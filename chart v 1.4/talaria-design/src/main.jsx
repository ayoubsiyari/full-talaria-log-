import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import TalariaV8b from './TalariaV8b'

/** Default Vite entry (`npm run dev`). Trades panel uses window.chart.orderManager (same as live build). For chart.js + backend proxies use `npm run dev:live`. */

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TalariaV8b />
  </StrictMode>,
)
