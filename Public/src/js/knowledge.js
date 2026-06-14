const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

const API_URL = '/api';

let isEditing = false;
let originalKeyword = null;


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
}

function getActiveBot() {
    const activeTab = document.querySelector('.tab.active');
    return activeTab ? activeTab.dataset.bot : null;
}

function switchTab(tab) {

    const title = document.getElementById('text-title');
    const valueContent = title.textContent.trim()
    title.textContent = `Basis Pengetahuan ${tab.charAt(0).toUpperCase() + tab.slice(1)}`;
    document.querySelectorAll('.tab').forEach(t =>
        t.classList.remove('active'));
    event.target.classList.add('active');
    document.querySelectorAll('.tab-pane').forEach(c =>
        c.classList.remove('active'));
    document.getElementById(tab).classList.add('active');
    loadKeywords(tab);

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


async function loadKeywords(kategori = 'tugasAkhir') {
    try {
        const response = await fetch(`${API_URL}/knowledge/keywords`);
        const data = await response.json();
        const containerId = kategori === 'tugasAkhir' ? 'tugasAkhir' : 'yudisium';
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        const botResponses = data.responses?.[kategori] ?? {};

        if (Object.keys(botResponses).length === 0) {
            container.innerHTML = `
                <p class="text-gray-400 text-center py-10 w-full">
                    Belum ada keyword untuk <strong>${bot}</strong>. Tambahkan keyword baru!
                </p>`;
            return;
        }

        Object.entries(botResponses).forEach(([keyword, response]) => {
            const item = document.createElement('div');
            item.className = 'group bg-white p-4 w-full rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 flex items-start justify-between gap-4';

            item.innerHTML = `
                <div>
                    <strong class="block text-sm font-bold text-blue-600 mb-1 uppercase tracking-wide">
                        ${keyword}
                    </strong>
                    <p class="text-gray-600 text-sm">${response}</p>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        class="text-xs font-medium px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg border border-gray-200 transition-colors"
                        onclick="editKeyword('${keyword}', '${kategori}')">
                        Edit
                    </button>
                    <button
                        class="text-xs font-medium px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg border border-red-100 transition-colors"
                        onclick="deleteKeyword('${keyword}', '${kategori}')">
                        Delete
                    </button>
                </div>`;

            container.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading keywords:', error);
    }
}

async function saveKeyword() {
    const keyword =
        document.getElementById('keyword').value.trim().toLowerCase();
    const response = document.getElementById('response').value.trim();
    const kategori = getActiveBot();
    if (!keyword || !response) {
        showNotification('Keyword dan response harus diisi!',
            'warning');
        return;
    }

    if (isEditing) {
        await fetch(
            `${API_URL}/knowledge/keyword/${kategori}/${encodeURIComponent(originalKeyword)}`,
            { method: 'DELETE' }
        );
    }

    try {
        const res = await fetch(`${API_URL}/knowledge/keyword`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword, response, kategori })
        });
        isEditing = false;
        document.getElementById('submitBtn').textContent = 'Simpan Kata Kunci';
        const data = await res.json();
        showNotification(data.message, data.success ? 'success' :
            'error');
        if (data.success) {
            clearForm();
            loadKeywords(kategori);
        }

    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

function editKeyword(keyword, kategori) {

    isEditing = true;
    originalKeyword = keyword;

    document.getElementById('keyword').value = keyword;
    loadKeywordsForEdit(keyword, kategori);
    document.getElementById('keyword').focus();


    document.getElementById('submitBtn').textContent = 'Update Keyword';
}

async function loadKeywordsForEdit(keyword, kategori) {
    try {
        const response = await fetch(`${API_URL}/knowledge/keywords`);
        const data = await response.json();
        if (data.responses[kategori]?.[keyword]) {
            document.getElementById('response').value = data.responses[kategori][keyword];
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

async function deleteKeyword(keyword, kategori) {
    if (!confirm(`Hapus kata kunci "${keyword}"?`)) return;
    try {
        const response = await
            fetch(`${API_URL}/knowledge/keyword/${kategori}/${encodeURIComponent(keyword)}`, {
                method: 'DELETE'
            });
        const data = await response.json();
        showNotification(data.message, data.success ? 'success' :
            'error');
        if (data.success) {
            loadKeywords(kategori);
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}
function clearForm() {

    document.getElementById('keyword').value = '';
    document.getElementById('response').value = '';
    document.getElementById('keyword').focus();
}

async function refreshAll() {
    await Promise.all([loadStatus(), loadKeywords()]);
}
setInterval(() => {
    loadStatus().catch(() => { });
}, 5000);

