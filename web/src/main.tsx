import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary.tsx'
import { applyTextSize } from './ProfileView.tsx'

// Restore the saved text-size before first paint (no flash).
applyTextSize((localStorage.getItem('console-text') as 'sm' | 'md' | 'lg' | 'xl') || 'md')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
