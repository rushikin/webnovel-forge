import React from 'react'
import ReactDOM from 'react-dom/client'
import App, { AppProvider } from './App'
import './index.css'

function Root() {
  return (
    <React.StrictMode>
      <AppProvider>
        <App />
      </AppProvider>
    </React.StrictMode>
  )
}

const rootEl = document.getElementById('root')
if (!rootEl) {
  // Fallback if #root missing – show error instead of blank black
  document.body.innerHTML = '<div style="color:#C9A84C;padding:40px;font-family:Inter,sans-serif;background:#0D0F14;min-height:100vh"><h1 style="font-size:24px">WebNovel Forge – Renderer Error</h1><p>Root element not found. index.html may be malformed.</p></div>'
  throw new Error('Root element not found')
}

// Global error handler to surface blank-screen errors
window.addEventListener('error', (e) => {
  console.error('Window error:', e.error || e.message)
  const el = document.getElementById('root')
  if (el && !el.hasChildNodes()) {
    el.innerHTML = `<div style="color:#E05252;padding:24px;font-family:monospace;white-space:pre-wrap;background:#0D0F14;min-height:100vh">Renderer crashed:\n${String(e.error?.stack || e.message || e.error)}</div>`
  }
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection:', e.reason)
})

try {
  ReactDOM.createRoot(rootEl).render(<Root />)
} catch (err: any) {
  console.error('Failed to mount React:', err)
  rootEl.innerHTML = `<div style="color:#E05252;padding:24px;font-family:monospace;white-space:pre-wrap;background:#0D0F14;min-height:100vh">Failed to mount:\n${String(err?.stack || err)}</div>`
}