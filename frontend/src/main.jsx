import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initTheme } from './lib/theme'

initTheme()

// A lazy chunk that fails to load (a deploy replaced it under an open tab): reload
// once to get the current version. Once only per 10 s, so a chunk that keeps failing
// falls through to ChunkBoundary's Reload panel instead of a reload loop.
window.addEventListener('vite:preloadError', () => {
  const KEY = 'mtgweb:chunkReloadAt'
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (Date.now() - last < 10000) return
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    return // no storage: no way to stop a loop, so leave it to the boundary
  }
  window.location.reload()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
