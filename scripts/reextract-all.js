require('dotenv').config();

const DatasetManager = require('../Lib/dataset');

// Re-runs the current extraction pipeline over every already-uploaded file in /uploads,
// rebuilding RAG chunks in place. Use after improving extraction (OCR, table/image reading)
// so old documents benefit without re-uploading. Optional arg: a single source id.
//
//   node scripts/reextract-all.js            # all docs
//   node scripts/reextract-all.js <sourceId> # one doc

async function main() {
  const manager = new DatasetManager();
  const onlyId = process.argv[2];

  const sources = manager.getSourceDocuments();
  if (!sources.length) {
    console.log('Tidak ada dokumen untuk diproses.');
    return;
  }

  const targets = onlyId ? sources.filter(s => s.id === onlyId) : sources;
  if (!targets.length) {
    console.log(`Dokumen dengan id ${onlyId} tidak ditemukan.`);
    return;
  }

  console.log(`Memproses ulang ${targets.length} dokumen...\n`);
  let improved = 0;

  for (const source of targets) {
    const result = await manager.reextractById(source.id);
    if (!result.success) {
      console.log(`✗ ${source.name} — ${result.message}`);
      continue;
    }
    if (result.skipped) {
      console.log(`= ${result.name}`);
      console.log(`    dilewati — hasil baru (${result.after}) lebih sedikit dari yang tersimpan (${result.before}), kemungkinan OCR kena limit. Coba lagi nanti.`);
      continue;
    }
    const delta = result.after - result.before;
    const flag = delta > 50 ? `  (+${delta} char, MEMBAIK)` : '';
    if (delta > 50) improved++;
    console.log(`✓ ${result.name}`);
    console.log(`    ${result.before} -> ${result.after} char | ${result.chunks} potongan | ${result.method}${flag}`);
  }

  console.log(`\nSelesai. ${improved} dokumen mendapat lebih banyak teks dari sebelumnya.`);
  console.log(`Total potongan RAG sekarang: ${manager.getAllDocuments().length}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
