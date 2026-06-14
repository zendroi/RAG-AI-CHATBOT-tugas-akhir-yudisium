require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const qrcode = require('qrcode');
const RAGEngine = require('./Lib/rag');
const DatasetManager = require('./Lib/dataset');

const app = express();
const PORT = Number(process.env.PORT || 3001);
const GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v23.0';
const WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'praktikum-ai-yudisium';
const FALLBACK_RESPONSE = 'Maaf, saya belum menemukan informasi tersebut pada dokumen TA atau yudisium yang tersedia. Silakan hubungi SSC untuk konfirmasi lebih lanjut.';

const uploadDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 20) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.docx', '.txt'].includes(ext)) return cb(null, true);
    cb(new Error('Format dokumen harus PDF, DOCX, atau TXT.'));
  }
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/Public/login.html');
});
app.use(express.static('Public'));

const ragEngine = new RAGEngine();
const datasetManager = new DatasetManager();
const handledMessageIds = new Set();
const conversationMemory = new Map();
let waClient = null;
let waQrDataUrl = null;
let waReady = false;
let waInitializing = false;
let waStopping = false;

function wantsSources(message) {
  return /\b(sumber(?:nya)?|dokumen(?:nya)?|referensi(?:nya)?|rujukan(?:nya)?|dari mana|asal jawaban)\b/i.test(message || '');
}

function getSmallTalkResponse(message) {
  const text = String(message || '').toLowerCase().trim();
  if (/^(halo|hai|hi|hello|pagi|siang|sore|malam|assalamualaikum|permisi|punten)\b/.test(text)) {
    return 'Halo, saya chatbot akademik untuk membantu pertanyaan seputar Tugas Akhir dan Yudisium. Silakan tanyakan hal seperti pendaftaran TA, pencarian pembimbing, sidang TA, atau yudisium.';
  }

  if (/\b(terima kasih|makasih|thanks|thank you|sip|oke makasih)\b/.test(text)) {
    return 'Sama-sama. Semoga proses TA atau yudisiumnya lancar.';
  }

  if (/\b(bantuan|help|menu|apa bot anda|siapa kamu|bot apa|bisa apa)\b/.test(text)) {
    return 'Saya chatbot akademik berbasis dokumen untuk menjawab pertanyaan seputar Tugas Akhir dan Yudisium. Contoh pertanyaan: "bagaimana daftar sidang TA?", "bagaimana mencari pembimbing?", atau "bagaimana cara yudisium?".';
  }

  return null;
}

function isInScopeQuestion(message) {
  return /\b(ta|tugas akhir|proposal|sidang|yudisium|pembimbing|penguji|kelulusan|cumlaude|summa|ijazah|skripsi|pendaftaran sidang|bebas tunggakan|luaran|buku tugas akhir|aplikasi ta|sk|surat keputusan|bimbingan|tak|igracias|basila)\b/i.test(message || '');
}

function normalizeCasualText(message) {
  return String(message || '')
    .toLowerCase()
    .replace(/\bafa\b/g, 'ada')
    .replace(/\bpedomanya\b/g, 'pedomannya')
    .replace(/\bpedoman nya\b/g, 'pedomannya')
    .replace(/\blink nya\b/g, 'linknya')
    .replace(/\byg\b/g, 'yang')
    .replace(/\bgmn\b/g, 'bagaimana')
    .replace(/\bgimana\b/g, 'bagaimana')
    .replace(/\bcarany\b/g, 'caranya')
    .replace(/\bsidan\b/g, 'sidang')
    .replace(/\bsidang nya\b/g, 'sidang')
    .replace(/\bsidangnya\b/g, 'sidang')
    .replace(/\btau\b/g, 'tahu')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAcademicQuery(message) {
  let text = normalizeCasualText(message);
  text = text.replace(/\bta\b/g, 'tugas akhir');
  text = text.replace(/\bpa\b/g, 'pembimbing akademik');
  text = text.replace(/\bstep\b/g, 'langkah');
  text = text.replace(/\bdaftar\b/g, 'pendaftaran');
  text = text.replace(/\bmencari\b/g, 'cari');
  text = text.replace(/\bmulai tugas akhir\b/g, 'langkah awal proposal tugas akhir pendaftaran tugas akhir pengajuan pembimbing');
  text = text.replace(/\bmemulai tugas akhir\b/g, 'langkah awal proposal tugas akhir pendaftaran tugas akhir pengajuan pembimbing');
  text = text.replace(/\byudisium bagaimana caranya\b/g, 'cara pendaftaran yudisium basila ijazah linktree akademik');
  text = text.replace(/\blangkah yudisium\b/g, 'cara pendaftaran yudisium basila ijazah linktree akademik');
  text = text.replace(/\bsurat keputusan\b/g, 'surat keputusan sk pembimbing tugas akhir');
  text = text.replace(/\bsk\b/g, 'surat keputusan sk pembimbing tugas akhir');
  return text;
}

function inferTopic(message) {
  const text = normalizeAcademicQuery(message);
  if (/\bjadwal\b/.test(text) && /\bsidang|yudisium|tugas akhir\b/.test(text)) return 'jadwal';
  if (/\bsidang(?:nya)?\b/.test(text)) return 'sidang';
  if (/\byudisium|basila|ijazah\b/.test(text)) return 'yudisium';
  if (/\bbuku|pedoman|template|linktree|link\b/.test(text)) return 'pedoman';
  if (/\bpembimbing|bimbingan|surat keputusan|sk\b/.test(text)) return 'pembimbing';
  if (/\btugas akhir|proposal\b/.test(text)) return 'ta';
  return null;
}

function sourceBlock(includeSources, sources) {
  if (!includeSources) return '';
  return `\n\nSumber:\n${sources.map(source => `- ${source}`).join('\n')}`;
}

function getGuidedIntentResponse(message, includeSources = false, previousTopic = null) {
  const text = normalizeCasualText(message);
  const topic = inferTopic(text) || previousTopic;
  const asksLink = /\blink|url|akses|download\b/.test(text);
  const asksGuide = /\b(pedoman|pedomannya|buku|template|panduan)\b/.test(text);
  const asksRequirements = /\b(syarat|persyaratan|berkas|dokumen|ketentuan|apa saja)\b/.test(text);
  const asksSchedule = /\b(jadwal|tanggal|periode|kapan)\b/.test(text);
  const asksSteps = /\b(step|langkah|cara|bagaimana|mulai|memulai|daftar|pendaftaran|harus|lakukan|bingung|dibimbing|cari|mencari|ingin|tahu)\b/.test(text);

  if (topic === 'pedoman' && (asksGuide || asksLink)) {
    return `Ya, ada buku pedoman/panduan untuk Tugas Akhir. Untuk akses dokumen atau template TA, gunakan Linktree Akademik: https://linktr.ee/laa.upps.sby.${sourceBlock(includeSources, ['buku pedoman pelakasanaan proposal dan tugas akhir.pdf'])}`;
  }

  if (topic === 'yudisium' && asksSteps) {
    return `Untuk mengikuti yudisium, langkah umumnya seperti ini:\n\n1. Pastikan data dan foto ijazah di iBasila sudah sesuai dan berstatus "Approved".\n2. Siapkan berkas validasi biodata/dummy ijazah jika diminta oleh akademik/SSC.\n3. Lakukan pendaftaran yudisium melalui Linktree Akademik: https://linktr.ee/laa.upps.sby.\n4. Tunggu proses verifikasi dan hasil yudisium dari akademik.\n\nJika ada jadwal atau periode tertentu, ikuti pengumuman akademik terbaru yang tersedia di dokumen jadwal yudisium.${sourceBlock(includeSources, ['JADWAL SIDANG TUGAS AKHIR DAN YUDISIUM SEMESTER GENAP TAHUN.pdf'])}`;
  }

  if (topic === 'jadwal' || ((topic === 'sidang' || topic === 'yudisium') && asksSchedule)) {
    return `Untuk jadwal sidang Tugas Akhir dan yudisium, ikuti jadwal resmi semester berjalan dari akademik/SSC. Informasi biasanya diumumkan melalui dokumen jadwal, Linktree Akademik, atau kanal akademik kampus.\n\nUntuk akses informasi akademik, gunakan Linktree Akademik: https://linktr.ee/laa.upps.sby.\n\nJika kamu ingin tanggal yang benar-benar pasti, sebaiknya cek dokumen jadwal terbaru atau konfirmasi ke SSC karena jadwal dapat berubah mengikuti periode akademik.${sourceBlock(includeSources, ['JADWAL SIDANG TUGAS AKHIR DAN YUDISIUM SEMESTER GENAP TAHUN.pdf', 'cad03059-312a-4667-addd-c58bab99a700_Surat-Edaran-Jadwal-Sidang-Tugas-Akhir-dan-Yudisium-Semester-Genap-2526---Lampiran.pdf'])}`;
  }

  if (topic === 'sidang' && (asksRequirements || asksSteps)) {
    return `Untuk mendaftar atau mengikuti sidang Tugas Akhir, alur umumnya seperti ini:\n\n1. Pastikan penyusunan TA sudah selesai dan mendapat persetujuan dosen pembimbing.\n2. Lengkapi persyaratan administrasi sidang TA sesuai pengumuman akademik.\n3. Siapkan dokumen TA/buku TA sesuai template dan ketentuan yang berlaku.\n4. Lakukan pendaftaran sidang TA melalui Linktree Akademik atau aplikasi/kanal akademik yang ditentukan.\n5. Tunggu verifikasi dan jadwal sidang dari pihak akademik/PIC TA.\n\nUntuk akses pendaftaran dan panduan, gunakan https://linktr.ee/laa.upps.sby. Jika ingin daftar berkas yang paling detail, cek dokumen persyaratan pendaftaran sidang TA atau konfirmasi ke SSC karena persyaratan dapat mengikuti periode berjalan.${sourceBlock(includeSources, ['Persyaratan Pendaftaran Sidang Tugas Akhir.pdf', '1. Panduan Pendaftaran Sidang TA TUS.pdf', 'JADWAL SIDANG TUGAS AKHIR DAN YUDISIUM SEMESTER GENAP TAHUN.pdf'])}`;
  }

  if (topic === 'ta' && /\b(takut|cemas|khawatir|bingung)\b/.test(text)) {
    return 'Wajar kalau merasa bingung atau takut mulai TA. Mulai dari langkah kecil dulu: pilih area/topik yang kamu minati, baca pedoman TA, diskusikan ide dengan calon pembimbing atau prodi, lalu susun proposal sesuai template. Setelah proposal siap, lanjutkan proses pendaftaran proposal/TA melalui jalur akademik yang tersedia.';
  }

  if (topic === 'ta' && asksSteps) {
    return `Untuk memulai Tugas Akhir, alurnya bisa kamu ikuti seperti ini:\n\n1. Tentukan topik atau masalah yang ingin diselesaikan.\n2. Cari dan ajukan calon dosen pembimbing melalui fitur/panduan TA-PA.\n3. Susun proposal TA sesuai buku pedoman dan template.\n4. Lakukan bimbingan proposal sampai memenuhi ketentuan.\n5. Daftar seminar proposal atau proses TA melalui Linktree Akademik/iGracias sesuai panduan.\n6. Setelah proposal/TA disetujui, lanjutkan penyusunan buku TA dan pendaftaran sidang.\n\nUntuk akses panduan dan template, gunakan https://linktr.ee/laa.upps.sby.${sourceBlock(includeSources, ['buku pedoman pelakasanaan proposal dan tugas akhir.pdf', 'Panduan-Aplikasi-TA-PA-Mahasiswa-Versi-3.3--16-Maret-2015-.pdf'])}`;
  }

  if (topic === 'pembimbing' && asksSteps) {
    return `Untuk mencari atau mengajukan pembimbing, gunakan menu "Pengajuan Pembimbing" pada aplikasi TA/PA. Masukkan kode dosen calon pembimbing, lalu ajukan/request. Setelah pengajuan diproses, persetujuan akan mengikuti alur akademik/kelompok keahlian yang berlaku.${sourceBlock(includeSources, ['Panduan-Aplikasi-TA-PA-Mahasiswa-Versi-3.3--16-Maret-2015-.pdf', '10.-Surat-Edaran-Persyaratan-Pembimbing-dan-Penguji-Tugas-Akhir.pdf'])}`;
  }

  return null;
}

function cleanAnswer(answer, includeSources) {
  let text = String(answer || '').trim();
  if (!includeSources) {
    text = text
      .replace(/\s*\(Sumber:[^)]+\)/gi, '')
      .replace(/\s*\[Sumber:[^\]]+\]/gi, '')
      .replace(/^Sumber:.*$/gim, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  return text;
}

function normalizeTextMessage(message) {
  if (!message) return '';
  if (message.type === 'text') return message.text && message.text.body ? message.text.body.trim() : '';
  if (message.type === 'button') return message.button && message.button.text ? message.button.text.trim() : '';
  if (message.type === 'interactive') {
    const interactive = message.interactive || {};
    return interactive.button_reply?.title || interactive.list_reply?.title || '';
  }
  return '';
}

function uniqueSources(contextItems) {
  return [...new Set(contextItems.map(item => item.source).filter(Boolean))];
}

function buildLlmPrompt(question, contextItems, includeSources) {
  const contextBlock = ragEngine.buildContextBlock(contextItems);
  const sources = uniqueSources(contextItems);
  const sourceInstruction = includeSources
    ? 'Jika pengguna meminta sumber, tutup jawaban dengan daftar "Sumber:" berisi nama dokumen dari konteks.'
    : 'Jangan tampilkan sumber dokumen, nama file, kutipan "Sumber:", atau referensi dokumen dalam bentuk apa pun kecuali pengguna memintanya.';

  return [
    'Anda adalah chatbot akademik berbahasa Indonesia untuk mahasiswa Telkom University Surabaya.',
    'Ruang lingkup jawaban hanya Tugas Akhir, Proposal TA, sidang TA, yudisium, kelulusan studi, dan dokumen administrasi terkait.',
    'Jawab hanya berdasarkan konteks dokumen yang diberikan.',
    `Jika konteks tidak cukup atau pertanyaan di luar ruang lingkup, jawab persis: "${FALLBACK_RESPONSE}"`,
    'Gunakan gaya singkat, jelas, sopan, dan operasional seperti admin SSC.',
    sourceInstruction,
    '',
    `Konteks dokumen:\n${contextBlock}`,
    '',
    `Pertanyaan mahasiswa:\n${question}`,
    '',
    `Dokumen relevan yang boleh disebut sebagai sumber: ${sources.join(', ') || '-'}`
  ].join('\n');
}

async function generateGeminiAnswer(question, contextItems, includeSources) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY belum diatur.');
  }

  const prompt = buildLlmPrompt(question, contextItems, includeSources);
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: Number(process.env.GEMINI_MAX_TOKENS || 450)
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
  return text || FALLBACK_RESPONSE;
}

async function generateGroqAnswer(question, contextItems, includeSources) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY belum diatur.');
  }

  const prompt = buildLlmPrompt(question, contextItems, includeSources);
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: 'Anda menjawab sebagai chatbot akademik SSC. Jawab dalam bahasa Indonesia, singkat, dan hanya berdasarkan konteks.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: Number(process.env.GROQ_MAX_TOKENS || 450)
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || FALLBACK_RESPONSE;
}

async function generateAnswerWithFallback(question, contextItems, includeSources) {
  try {
    return await generateGeminiAnswer(question, contextItems, includeSources);
  } catch (geminiError) {
    console.error('Gemini error, mencoba Groq:', geminiError.message);
    return await generateGroqAnswer(question, contextItems, includeSources);
  }
}

async function answerQuestion(question, options = {}) {
  const smallTalk = getSmallTalkResponse(question);
  if (smallTalk) return smallTalk;

  const includeSources = wantsSources(question);
  const guidedAnswer = getGuidedIntentResponse(question, includeSources, options.previousTopic);
  if (guidedAnswer) return guidedAnswer;

  const documents = datasetManager.getAllDocuments();
  if (!documents.length) {
    return 'Basis dokumen masih kosong. Silakan upload dokumen TA atau yudisium melalui dashboard admin.';
  }

  const expandedQuestion = normalizeAcademicQuery(question);
  const contextItems = ragEngine.retrieveContext(
    expandedQuestion,
    documents,
    Number(process.env.RAG_TOP_K || 5)
  );
  const relevantItems = contextItems.filter(item => item.score >= Number(process.env.RAG_MIN_SCORE || 0.12));

  if (!isInScopeQuestion(expandedQuestion) || !relevantItems.length) return FALLBACK_RESPONSE;

  try {
    const answer = await generateAnswerWithFallback(question, relevantItems, includeSources);
    let cleanedAnswer = cleanAnswer(answer, includeSources);
    if (includeSources && !/\bSumber:/i.test(cleanedAnswer)) {
      cleanedAnswer += `\n\nSumber:\n${uniqueSources(relevantItems).map(source => `- ${source}`).join('\n')}`;
    }
    return cleanedAnswer;
  } catch (error) {
    console.error('LLM fallback error:', error.message);
    return 'Maaf, terjadi kendala saat memproses jawaban AI. Silakan coba lagi beberapa saat atau hubungi SSC untuk konfirmasi.';
  }
}

async function sendWhatsAppText(to, body) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.log('WhatsApp env belum lengkap. Jawaban tidak dikirim:', { to, body });
    return;
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        preview_url: false,
        body
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WhatsApp API error ${response.status}: ${errorText}`);
  }
}

async function handleWebJsMessage(msg) {
  const messageId = msg.id?._serialized;
  if (messageId && handledMessageIds.has(messageId)) return;
  if (messageId) {
    handledMessageIds.add(messageId);
    setTimeout(() => handledMessageIds.delete(messageId), 10 * 60 * 1000);
  }

  if (msg.fromMe) return;

  const isPersonalChat = msg.from.endsWith('@c.us') || msg.from.endsWith('@lid');
  const isNotStatus = !msg.from.endsWith('@status');
  if (!isPersonalChat || !isNotStatus) return;

  let text = String(msg.body || '').trim();
  if (!text) {
    await msg.reply('Saat ini saya hanya dapat memproses pesan teks.');
    return;
  }

  const previous = conversationMemory.get(msg.from) || {};
  if (/^(oke\s+)?(setelah itu|lalu|lanjut|selanjutnya|terus|berikutnya)\??$/i.test(text) && previous.lastQuestion) {
    text = `${previous.lastQuestion}. Pertanyaan lanjutan: ${text}`;
  } else if (/^(apakah\s+)?(ada\s+)?(link|linknya|url|download)(\s+nya)?\??$/i.test(text) && previous.lastQuestion) {
    text = `${previous.lastQuestion}. Pertanyaan lanjutan: ${text}`;
  }

  try {
    const chat = await msg.getChat();
    await chat.sendStateTyping();
  } catch (error) {
    console.log('Tidak bisa mengirim typing indicator:', error.message);
  }

  const answer = await answerQuestion(text, { previousTopic: previous.topic });
  conversationMemory.set(msg.from, {
    lastQuestion: text,
    topic: inferTopic(text) || previous.topic
  });
  setTimeout(() => conversationMemory.delete(msg.from), 30 * 60 * 1000);
  await msg.reply(answer);
}

function createWhatsAppClient() {
  const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'rag-ta-yudisium' }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-default-apps'
      ]
    }
  });

  client.on('qr', async qr => {
    waReady = false;
    waQrDataUrl = await qrcode.toDataURL(qr, { width: 300, margin: 2 });
    console.log('QR WhatsApp dibuat. Scan dari dashboard atau terminal.');
    qrcodeTerminal.generate(qr, { small: true });
  });

  client.on('authenticated', () => {
    console.log('WhatsApp berhasil autentikasi.');
  });

  client.on('ready', () => {
    console.log('WhatsApp bot siap menerima pesan.');
    waReady = true;
    waInitializing = false;
    waStopping = false;
    waQrDataUrl = null;
  });

  client.on('disconnected', reason => {
    console.log('WhatsApp terputus:', reason);
    waReady = false;
    waInitializing = false;
    waStopping = false;
    waClient = null;
    waQrDataUrl = null;
  });

  client.on('message', handleWebJsMessage);

  return client;
}

async function startWhatsAppQrBot() {
  if (waReady || waInitializing) {
    return { success: false, message: 'Bot WhatsApp sudah berjalan atau sedang dimulai.' };
  }

  waInitializing = true;
  waStopping = false;
  waQrDataUrl = null;

  try {
    waClient = createWhatsAppClient();
    waClient.initialize().catch(error => {
      console.error('Inisialisasi WhatsApp gagal:', error.message);
      waClient = null;
      waReady = false;
      waInitializing = false;
      waQrDataUrl = null;
    });
    return { success: true, message: 'Bot dimulai. Scan QR yang muncul di dashboard.' };
  } catch (error) {
    waClient = null;
    waReady = false;
    waInitializing = false;
    waQrDataUrl = null;
    throw error;
  }
}

async function stopWhatsAppQrBot() {
  if (!waClient) {
    waReady = false;
    waInitializing = false;
    waQrDataUrl = null;
    return { success: false, message: 'Bot WhatsApp belum berjalan.' };
  }

  const clientToStop = waClient;
  waClient = null;
  waReady = false;
  waInitializing = false;
  waStopping = true;
  waQrDataUrl = null;

  try {
    await clientToStop.destroy();
    waStopping = false;
    return { success: true, message: 'Bot WhatsApp dihentikan.' };
  } catch (error) {
    waStopping = false;
    return { success: false, message: `Gagal menghentikan bot: ${error.message}` };
  }
}

async function processIncomingWhatsAppMessage(message) {
  const messageId = message.id;
  if (messageId && handledMessageIds.has(messageId)) return;
  if (messageId) {
    handledMessageIds.add(messageId);
    setTimeout(() => handledMessageIds.delete(messageId), 10 * 60 * 1000);
  }

  const from = message.from;
  const text = normalizeTextMessage(message);
  if (!from || !text) {
    if (from) await sendWhatsAppText(from, 'Saat ini saya hanya dapat memproses pesan teks.');
    return;
  }

  const answer = await answerQuestion(text);
  await sendWhatsAppText(from, answer);
}

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post('/webhook', (req, res) => {
  res.sendStatus(200);

  const entries = req.body.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const messages = change.value?.messages || [];
      for (const message of messages) {
        processIncomingWhatsAppMessage(message).catch(error => {
          console.error('Webhook message error:', error.message);
        });
      }
    }
  }
});

app.get('/api/bot/status', (req, res) => {
  res.json({
    mode: 'whatsapp-web-qr',
    isReady: waReady,
    isInitializing: waInitializing,
    isStopping: waStopping,
    hasQr: Boolean(waQrDataUrl)
  });
});

app.post('/api/bot/start', async (req, res) => {
  try {
    const result = await startWhatsAppQrBot();
    res.json(result);
  } catch (error) {
    console.error('Gagal memulai bot QR:', error.message);
    res.status(500).json({ success: false, message: `Gagal memulai bot: ${error.message}` });
  }
});

app.post('/api/bot/stop', async (req, res) => {
  const result = await stopWhatsAppQrBot();
  res.status(result.success ? 200 : 400).json(result);
});

app.get('/api/bot/qr', (req, res) => {
  res.json({ qr: waQrDataUrl });
});

app.get('/api/status', (req, res) => {
  res.json({
    server: 'online',
    documents: datasetManager.getSourceDocuments().length,
    chunks: datasetManager.getAllDocuments().length,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    whatsappConfigured: waReady,
    whatsappMode: 'QR Scan',
    webhookPath: '/webhook',
    verifyToken: WEBHOOK_VERIFY_TOKEN
  });
});

app.get('/api/documents', (req, res) => {
  res.json({
    documents: datasetManager.getSourceDocuments(),
    chunks: datasetManager.getAllDocuments().length
  });
});

app.post('/api/documents/upload', upload.array('documents', 20), async (req, res) => {
  try {
    if (!req.files || !req.files.length) {
      return res.status(400).json({ success: false, message: 'Pilih minimal satu dokumen.' });
    }

    const result = await datasetManager.ingestUploadedFiles(req.files);
    ragEngine.clearCache();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/documents/:id', (req, res) => {
  try {
    const result = datasetManager.deleteSourceDocument(req.params.id);
    ragEngine.clearCache();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/chat/test', async (req, res) => {
  const question = String(req.body.question || '').trim();
  if (!question) return res.status(400).json({ message: 'Pertanyaan harus diisi.' });

  const answer = await answerQuestion(question);
  res.json({ answer });
});

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
  console.log(`Webhook WhatsApp: http://localhost:${PORT}/webhook`);
});

// ===================================================
// CONTOH PENAMBAHAN KE server-v2.js KAMU
// Copy bagian-bagian ini ke server-v2.js yang sudah ada
// ===================================================
const session = require('express-session');

const { connectDB } = require('./db');
const authRoutes = require('./routes/auth');
const { requireAuth, requireAdmin } = require('./middleware/authMiddleware');



// Koneksi ke MySQL
connectDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'rahasia',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 1 hari
}));

// Routes auth (register, login, logout, me)
app.use('/api/auth', authRoutes);

// ===== ROUTING HALAMAN =====
// Halaman login jadi default ('/')
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Public', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'Public', 'register.html'));
});

// Homepage, hanya bisa diakses kalau sudah login
app.get('/home', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'Public', 'index.html'));
});

// Admin dashboard, hanya bisa diakses admin
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'Public', 'admin.html'));
});

// Serve file static (CSS, JS, gambar, dll)
app.use(express.static(path.join(__dirname, 'Public')));



