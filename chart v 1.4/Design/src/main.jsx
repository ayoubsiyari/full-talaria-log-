import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import TalariaV8b from './TalariaV8b'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <TalariaV8b />
    </BrowserRouter>
  </StrictMode>,
)
