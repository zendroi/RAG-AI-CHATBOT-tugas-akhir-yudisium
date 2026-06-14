import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
    plugins: [
        tailwindcss(),
    ],
    root: 'Public',
    build: {
        outDir: '../dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'Public/index.html'),
                dashboard: resolve(__dirname, 'Public/pages/dashboard.html'),
                knowledge: resolve(__dirname, 'Public/pages/knowledge.html'),
                tugasAkhir: resolve(__dirname, 'Public/pages/tugasAkhir.html'),
                yudisium: resolve(__dirname, 'Public/pages/yudisium.html'),
            }
        }
    }
})