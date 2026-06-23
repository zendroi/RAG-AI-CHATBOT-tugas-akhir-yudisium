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
                landing: resolve(__dirname, 'Public/pages/guest/landing.html'),
                login: resolve(__dirname, 'Public/pages/auth/login.html'),
                register: resolve(__dirname, 'Public/pages/auth/register.html'),
                admin: resolve(__dirname, 'Public/pages/admin/admin.html'),
                home: resolve(__dirname, 'Public/pages/admin/home.html'),
                user_chat: resolve(__dirname, 'Public/pages/user/chat.html'),
                chatlog: resolve(__dirname, 'Public/pages/chatlog.html'),
                dashboard: resolve(__dirname, 'Public/pages/dashboard.html'),
                knowledge: resolve(__dirname, 'Public/pages/knowledge.html')
            }
        }
    }
})