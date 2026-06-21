(function () {
  const JENIS_TITLE = { tugasAkhir: 'Tugas Akhir', sidangTA: 'Sidang Tugas Akhir', yudisium: 'Yudisium' };
  const JENIS_ORDER = ['tugasAkhir', 'sidangTA', 'yudisium'];

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Bot answers contain raw URLs and relative download paths (e.g.
  // /api/documents/<id>/download) as plain text — without turning them into real <a>
  // tags, the student has no way to actually click/download them.
  function linkify(text) {
    return escapeHtml(text)
      .replace(/(https?:\/\/[^\s)]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/(\/api\/documents\/[a-zA-Z0-9-]+\/download)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">Unduh dokumen</a>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  function buildFieldsHtml(rule, prefill) {
    prefill = prefill || {};
    const numeric = rule.numeric.map(item => `
      <label>${item.label}
        <input type="number" step="0.01" name="${item.field}" value="${prefill[item.field] ?? ''}">
      </label>
    `).join('');
    const boolean = rule.boolean.map(item => `
      <label class="checkbox-label">
        <input type="checkbox" name="${item.field}" ${prefill[item.field] ? 'checked' : ''}> ${item.label}
      </label>
    `).join('');
    return numeric + boolean;
  }

  function collectStatusFromForm(rule, formEl) {
    const formData = new FormData(formEl);
    const status = {};
    rule.numeric.forEach(item => { status[item.field] = formData.get(item.field); });
    rule.boolean.forEach(item => { status[item.field] = formData.get(item.field) === 'on'; });
    return status;
  }

  // ===================== Tab switching =====================
  // Sidebar partial loads asynchronously (fetched by layout.js), so the
  // [data-tab] buttons may not exist yet at DOMContentLoaded — delegate from
  // a node that's always there instead of binding directly to the buttons.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    const tab = btn.dataset.tab;

    document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab' + tab.charAt(0).toUpperCase() + tab.slice(1)));

    const titles = { chat: ['Chat', 'Tanyakan apa saja seputar Tugas Akhir dan Yudisium.'], status: ['Status Kelulusan', 'Progres syarat TA, sidang, dan yudisium kamu.'] };
    const [title, subtitle] = titles[tab] || [];
    if (title) {
      const t = document.getElementById('pageTitle');
      const s = document.getElementById('pageSubtitle');
      if (t) t.textContent = title;
      if (s) s.textContent = subtitle;
    }
  });

  // ===================== Status Kelulusan dashboard =====================
  const statusCardsEl = document.getElementById('statusCards');

  async function fetchJenisData(jenis) {
    const [fieldsRes, lastRes] = await Promise.all([
      fetch(`/api/smart-check/${jenis}/fields`),
      fetch(`/api/smart-check/${jenis}`)
    ]);
    const fields = await fieldsRes.json();
    const last = await lastRes.json();
    return { jenis, rule: fields.rule, payload: last.payload, eligible: last.eligible, missing: last.missing };
  }

  function isFieldMissing(data, field) {
    if (!data.payload) return true;
    if (!data.missing) return false;
    return data.missing.some(m => m.field === field);
  }

  function currentValueFor(data, field, item) {
    if (!data.payload || data.payload[field] === undefined || data.payload[field] === '' || data.payload[field] === null) return '-';
    const raw = data.payload[field];
    if (item.unit !== undefined) return `${raw}${item.unit}`;
    return raw ? 'Ya' : 'Belum';
  }

  function renderStatusCard(data) {
    const { jenis, rule } = data;
    const allFields = [...rule.numeric, ...rule.boolean];
    const metCount = data.payload ? allFields.filter(item => !isFieldMissing(data, item.field)).length : 0;

    const pill = !data.payload
      ? '<span class="progress-pill pending">Belum diisi</span>'
      : data.eligible
        ? '<span class="progress-pill ok">Semua syarat terpenuhi</span>'
        : `<span class="progress-pill pending">${metCount}/${allFields.length} syarat terpenuhi</span>`;

    const reqRows = allFields.map(item => {
      const missing = isFieldMissing(data, item.field);
      const icon = missing ? '<i class="ti ti-x"></i>' : '<i class="ti ti-check"></i>';
      return `
        <div class="req-row ${missing ? 'missing' : 'met'}">
          <span class="req-icon">${icon}</span>
          <span class="req-label">${item.label}</span>
          <span class="req-value">${currentValueFor(data, item.field, item)}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="panel status-card" data-jenis="${jenis}">
        <div class="status-head">
          <h2 style="margin:0;">${JENIS_TITLE[jenis]}</h2>
          ${pill}
        </div>
        <div class="req-list">${reqRows}</div>
        <button type="button" class="btn-secondary toggle-status-form">Update Status</button>
        <form class="status-form">
          ${buildFieldsHtml(rule, data.payload || {})}
          <div class="status-form-actions">
            <button type="submit">Simpan</button>
          </div>
          <p class="hint form-msg"></p>
        </form>
      </div>
    `;
  }

  async function loadStatusCards() {
    if (!statusCardsEl) return;
    try {
      const results = await Promise.all(JENIS_ORDER.map(fetchJenisData));
      statusCardsEl.innerHTML = results.map(renderStatusCard).join('');
      wireStatusCards(results);
    } catch (error) {
      statusCardsEl.innerHTML = `<p class="hint">Gagal memuat status: ${escapeHtml(error.message)}</p>`;
    }
  }

  function wireStatusCards(results) {
    statusCardsEl.querySelectorAll('.status-card').forEach(card => {
      const jenis = card.dataset.jenis;
      const data = results.find(r => r.jenis === jenis);
      const form = card.querySelector('.status-form');

      card.querySelector('.toggle-status-form').addEventListener('click', () => {
        form.classList.toggle('open');
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const status = collectStatusFromForm(data.rule, form);
        const msgEl = form.querySelector('.form-msg');
        msgEl.textContent = 'Menyimpan...';

        try {
          const res = await fetch('/api/smart-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jenis, status })
          });
          const result = await res.json();
          if (!res.ok || !result.success) {
            msgEl.textContent = result.message || 'Gagal menyimpan status.';
            return;
          }
          await loadStatusCards();
        } catch (error) {
          msgEl.textContent = `Gagal menyimpan: ${error.message}`;
        }
      });
    });
  }

  // ===================== Chat =====================
  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("chatForm");
    const input = document.getElementById("chatInput");
    const sendBtn = document.getElementById("sendBtn");
    const messages = document.getElementById("chatMessages");
    const emptyState = document.getElementById("emptyState");
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    loadStatusCards();

    fetch('/api/status').then(r => r.json()).then(data => {
      if (statusDot) statusDot.classList.toggle('ok', data.server === 'online');
      if (statusText) statusText.textContent = data.server === 'online' ? 'Server online' : 'Server offline';
    }).catch(() => {});

    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });

    function setBotHtml(el, text) {
      el.innerHTML = linkify(text);
    }

    function addMessage(text, sender) {
      if (emptyState) emptyState.remove();

      const msg = document.createElement("div");
      msg.className = "msg " + sender;
      if (sender === "bot") {
        setBotHtml(msg, text);
      } else {
        msg.textContent = text;
      }
      messages.appendChild(msg);
      messages.scrollTop = messages.scrollHeight;
      return msg;
    }

    async function renderSmartCheckForm(jenis) {
      if (emptyState) emptyState.remove();

      const wrapper = document.createElement("div");
      wrapper.className = "msg bot";
      wrapper.innerHTML = '<p>Memuat form pengecekan...</p>';
      messages.appendChild(wrapper);
      messages.scrollTop = messages.scrollHeight;

      try {
        const res = await fetch(`/api/smart-check/${jenis}/fields`);
        const data = await res.json();
        if (!data.success) {
          setBotHtml(wrapper, data.message || "Gagal memuat form pengecekan.");
          return;
        }

        const rule = data.rule;
        wrapper.innerHTML = `
          <p style="margin-bottom:8px;">Isi status kamu untuk ${rule.label}:</p>
          <form class="smart-check-form">
            ${buildFieldsHtml(rule)}
            <button type="submit" style="margin-top:10px;border:0;border-radius:8px;background:linear-gradient(to bottom,#b794f4,#805ad5);color:#fff;padding:8px 14px;cursor:pointer;">Cek Kelayakan</button>
          </form>
        `;

        wrapper.querySelector('form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const status = collectStatusFromForm(rule, e.target);

          const checkRes = await fetch('/api/smart-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jenis, status })
          });
          const checkData = await checkRes.json();

          if (!checkRes.ok || !checkData.success) {
            addMessage(checkData.message || 'Gagal memproses pengecekan kelayakan.', 'bot');
            return;
          }

          const resultMsg = checkData.eligible
            ? 'Selamat, kamu sudah memenuhi semua syarat.'
            : `Belum lengkap, berikut yang masih kurang:\n${checkData.missing.map(m => `- ${m.requirement} (saat ini: ${m.currentValue})`).join('\n')}`;

          addMessage(resultMsg, 'bot');
          loadStatusCards(); // keep the dashboard tab in sync with what was just submitted from chat
        });
      } catch (error) {
        setBotHtml(wrapper, `Gagal memuat form: ${error.message}`);
      }
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const question = input.value.trim();
      if (!question) return;

      addMessage(question, "user");
      input.value = "";
      input.style.height = "auto";

      const loadingMsg = addMessage("Mengetik...", "bot");
      loadingMsg.classList.add("loading");

      sendBtn.disabled = true;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ question }),
        });

        const data = await response.json();

        loadingMsg.classList.remove("loading");

        if (!response.ok) {
          setBotHtml(loadingMsg, data.message || "Maaf, terjadi kesalahan saat memproses pertanyaan.");
          return;
        }

        setBotHtml(loadingMsg, data.answer || data.message || "Maaf, tidak ada jawaban yang ditemukan.");

        if (data.action === 'smart_check_form' && data.jenis) {
          await renderSmartCheckForm(data.jenis);
        }
      } catch (error) {
        console.error(error);
        loadingMsg.classList.remove("loading");
        setBotHtml(loadingMsg, "Tidak dapat terhubung ke server.");
      } finally {
        sendBtn.disabled = false;
        messages.scrollTop = messages.scrollHeight;
      }
    });
  });
})();
