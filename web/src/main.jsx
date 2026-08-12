import { Buffer } from 'buffer'
globalThis.Buffer = Buffer

import './lib/domMutationGuard'
import { createRoot } from 'react-dom/client'
import './index.css'
import './components/FuturesTerminal.css'
import './hooks/useFuturesTheme'
import { installClientLogger } from './lib/clientLogger'
import { installPrivyAnalyticsGuard } from './lib/privyAnalyticsGuard'
import App from './App.jsx'

installPrivyAnalyticsGuard()
installClientLogger()

createRoot(document.getElementById('root')).render(
  <App />,
)
