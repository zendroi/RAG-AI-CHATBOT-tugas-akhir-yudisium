const fs = require('fs');
const path = require('path');

const DashboardController = require('../controllers/DashboardController');
const KnowledgeController = require('../controllers/KnowledgeController');
const SmartCheckController = require('../controllers/SmartCheckController');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

const dashboardController = new DashboardController();
const knowledgeController = new KnowledgeController();
const smartCheckController = new SmartCheckController();


class Routes {

    constructor(app, path) {
        this.app = app;
        this.path = path;
    }


    init() {

        this.app.get('/dashboard', (req, res) => {
            dashboardController.index(req, res, this.path);
        });

        this.app.get('/knowledge', (req, res) => {
            knowledgeController.index(req, res, this.path);
        });

    }

    knowledge(ragEngine, datasetManager, upload) {

        this.app.get('/api/knowledge/sources', requireAuth, (req, res) => {
            knowledgeController.list(req, res, datasetManager);
        });

        this.app.post('/api/knowledge/sources', requireAdmin, upload.array('documents', 20), async (req, res) => {
            await knowledgeController.upload(req, res, ragEngine, datasetManager);
        });

        this.app.put('/api/knowledge/sources/:id', requireAdmin, (req, res) => {
            knowledgeController.update(req, res, ragEngine, datasetManager);
        });

        this.app.put('/api/knowledge/sources/:id/file', requireAdmin, upload.single('document'), async (req, res) => {
            await knowledgeController.replaceFile(req, res, ragEngine, datasetManager);
        });

        this.app.delete('/api/knowledge/sources/:id', requireAdmin, (req, res) => {
            knowledgeController.destroy(req, res, ragEngine, datasetManager);
        });

        // Re-run extraction over all docs (or one) with the current pipeline.
        this.app.post('/api/knowledge/reextract', requireAdmin, async (req, res) => {
            await knowledgeController.reextract(req, res, ragEngine, datasetManager);
        });
        this.app.post('/api/knowledge/sources/:id/reextract', requireAdmin, async (req, res) => {
            await knowledgeController.reextract(req, res, ragEngine, datasetManager);
        });

        this.app.get('/api/documents/:id/download', requireAuth, (req, res) => {
            const source = datasetManager.getSourceDocuments().find(item => item.id === req.params.id);
            if (!source) return res.status(404).json({ success: false, message: 'Dokumen tidak ditemukan.' });

            const filePath = path.join(__dirname, '..', 'uploads', source.storedName);
            if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'File dokumen tidak ditemukan di server.' });

            res.download(filePath, source.name);
        });
    }

    smartCheck() {
        this.app.get('/api/smart-check/:jenis/fields', requireAuth, (req, res) => {
            smartCheckController.fields(req, res);
        });

        this.app.get('/api/smart-check/:jenis', requireAuth, async (req, res) => {
            await smartCheckController.lastStatus(req, res);
        });

        this.app.post('/api/smart-check', requireAuth, async (req, res) => {
            await smartCheckController.check(req, res);
        });
    }
}

module.exports = Routes;
