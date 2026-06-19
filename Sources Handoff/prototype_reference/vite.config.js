import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const fullReloadTalariaMonolith = () => ({
  name: 'full-reload-talaria-monolith',
  handleHotUpdate(ctx) {
    if (ctx.file.endsWith('src/TalariaV8b.jsx')) {
      ctx.server.ws.send({ type: 'full-reload' })
      return []
    }
  },
})

export default defineConfig({
  plugins: [fullReloadTalariaMonolith(), react()],
})
