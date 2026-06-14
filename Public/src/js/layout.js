

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

    // Active menu otomatis
    const currentPage = window.location.pathname
        .split('/').pop()
        .replace('.html', '') || 'index';

    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.dataset.page === currentPage) {
            item.classList.add('active');
        }
    });
}



async function loadPages() {
    try {
        const response = await fetch('/api/data-Pages');
        const result = await response.json();

        // Asumsi Anda punya elemen <div id="sidebar-menu"></div>
        const menuContainer = document.getElementById('sidebar-menu');


        const pages = result.pages;


        groupSidebar(pages)

    } catch (error) {
        console.error("Error memuat menu:", error);
    }
};

async function groupSidebar(pages) {
    const grouped = pages.reduce((acc, item) => {

        const label = item.label.toLowerCase();

        const isConf = ['knowledge'].includes(label);
        const isDoc = ['yudisium', 'tugasakhir'].includes(label); // Pastikan nama sama
        const isSubDoc = ['yudisium', 'tugasakhir'].includes(label);

        let group = 'Main';
        if (isConf) group = 'Konfigurasi Sistem';
        else if (isDoc) group = 'Dokumen';

        // 4. Inisialisasi object
        if (!acc[group]) acc[group] = {};
        if (!acc[group][isSubDoc ? 'Sub-Dokumen' : 'General']) {
            acc[group][isSubDoc ? 'Sub-Dokumen' : 'General'] = [];
        }


        acc[group][isSubDoc ? 'Sub-Dokumen' : 'General'].push(item);

        return acc;
    }, {});


    if (pages && pages.length > 0) {


        document.getElementById("content").innerHTML = Object.entries(grouped).map(([groupName, items]) => {



            return `
              <p class="sidebar-text text-[10px] font-medium uppercase tracking-widest text-gray-400 px-2 pt-3 pb-1">${groupName}</p>

           ${Object.entries(items).map(([subName, files]) => `

    ${files.map(file => `
        <a href="${file.label === 'dashboard' ? '/' : file.label}" data-page="${file.label}"
            class="nav-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors whitespace-nowrap overflow-hidden">
            <i class="ti ti-file-text text-lg w-5 text-center flex-shrink-0"></i>
            <span class="sidebar-text capitalize">${file.label}</span>
        </a>
    `).join('')}
`).join('')}
              `
        }).join('')



    } else {
        contentDiv.innerHTML = '<p class="px-3 text-xs text-gray-400">Tidak ada dokumen.</p>';
    }
}


async function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
    
    const isCollapsed = sidebar.classList.contains('collapsed');
    localStorage.setItem('sidebarCollapsed', isCollapsed);
}

document.addEventListener('DOMContentLoaded', async () => {
  await initLayout();

  await loadPages();


  await toggleSidebar();

  const sidebar = document.getElementById('sidebar');

  sidebar.classList.remove('collapsed');


  await new Promise(resolve => setTimeout(resolve, 50));

  const statusDot = document.getElementById('statusDot');


     refreshAll().catch(error => {
        statusDot?.classList?.remove('ok');
        console.error("Gagal refresh:", error);
    });
});