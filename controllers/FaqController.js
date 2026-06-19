const RagService = require('../services/RagService');
const ragService = new RagService();
const KnowledgesServices = require('../services/KnowledgesSevices');
const knowledgesServices = new KnowledgesServices();

class FaqController {
    async askBot(req, res, fs, knowledgeFile) {
        try {
            const { question } = req.body;
            
            if (!question) {
                return res.status(400).json({ 
                    message: 'Pertanyaan tidak boleh kosong', 
                    success: false 
                });
            }

            const knowledge = knowledgesServices.loadKnowledge(fs, knowledgeFile);

            const context = ragService.retrieveContext(question, knowledge);

            const finalAnswer = await ragService.generateAnswer(question, context);


            res.json({
                success: true,
                question: question,
                answer: finalAnswer,
                found_in_database: context ? true : false 
            });

        } catch (error) {
            res.status(500).json({
                message: 'Error pada server bot: ' + error.message, 
                success: false
            });
        }
    }
}

module.exports = FaqController;