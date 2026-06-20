const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

class RagService {
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }

    retrieveContext(query, knowledge) {
        const lowerQuery = query.toLowerCase();
        let relevantContexts = [];

        for (const kategori in knowledge.keywords) {
            knowledge.keywords[kategori].forEach(keyword => {
                if (lowerQuery.includes(keyword)) {
                    relevantContexts.push(knowledge.responses[kategori][keyword]);
                }
            });
        }
        
        return relevantContexts.length > 0 ? relevantContexts.join('\n- ') : null;
    }

    async generateAnswer(query, context) {
        const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        let prompt = `
        Anda adalah Chatbot Akademik cerdas untuk membantu mahasiswa terkait Tugas Akhir dan Yudisium.
        Jawab pertanyaan mahasiswa HANYA berdasarkan KONTEKS yang diberikan di bawah ini.
        Jika jawaban tidak ada di dalam KONTEKS, katakan dengan sopan bahwa Anda belum memiliki informasi tersebut dan arahkan untuk bertanya ke BAAK/Admin.
        Jangan mengarang informasi atau tanggal.

        KONTEKS ATURAN KAMPUS:
        ${context ? '- ' + context : 'Tidak ada data relevan di sistem.'}

        PERTANYAAN MAHASISWA: 
        "${query}"
        
        JAWABAN:`;

        try {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error("LLM Error:", error);
            throw new Error("Gagal memproses AI Engine.");
        }
    }
}

module.exports = RagService;