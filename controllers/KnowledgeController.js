
const KnowledgesServices = require('../services/KnowledgesSevices');
const knowledgesServices = new KnowledgesServices();
const ALLOWED_KATEGORI = new Set(['tugasAkhir', 'yudisium']);

class KnowledgeController {
    index(req, res, path) {
        res.sendFile(path.join(__dirname, '../Public/pages/knowledge.html'));
    }

    store(req, res, ragEngine, fs, knowledgeFile) {
        try {
            const { keyword, response, kategori } = req.body;
            if (!keyword || !response) {
                return res.status(400).json({ message: 'Keyword dan response harus diisi', success: false });
            }
            if (!ALLOWED_KATEGORI.has(kategori)) {
                return res.status(400).json({ message: 'Kategori tidak valid', success: false });
            }
            const knowledge = knowledgesServices.loadKnowledge(fs, knowledgeFile);

            const lowerKeyword = keyword.toLowerCase().trim();
            if (!knowledge.keywords[kategori]) {
                knowledge.keywords[kategori] = [];
            }

            if (!knowledge.keywords[kategori].includes(lowerKeyword)) {
                knowledge.keywords[kategori].push(lowerKeyword);
            }

            if (!knowledge.responses[kategori]) {
                knowledge.responses[kategori] = {};
            }

            knowledge.responses[kategori][lowerKeyword] = response;

            if (knowledgesServices.saveKnowledge(knowledge, ragEngine, fs, knowledgeFile)) {
                res.json({
                    message: 'Keyword berhasil disimpan', success: true
                });
            } else {
                res.status(500).json({
                    message: 'Error menyimpan keyword',
                    success: false
                });
            }
        } catch (error) {
            res.status(500).json({
                message: 'Error: ' + error.message, success: false
            });
        }
    }

    show(req, res, fs, knowledgeFile) {
        try {
            const knowledge = knowledgesServices.loadKnowledge(fs, knowledgeFile);
            res.json(knowledge);

        } catch (error) {
            res.status(500).json({
                message: 'Error: ' + error.message, success: false
            });
        }
    }

    destroy(req, res, ragEngine, fs, knowledgeFile) {
        try {
            const keyword =
                decodeURIComponent(req.params.keyword).toLowerCase();
            const knowledge = knowledgesServices.loadKnowledge(fs, knowledgeFile);

            const kategori = req.params.kategori;
            if (!ALLOWED_KATEGORI.has(kategori)) {
                return res.status(400).json({ message: 'Kategori tidak valid', success: false });
            }
            if (knowledge.responses[kategori]?.[keyword]) {
                delete knowledge.responses[kategori][keyword];

                if (knowledge.keywords[kategori]) {
                    knowledge.keywords[kategori] = knowledge.keywords[kategori]
                        .filter(k => k !== keyword);
                }
                if (knowledgesServices.saveKnowledge(knowledge, ragEngine, fs, knowledgeFile)) {

                    res.json({
                        message: 'Keyword berhasil dihapus', success: true
                    });
                } else {
                    res.status(500).json({
                        message: 'Error menghapus keyword',
                        success: false
                    });
                }
            } else {
                res.status(404).json({
                    message: 'Keyword tidak ditemukan',
                    success: false
                });
            }
        } catch (error) {
            res.status(500).json({
                message: 'Error: ' + error.message, success: false
            });
        }
    }
}

module.exports = KnowledgeController;