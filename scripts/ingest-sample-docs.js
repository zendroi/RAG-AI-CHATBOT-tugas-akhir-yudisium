require('dotenv').config();

const fs = require('fs');
const path = require('path');
const DatasetManager = require('../Lib/dataset');

const sourceDir = process.argv[2] || path.join(__dirname, '..', 'source-documents');
const tmpDir = path.join(__dirname, '..', 'uploads', '_tmp_import');
const allowed = new Set(['.pdf', '.docx', '.txt']);

async function main() {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Folder dokumen tidak ditemukan: ${sourceDir}. Jalankan: npm run ingest:sample -- "C:\\path\\ke\\folder-dokumen"`);
  }

  fs.mkdirSync(tmpDir, { recursive: true });
  const files = fs.readdirSync(sourceDir)
    .filter(name => allowed.has(path.extname(name).toLowerCase()))
    .map(name => {
      const sourcePath = path.join(sourceDir, name);
      const tmpPath = path.join(tmpDir, `${Date.now()}-${Math.random().toString(16).slice(2)}-${name}`);
      fs.copyFileSync(sourcePath, tmpPath);
      return {
        originalname: name,
        path: tmpPath,
        size: fs.statSync(sourcePath).size
      };
    });

  if (!files.length) {
    console.log('Tidak ada dokumen PDF/DOCX/TXT untuk diimpor.');
    return;
  }

  const manager = new DatasetManager();
  const result = await manager.ingestUploadedFiles(files);
  console.log(result.message);
  console.log(`Total dokumen: ${result.totalDocuments}`);
  console.log(`Total potongan RAG: ${result.totalChunks}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
