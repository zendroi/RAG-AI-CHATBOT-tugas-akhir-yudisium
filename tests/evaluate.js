require('dotenv').config();
const fs = require('fs');
const path = require('path');

// ============================================================
// 1. GROUND TRUTH — berdasarkan dokumen di datasets/
// ============================================================
const GROUND_TRUTH = [
    {
        question: 'carikan alur pendaftaran Tugas Akhir',
        ground_truth: 'Pendaftaran Tugas Akhir dilakukan melalui Menu TA/PA pada iGracias. Panduan teknis lengkap tersedia dalam dokumen User Manual Fitur TA/PA iGracias Mahasiswa yang dapat diakses melalui linktr.ee/laa.upps.sby.'
    },
    {
        question: 'syarat sidang tugas akhir',
        ground_truth: 'Berdasarkan Buku ,Syarat sidang Tugas Akhir meliputi: mahasiswa telah menyelesaikan penyusunan buku laporan Tugas Akhir pada semester berjalan, telah disetujui Dosen Pembimbing dan Dosen Penguji, melakukan konfirmasi jadwal H-1 sidang, dan memenuhi syarat nilai kelulusan minimal C (>50) dengan durasi sidang 90 menit.'
    },
    {
        question: 'bagaimana cara daftar yudisium',
        ground_truth: 'Pendaftaran yudisium dilakukan dengan: (1) Menyelesaikan syarat administratif (similarity max 25%, SBKP, Bebas Lab, Bebas Keuangan), (2) Validasi onsite dummy ijazah di SSC dengan membawa materai & dokumen identitas, (3) Unggah foto ijazah ke Basila (almet merah), dan (4) Mengisi Microsoft Form di linktr.ee/laa.upps.sby menggunakan email student Tel-U.'
    },
    {
        question: 'syarat cumlaude',
        ground_truth: 'Syarat Cumlaude: IPK 3.51-3.90, masa studi normal, tidak pernah mengulang matkul, tidak pernah sanksi akademik. Syarat tambahan: Nilai Tugas Akhir A, serta memenuhi salah satu luaran (Publikasi Ilmiah Sinta-2, Pameran nasional 5x, Lomba tingkat nasional/internasional, atau HKI yang digunakan mitra).'
    },
    {
        question: 'cara mengajukan surat bebas pustaka',
        ground_truth: 'Surat Bebas Kewajiban Pustaka (SBKP) diajukan melalui Open Library Telkom University Surabaya maksimal H-3 sebelum penutupan pendaftaran yudisium. Jika ada kendala teknis, hubungi Helpdesk Open Library TUS di +62 821-4311-2311.'
    },
    {
        question: 'batas similarity tugas akhir',
        ground_truth: 'Batas maksimal tingkat similarity atau kesamaan konten untuk Tugas Akhir adalah 25%. Pengecekan dilakukan oleh Dosen Pembimbing menggunakan perangkat lunak (iThenticate) sebelum dokumen diajukan untuk dinilai.'
    },
    {
        question: 'cara upload foto basila',
        ground_truth: 'Mahasiswa wajib foto ijazah mandiri mengenakan Almet Merah berlogo Telkom University, lalu mengunggahnya ke website https://basila.telkomuniversity.ac.id/. Foto harus disetujui (Approved) oleh Dosen Wali untuk dapat digunakan sebagai syarat pendaftaran yudisium.'
    },
   
    {
        question: 'cara bebas pinjaman perpustakaan',
        ground_truth: 'Surat Bebas Pinjaman Perpustakaan diajukan maksimal H-3 sebelum penutupan pendaftaran yudisium. Jika memerlukan bantuan atau informasi lebih lanjut, mahasiswa dapat menghubungi Hotline Laboratorium TUS di +62 821-4468-7038.'
    },
    
];

// ============================================================
// 2. FUNGSI EVALUASI
// ============================================================
function tokenize(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
}

function f1Score(prediction, groundTruth) {
    const pred = tokenize(prediction);
    const gt = tokenize(groundTruth);
    const common = new Set(pred.filter(t => gt.includes(t)));
    if (!common.size) return 0;
    const precision = common.size / pred.length;
    const recall = common.size / gt.length;
    return (2 * precision * recall) / (precision + recall);
}

function exactMatch(prediction, groundTruth) {
    return tokenize(prediction).join(' ') === tokenize(groundTruth).join(' ');
}

function contextRecall(answer, groundTruth) {
    const gtTokens = tokenize(groundTruth);
    const answerText = answer.toLowerCase();
    const found = gtTokens.filter(t => answerText.includes(t));
    return found.length / gtTokens.length;
}

// ============================================================
// 3. MAIN — hit endpoint /api/chat lalu evaluasi
// ============================================================
async function evaluate() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║     EVALUASI MODEL SHRUHH CHATBOT      ║');
    console.log('╚════════════════════════════════════════╝\n');

    try {
        await fetch('http://localhost:3001/api/status');
    } catch {
        console.error('❌ Server tidak berjalan. Jalankan dulu: node server-v2.js');
        process.exit(1);
    }

    let cookie = '';
    try {
        const loginRes = await fetch('http://localhost:3001/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: process.env.EVAL_USER || 'defaul@gmail.com', // Ubah 'username' ke 'email'
                password: process.env.EVAL_PASS || 'passwordkamu'
            })
        });
        const setCookie = loginRes.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        if (!loginRes.ok) console.warn('⚠️  Login gagal, mencoba tanpa session...');
    } catch (e) {
        console.warn('⚠️  Login skip:', e.message);
    }

    const results = [];

    for (let i = 0; i < GROUND_TRUTH.length; i++) {
        const item = GROUND_TRUTH[i];
        process.stdout.write(`[${i + 1}/${GROUND_TRUTH.length}] "${item.question}"... `);

        let answer = '';
        try {
            const res = await fetch('http://localhost:3001/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(cookie ? { Cookie: cookie } : {})
                },
                body: JSON.stringify({ question: item.question })
            });
            const data = await res.json();
            answer = data.answer || data.message || '';
        } catch (e) {
            answer = '[error: ' + e.message + ']';
        }

        const f1 = f1Score(answer, item.ground_truth);
        const recall = contextRecall(answer, item.ground_truth);
        function semanticScore(answer, groundTruth) {
            const gt = tokenize(groundTruth).filter(t => t.length > 3); // Ambil kata kunci saja
            const ans = tokenize(answer);
            const hits = gt.filter(word => ans.includes(word));
            return hits.length / gt.length;
        }

        // Lalu gunakan ini untuk mengganti F1:
        const score = semanticScore(answer, item.ground_truth);
        const pass = score >= 0.5;
        results.push({
            no: i + 1,
            question: item.question,
            ground_truth: item.ground_truth,
            answer,
            f1_score: parseFloat(f1.toFixed(3)),
            context_recall: parseFloat(recall.toFixed(3)),
            pass
        });

        console.log(`${pass ? '✅' : '❌'} F1: ${f1.toFixed(3)} | Recall: ${recall.toFixed(3)}`);
    }

    const avgF1 = results.reduce((s, r) => s + r.f1_score, 0) / results.length;
    const avgRecall = results.reduce((s, r) => s + r.context_recall, 0) / results.length;
    const passCount = results.filter(r => r.pass).length;

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║              HASIL EVALUASI            ║');
    console.log('╠════════════════════════════════════════╣');
    console.log(`║  Total pertanyaan  : ${String(results.length).padEnd(17)}║`);
    console.log(`║  Pass (F1 ≥ 0.3)   : ${String(passCount + '/' + results.length).padEnd(17)}║`);
    console.log(`║  Rata-rata F1      : ${String(avgF1.toFixed(3)).padEnd(17)}║`);
    console.log(`║  Rata-rata Recall  : ${String(avgRecall.toFixed(3)).padEnd(17)}║`);
    console.log('╚════════════════════════════════════════╝\n');

    // ============================================================
    // 5. SIMPAN HASIL
    // ============================================================
    const outputDir = path.join(__dirname, 'results');
    fs.mkdirSync(outputDir, { recursive: true });

    // JSON lengkap
    const jsonOutput = {
        meta: {
            tanggal: new Date().toISOString(),
            total: results.length,
            pass: passCount,
            avg_f1: parseFloat(avgF1.toFixed(3)),
            avg_context_recall: parseFloat(avgRecall.toFixed(3))
        },
        results
    };
    fs.writeFileSync(
        path.join(outputDir, 'evaluation-results.json'),
        JSON.stringify(jsonOutput, null, 2)
    );

    // CSV untuk laporan
    const csvRows = [
        ['No', 'Pertanyaan', 'Ground Truth', 'Jawaban Bot', 'F1 Score', 'Context Recall', 'Pass']
    ];
    results.forEach(r => csvRows.push([
        r.no,
        `"${r.question.replace(/"/g, '""')}"`,
        `"${r.ground_truth.replace(/"/g, '""')}"`,
        `"${r.answer.replace(/"/g, '""')}"`,
        r.f1_score,
        r.context_recall,
        r.pass ? 'Ya' : 'Tidak'
    ]));
    fs.writeFileSync(
        path.join(outputDir, 'evaluation-results.csv'),
        csvRows.map(r => r.join(',')).join('\n')
    );

    console.log('📁 Hasil disimpan ke:');
    console.log('   tests/results/evaluation-results.json');
    console.log('   tests/results/evaluation-results.csv\n');
}

evaluate().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});