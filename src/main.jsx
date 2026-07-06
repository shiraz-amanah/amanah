import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App.jsx'
import ErrorFallback from './components/ErrorFallback.jsx'
import './index.css'

// Sentry — errors only this session (no performance/tracing). The DSN comes from
// VITE_SENTRY_DSN (Vite only exposes VITE_-prefixed env to the client; the DSN is
// safe to ship in the bundle). When unset — local dev, or before the Vercel env
// is wired — init is skipped and everything below is a harmless no-op, so nothing
// breaks. Unhandled errors + unhandled promise rejections are captured by the
// default integrations; the ErrorBoundary below catches React render errors.
const dsn = import.meta.env.VITE_SENTRY_DSN
if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={({ resetError }) => <ErrorFallback resetError={resetError} />}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
)
