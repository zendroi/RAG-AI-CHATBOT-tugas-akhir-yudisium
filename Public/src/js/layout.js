

async function loadPartial(selector, file) {
    const el = document.querySelector(selector);
    if (!el) return;
    try {
        const res = await fetch(file);
        el.innerHTML = await res.text();
    } catch {
        console.warn(`Gagal load partial: ${file}`);
    }
}

async function initLayout() {
    await Promise.all([
        loadPartial('#sidebar', '/partials/sidebar.html'),
        loadPartial('#navbar', '/partials/navbar.html'),
        loadPartial('#footer', '/partials/footer.html'),
    ]);


    document.getElementById('btnDownload')?.addEventListener('click', async (e) => {
        e.preventDefault();

        // Tampilkan loading jika ada
        document.body.classList.remove('page-ready');

        try {
            const response = await fetch('/download-data-stream');
            if (!response.ok) throw new Error('Download gagal');

            // Mengubah response menjadi blob
            const blob = await response.blob();

            // Membuat link download secara programatik
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'academic-documents.csv';
            document.body.appendChild(a);
            a.click();

            // Bersihkan
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Error:', err);
        } finally {
            document.body.classList.add('page-ready');
        }
    });

    document.getElementById('sidebarLogoutBtn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch (err) {
            console.error(err);
        } finally {
            document.body.classList.remove('page-ready');
            setTimeout(() => { window.location.href = '/'; }, 180);
        }
    });
}



async function loadPages() {
    // Student sidebar has no #content (its nav is static, not admin-page-driven) — skip entirely.
    if (!document.getElementById('content')) return;
    try {
        const response = await fetch('/api/data-Pages');
        const result = await response.json();
        groupSidebar(result.pages);
    } catch (error) {
        console.error("Error memuat menu:", error);
    }
};

const SIDEBAR_GROUP_BY_LABEL = { knowledge: 'Manajemen', chatlog: 'Manajemen' };
const SIDEBAR_ICON_BY_LABEL = { dashboard: 'ti-layout-dashboard', knowledge: 'ti-database', chatlog: 'ti-message-2' };
const SIDEBAR_TITLE_BY_LABEL = { knowledge: 'Knowledge Base', chatlog: 'Chat Log' };

// "/admin" is served by the dashboard.html nav entry — map it back to that label.
function activePageFromPath(pathname) {
    const page = pathname.split('/').pop().replace('.html', '') || 'index';
    return page === 'admin' ? 'dashboard' : page;
}

function markActiveNav(pathname) {
    const activePage = activePageFromPath(pathname);
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === activePage);
    });
}

async function groupSidebar(pages) {
    const grouped = pages.reduce((acc, item) => {
        const label = item.label.toLowerCase();
        const group = SIDEBAR_GROUP_BY_LABEL[label] || 'Main';
        if (!acc[group]) acc[group] = [];
        acc[group].push(item);
        return acc;
    }, {});

    const content = document.getElementById('content');

    if (!pages || !pages.length) {
        content.innerHTML = '<p class="px-3 text-xs text-gray-400">Tidak ada menu.</p>';
        return;
    }

    const GROUP_ORDER = ['Main', 'Manajemen'];

    content.innerHTML = Object.entries(grouped)
        .sort(([a], [b]) => {
            const ai = GROUP_ORDER.indexOf(a);
            const bi = GROUP_ORDER.indexOf(b);
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        })
        .map(([groupName, files]) => `
    <p class="sidebar-text text-[10px] font-medium uppercase tracking-widest text-gray-400 px-2 pt-3 pb-1">${groupName}</p>
    ${files.map(file => `
      <a href="${file.label === 'dashboard' ? '/admin' : '/' + file.label}" data-page="${file.label}"
        class="nav-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors whitespace-nowrap overflow-hidden">
        <i class="ti ${SIDEBAR_ICON_BY_LABEL[file.label.toLowerCase()] || 'ti-file-text'} text-lg w-5 text-center flex-shrink-0"></i>
        <span class="sidebar-text capitalize">${SIDEBAR_TITLE_BY_LABEL[file.label.toLowerCase()] || file.label}</span>
      </a>
    `).join('')}
  `).join('');

    markActiveNav(window.location.pathname);
}


async function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');

    const isCollapsed = sidebar.classList.contains('collapsed');
    localStorage.setItem('sidebarCollapsed', isCollapsed);
}

// --- Shell router: admin <-> knowledge share this exact sidebar/header chrome,
// so swap only .main-content instead of a full page reload (which always
// unmounts the sidebar too, no matter how the reload itself is faded). ---

function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.body.appendChild(s);
    });
}

async function runShellPageScript(url) {
    // Leaving a shell page should stop its background status poller — each
    // page's own script only clears its *own* interval before restarting it.
    if (window.__adminStatusInterval) { clearInterval(window.__adminStatusInterval); window.__adminStatusInterval = null; }
    if (window.__knowledgeStatusInterval) { clearInterval(window.__knowledgeStatusInterval); window.__knowledgeStatusInterval = null; }

    if (url.includes('/knowledge')) {
        if (window.KnowledgePage) window.KnowledgePage.init();
        else await loadScriptOnce('/src/js/knowledge.js');
    } else if (url.includes('/chatlog')) {
        if (window.RiwayatPage) window.RiwayatPage.init();
        else await loadScriptOnce('/src/js/riwayat.js');
    } else {
        if (window.AdminPage) window.AdminPage.init();
        else await loadScriptOnce('/app.js');
    }
}

async function swapShellPage(url, push) {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) { window.location.href = url; return; }
    if (push !== false && url === window.location.pathname) return; // already here

    // Fetch with the OLD content still fully visible — network latency must
    // never be spent staring at a blank panel. Only the actual DOM swap (near
    // instant) gets a brief fade, not the round-trip.
    let doc;
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Gagal memuat halaman (' + res.status + ')');
        const html = await res.text();
        doc = new DOMParser().parseFromString(html, 'text/html');
        if (!doc.querySelector('.main-content')) throw new Error('Halaman tujuan tidak punya .main-content');
    } catch (err) {
        console.error('Shell nav gagal, fallback full reload:', err);
        window.location.href = url;
        return;
    }

    mainContent.style.transition = 'opacity .1s ease';
    mainContent.style.opacity = '0';
    await new Promise(r => setTimeout(r, 100));

    mainContent.innerHTML = doc.querySelector('.main-content').innerHTML;
    document.title = doc.title;
    if (push !== false) history.pushState({ shellNav: true }, '', url);
    markActiveNav(url);
    await runShellPageScript(url);

    requestAnimationFrame(() => { mainContent.style.opacity = '1'; });
}

window.addEventListener('popstate', () => {
    if (location.pathname === '/admin' || location.pathname === '/knowledge') {
        swapShellPage(location.pathname, false);
    }
});

document.addEventListener('click', (e) => {
    const link = e.target.closest('a.nav-item[href]');
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    swapShellPage(link.getAttribute('href'));
});

document.addEventListener('DOMContentLoaded', async () => {
    await initLayout();

    await loadPages();

    const sidebar = document.getElementById('sidebar');
    const wasCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    sidebar.classList.toggle('collapsed', wasCollapsed);
});
