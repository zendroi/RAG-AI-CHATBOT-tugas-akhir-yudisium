# RAG AI Chatbot TA dan Yudisium

Chatbot web RAG berbahasa Indonesia untuk membantu mahasiswa bertanya seputar Tugas Akhir, sidang TA, pembimbing, yudisium, kelulusan, dan administrasi akademik terkait. Bot tertanam di homepage web (login mahasiswa), memakai Gemini sebagai model utama, dan Groq sebagai fallback jika Gemini terkena quota/rate limit.

https://sruhh-ssc-chatbot.up.railway.app/

## Fitur

- Chatbot web (widget chat di homepage, perlu login).
- Auth + role admin/user (MySQL, session).
- Dashboard admin untuk CRUD Knowledge Base (upload/hapus/kategori dokumen PDF, DOCX, TXT).
- RAG (TF-IDF) dari dokumen akademik lokal.
- Document delivery: deteksi permintaan dokumen ("minta template buku TA") lalu balas link unduhan.
- Smart bot checking: cek kelayakan TA/sidang TA/yudisium berdasarkan rule terstruktur.
- Jawaban dibatasi hanya seputar TA dan yudisium.
- Sumber dokumen hanya ditampilkan jika pengguna memintanya.
- Fallback Groq otomatis jika Gemini error/quota.
- Intent cepat untuk sapaan, terima kasih, bantuan, pembimbing, sidang TA, jadwal, pedoman, dan yudisium.

## Instalasi

```bash
git clone https://github.com/zendroi/RAG-AI-CHATBOT-tugas-akhir-yudisium.git
cd RAG-AI-CHATBOT-tugas-akhir-yudisium
npm install
```

Salin konfigurasi environment:

```bash
copy .env.example .env
```

Isi minimal salah satu atau keduanya:

```env
GEMINI_API_KEY=isi_api_key_gemini
GROQ_API_KEY=isi_api_key_groq
```

Buat database MySQL dan jalankan migrasi:

```bash
mysql -u root -p nama_database < schema.sql
```

Jalankan server:

```bash
npm start
```

Buka aplikasi:

```text
http://localhost:3001
```

## Mengelola Dokumen (Knowledge Base)

Upload dokumen dari `/knowledge` (admin), pilih kategori Tugas Akhir/Yudisium/Umum. Format yang didukung:

- PDF
- DOCX
- TXT

Untuk impor dokumen dari folder lewat terminal:

```bash
npm run ingest:sample -- "C:\path\ke\folder-dokumen"
```

Dataset hasil ekstraksi disimpan di:

```text
datasets/academic-documents.json
```

## Perilaku Chatbot

- Menjawab dalam bahasa Indonesia.
- Tidak menjawab topik di luar TA/yudisium.
- Jika informasi tidak ditemukan, bot mengarahkan pengguna ke SSC.
- Jika pengguna meminta sumber, bot menampilkan nama dokumen relevan.
- Jika pengguna minta dokumen tertentu, bot membalas link unduhan langsung.
- Jika pengguna minta cek kelayakan TA/sidang/yudisium, bot menampilkan form pengecekan.

## Catatan Keamanan

Jangan commit file `.env`, `uploads/`, atau `node_modules/`. File-file itu sudah dimasukkan ke `.gitignore`.

## Referensi

- [Gemini API generateContent](https://ai.google.dev/api/generate-content)
- [Groq API Reference](https://console.groq.com/docs/api-reference)
