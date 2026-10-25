// Fonts are bundled, not fetched from a font service (index.css explains which is used for what)
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/readex-pro/wght.css'
import './index.css'
import './i18n'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
