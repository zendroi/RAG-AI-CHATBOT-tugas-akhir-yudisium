const ALLOWED_CATEGORY = new Set(['tugasAkhir', 'yudisium', 'umum']);

class KnowledgeController {
  index(req, res, path) {
    res.sendFile(path.join(__dirname, '../Public/pages/knowledge.html'));
  }

  list(req, res, datasetManager) {
    const { category, subCategory } = req.query;
    let sources = datasetManager.getSourceDocuments();
    if (category && ALLOWED_CATEGORY.has(category)) {
      sources = sources.filter(item => item.category === category);
    }
    if (subCategory) {
      sources = sources.filter(item => item.subCategory === subCategory);
    }
    res.json({ sources, totalChunks: datasetManager.getAllDocuments().length });
  }

  async upload(req, res, ragEngine, datasetManager) {
    try {
      if (!req.files || !req.files.length) {
        return res.status(400).json({ success: false, message: 'Pilih minimal satu dokumen.' });
      }
      const category = ALLOWED_CATEGORY.has(req.body.category) ? req.body.category : 'umum';
      const subCategory = req.body.subCategory || null;
      const result = await datasetManager.ingestUploadedFiles(req.files, category, subCategory);
      ragEngine.clearCache();
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  update(req, res, ragEngine, datasetManager) {
    try {
      const { name, category, subCategory } = req.body;
      if (category && !ALLOWED_CATEGORY.has(category)) {
        return res.status(400).json({ success: false, message: 'Kategori tidak valid.' });
      }
      const result = datasetManager.updateSourceMeta(req.params.id, { name, category, subCategory });
      ragEngine.clearCache();
      res.status(result.success ? 200 : 404).json(result);
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async replaceFile(req, res, ragEngine, datasetManager) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Pilih file pengganti.' });
      }
      const result = await datasetManager.replaceSourceFile(req.params.id, req.file);
      ragEngine.clearCache();
      res.status(result.success ? 200 : 404).json(result);
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  destroy(req, res, ragEngine, datasetManager) {
    try {
      const result = datasetManager.deleteSourceDocument(req.params.id);
      ragEngine.clearCache();
      res.status(result.success ? 200 : 404).json(result);
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Re-run the current extraction pipeline over every already-uploaded file (or one by id),
  // so improvements to OCR/table reading apply to old docs without re-uploading them.
  async reextract(req, res, ragEngine, datasetManager) {
    try {
      const { id } = req.params;
      const results = id ? [await datasetManager.reextractById(id)] : await datasetManager.reextractAll();
      ragEngine.clearCache();
      const ok = results.filter(r => r.success).length;
      res.json({ success: true, message: `${ok}/${results.length} dokumen diproses ulang.`, results });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = KnowledgeController;
