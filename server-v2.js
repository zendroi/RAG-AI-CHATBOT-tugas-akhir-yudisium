require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const session = require('express-session');

const RAGEngine = require('./Lib/rag');
const DatasetManager = require('./Lib/dataset');
const PagesManager = require('./Lib/pages');
const { matchDocumentRequest, matchLinkSource } = require('./Lib/documentDelivery');

const RoutesManager = require('./routes');
const { connectDB } = require('./db');
const authRoutes = require('./routes/auth');
const { requireAuth, requireAdmin } = require('./middleware/authMiddleware');

const app = express();
const PORT = Number(process.env.PORT || 3001);
const FALLBACK_RESPONSE = 'Maaf, saya belum menemukan informasi tersebut pada dokumen TA atau yudisium yang tersedia. Silakan hubungi SSC untuk konfirmasi lebih lanjut.';

const uploadDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 20) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.docx', '.txt', '.xlsx', '.xls', '.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return cb(null, true);
    cb(new Error('Format dokumen harus PDF, DOCX, TXT, XLSX, atau gambar (PNG/JPG/WEBP).'));
  }
});

connectDB();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'rahasia',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 hari
}));

const ragEngine = new RAGEngine();
const datasetManager = new DatasetManager();
const pagesManager = new PagesManager();
const routesManager = new RoutesManager(app, path);

routesManager.init();
routesManager.knowledge(ragEngine, datasetManager, upload);
routesManager.smartCheck();

app.use('/api/auth', authRoutes);

// ===== ROUTING HALAMAN =====
function redirectIfLoggedIn(req, res) {
  if (!req.session.user) return false;
  res.redirect(req.session.user.role === 'admin' ? '/admin' : '/chat');
  return true;
}

app.get('/', (req, res) => {
  if (redirectIfLoggedIn(req, res)) return;
  res.sendFile(path.join(__dirname, 'Public', 'landing.html'));
});

app.get('/login', (req, res) => {
  if (redirectIfLoggedIn(req, res)) return;
  res.sendFile(path.join(__dirname, 'Public', 'login.html'));
});

app.get('/register', (req, res) => {
  if (redirectIfLoggedIn(req, res)) return;
  res.sendFile(path.join(__dirname, 'Public', 'register.html'));
});

app.get('/chat', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'Public', 'chat.html'));
});

// Old bookmarks/links — keep working, just hop to the renamed route.
app.get('/home', requireAuth, (req, res) => res.redirect('/chat'));

app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'Public', 'admin.html'));
});

// Sidebar partial content depends on role (admin dashboard nav vs student chat nav) —
// needs a real route (not a static file) so it can branch on the session.
app.get('/partials/sidebar.html', (req, res) => {
  const file = req.session.user?.role === 'admin' ? 'sidebar.html' : 'sidebar-student.html';
  res.sendFile(path.join(__dirname, 'Public', 'partials', file));
});

// Long cache for static images (the silk-wave backdrop) so full-page navigations
// (login/register/home) don't redecode/refetch it every single time.
app.use('/assets', express.static(path.join(__dirname, 'Public', 'assets'), { maxAge: '30d', immutable: true }));
app.use(express.static('Public'));
app.use(express.static(path.join(__dirname, 'dist')));

function wantsSources(message) {
  return /\b(sumber(?:nya)?|dokumen(?:nya)?|referensi(?:nya)?|rujukan(?:nya)?|dari mana|asal jawaban)\b/i.test(message || '');
}

// Only attach actual document download links when the student's question signals they
// need the file itself (template/form/doc/link/etc) — not on every plain Q&A answer, so
// the bot leads with a real, document-grounded text answer instead of link spam.
function wantsDocumentLink(message) {
  return /\b(dokumen(?:nya)?|document(?:nya)?|file(?:nya)?|template|formulir|berkas|link(?:nya)?|unduh|download|kirim(?:kan)?|minta|surat|form|mana(?:kah)?)\b/i.test(message || '');
}

function getSmallTalkResponse(message) {
  const text = String(message || '').toLowerCase().trim();
  // A message that merely *starts* with "halo"/"hai" but goes on to ask a real
  // question (e.g. "halo saya ingin tahu kapan jadwal yudisium") must NOT be
  // short-circuited into the generic greeting — only treat it as small talk when
  // the whole message is short (just the greeting, give or take a word or two).
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  if (wordCount <= 4 && /^(halo|hai|hi|hello|pagi|siang|sore|malam|assalamualaikum|permisi|punten)\b/.test(text)) {
    return 'Halo, saya chatbot akademik untuk membantu pertanyaan seputar Tugas Akhir dan Yudisium. Silakan tanyakan hal seperti pendaftaran TA, pencarian pembimbing, sidang TA, atau yudisium.';
  }

  if (wordCount <= 5 && /\b(terima kasih|makasih|thanks|thank you|sip|oke makasih)\b/.test(text)) {
    return 'Sama-sama. Semoga proses TA atau yudisiumnya lancar.';
  }

  if (wordCount <= 6 && /\b(bantuan|help|menu|apa bot anda|siapa kamu|bot apa|bisa apa)\b/.test(text)) {
    return 'Saya chatbot akademik berbasis dokumen untuk menjawab pertanyaan seputar Tugas Akhir dan Yudisium. Contoh pertanyaan: "bagaimana daftar sidang TA?", "bagaimana mencari pembimbing?", atau "bagaimana cara yudisium?".';
  }

  return null;
}

function isInScopeQuestion(message) {
  return /\b(ta|tugas akhir|proposal|sidang|yudisium|pembimbing|penguji|kelulusan|cumlaude|summa|ijazah|skripsi|pendaftaran sidang|bebas tunggakan|bebas pustaka|bebas keuangan|bebas laboratorium|pustaka|perpustakaan|wisuda|luaran|buku tugas akhir|aplikasi ta|sk|surat keputusan|bimbingan|tak|igracias|basila|similarity|cek similarity|ithenticate|sks|ipk|predikat)\b/i.test(message || '');
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
  if (/\byudisium|basila|ijazah|kelulusan|\blulus\b/.test(text)) return 'yudisium';
  if (/\bbuku|pedoman|template|linktree|link\b/.test(text)) return 'pedoman';
  if (/\bpembimbing|bimbingan|surat keputusan|sk\b/.test(text)) return 'pembimbing';
  if (/\btugas akhir|proposal\b/.test(text)) return 'ta';
  return null;
}

function detectSmartCheckIntent(message) {
  const text = normalizeCasualText(message);
  if (!/\b(cek kelayakan|cek syarat|cek status|apakah saya (bisa|boleh|sudah)|status kelayakan|sudah layak|memenuhi syarat|saya kurang|kurang apa|kurang dari saya|yang (masih )?kurang|apa (saja )?(yang )?(masih )?belum|belum (lengkap|cukup)|sudah (lengkap|cukup)|(syarat|persyaratan) (lulus|kelulusan)|cek kelulusan)\b/.test(text)) {
    return null;
  }
  const topic = inferTopic(text);
  if (topic === 'yudisium') return 'yudisium';
  if (topic === 'sidang') return 'sidangTA';
  if (topic === 'ta') return 'tugasAkhir';
  return 'tugasAkhir';
}

function uniqueSourcesFromItems(items, topK = 2) {
  const sources = datasetManager.getSourceDocuments();
  const seen = new Map();
  for (const item of items) {
    if (seen.size >= topK) break;
    const source = sources.find(s => s.name === item.source);
    if (source && !seen.has(source.id)) seen.set(source.id, source);
  }
  return [...seen.values()];
}

function documentLinksBlock(sources) {
  if (!sources.length) return '';
  return `\n\nDokumen terkait:\n${sources.map(source => `- ${source.name} -> ${source.link || `/api/documents/${source.id}/download`}`).join('\n')}`;
}

// A .txt source whose entire content is a link (e.g. a Microsoft Forms URL) is useless to
// an LLM as prose context — the model tends to paraphrase around it instead of quoting the
// raw URL. Per explicit product rule: whenever the retrieved context includes one of these
// link-only sources, ALWAYS surface its link — unlike regular downloadable files, this is
// not gated behind the student explicitly asking for it.
function linkOnlySourcesFromItems(items) {
  const sources = datasetManager.getSourceDocuments();
  const seen = new Map();
  for (const item of items) {
    const source = sources.find(s => s.name === item.source);
    if (source && source.link && !seen.has(source.id)) seen.set(source.id, source);
  }
  return [...seen.values()];
}

function linkBlock(sources) {
  if (!sources.length) return '';
  return `\n\nLink terkait:\n${sources.map(source => `- ${source.name}: ${source.link}`).join('\n')}`;
}

// No hardcoded guided-intent canned answers anymore (pedoman/yudisium/sidang/ta/pembimbing
// steps used to live here as hand-written prose). Comparing them against the real RAG+LLM
// pipeline showed the canned text was consistently less accurate and less detailed than
// answers grounded in the actual ingested documents (missing real phone numbers, exact
// step sequences, document names, etc). Every content question now flows through RAG so
// the answer reflects what the documents actually say.

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

function uniqueSources(contextItems) {
  return [...new Set(contextItems.map(item => item.source).filter(Boolean))];
}

// Trim the context actually sent to the LLM so the prompt stays under free-tier token limits
// (Groq's free tier caps at 6000 tokens/minute — an over-budget prompt is rejected outright
// with HTTP 413, which would otherwise sink the whole answer). Also drops duplicate chunk text
// (the KB has some documents uploaded twice), so the budget is spent on distinct information.
function capContextForLlm(contextItems, charBudget = Number(process.env.LLM_CONTEXT_CHARS || 9000)) {
  const seen = new Set();
  const kept = [];
  let total = 0;
  for (const item of contextItems) {
    const norm = (item.text || '').replace(/\s+/g, ' ').trim();
    const key = norm.slice(0, 200);
    if (!norm || seen.has(key)) continue;
    seen.add(key);
    if (total + norm.length > charBudget && kept.length) break;
    kept.push(item);
    total += norm.length;
  }
  return kept;
}

function buildLlmPrompt(question, contextItems, includeSources) {
  const contextBlock = ragEngine.buildContextBlock(contextItems);
  const sources = uniqueSources(contextItems);
  const sourceInstruction = includeSources
    ? 'Jika pengguna meminta sumber, tutup jawaban dengan daftar "Sumber:" berisi nama dokumen dari konteks.'
    : 'Anda boleh menyebut nama dokumen secara alami di dalam kalimat jawaban jika itu membantu (misal: "Berdasarkan dokumen [nama], disebutkan bahwa..."), tapi jangan menutup jawaban dengan daftar terpisah berjudul "Sumber:" kecuali pengguna memintanya.';

  return [
    'Anda adalah chatbot akademik berbahasa Indonesia untuk mahasiswa Telkom University Surabaya.',
    'Ruang lingkup jawaban hanya Tugas Akhir, Proposal TA, sidang TA, yudisium, kelulusan studi, dan dokumen administrasi terkait.',
    'Jawab hanya berdasarkan konteks dokumen yang diberikan.',
    `Aturan fallback (pilih satu, jangan campur keduanya dalam satu respons): jawab persis "${FALLBACK_RESPONSE}" HANYA JIKA konteks dokumen di atas sama sekali tidak membahas topik pertanyaan, atau pertanyaan di luar ruang lingkup. Jika konteks membahas topik yang ditanya — walau tidak lengkap (misal prosedurnya ada tapi tanggal pastinya tidak disebutkan) — WAJIB jawab pakai informasi yang tersedia itu secara percaya diri, lalu sebutkan secara natural bagian yang belum tersedia di dokumen. Jangan pernah menulis kalimat fallback itu bersamaan dengan jawaban lain.`,
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

// Hardcoded last-resort list, only used if the live ListModels call fails entirely
// (e.g. network down) — otherwise the real candidate list is fetched from the API below.
const GEMINI_MODEL_FALLBACKS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-2.5-pro'
];

const geminiModelListCache = { models: null, fetchedAt: 0 };
const GEMINI_MODEL_LIST_TTL = 60 * 60 * 1000; // 1 hour

function geminiModelPriority(name) {
  if (/preview|exp/.test(name)) return 4;
  if (/flash-lite/.test(name)) return 0;
  if (/flash/.test(name)) return 1;
  if (/pro/.test(name)) return 2;
  return 3;
}

async function fetchAvailableGeminiModels(apiKey) {
  const now = Date.now();
  if (geminiModelListCache.models && now - geminiModelListCache.fetchedAt < GEMINI_MODEL_LIST_TTL) {
    return geminiModelListCache.models;
  }

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': apiKey }
    });
    if (!response.ok) throw new Error(`List models error ${response.status}`);

    const data = await response.json();
    const models = (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace(/^models\//, ''))
      .filter(name => /^gemini-/.test(name) && !/tts|image|computer-use|robotics|customtools/.test(name))
      .sort((a, b) => geminiModelPriority(a) - geminiModelPriority(b));

    if (models.length) {
      geminiModelListCache.models = models;
      geminiModelListCache.fetchedAt = now;
      return models;
    }
  } catch (error) {
    console.error('Gagal mengambil daftar model Gemini dari API, pakai daftar bawaan:', error.message);
  }

  return null;
}

async function getGeminiModelCandidates(apiKey) {
  const configured = (process.env.GEMINI_MODEL || '').trim();
  const extra = (process.env.GEMINI_MODELS || '').split(',').map(s => s.trim()).filter(Boolean);
  const discovered = (await fetchAvailableGeminiModels(apiKey)) || GEMINI_MODEL_FALLBACKS;
  return [...new Set([configured, ...extra, ...discovered].filter(Boolean))];
}

async function callGeminiModel(model, apiKey, prompt) {
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
        maxOutputTokens: Number(process.env.GEMINI_MAX_TOKENS || 800),
        // 2.5-series "thinking" models silently burn the maxOutputTokens budget on hidden
        // reasoning before writing the visible answer — without this, RAG answers were
        // getting cut off mid-sentence (e.g. 429 of 450 tokens spent on invisible
        // "thoughts", leaving 17 for the actual text). This is plain extraction from
        // supplied context, not a task that needs extended reasoning, so disable it.
        thinkingConfig: { thinkingBudget: 0 }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status} (model: ${model}): ${errorText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
}

async function generateGeminiAnswer(question, contextItems, includeSources) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY belum diatur.');
  }

  const prompt = buildLlmPrompt(question, contextItems, includeSources);
  const models = await getGeminiModelCandidates(apiKey);
  let lastError;

  for (const model of models) {
    try {
      const text = await callGeminiModel(model, apiKey, prompt);
      if (text) return text;
      lastError = new Error(`Model Gemini ${model} mengembalikan jawaban kosong.`);
    } catch (error) {
      console.error(`Gemini model ${model} gagal, coba model berikutnya:`, error.message);
      lastError = error;
    }
  }

  throw lastError || new Error('Semua model Gemini gagal diakses.');
}

// Mirrors the Gemini model-discovery approach: pull the live list of text-capable models
// from Groq's API instead of hardcoding one, so a quota/outage on one model falls through
// to the next instead of failing the whole Groq leg of the fallback chain.
const GROQ_MODEL_FALLBACKS = ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'];
const groqModelListCache = { models: null, fetchedAt: 0 };
const GROQ_MODEL_LIST_TTL = 60 * 60 * 1000; // 1 hour

function groqModelPriority(id) {
  if (/guard/.test(id)) return 9; // classifier models, not chat — sink to the bottom
  if (/8b-instant/.test(id)) return 0;
  if (/70b-versatile/.test(id)) return 1;
  if (/gpt-oss-20b/.test(id)) return 2;
  if (/gpt-oss-120b/.test(id)) return 3;
  if (/llama-4-scout/.test(id)) return 4;
  if (/qwen3-32b/.test(id)) return 5;
  if (/compound/.test(id)) return 7;
  return 6;
}

async function fetchAvailableGroqModels(apiKey) {
  const now = Date.now();
  if (groqModelListCache.models && now - groqModelListCache.fetchedAt < GROQ_MODEL_LIST_TTL) {
    return groqModelListCache.models;
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!response.ok) throw new Error(`List models error ${response.status}`);

    const data = await response.json();
    const models = (data.data || [])
      .filter(m => m.active && (m.input_modalities || []).includes('text') && (m.output_modalities || []).includes('text'))
      .map(m => m.id)
      .filter(id => !/prompt-guard/.test(id))
      .sort((a, b) => groqModelPriority(a) - groqModelPriority(b));

    if (models.length) {
      groqModelListCache.models = models;
      groqModelListCache.fetchedAt = now;
      return models;
    }
  } catch (error) {
    console.error('Gagal mengambil daftar model Groq dari API, pakai daftar bawaan:', error.message);
  }

  return null;
}

async function getGroqModelCandidates(apiKey) {
  const configured = (process.env.GROQ_MODEL || '').trim();
  const extra = (process.env.GROQ_MODELS || '').split(',').map(s => s.trim()).filter(Boolean);
  const discovered = (await fetchAvailableGroqModels(apiKey)) || GROQ_MODEL_FALLBACKS;
  return [...new Set([configured, ...extra, ...discovered].filter(Boolean))];
}

async function callGroqModel(model, apiKey, prompt) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
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
      max_tokens: Number(process.env.GROQ_MAX_TOKENS || 800)
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error ${response.status} (model: ${model}): ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim();
}

async function generateGroqAnswer(question, contextItems, includeSources) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY belum diatur.');
  }

  const prompt = buildLlmPrompt(question, contextItems, includeSources);
  const models = await getGroqModelCandidates(apiKey);
  let lastError;

  for (const model of models) {
    try {
      const text = await callGroqModel(model, apiKey, prompt);
      if (text) return text;
      lastError = new Error(`Model Groq ${model} mengembalikan jawaban kosong.`);
    } catch (error) {
      console.error(`Groq model ${model} gagal, coba model berikutnya:`, error.message);
      lastError = error;
    }
  }

  throw lastError || new Error('Semua model Groq gagal diakses.');
}

async function generateAnswerWithFallback(question, contextItems, includeSources) {
  try {
    return await generateGeminiAnswer(question, contextItems, includeSources);
  } catch (geminiError) {
    console.error('Gemini error, mencoba Groq:', geminiError.message);
    return await generateGroqAnswer(question, contextItems, includeSources);
  }
}

async function answerQuestion(question) {
  const smallTalk = getSmallTalkResponse(question);
  if (smallTalk) return smallTalk;

  const includeSources = wantsSources(question);
  const wantsDoc = wantsDocumentLink(question);

  const documents = datasetManager.getAllDocuments();
  if (!documents.length) {
    return 'Basis dokumen masih kosong. Silakan upload dokumen TA atau yudisium melalui dashboard admin.';
  }

  const expandedQuestion = normalizeAcademicQuery(question);
  if (!isInScopeQuestion(expandedQuestion)) return FALLBACK_RESPONSE;

  const contextItems = ragEngine.retrieveContext(
    expandedQuestion,
    documents,
    Number(process.env.RAG_TOP_K || 8)
  );
  const relevantItems = contextItems.filter(item => item.score >= Number(process.env.RAG_MIN_SCORE || 0.12));

  // In-scope but nothing scored high enough for a grounded text answer — rather than a
  // bare apology, point the student at the closest-matching document(s) so they have
  // something actionable instead of a dead end.
  if (!relevantItems.length) {
    const looseItems = contextItems.filter(item => item.score >= 0.05);
    const linkSources = linkOnlySourcesFromItems(looseItems);
    const linkSourceIds = new Set(linkSources.map(s => s.id));
    const regularDocs = uniqueSourcesFromItems(looseItems, 3).filter(s => !linkSourceIds.has(s.id));
    const fallbackDocs = documentLinksBlock(regularDocs) + linkBlock(linkSources);
    return fallbackDocs
      ? `${FALLBACK_RESPONSE} Sambil menunggu konfirmasi SSC, kamu bisa cek dokumen berikut yang kemungkinan relevan:${fallbackDocs}`
      : FALLBACK_RESPONSE;
  }

  try {
    const llmItems = capContextForLlm(relevantItems);
    const answer = await generateAnswerWithFallback(question, llmItems, includeSources);
    let cleanedAnswer = cleanAnswer(answer, includeSources);
    if (includeSources && !/\bSumber:/i.test(cleanedAnswer)) {
      cleanedAnswer += `\n\nSumber:\n${uniqueSources(relevantItems).map(source => `- ${source}`).join('\n')}`;
    }
    const linkSources = linkOnlySourcesFromItems(relevantItems);
    const linkSourceIds = new Set(linkSources.map(s => s.id));
    if (wantsDoc || cleanedAnswer.includes(FALLBACK_RESPONSE)) {
      // Either the student explicitly asked for the file, or the LLM itself gave up
      // despite having some context — in both cases, hand over the actual document
      // instead of leaving them with just an apology.
      const regularDocs = uniqueSourcesFromItems(relevantItems, 2).filter(s => !linkSourceIds.has(s.id));
      cleanedAnswer += documentLinksBlock(regularDocs);
    }
    // Link-only sources (.txt with a Microsoft Forms URL etc) always surface their link
    // when topic-relevant, regardless of whether the student explicitly asked for it.
    cleanedAnswer += linkBlock(linkSources);
    return cleanedAnswer;
  } catch (error) {
    console.error('LLM fallback error:', error.message);
    return 'Maaf, terjadi kendala saat memproses jawaban AI. Silakan coba lagi beberapa saat atau hubungi SSC untuk konfirmasi.';
  }
}

app.get('/api/status', (req, res) => {
  res.json({
    server: 'online',
    documents: datasetManager.getSourceDocuments().length,
    chunks: datasetManager.getAllDocuments().length,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY)
  });
});

app.get('/api/data-Pages', (req, res) => {
  res.json({
    pages: pagesManager.readPages()
  });
});

app.post('/api/chat', requireAuth, async (req, res) => {
  const question = String(req.body.question || '').trim();
  if (!question) return res.status(400).json({ message: 'Pertanyaan harus diisi.' });

  const smartCheckJenis = detectSmartCheckIntent(question);
  if (smartCheckJenis) {
    return res.json({
      answer: 'Baik, mari cek kelayakan kamu. Silakan isi form berikut ini.',
      action: 'smart_check_form',
      jenis: smartCheckJenis
    });
  }

  const sources = datasetManager.getSourceDocuments();

  const linkMatch = matchLinkSource(question, sources);
  if (linkMatch) {
    return res.json({
      answer: `Untuk **${linkMatch.name}**, silakan akses link berikut:\n${linkMatch.link}`
    });
  }

  const docMatch = matchDocumentRequest(question, sources);
  if (docMatch) {
    return res.json({
      answer: docMatch.link
        ? `Untuk **${docMatch.name}**, silakan akses link berikut:\n${docMatch.link}`
        : `Berikut dokumen yang Anda minta: **${docMatch.name}**\nUnduh: /api/documents/${docMatch.id}/download`
    });
  }

  const answer = await answerQuestion(question);
  res.json({ answer });
});

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});
