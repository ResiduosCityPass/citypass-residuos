import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { seedDevToken } from './api/client.js'

// Solo hace algo en desarrollo y con VITE_DEV_TOKEN definida. Va antes del
// render para que la primera pantalla ya salga con sesion, en vez de pintar
// un 401 y corregirlo un instante despues.
seedDevToken(window.location.pathname)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
