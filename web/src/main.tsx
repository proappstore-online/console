import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary.tsx'
import { applyTextSize } from './ProfileView.tsx'

// Restore the saved text-size before first paint (no flash).
applyTextSize((localStorage.getItem('console-text') as 'sm' | 'md' | 'lg' | 'xl') || 'md')

// A deploy's service worker takes over at once (console#21): reload onto the new build, whose chunks
// replace this one's in the precache. Only when a worker already controlled the page — the first
// install claims it without a reload.
if (navigator.serviceWorker?.controller) {
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
