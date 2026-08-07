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
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Backend that serves /chart/* (legacy chart.js + modules) and /api/*.
// Override with `CHART_BACKEND=http://your-server:port npm run dev:live`.
const BACKEND = process.env.CHART_BACKEND || 'http://31.97.192.82:3000'
// Prefer local ../chart/* over the remote proxy so chrome edits (context menu,
// order lines, etc.) show up on localhost. Force remote with USE_LOCAL_CHART=0.
const FORCE_REMOTE_CHART =
    process.env.USE_LOCAL_CHART === '0' || process.env.USE_LOCAL_CHART === 'false'
const chartRoot = path.resolve(__dirname, '../chart')

const MIME_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
}

function localChartFileForUrl(url) {
    if (!url.startsWith('/chart/')) return null
    const rel = decodeURIComponent(url.replace(/^\/chart\//, ''))
    const file = path.normalize(path.join(chartRoot, rel))
    return file.startsWith(chartRoot + path.sep) ? file : null
}

/** Serve ../chart/* from disk when present (default). Proxy only fills gaps. */
function localChartModulesPlugin() {
    return {
        name: 'local-chart-modules',
        configureServer(server) {
            if (FORCE_REMOTE_CHART) return
            server.middlewares.use((req, res, next) => {
                const url = (req.url || '').split('?')[0]
                const file = localChartFileForUrl(url)
                if (!file) {
                    next()
                    return
                }
                try {
                    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
                        const type = MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream'
                        res.setHeader('Content-Type', type)
                        res.setHeader('Cache-Control', 'no-cache')
                        fs.createReadStream(file).pipe(res)
                        return
                    }
                } catch (_) { /* fall through */ }
                next()
            })
        },
    }
}

export default defineConfig({
    plugins: [react(), localChartModulesPlugin()],

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
            // Legacy chart static files (chart.js, modules/*.js, vendor/*, assets)
            '/chart/chart.js':              { target: BACKEND, changeOrigin: true },
            '/chart/chart-main.js':         { target: BACKEND, changeOrigin: true },
            '/chart/chart.module.js':       { target: BACKEND, changeOrigin: true },
            '/chart/styles.css':            { target: BACKEND, changeOrigin: true },
            '/chart/propfirm-styles.css':   { target: BACKEND, changeOrigin: true },
            '/chart/modules':               { target: BACKEND, changeOrigin: true },
            '/chart/vendor':                { target: BACKEND, changeOrigin: true },
            '/chart/indicators':            { target: BACKEND, changeOrigin: true },
            '/chart/image':                 { target: BACKEND, changeOrigin: true },
            '/chart/fonts':                 { target: BACKEND, changeOrigin: true },
            '/chart/pwa':                   { target: BACKEND, changeOrigin: true },
            '/chart/manifest.webmanifest':  { target: BACKEND, changeOrigin: true },
            '/chart/pwa-install.js':        { target: BACKEND, changeOrigin: true },
            '/chart/settings-panel.js':     { target: BACKEND, changeOrigin: true },
            '/chart/settings-panel-ext.js': { target: BACKEND, changeOrigin: true },
            '/chart/multichart-prod':       { target: BACKEND, changeOrigin: true },
            '/chart/multichart':            { target: BACKEND, changeOrigin: true },
            // Backend API + websockets
            '/api':  { target: BACKEND, changeOrigin: true },
            '/ws':   { target: BACKEND, changeOrigin: true, ws: true },
            // Auth endpoints chart.js may hit
            '/auth': { target: BACKEND, changeOrigin: true },
            // Without these, Vite SPA-falls /login back to live/index.html and the
            // auth bootstrap 401→/login loop reloads forever on localhost.
            '/login': { target: BACKEND, changeOrigin: true },
            '/logout': { target: BACKEND, changeOrigin: true },
            '/register': { target: BACKEND, changeOrigin: true },
        },
    },

    build: {
        // Emit into chart/dist-v9/ (NOT chart/dist/) because the legacy
        // `npm run build:chart-client` script (run in Dockerfile) writes
        // to chart/dist/ and would overwrite our index.html.
        outDir: path.resolve(__dirname, '../chart/dist-v9'),
        emptyOutDir: true,
        /**
         * KILL-04 — no source maps in the served bundle, ever.
         *
         * Vite already defaults this to false, so today's bundle is clean; I verified that against the
         * running build, not against this file. Pinned explicitly anyway because the property we want
         * is "maps cannot ship", and "the default happens to be off" is not that property — a Vite
         * major, an inherited config, or one debugging session that forgets to revert all turn it on
         * silently. A shipped map hands the reader our whole unminified source.
         */
        sourcemap: false,
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
