import { Buffer } from 'buffer'
globalThis.Buffer = Buffer

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { installClientLogger } from './lib/clientLogger'
import App from './App.jsx'

installClientLogger()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
