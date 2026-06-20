const fs = require('fs');
const path = require('path');

class PagesManager {
    constructor() {
        // Gunakan path.resolve agar lebih stabil
        this.datasetsPath = path.resolve(__dirname, '../Public/Pages');
        
        if (!fs.existsSync(this.datasetsPath)) {
            fs.mkdirSync(this.datasetsPath, { recursive: true });
        }

        console.log("Mencari di:", this.datasetsPath); // CEK INI DI TERMINAL
    
    if (!fs.existsSync(this.datasetsPath)) {
        console.log("Folder TIDAK DITEMUKAN!");
        fs.mkdirSync(this.datasetsPath, { recursive: true });
    } else {
        console.log("Folder DITEMUKAN!");
    }
    }

    readPages() {
        try {
            const files = fs.readdirSync(this.datasetsPath);
            // Hanya ambil file .js atau .txt, hindari file sistem seperti .DS_Store
            return files
                .filter(file => file.endsWith('.html') || file.endsWith('.txt')) 
                .map(file => ({
                    fileName: file,
                    label: file.split('.')[0]
                }));
        } catch (error) {
            console.error('Error reading pages:', error.message);
            return []; // Kembalikan array kosong jika gagal
        }
    }
}

module.exports = PagesManager;
