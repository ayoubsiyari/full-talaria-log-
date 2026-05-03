/**
 * Vite config for the LIVE V9 build (TalariaV8bLive.jsx).
 *
 * - Dev: serves the React app at http://localhost:5173 with proxies for
 *   /chart/* (legacy chart scripts), /api/* (FastAPI), /ws/* (websockets)
 *   so the React app reaches the chart backend without CORS issues.
 *
 * - Build: outputs to ../chart/dist/ so the FastAPI server's existing logic
 *   in api_server.py:12046 (which prefers chart/dist/index.html when it
 *   exists) automatically serves the V9 build at /chart/index.html.
 *   Delete chart/dist/ to fall back to legacy index.html.
 *
 * Original config (vite.config.js) for the design-system build under
 * /talaria-v8b-design/ is left untouched.
 *
 * Usage:
 *   npm run dev:live      → http://localhost:5173 (V9 + real chart)
 *   npm run build:live    → emits ../chart/dist/
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Backend that serves /chart/* (legacy chart.js + modules) and /api/*.
// Override with `CHART_BACKEND=http://your-server:port npm run dev:live`.
const BACKEND = process.env.CHART_BACKEND || 'http://31.97.192.82:3000'

export default defineConfig({
    plugins: [react()],

    // Use live/ as the project root; live/index.html is the entry,
    // live/main.jsx imports ../src/TalariaV8bLive.jsx.
    root: path.resolve(__dirname, 'live'),

    // Asset base path. In dev we use '/' so the dev server serves at root.
    // In prod the build emits /chart/dist-v9/assets/... because:
    //   - The legacy `npm run build:chart-client` (run in Dockerfile) writes
    //     to chart/dist/, so the V9 build MUST go elsewhere to avoid being
    //     overwritten during docker build.
    //   - api_server.py serves /chart/dist-v9/* via a StaticFiles mount,
    //     and the /chart/index.html route prefers chart/dist-v9/index.html
    //     when it exists.
    base: process.env.NODE_ENV === 'production' ? '/chart/dist-v9/' : '/',

    // Resolve sources outside live/ (so live/main.jsx can import ../src/*).
    resolve: {
        alias: {
            '@src': path.resolve(__dirname, 'src'),
        },
    },

    server: {
        port: 5173,
        // fs.allow lets dev server read files outside of `root` (i.e. ../src).
        fs: {
            allow: [
                path.resolve(__dirname),       // talaria-design/
                path.resolve(__dirname, '..'), // chart v 1.4/
            ],
        },
        proxy: {
            // Legacy chart static files (chart.js, modules/*.js, indicators/*, image/*)
            '/chart/chart.js':              { target: BACKEND, changeOrigin: true },
            '/chart/chart-main.js':         { target: BACKEND, changeOrigin: true },
            '/chart/chart.module.js':       { target: BACKEND, changeOrigin: true },
            '/chart/styles.css':            { target: BACKEND, changeOrigin: true },
            '/chart/propfirm-styles.css':   { target: BACKEND, changeOrigin: true },
            '/chart/modules':               { target: BACKEND, changeOrigin: true },
            '/chart/indicators':            { target: BACKEND, changeOrigin: true },
            '/chart/image':                 { target: BACKEND, changeOrigin: true },
            '/chart/settings-panel.js':     { target: BACKEND, changeOrigin: true },
            '/chart/settings-panel-ext.js': { target: BACKEND, changeOrigin: true },
            // Backend API + websockets
            '/api':  { target: BACKEND, changeOrigin: true },
            '/ws':   { target: BACKEND, changeOrigin: true, ws: true },
            // Auth endpoints chart.js may hit
            '/auth': { target: BACKEND, changeOrigin: true },
        },
    },

    build: {
        // Emit into chart/dist-v9/ (NOT chart/dist/) because the legacy
        // `npm run build:chart-client` script (run in Dockerfile) writes
        // to chart/dist/ and would overwrite our index.html.
        outDir: path.resolve(__dirname, '../chart/dist-v9'),
        emptyOutDir: true,
        /**
         * Stable entry filename (no content hash in the basename) so partial deploys
         * are less likely to 404: index.html and assets/talaria-v9-live.js stay aligned.
         * Cache bust: bump ?v= on the script in live/index.html when needed.
         */
        rollupOptions: {
            output: {
                inlineDynamicImports: true,
                entryFileNames: 'assets/talaria-v9-live.js',
                chunkFileNames: 'assets/chunk-[hash].js',
                assetFileNames: 'assets/[name][hash][extname]',
            },
        },
    },
})
