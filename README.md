# RAG AI Chatbot TA dan Yudisium

Chatbot RAG berbahasa Indonesia untuk membantu mahasiswa bertanya seputar Tugas Akhir, sidang TA, pembimbing, yudisium, kelulusan, dan administrasi akademik terkait. Bot berjalan di WhatsApp melalui QR scan (`whatsapp-web.js`), memakai Gemini sebagai model utama, dan Groq sebagai fallback jika Gemini terkena quota/rate limit.

## Fitur

- Chatbot WhatsApp dengan scan QR.
- Dashboard admin untuk upload dokumen PDF, DOCX, atau TXT.
- RAG dari dokumen akademik lokal.
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

Jalankan server:

```bash
npm start
```

Buka dashboard:

```text
http://localhost:3001
```

## Menghubungkan WhatsApp

1. Buka dashboard.
2. Klik **Mulai Bot** pada panel Koneksi WhatsApp.
3. Scan QR dari WhatsApp HP melalui **Perangkat Tertaut**.
4. Setelah status terhubung, bot akan membalas pesan pribadi yang masuk.

Folder `.wwebjs_auth/` menyimpan sesi login dan tidak boleh di-commit.

## Mengelola Dokumen

Upload dokumen dari dashboard admin. Format yang didukung:

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

## Catatan Keamanan

Jangan commit file `.env`, `.wwebjs_auth/`, `.wwebjs_cache/`, `uploads/`, atau `node_modules/`. File-file itu sudah dimasukkan ke `.gitignore`.

## Referensi

- [whatsapp-web.js](https://wwebjs.dev/)
- [Gemini API generateContent](https://ai.google.dev/api/generate-content)
- [Groq API Reference](https://console.groq.com/docs/api-reference)
