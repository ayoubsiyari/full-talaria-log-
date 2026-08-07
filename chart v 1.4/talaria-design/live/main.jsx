/**
 * Entry for the LIVE V9 build.
 *
 * Imports TalariaV8bLive (real-data version with chart.js wired in) instead
 * of the original TalariaV8b mockup. Original mockup stays untouched in
 * src/TalariaV8b.jsx as the design reference.
 *
 * Loaded by live/index.html, which is the entry for vite.config.live.js.
 */
import { createRoot } from 'react-dom/client'
import '../src/chrome-tokens.css'
import '../src/chrome-kit.css'
import '../src/chrome-rebuild.css'
import '../src/chrome-obsidian-surfaces.css'
import '../src/chrome-order-ticket.css'
import '../src/chrome-alert-modal.css'
import '../src/chrome-goto.css'
import '../src/chrome-trade-card.css'
import '../src/chrome-settings.css'
import { installForbidNativeTooltips } from '../src/forbidNativeTooltips.js'
import TalariaV8bLive from '../src/TalariaV8bLive.jsx'

installForbidNativeTooltips(document)

createRoot(document.getElementById('root')).render(<TalariaV8bLive />)
