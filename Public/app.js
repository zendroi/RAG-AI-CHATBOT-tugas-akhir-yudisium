(function () {
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Bot answers contain raw URLs and relative download paths (/api/documents/<id>/download)
  // as plain text — without converting them to real <a> tags they're not clickable/downloadable.
  function setAnswerHtml(element, text) {
    element.innerHTML = escapeHtml(text)
      .replace(/(https?:\/\/[^\s)]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/(\/api\/documents\/[a-zA-Z0-9-]+\/download)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">Unduh dokumen</a>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  function setText(element, value) {
    if (element) element.textContent = value;
  }

  function init() {
    var statusDot = document.getElementById('statusDot');
    var statusText = document.getElementById('statusText');
    var documentCount = document.getElementById('documentCount');
    var chunkCount = document.getElementById('chunkCount');
    var geminiStatus = document.getElementById('geminiStatus');
    var askBtn = document.getElementById('askBtn');
    var question = document.getElementById('question');
    var answer = document.getElementById('answer');
    if (!askBtn || !question || !answer) return; // not on the dashboard page

    async function loadStatus() {
      const response = await fetch('/api/status');
      const data = await response.json();

      if (statusDot) statusDot.classList.toggle('ok', data.server === 'online');
      if (statusText) setText(statusText, data.server === 'online' ? 'Server online' : 'Server offline');

      setText(documentCount, String(data.documents || 0));
      setText(chunkCount, String(data.chunks || 0));
      setText(geminiStatus, data.geminiConfigured ? 'Siap' : 'Belum');
    }

    askBtn.addEventListener('click', async () => {
      const text = question.value.trim();
      if (!text) {
        setText(answer, 'Isi pertanyaan terlebih dahulu.');
        return;
      }

      askBtn.disabled = true;
      setText(answer, 'Memproses jawaban...');

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: text })
        });
        const data = await response.json();
        setAnswerHtml(answer, data.answer || data.message || 'Tidak ada jawaban.');
      } catch (error) {
        setText(answer, `Gagal memproses: ${error.message}`);
      } finally {
        askBtn.disabled = false;
      }
    });

    loadStatus().catch(error => {
      statusDot?.classList?.remove('ok');
      setText(statusText, `Gagal memuat status: ${error.message}`);
    });

    // Re-running init() after a shell swap (admin <-> knowledge nav) would
    // otherwise stack a new poller on top of the old one every time.
    if (window.__adminStatusInterval) clearInterval(window.__adminStatusInterval);
    window.__adminStatusInterval = setInterval(() => {
      loadStatus().catch(() => {});
    }, 5000);
  }

  window.AdminPage = { init };
  init();
})();
