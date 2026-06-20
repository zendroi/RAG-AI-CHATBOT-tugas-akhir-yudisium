const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const documentCount = document.getElementById('documentCount');
const chunkCount = document.getElementById('chunkCount');
const geminiStatus = document.getElementById('geminiStatus');
const whatsappStatus = document.getElementById('whatsappStatus');
const webhookInfo = document.getElementById('webhookInfo');
const documentList = document.getElementById('documentList');
const uploadForm = document.getElementById('uploadForm');
const uploadBtn = document.getElementById('uploadBtn');
const uploadMessage = document.getElementById('uploadMessage');
const botStatusText = document.getElementById('botStatusText');
const startBotBtn = document.getElementById('startBotBtn');
const stopBotBtn = document.getElementById('stopBotBtn');
const qrBox = document.getElementById('qrBox');
const qrImage = document.getElementById('qrImage');
const askBtn = document.getElementById('askBtn');
const question = document.getElementById('question');
const answer = document.getElementById('answer');

const API_URL = '/api';

function setText(element, value) {
  element.textContent = value;
}

function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

const getEl = (id) => document.getElementById(id);

function getStatusDot() {
  return document.getElementById('statusDot');
}

async function loadStatus() {
  const response = await fetch('/api/status');
  const data = await response.json();

  const statusDot = getEl('statusDot');
  const statusText = getEl('statusText');

  if (statusDot) statusDot.classList.toggle('ok', data.server === 'online');
  if (statusText) setText(statusText, data.server === 'online' ? 'Server online' : 'Server offline');

  // ... lanjut ke elemen lainnya dengan pola yang sama ...
  setText(getEl('documentCount'), String(data.documents || 0));
  setText(chunkCount, String(data.chunks || 0));
  setText(geminiStatus, data.geminiConfigured ? 'Siap' : 'Belum');
  setText(whatsappStatus, data.whatsappConfigured ? 'Siap' : 'Belum');
  setText(webhookInfo, `Path webhook: ${data.webhookPath} | Verify token: ${data.verifyToken}`);
}

async function loadBotStatus() {
  const response = await fetch('/api/bot/status');
  const data = await response.json();

  startBotBtn.style.display = data.isReady || data.isInitializing ? 'none' : 'inline-flex';
  stopBotBtn.style.display = data.isReady || data.isInitializing || data.hasQr ? 'inline-flex' : 'none';

  if (data.isReady) {
    setText(botStatusText, 'Bot WhatsApp terhubung dan siap membalas pesan.');
    qrBox.style.display = 'none';
    qrImage.removeAttribute('src');
    return;
  }

  if (data.hasQr) {
    setText(botStatusText, 'Menunggu scan QR WhatsApp.');
    const qrResponse = await fetch('/api/bot/qr');
    const qrData = await qrResponse.json();
    if (qrData.qr) {
      qrImage.src = qrData.qr;
      qrBox.style.display = 'block';
    }
    return;
  }

  if (data.isInitializing) {
    setText(botStatusText, 'Bot sedang dimulai...');
    qrBox.style.display = 'none';
    return;
  }

  if (data.isStopping) {
    setText(botStatusText, 'Bot sedang dihentikan...');
    qrBox.style.display = 'none';
    return;
  }

  setText(botStatusText, 'Bot WhatsApp belum berjalan.');
  qrBox.style.display = 'none';
  qrImage.removeAttribute('src');
}

async function loadDocuments() {
  const response = await fetch('/api/documents');
  const data = await response.json();
  const documents = data.documents || [];

  if (!documents.length) {
    documentList.innerHTML = '<p class="meta">Belum ada dokumen aktif.</p>';
    return;
  }

  documentList.innerHTML = '';
  documents
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .forEach(doc => {
      const row = document.createElement('div');
      row.className = 'document-row';
      row.innerHTML = `
        <div>
          <strong>${doc.name}</strong>
          <p class="meta">${doc.type.toUpperCase()} | ${formatBytes(doc.bytes)} | ${doc.chunks} potongan</p>
        </div>
        <button class="danger" type="button" data-id="${doc.id}">Hapus</button>
      `;
      documentList.appendChild(row);
    });
}

async function refreshAll() {
  await Promise.all([loadStatus(), loadBotStatus(), loadDocuments()]);
}

uploadForm.addEventListener('submit', async event => {
  event.preventDefault();
  const files = document.getElementById('documents').files;
  if (!files.length) {
    setText(uploadMessage, 'Pilih dokumen terlebih dahulu.');
    return;
  }

  const formData = new FormData();
  [...files].forEach(file => formData.append('documents', file));

  uploadBtn.disabled = true;
  setText(uploadMessage, 'Memproses dokumen...');

  try {
    const response = await fetch('/api/documents/upload', {
      method: 'POST',
      body: formData
    });
    const data = await response.json();
    setText(uploadMessage, data.message || 'Upload selesai.');
    uploadForm.reset();
    await refreshAll();
  } catch (error) {
    setText(uploadMessage, `Gagal upload: ${error.message}`);
  } finally {
    uploadBtn.disabled = false;
  }
});

documentList.addEventListener('click', async event => {
  const button = event.target.closest('button[data-id]');
  if (!button) return;
  if (!confirm('Hapus dokumen ini dari basis pengetahuan?')) return;

  button.disabled = true;
  const response = await fetch(`/api/documents/${button.dataset.id}`, { method: 'DELETE' });
  const data = await response.json();
  setText(uploadMessage, data.message || '');
  await refreshAll();
});



refreshAll().catch(error => {
  statusDot.classList.remove('ok');
  setText(statusText, `Gagal memuat status: ${error.message}`);
});

setInterval(() => {
  loadBotStatus().catch(() => { });
  loadStatus().catch(() => { });
}, 5000);


