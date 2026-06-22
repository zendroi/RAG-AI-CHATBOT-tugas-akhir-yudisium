// riwayat.js — Admin chat history page

(function () {
    function loadCssOnce(href) {
        if (document.querySelector(`link[href="${href}"]`)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }


    const PER_PAGE = 20;
    let allLogs = [];
    let filtered = [];
    let currentPage = 1;

    function formatTime(iso) {
        if (!iso) return '-';
        const d = new Date(iso);
        return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
            + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function initials(name) {
        return (name || 'U').slice(0, 2).toUpperCase();
    }

    function updateStats() {
        const today = new Date().toDateString();
        const todayCount = allLogs.filter(l => new Date(l.created_at).toDateString() === today).length;
        const uniqueUsers = new Set(allLogs.map(l => l.user_id)).size;
        document.getElementById('statTotal').textContent = allLogs.length;
        document.getElementById('statUsers').textContent = uniqueUsers;
        document.getElementById('statToday').textContent = todayCount;
    }

    function populateUserFilter() {
        const select = document.getElementById('userFilter');
        // Reset dulu agar tidak dobel saat init dipanggil ulang
        select.innerHTML = '<option value="">Semua pengguna</option>';
        const users = [...new Map(allLogs.map(l => [l.user_id, l.username])).entries()];
        users.forEach(([id, name]) => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = name || `User #${id}`;
            select.appendChild(opt);
        });
    }

    function applyFilter() {
        const search = document.getElementById('searchInput').value.toLowerCase();
        const userId = document.getElementById('userFilter').value;
        filtered = allLogs.filter(log => {
            const matchUser = !userId || String(log.user_id) === userId;
            const matchSearch = !search
                || (log.question || '').toLowerCase().includes(search)
                || (log.username || '').toLowerCase().includes(search)
                || (log.answer || '').toLowerCase().includes(search);
            return matchUser && matchSearch;
        });
        currentPage = 1;
        renderTable();
        renderPagination();
    }

    function renderTable() {
        const tbody = document.getElementById('chatTableBody');
        const emptyMsg = document.getElementById('emptyMsg');
        const tableWrap = document.getElementById('tableWrap');
        const loadingState = document.getElementById('loadingState');

        if (loadingState) loadingState.style.display = 'none';
        tableWrap.style.display = 'block';

        if (!filtered.length) {
            tbody.innerHTML = '';
            emptyMsg.style.display = 'block';
            return;
        }

        emptyMsg.style.display = 'none';

        const start = (currentPage - 1) * PER_PAGE;
        const pageData = filtered.slice(start, start + PER_PAGE);

        tbody.innerHTML = pageData.map((log, i) => `
      <tr data-idx="${allLogs.indexOf(log)}">
        <td style="color:var(--ink-soft); font-size:12px;">${start + i + 1}</td>
        <td>
          <span class="badge-user">
            <span style="width:20px;height:20px;border-radius:50%;background:var(--primary-dark);color:#fff;font-size:10px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">
              ${escapeHtml(initials(log.username))}
            </span>
            ${escapeHtml(log.username || 'Unknown')}
          </span>
        </td>
        <td class="td-q"><div class="truncate-cell">${escapeHtml(log.question)}</div></td>
        <td class="td-a"><div class="truncate-cell">${escapeHtml(log.answer)}</div></td>
        <td class="td-time">${formatTime(log.created_at)}</td>
      </tr>
    `).join('');

        tbody.querySelectorAll('tr').forEach(row => {
            row.addEventListener('click', () => {
                const idx = parseInt(row.dataset.idx);
                openModal(allLogs[idx]);
            });
        });
    }

    function renderPagination() {
        const total = Math.ceil(filtered.length / PER_PAGE);
        const el = document.getElementById('pagination');
        if (total <= 1) { el.innerHTML = ''; return; }

        let html = `<button class="page-btn" id="prevBtn" ${currentPage === 1 ? 'disabled' : ''}>‹ Prev</button>`;
        const start = Math.max(1, currentPage - 2);
        const end = Math.min(total, currentPage + 2);
        for (let i = start; i <= end; i++) {
            html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }
        html += `<button class="page-btn" id="nextBtn" ${currentPage === total ? 'disabled' : ''}>Next ›</button>`;
        html += `<span style="font-size:12px;color:var(--ink-soft);margin-left:4px;">${filtered.length} hasil</span>`;
        el.innerHTML = html;

        el.querySelector('#prevBtn')?.addEventListener('click', () => { currentPage--; renderTable(); renderPagination(); });
        el.querySelector('#nextBtn')?.addEventListener('click', () => { currentPage++; renderTable(); renderPagination(); });
        el.querySelectorAll('[data-page]').forEach(btn => {
            btn.addEventListener('click', () => { currentPage = parseInt(btn.dataset.page); renderTable(); renderPagination(); });
        });
    }

    function openModal(log) {
    const modalUser = document.getElementById('modalUser');
    const modalQuestion = document.getElementById('modalQuestion');
    const modalAnswer = document.getElementById('modalAnswer');
    const modalTime = document.getElementById('modalTime');
    const modalOverlay = document.getElementById('modalOverlay');

    if (!modalUser || !modalQuestion || !modalAnswer || !modalTime || !modalOverlay) {
        console.warn('Modal element tidak ditemukan');
        return;
    }

    modalUser.textContent = `${log.username || 'Unknown'} (ID: ${log.user_id})`;
    modalQuestion.textContent = log.question || '-';
    modalAnswer.textContent = log.answer || '-';
    modalTime.textContent = formatTime(log.created_at);

    modalOverlay.classList.add('open');
}

   function closeModal() {
    const modalOverlay = document.getElementById('modalOverlay');
    if (!modalOverlay) return;

    modalOverlay.classList.remove('open');
}

    function exportCsv() {
        const data = filtered.length ? filtered : allLogs;
        const rows = [['ID', 'User ID', 'Username', 'Pertanyaan', 'Jawaban', 'Waktu']];
        data.forEach(l => rows.push([
            l.id, l.user_id,
            `"${(l.username || '').replace(/"/g, '""')}"`,
            `"${(l.question || '').replace(/"/g, '""')}"`,
            `"${(l.answer || '').replace(/"/g, '""')}"`,
            l.created_at
        ]));
        const csv = rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `riwayat-chat-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // Simpan referensi listener agar bisa di-remove saat init ulang
    let _listeners = [];
    function addListener(el, event, fn) {
        if (!el) return;
        el.addEventListener(event, fn);
        _listeners.push({ el, event, fn });
    }
    function removeListeners() {
        _listeners.forEach(({ el, event, fn }) => el.removeEventListener(event, fn));
        _listeners = [];
    }

    async function init() {
        // Load CSS yang dibutuhkan
        loadCssOnce('/src/css/riwayat.css');

        // Reset state saat halaman di-swap
        allLogs = [];
        filtered = [];
        currentPage = 1;
        removeListeners();

        // Reset UI ke loading state
        const loadingState = document.getElementById('loadingState');
        const tableWrap = document.getElementById('tableWrap');
        if (loadingState) { loadingState.style.display = 'block'; loadingState.innerHTML = '<i class="ti ti-loader ti-spin"></i> Memuat data...'; }
        if (tableWrap) tableWrap.style.display = 'none';

        // Status dot
        fetch('/api/status').then(r => r.json()).then(data => {
            const dot = document.getElementById('statusDot');
            const txt = document.getElementById('statusText');
            if (dot) dot.classList.toggle('ok', data.server === 'online');
            if (txt) txt.textContent = data.server === 'online' ? 'Server online' : 'Server offline';
        }).catch(() => { });

        // Load logs
        try {
            const res = await fetch('/api/admin/chat-logs');
            if (!res.ok) throw new Error('Gagal memuat data');
            const data = await res.json();
            allLogs = (data.logs || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            filtered = [...allLogs];

            updateStats();
            populateUserFilter();
            renderTable();
            renderPagination();
        } catch (err) {
            if (loadingState) loadingState.innerHTML =
                `<i class="ti ti-alert-circle" style="color:var(--danger)"></i> Gagal memuat riwayat: ${err.message}`;
        }

        // Event listeners — pakai addListener agar bisa di-remove saat init ulang
        addListener(document.getElementById('searchInput'), 'input', applyFilter);
        addListener(document.getElementById('userFilter'), 'change', applyFilter);
        addListener(document.getElementById('btnExport'), 'click', exportCsv);
        addListener(document.getElementById('modalClose'), 'click', closeModal);
        addListener(document.getElementById('modalOverlay'), 'click', e => {
            if (e.target === document.getElementById('modalOverlay')) closeModal();
        });
    }




    window.RiwayatPage = { init };
    if (document.readyState !== 'loading') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
})();
