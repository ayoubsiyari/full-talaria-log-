/**
 * Entry for the LIVE V9 build.
 *
 * Imports TalariaV8bLive (real-data version with chart.js wired in) instead
 * of the original TalariaV8b mockup. Original mockup stays untouched in
 * src/TalariaV8b.jsx as the design reference.
 *
 * Loaded by live/index.html, which is the entry for vite.config.live.js.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import TalariaV8bLive from '../src/TalariaV8bLive.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TalariaV8bLive />
  </StrictMode>,
)
