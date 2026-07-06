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
// Vercel env values often arrive wrapped in quotes or with stray whitespace (a
// very common paste artefact) — Sentry's DSN parser then rejects the whole thing
// with "Invalid Sentry DSN" on every page load. Strip surrounding quotes + trim
// so a slightly-off value still initialises; if it's still not a plausible DSN,
// skip init with ONE clear warning instead of Sentry's cryptic repeated error.
const rawDsn = import.meta.env.VITE_SENTRY_DSN
const dsn = rawDsn?.trim().replace(/^['"]+|['"]+$/g, '').trim()
if (dsn && /^https:\/\/[^@/]+@[^/]+\/\d+$/.test(dsn)) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
  })
} else if (rawDsn) {
  console.warn('[sentry] VITE_SENTRY_DSN is set but not a valid DSN after trimming — skipping init. Check the Vercel env value for surrounding quotes, whitespace, or a "VITE_SENTRY_DSN=" prefix.')
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={({ resetError }) => <ErrorFallback resetError={resetError} />}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
)
