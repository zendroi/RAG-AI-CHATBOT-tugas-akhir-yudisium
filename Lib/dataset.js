const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');

class DatasetManager {
  constructor() {
    this.datasetsPath = path.join(__dirname, '..', 'datasets');
    this.uploadsPath = path.join(__dirname, '..', 'uploads');
    this.datasetFile = path.join(this.datasetsPath, 'academic-documents.json');
    fs.mkdirSync(this.datasetsPath, { recursive: true });
    fs.mkdirSync(this.uploadsPath, { recursive: true });

    if (!fs.existsSync(this.datasetFile)) {
      this.writeStore({ sources: [], chunks: [] });
    }
  }

  readStore() {
    try {
      const data = JSON.parse(fs.readFileSync(this.datasetFile, 'utf8'));
      return {
        sources: Array.isArray(data.sources) ? data.sources : [],
        chunks: Array.isArray(data.chunks) ? data.chunks : []
      };
    } catch (error) {
      console.error('Error reading academic dataset:', error.message);
      return { sources: [], chunks: [] };
    }
  }

  writeStore(store) {
    fs.writeFileSync(this.datasetFile, JSON.stringify(store, null, 2));
  }

  async ingestUploadedFiles(files) {
    const store = this.readStore();
    const imported = [];

    for (const file of files) {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const ext = path.extname(originalName).toLowerCase();
      const id = crypto.randomUUID();
      const storedName = `${id}${ext}`;
      const storedPath = path.join(this.uploadsPath, storedName);

      fs.renameSync(file.path, storedPath);

      const text = await this.extractText(storedPath, ext);
      const chunks = this.splitIntoChunks(text).map((chunkText, idx) => ({
        id: `${id}-${idx + 1}`,
        sourceId: id,
        source: originalName,
        chunk: idx + 1,
        text: chunkText,
        domain: 'ta-yudisium',
        createdAt: new Date().toISOString()
      }));

      const source = {
        id,
        name: originalName,
        storedName,
        type: ext.replace('.', ''),
        bytes: file.size,
        chunks: chunks.length,
        createdAt: new Date().toISOString()
      };

      const duplicate = store.sources.find(item => item.name === source.name && item.bytes === source.bytes);
      if (duplicate) {
        const duplicatePath = path.join(this.uploadsPath, duplicate.storedName);
        if (fs.existsSync(duplicatePath)) fs.unlinkSync(duplicatePath);
        store.sources = store.sources.filter(item => item.id !== duplicate.id);
        store.chunks = store.chunks.filter(item => item.sourceId !== duplicate.id);
      }

      store.sources.push(source);
      store.chunks.push(...chunks);
      imported.push(source);
    }

    this.writeStore(store);

    return {
      message: `${imported.length} dokumen berhasil diproses.`,
      imported,
      totalDocuments: store.sources.length,
      totalChunks: store.chunks.length
    };
  }

  async extractText(filePath, ext) {
    let text = '';

    if (ext === '.pdf') {
      const parser = new PDFParse({ data: fs.readFileSync(filePath) });
      const data = await parser.getText();
      await parser.destroy();
      text = data.text || '';
      if (text.trim().length < 120) {
        text = await this.extractTextWithGemini(filePath, 'application/pdf');
      }
      return text;
    }

    if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value || '';
    }

    if (ext === '.txt') {
      return fs.readFileSync(filePath, 'utf8');
    }

    throw new Error('Format dokumen tidak didukung.');
  }

  async extractTextWithGemini(filePath, mimeType) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return '';

    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const base64 = fs.readFileSync(filePath).toString('base64');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: 'Ekstrak semua teks yang terbaca dari dokumen ini dalam bahasa Indonesia. Jangan ringkas, jangan menambah informasi, dan pertahankan judul atau nomor penting.'
            },
            {
              inlineData: {
                mimeType,
                data: base64
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 8192
        }
      })
    });

    if (!response.ok) {
      console.error(`Gemini document extraction failed: ${response.status} ${await response.text()}`);
      return '';
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n').trim() || '';
  }

  splitIntoChunks(text, chunkSize = 1200, overlap = 180) {
    const normalized = String(text || '')
      .replace(/\r/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!normalized) return [];

    const chunks = [];
    let start = 0;

    while (start < normalized.length) {
      let end = Math.min(start + chunkSize, normalized.length);
      if (end < normalized.length) {
        const paragraphBreak = normalized.lastIndexOf('\n\n', end);
        const lineBreak = normalized.lastIndexOf('\n', end);
        const sentenceBreak = normalized.lastIndexOf('.', end);
        const bestBreak = [paragraphBreak, lineBreak, sentenceBreak]
          .filter(pos => pos > start + 250)
          .sort((a, b) => b - a)[0];
        if (bestBreak) end = bestBreak + 1;
      }

      const chunk = normalized.slice(start, end).trim();
      if (chunk.length >= 80) chunks.push(chunk);
      if (end >= normalized.length) break;
      start = Math.max(end - overlap, start + 1);
    }

    return chunks;
  }

  getSourceDocuments() {
    return this.readStore().sources;
  }

  getAllDocuments() {
    return this.readStore().chunks;
  }

  deleteSourceDocument(id) {
    const store = this.readStore();
    const source = store.sources.find(item => item.id === id);
    if (!source) return { success: false, message: 'Dokumen tidak ditemukan.' };

    const filePath = path.join(this.uploadsPath, source.storedName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    store.sources = store.sources.filter(item => item.id !== id);
    store.chunks = store.chunks.filter(item => item.sourceId !== id);
    this.writeStore(store);

    return { success: true, message: 'Dokumen berhasil dihapus.' };
  }
}

module.exports = DatasetManager;
