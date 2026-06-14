
const DashboardController = require('../controllers/DashboardController');
const KnowledgeController = require('../controllers/KnowledgeController');
const YudisiumController = require('../controllers/YudisiumController');
const TAController = require('../controllers/TugasAkhirController');

const dashboardController = new DashboardController();
const knowledgeController = new KnowledgeController();
const yudisiumController = new YudisiumController();
const taController = new TAController();


class Routes {

    constructor(app, path) {
        this.app = app;
        this.path = path;
    }


    init() {


        this.app.get('/dashboard', (req, res) => {
            dashboardController.index(req, res, this.path);
        });

        this.app.get('/yudisium', (req, res) => {
            yudisiumController.index(req, res, this.path);
        });

        this.app.get('/tugasAkhir', (req, res) => {
            taController.index(req, res, this.path);
        });

        this.app.get('/knowledge', (req, res) => {
            knowledgeController.index(req, res, this.path);
        });


    }

    documents(ragEngine, datasetManager, upload) {


        this.app.get('/api/documents', (req, res) => {
            res.json({
                documents: datasetManager.getSourceDocuments(),
                chunks: datasetManager.getAllDocuments().length
            });
        });


        this.app.post('/api/documents/upload', upload.array('documents', 20), async (req, res) => {
            try {
                if (!req.files || !req.files.length) {
                    return res.status(400).json({ success: false, message: 'Pilih minimal satu dokumen.' });
                }

                const result = await datasetManager.ingestUploadedFiles(req.files);
                ragEngine.clearCache();
                res.json({ success: true, ...result });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        this.app.delete('/api/documents/:id', (req, res) => {
            try {
                const result = datasetManager.deleteSourceDocument(req.params.id);
                ragEngine.clearCache();
                res.json(result);
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });
    }

    knowledges(ragEngine, knowledgeFile, fs) {

        this.app.get('/api/knowledge/keywords', (req, res) => {
            knowledgeController.show(req, res,fs, knowledgeFile)
        });
        this.app.post('/api/knowledge/keyword', (req, res) => {
            knowledgeController.store(req, res, ragEngine, fs, knowledgeFile)
        });
        this.app.delete('/api/knowledge/keyword/:kategori/:keyword', (req, res) => {
           knowledgeController.destroy(req, res, ragEngine, fs, knowledgeFile)
        });
    }
}

module.exports = Routes;

