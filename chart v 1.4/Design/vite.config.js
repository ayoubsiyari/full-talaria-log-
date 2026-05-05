import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  base: '/talaria-v8b-design/',
  build: {
    outDir: path.resolve(__dirname, '../../homepage/public/talaria-v8b-design'),
    emptyOutDir: true,
  },
})
