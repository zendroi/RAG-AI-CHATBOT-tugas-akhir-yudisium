(function () {
  const API_URL = '/api';
  const CATEGORY_LABEL = { umum: 'Umum', tugasAkhir: 'Tugas Akhir', yudisium: 'Yudisium' };
  let activeCategory = 'umum';

  function setText(element, value) {
    if (element) element.textContent = value;
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 KB';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  }

  function showNotification(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, duration);
  }

  function renderSourceItem(source) {
    const item = document.createElement('div');
    item.className = 'group bg-white p-4 w-full rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 flex items-start justify-between gap-4';

    // Surface how the file was read + how much text came out, so admin can spot a doc that
    // extracted almost nothing (e.g. a scan that even OCR couldn't read) and swap the source.
    const chars = source.extractedChars;
    const method = source.extractionMethod ? ` | ${source.extractionMethod}` : '';
    const charsLabel = (chars !== undefined && chars !== null) ? ` | ${chars.toLocaleString('id-ID')} karakter` : '';
    const lowYield = (chars !== undefined && chars !== null && chars < 100);
    const warning = lowYield
      ? `<p class="text-xs text-amber-600 font-medium mt-1"><i class="ti ti-alert-triangle"></i> Teks minim terbaca — cek/ganti file sumbernya.</p>`
      : '';

    item.innerHTML = `
        <div>
            <strong class="block text-sm font-bold text-blue-600 mb-1">${source.name}</strong>
            <p class="text-gray-600 text-xs">${source.type.toUpperCase()} | ${formatBytes(source.bytes)} | ${source.chunks} potongan${charsLabel}${method}</p>
            ${warning}
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
            <a
                href="/api/documents/${source.id}/download"
                class="text-xs font-medium px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg border border-gray-200 transition-colors"
            >Unduh</a>
            <button
                class="text-xs font-medium px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg border border-blue-100 transition-colors"
                onclick="triggerReplaceFile('${source.id}')">
                Ganti File
            </button>
            <button
                class="text-xs font-medium px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg border border-red-100 transition-colors"
                onclick="deleteSource('${source.id}')">
                Hapus
            </button>
        </div>`;

    return item;
  }

  async function triggerReplaceFile(id) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.docx,.txt,.xlsx,.xls,.png,.jpg,.jpeg,.webp';
    input.onchange = async () => {
      if (!input.files.length) return;
      const formData = new FormData();
      formData.append('document', input.files[0]);
      try {
        const response = await fetch(`${API_URL}/knowledge/sources/${id}/file`, {
          method: 'PUT',
          body: formData
        });
        const data = await response.json();
        showNotification(data.message, data.success ? 'success' : 'error');
        if (data.success) loadSources();
      } catch (error) {
        showNotification('Error: ' + error.message, 'error');
      }
    };
    input.click();
  }

  async function deleteSource(id) {
    if (!confirm('Hapus dokumen ini dari basis pengetahuan?')) return;
    try {
      const response = await fetch(`${API_URL}/knowledge/sources/${id}`, { method: 'DELETE' });
      const data = await response.json();
      showNotification(data.message, data.success ? 'success' : 'error');
      if (data.success) loadSources();
    } catch (error) {
      showNotification('Error: ' + error.message, 'error');
    }
  }

  let loadSources; // bound to current DOM inside init()

  function init() {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const uploadForm = document.getElementById('uploadForm');
    if (!uploadForm) return; // not on the knowledge page

    activeCategory = 'umum';

    async function loadStatus() {
      const response = await fetch('/api/status');
      const data = await response.json();
      if (statusDot) statusDot.classList.toggle('ok', data.server === 'online');
      if (statusText) setText(statusText, data.server === 'online' ? 'Server online' : 'Server offline');
    }

    loadSources = async function (category = activeCategory) {
      const container = document.getElementById('sourceList');
      try {
        const response = await fetch(`${API_URL}/knowledge/sources?category=${category}`);
        const data = await response.json();
        const sources = data.sources || [];

        const subCategoryOptions = document.getElementById('subCategoryOptions');
        if (subCategoryOptions) {
          const uniqueSubCategories = [...new Set(sources.map(s => s.subCategory).filter(Boolean))].sort();
          subCategoryOptions.innerHTML = uniqueSubCategories.map(s => `<option value="${s}"></option>`).join('');
        }

        if (!sources.length) {
          container.innerHTML = `
                <p class="text-gray-400 text-center py-10 w-full">
                    Belum ada dokumen untuk kategori <strong>${CATEGORY_LABEL[category]}</strong>. Upload dokumen baru!
                </p>`;
          return;
        }

        container.innerHTML = '';
        const groups = new Map();
        sources
          .slice()
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .forEach(source => {
            const key = source.subCategory || 'Tanpa sub-kategori';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(source);
          });

        [...groups.keys()].sort().forEach(subCategory => {
          const heading = document.createElement('p');
          heading.className = 'text-xs font-semibold uppercase tracking-wide text-gray-400 mt-4 mb-2';
          heading.textContent = subCategory;
          container.appendChild(heading);

          groups.get(subCategory).forEach(source => {
            container.appendChild(renderSourceItem(source));
          });
        });
      } catch (error) {
        console.error('Error loading sources:', error);
      }
    };

    window.switchTab = function (category) {
      activeCategory = category;
      document.getElementById('text-title').textContent = `Basis Pengetahuan ${CATEGORY_LABEL[category]}`;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelector(`.tab[data-category="${category}"]`)?.classList.add('active');
      loadSources(category);
    };

    uploadForm.addEventListener('submit', async event => {
      event.preventDefault();
      const files = document.getElementById('documents').files;
      if (!files.length) {
        showNotification('Pilih dokumen terlebih dahulu.', 'warning');
        return;
      }

      const formData = new FormData();
      [...files].forEach(file => formData.append('documents', file));
      formData.append('category', activeCategory);
      formData.append('subCategory', document.getElementById('subCategory').value.trim());

      const submitBtn = document.getElementById('submitBtn');
      const uploadMessage = document.getElementById('uploadMessage');
      submitBtn.disabled = true;
      setText(uploadMessage, 'Memproses dokumen...');

      try {
        const response = await fetch(`${API_URL}/knowledge/sources`, {
          method: 'POST',
          body: formData
        });
        const data = await response.json();
        setText(uploadMessage, data.message || 'Upload selesai.');
        event.target.reset();
        loadSources();
      } catch (error) {
        setText(uploadMessage, `Gagal upload: ${error.message}`);
      } finally {
        submitBtn.disabled = false;
      }
    });

    const reextractBtn = document.getElementById('reextractBtn');
    if (reextractBtn) {
      reextractBtn.addEventListener('click', async () => {
        if (!confirm('Proses ulang SEMUA dokumen dengan mesin ekstraksi terbaru? Ini membaca ulang teks, tabel, dan gambar tiap file dan bisa makan waktu beberapa menit.')) return;
        const msg = document.getElementById('reextractMessage');
        reextractBtn.disabled = true;
        setText(msg, 'Memproses ulang semua dokumen... mohon tunggu, jangan tutup halaman.');
        try {
          const res = await fetch(`${API_URL}/knowledge/reextract`, { method: 'POST' });
          const data = await res.json();
          setText(msg, data.message || 'Selesai diproses ulang.');
          loadSources();
        } catch (error) {
          setText(msg, `Gagal memproses ulang: ${error.message}`);
        } finally {
          reextractBtn.disabled = false;
        }
      });
    }

    // Re-running init() after a shell swap (admin <-> knowledge nav) would
    // otherwise stack a new poller on top of the old one every time.
    if (window.__knowledgeStatusInterval) clearInterval(window.__knowledgeStatusInterval);
    window.__knowledgeStatusInterval = setInterval(() => {
      loadStatus().catch(() => {});
    }, 5000);

    loadStatus().catch(() => {});
    loadSources();
  }

  window.triggerReplaceFile = triggerReplaceFile;
  window.deleteSource = deleteSource;
  window.KnowledgePage = { init };
  init();
})();
