const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');

// Image formats an admin can upload directly (a screenshot/scan of a rule sheet) and that
// also show up embedded inside DOCX files — both get read via Gemini Vision OCR.
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

const OCR_PROMPT = [
  'Ekstrak SEMUA teks yang terbaca dari dokumen/gambar ini dalam bahasa Indonesia, apa adanya.',
  'Jangan ringkas dan jangan menambah informasi. Pertahankan judul, nomor, dan urutan asli.',
  'PENTING: jika ada tabel (misalnya tabel periode/tanggal/jadwal/syarat/kriteria), salin SELURUH isi tabel baris demi baris secara lengkap — jangan dilewati. Tulis setiap baris tabel dengan format "Kolom1 | Kolom2 | Kolom3 | ..." memakai header kolom yang sama seperti aslinya.',
  'Jika tidak ada teks yang terbaca sama sekali, balas dengan string kosong.'
].join(' ');

function detectLinkContent(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed || trimmed.includes('\n')) return null;

  if (/^https?:\/\/\S+$/.test(trimmed)) return trimmed;

  // Some source .txt files lost their punctuation (":", "/", "?") during a prior
  // copy/paste, e.g. "httpsforms.office.compagesresponsepage.aspxid=XYZ&route=shorturl".
  // Repair that specific Microsoft Forms short-link pattern.
  const formsMatch = trimmed.match(/^httpsforms\.office\.compagesresponsepage\.aspxid=([^&]+)&route=shorturl$/i);
  if (formsMatch) {
    return `https://forms.office.com/pages/responsepage.aspx?id=${formsMatch[1]}&route=shorturl`;
  }

  return null;
}

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

  async ingestUploadedFiles(files, category = 'umum', subCategory = null) {
    const store = this.readStore();
    const imported = [];
    const normalizedCategory = ['tugasAkhir', 'yudisium'].includes(category) ? category : 'umum';
    const normalizedSubCategory = subCategory && String(subCategory).trim() ? String(subCategory).trim() : null;

    for (const file of files) {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const ext = path.extname(originalName).toLowerCase();
      const id = crypto.randomUUID();
      const storedName = `${id}${ext}`;
      const storedPath = path.join(this.uploadsPath, storedName);

      fs.renameSync(file.path, storedPath);

      const { text, method } = await this.extractText(storedPath, ext);
      const chunks = this.splitIntoChunks(text)
        .filter(chunkText => !this.isTableOfContentsChunk(chunkText))
        .map((chunkText, idx) => ({
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
        extractedChars: text.length,
        extractionMethod: method,
        category: normalizedCategory,
        subCategory: normalizedSubCategory,
        link: ext === '.txt' ? detectLinkContent(text) : null,
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

  // Returns { text, method }. `method` is recorded on the source so admins can see HOW each
  // doc was read (and spot ones that need a better source file).
  async extractText(filePath, ext) {
    if (ext === '.pdf') return this.extractPdf(filePath);
    if (ext === '.docx') return this.extractDocx(filePath);
    if (ext === '.txt') return { text: fs.readFileSync(filePath, 'utf8'), method: 'text' };
    if (ext === '.xlsx' || ext === '.xls') return this.extractSpreadsheet(filePath);
    if (IMAGE_EXTS.has(ext)) {
      const ocr = await this.ocrImage(fs.readFileSync(filePath).toString('base64'), MIME_BY_EXT[ext]);
      return { text: ocr.text, method: ocr.text ? `ocr:${ocr.provider}` : 'ocr (kosong)' };
    }
    throw new Error('Format dokumen tidak didukung.');
  }

  extractSpreadsheet(filePath) {
    const workbook = XLSX.readFile(filePath);
    const text = workbook.SheetNames
      .map(sheetName => `Sheet: ${sheetName}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName])}`)
      .join('\n\n');
    return { text, method: 'xlsx' };
  }

  async extractPdf(filePath) {
    // pdf-parse reads the embedded text layer fully, locally, with no token cost — this is the
    // default and covers text-based PDFs (the bulk of academic docs). It flattens table columns,
    // but the words/numbers are all there for the LLM to read.
    let nativeText = '';
    try {
      const parser = new PDFParse({ data: fs.readFileSync(filePath) });
      const data = await parser.getText();
      await parser.destroy();
      nativeText = (data.text || '').trim();
    } catch (error) {
      console.error('pdf-parse gagal:', error.message);
    }

    // Only spend AI tokens on PDF OCR when explicitly opted in (OCR_MODE=ai) — it gives the
    // cleanest table structure but costs tokens, so it's off by default.
    if ((process.env.OCR_MODE || 'local').toLowerCase() === 'ai' && process.env.GEMINI_API_KEY) {
      const ocr = await this.ocrBase64(fs.readFileSync(filePath).toString('base64'), 'application/pdf');
      const ocrText = (ocr.text || '').trim();
      if (ocrText.length >= 50) {
        if (ocr.truncated && nativeText.length > ocrText.length) {
          return { text: `${ocrText}\n\n${nativeText}`, method: 'gemini-ocr+pdf-parse (digabung, ocr terpotong)' };
        }
        return { text: ocrText, method: ocr.truncated ? 'gemini-ocr (terpotong)' : 'gemini-ocr' };
      }
    }

    return { text: nativeText, method: 'pdf-parse' };
  }

  async extractDocx(filePath) {
    // mammoth's raw-text reader loses table structure AND can't see embedded images — and some
    // source docs put the actual rules (e.g. syarat Cumlaude) entirely inside a pasted PNG.
    // So: convert to HTML (keeps tables), flatten to text, THEN OCR every embedded image and
    // append what it reads, so image-only content stops being invisible to the bot.
    const images = [];
    let html = '';
    try {
      const result = await mammoth.convertToHtml({ path: filePath }, {
        convertImage: mammoth.images.imgElement(async (image) => {
          try {
            const base64 = await image.read('base64');
            images.push({ base64, contentType: image.contentType });
          } catch (error) {
            console.error('Gagal membaca gambar docx:', error.message);
          }
          return { src: '' };
        })
      });
      html = result.value || '';
    } catch (error) {
      console.error('mammoth convertToHtml gagal, fallback ke raw text:', error.message);
      const raw = await mammoth.extractRawText({ path: filePath }).catch(() => ({ value: '' }));
      html = raw.value || '';
    }

    let text = this.htmlToText(html);
    let method = 'mammoth';

    if (images.length) {
      const ocrParts = [];
      const providers = new Set();
      for (const img of images) {
        const mime = /^image\//.test(img.contentType || '') ? img.contentType : 'image/png';
        const ocr = await this.ocrImage(img.base64, mime);
        if (ocr.text && ocr.text.trim().length >= 20) {
          ocrParts.push(ocr.text.trim());
          providers.add(ocr.provider);
        }
      }
      if (ocrParts.length) {
        text = `${text}\n\n${ocrParts.join('\n\n')}`.trim();
        method = `mammoth+ocr:${[...providers].join('/')} (${ocrParts.length}/${images.length} gambar)`;
      }
    }

    return { text, method };
  }

  htmlToText(html) {
    return String(html || '')
      .replace(/<\/td>\s*<td[^>]*>/gi, ' | ')
      .replace(/<\/th>\s*<th[^>]*>/gi, ' | ')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<h[1-6][^>]*>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Generic Gemini Vision OCR over an inline base64 payload (PDF page set or single image).
  // Returns { text, truncated } — `truncated` is true when the model hit the output cap so the
  // caller can decide to merge in the native text layer instead of silently losing the tail.
  async ocrBase64(base64, mimeType) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { text: '', truncated: false };

    const configured = (process.env.GEMINI_OCR_MODEL || process.env.GEMINI_MODEL || '').trim();
    // OCR wants completeness over speed — lead with the fuller flash model, then lite, then 2.0.
    const models = [...new Set([configured, 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'].filter(Boolean))];
    const maxTokens = Number(process.env.GEMINI_OCR_MAX_TOKENS || 16384);

    const maxRetries = Number(process.env.GEMINI_OCR_RETRIES || 4);

    for (const model of models) {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
              contents: [{ parts: [{ text: OCR_PROMPT }, { inlineData: { mimeType, data: base64 } }] }],
              generationConfig: { temperature: 0, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } }
            })
          });

          if (response.status === 429) {
            const body = await response.text();
            // A PER-DAY quota exhaustion can't be waited out in-session — stop retrying this model
            // and fall straight through to the next model / provider. Only retry transient
            // per-minute (RPM/TPM) throttles, which the retryDelay actually clears.
            const isDaily = /PerDay|RequestsPerDay/i.test(body);
            if (isDaily || attempt >= maxRetries) {
              console.error(`Gemini OCR (${model}) ${isDaily ? 'kuota harian habis' : 'rate limit'} — lanjut ke provider berikutnya.`);
              break;
            }
            const wait = Math.min(this.parseRetryDelayMs(body) || (2000 * (attempt + 1)), 30000);
            console.error(`Gemini OCR (${model}) kena rate limit, tunggu ${Math.round(wait / 1000)}s lalu coba lagi...`);
            await this.sleep(wait);
            continue;
          }

          if (!response.ok) {
            console.error(`Gemini OCR (${model}) gagal: ${response.status} ${await response.text()}`);
            break; // non-retryable for this model — move to next model
          }

          const data = await response.json();
          const candidate = data.candidates?.[0];
          const text = candidate?.content?.parts?.map(part => part.text || '').join('\n').trim() || '';
          const truncated = candidate?.finishReason === 'MAX_TOKENS';
          if (text) return { text, truncated };
          break; // empty result from this model — try next model
        } catch (error) {
          console.error(`Gemini OCR (${model}) error:`, error.message);
          break;
        }
      }
    }

    return { text: '', truncated: false };
  }

  parseRetryDelayMs(body) {
    const match = String(body || '').match(/"retryDelay":\s*"([\d.]+)s"/);
    return match ? Math.ceil(parseFloat(match[1]) * 1000) + 500 : 0;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // OCR for IMAGE payloads (a DOCX-embedded picture or an uploaded screenshot/scan).
  //
  // Default (OCR_MODE=local): Tesseract.js ONLY — fully local, unlimited, ZERO AI tokens. The
  // admin just uploads files; nothing to configure and no token is ever spent on extraction.
  // The chatbot's LLM only reads the resulting TEXT later, so token use stays tiny.
  //
  // Opt-in (OCR_MODE=ai): use the AI vision chain first for higher quality on stylized layouts
  // (Gemini -> Groq Vision), falling back to local Tesseract. Costs tokens; off by default.
  async ocrImage(base64, mimeType) {
    const mode = (process.env.OCR_MODE || 'local').toLowerCase();

    if (mode === 'ai') {
      if (process.env.GEMINI_API_KEY) {
        const g = await this.ocrBase64(base64, mimeType);
        if (g.text && g.text.trim().length >= 20) return { ...g, provider: 'gemini' };
      }
      if (process.env.GROQ_API_KEY) {
        const gq = await this.ocrGroqVision(base64, mimeType);
        if (gq.text && gq.text.trim().length >= 20) return { ...gq, provider: 'groq-vision' };
      }
    }

    const t = await this.ocrTesseract(base64);
    if (t.text && t.text.trim().length >= 20) return { ...t, provider: 'tesseract' };
    return { text: '', truncated: false, provider: 'none' };
  }

  async ocrGroqVision(base64, mimeType) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return { text: '', truncated: false };
    const model = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
    const maxTokens = Number(process.env.GROQ_OCR_MAX_TOKENS || 4096);
    const mime = /^image\//.test(mimeType || '') ? mimeType : 'image/png';

    for (let attempt = 0; attempt <= 3; attempt++) {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            temperature: 0,
            max_tokens: maxTokens,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: OCR_PROMPT },
                { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } }
              ]
            }]
          })
        });

        if (response.status === 429 && attempt < 3) {
          const body = await response.text();
          await this.sleep(Math.min(this.parseRetryDelayMs(body) || 3000 * (attempt + 1), 20000));
          continue;
        }
        if (!response.ok) {
          console.error(`Groq Vision OCR gagal: ${response.status} ${await response.text()}`);
          return { text: '', truncated: false };
        }
        const data = await response.json();
        const text = (data.choices?.[0]?.message?.content || '').trim();
        const truncated = data.choices?.[0]?.finish_reason === 'length';
        return { text, truncated };
      } catch (error) {
        console.error('Groq Vision OCR error:', error.message);
        return { text: '', truncated: false };
      }
    }
    return { text: '', truncated: false };
  }

  // Local OCR via tesseract.js (WASM) — no API, no tokens. The Indonesian+English language data
  // downloads automatically ONCE into a persistent on-disk cache (no admin setup), then works
  // offline. A single worker is reused across documents so re-init cost isn't paid per image.
  async getTesseractWorker() {
    if (this._tessWorker) return this._tessWorker;
    const { createWorker } = require('tesseract.js');
    const lang = process.env.TESSERACT_LANG || 'ind+eng';
    const cachePath = path.join(__dirname, '..', '.tesseract-cache');
    fs.mkdirSync(cachePath, { recursive: true });
    this._tessWorker = await createWorker(lang, 1, { cachePath });
    return this._tessWorker;
  }

  async ocrTesseract(base64) {
    try {
      const worker = await this.getTesseractWorker();
      const { data } = await worker.recognize(Buffer.from(base64, 'base64'));
      return { text: (data.text || '').trim(), truncated: false };
    } catch (error) {
      console.error('Tesseract OCR error:', error.message);
      // a broken cached worker shouldn't poison subsequent calls
      this._tessWorker = null;
      return { text: '', truncated: false };
    }
  }

  // Table-of-contents / daftar isi pages are dense lists of the document's own section
  // titles (often the exact keywords a student's question contains) followed by
  // dot-leaders and page numbers, e.g. "Alur Sidang Tugas Akhir ........... 21". TF-IDF
  // scores these very highly despite them carrying zero actual answer content, which was
  // crowding out the real procedural chunks in RAG results. Drop them at ingestion time.
  isTableOfContentsChunk(text) {
    const dotLeaderLines = (text.match(/\.{4,}\s*\d{1,4}/g) || []).length;
    return dotLeaderLines >= 3;
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

  async replaceSourceFile(id, file) {
    const store = this.readStore();
    const source = store.sources.find(item => item.id === id);
    if (!source) return { success: false, message: 'Dokumen tidak ditemukan.' };

    const oldPath = path.join(this.uploadsPath, source.storedName);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);

    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName).toLowerCase();
    const storedName = `${id}${ext}`;
    const storedPath = path.join(this.uploadsPath, storedName);
    fs.renameSync(file.path, storedPath);

    const { text, method } = await this.extractText(storedPath, ext);
    const chunks = this.splitIntoChunks(text)
      .filter(chunkText => !this.isTableOfContentsChunk(chunkText))
      .map((chunkText, idx) => ({
        id: `${id}-${idx + 1}`,
        sourceId: id,
        source: originalName,
        chunk: idx + 1,
        text: chunkText,
        domain: 'ta-yudisium',
        createdAt: new Date().toISOString()
      }));

    source.name = originalName;
    source.storedName = storedName;
    source.type = ext.replace('.', '');
    source.bytes = file.size;
    source.chunks = chunks.length;
    source.extractedChars = text.length;
    source.extractionMethod = method;
    source.link = ext === '.txt' ? detectLinkContent(text) : null;
    source.updatedAt = new Date().toISOString();

    store.chunks = store.chunks.filter(item => item.sourceId !== id);
    store.chunks.push(...chunks);

    this.writeStore(store);
    return { success: true, message: 'Isi dokumen berhasil diperbarui.', source };
  }

  // Re-read an already-stored file with the current extraction pipeline and rebuild its chunks.
  // Used to upgrade previously-ingested docs (e.g. image-only DOCX that earlier extracted almost
  // nothing) without the admin needing to re-upload anything.
  async reextractById(id) {
    const store = this.readStore();
    const source = store.sources.find(item => item.id === id);
    if (!source) return { success: false, message: 'Dokumen tidak ditemukan.' };

    const storedPath = path.join(this.uploadsPath, source.storedName);
    if (!fs.existsSync(storedPath)) return { success: false, message: 'File tersimpan tidak ditemukan.', id };

    const ext = path.extname(source.storedName).toLowerCase();
    const before = source.extractedChars || 0;
    const { text, method } = await this.extractText(storedPath, ext);

    // Safety guard: re-reading the SAME file should only ever ADD information. If the new pass
    // yields meaningfully less text than what's already stored (classic cause: OCR was rate-
    // limited/quota-exhausted and silently fell back to the text-only reader), keep the better
    // existing chunks instead of destroying them. Re-run later when quota is available.
    if (before > 300 && text.length < before * 0.8) {
      return { success: true, id, name: source.name, before, after: text.length, chunks: source.chunks, method, skipped: true };
    }

    const chunks = this.splitIntoChunks(text)
      .filter(chunkText => !this.isTableOfContentsChunk(chunkText))
      .map((chunkText, idx) => ({
        id: `${id}-${idx + 1}`,
        sourceId: id,
        source: source.name,
        chunk: idx + 1,
        text: chunkText,
        domain: 'ta-yudisium',
        createdAt: new Date().toISOString()
      }));

    source.chunks = chunks.length;
    source.extractedChars = text.length;
    source.extractionMethod = method;
    if (ext === '.txt') source.link = detectLinkContent(text);
    source.updatedAt = new Date().toISOString();

    store.chunks = store.chunks.filter(item => item.sourceId !== id);
    store.chunks.push(...chunks);
    this.writeStore(store);

    return { success: true, id, name: source.name, before, after: text.length, chunks: chunks.length, method };
  }

  async reextractAll() {
    const sources = this.getSourceDocuments();
    const results = [];
    for (const source of sources) {
      // re-read fresh each loop; reextractById persists immediately so progress survives a crash
      // eslint-disable-next-line no-await-in-loop
      results.push(await this.reextractById(source.id));
    }
    return results;
  }

  // Replace a source's extracted text with corrected/known-good text and rebuild its chunks
  // (id-consistent — same source id, so document-delivery links and history stay valid). Used
  // to restore a good extraction when the live OCR is temporarily unavailable (quota), and as
  // the backend for a future admin "edit extracted text" feature.
  overrideSourceText(id, text, method = 'manual') {
    const store = this.readStore();
    const source = store.sources.find(item => item.id === id);
    if (!source) return { success: false, message: 'Dokumen tidak ditemukan.' };

    const chunks = this.splitIntoChunks(text)
      .filter(chunkText => !this.isTableOfContentsChunk(chunkText))
      .map((chunkText, idx) => ({
        id: `${id}-${idx + 1}`,
        sourceId: id,
        source: source.name,
        chunk: idx + 1,
        text: chunkText,
        domain: 'ta-yudisium',
        createdAt: new Date().toISOString()
      }));

    source.chunks = chunks.length;
    source.extractedChars = text.length;
    source.extractionMethod = method;
    source.updatedAt = new Date().toISOString();

    store.chunks = store.chunks.filter(item => item.sourceId !== id);
    store.chunks.push(...chunks);
    this.writeStore(store);
    return { success: true, id, chunks: chunks.length, chars: text.length };
  }

  updateSourceMeta(id, { name, category, subCategory } = {}) {
    const store = this.readStore();
    const source = store.sources.find(item => item.id === id);
    if (!source) return { success: false, message: 'Dokumen tidak ditemukan.' };

    if (name && name.trim()) {
      source.name = name.trim();
      store.chunks.forEach(chunk => {
        if (chunk.sourceId === id) chunk.source = source.name;
      });
    }
    if (category && ['tugasAkhir', 'yudisium', 'umum'].includes(category)) {
      source.category = category;
    }
    if (subCategory !== undefined) {
      source.subCategory = subCategory && String(subCategory).trim() ? String(subCategory).trim() : null;
    }

    this.writeStore(store);
    return { success: true, message: 'Dokumen berhasil diperbarui.', source };
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
