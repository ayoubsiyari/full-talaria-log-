import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './chrome-tokens.css'
import './chrome-kit.css'
import './chrome-rebuild.css'
import './chrome-obsidian-surfaces.css'
import './chrome-order-ticket.css'
import './chrome-alert-modal.css'
import './chrome-goto.css'
import './chrome-trade-card.css'
import './chrome-settings.css'
import { installForbidNativeTooltips } from './forbidNativeTooltips.js'
import TalariaV8b from './TalariaV8b'

/** Default Vite entry (`npm run dev`). Trades panel uses window.chart.orderManager (same as live build). For chart.js + backend proxies use `npm run dev:live`. */

installForbidNativeTooltips(document)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TalariaV8b />
  </StrictMode>,
)
