

const NotificationServices = require('../services/NotificationServices');
const notificationServices = new NotificationServices();


class KnowledgesServices {

    loadKnowledge(fs, knowledgeFile) {
        try {
            const data = fs.readFileSync(knowledgeFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading knowledge:', error);
            return { keywords: {}, responses: {} };
        }
    }
    saveKnowledge(data, ragEngine, fs, knowledgeFile) {
        try {
            fs.writeFileSync(knowledgeFile, JSON.stringify(data, null, 2));
            ragEngine.clearCache();
            return true;
        } catch (error) {
            console.error('Error saving knowledge:', error);
            return false;
        }
    }


    async loadKeywords() {
        try {
            const response = await fetch(`${API_URL}/knowledge/keywords`);
            const data = await response.json();
            const container = document.getElementById('keywordItems');
            container.innerHTML = '';
            if (Object.keys(data.responses).length === 0) {
                container.innerHTML = '<p style="color: #999; text-align: center; padding: 40px; ">Belum ada keyword. Tambahkan keyword baru diatas!</p > ';
                return;
            }
            Object.entries(data.responses).forEach(([keyword, response]) => {

                const item = document.createElement('div');
                item.className = 'group bg-white p-4 w-full rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 flex items-start justify-between gap-4';

                item.innerHTML = `
  <div class="">
    <strong class="block text-sm font-bold text-blue-600 mb-1 uppercase tracking-wide">
      ${keyword}
    </strong>
    <p class="text-gray-600 text-sm ">
      ${response}
    </p>
  </div>
  
  <div class="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
    <button 
      class="text-xs font-medium px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg border border-gray-200 transition-colors"
      onclick="editKeyword('${keyword}')">
      Edit
    </button>
    <button 
      class="text-xs font-medium px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg border border-red-100 transition-colors"
      onclick="deleteKeyword('${keyword}')">
      Delete
    </button>
  </div>
`;
                container.appendChild(item);
            });
        } catch (error) {
            console.error('Error loading keywords:', error);
        }
    }
}

module.exports = KnowledgesServices;