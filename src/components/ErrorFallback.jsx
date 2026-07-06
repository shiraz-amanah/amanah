import { AlertTriangle, RotateCw } from "lucide-react";

// Shown by the app-root Sentry.ErrorBoundary (main.jsx) when a render throws.
// Before Sentry this app had NO error boundary — an uncaught render error
// white-screened the whole SPA. Keep this dependency-light: it renders when the
// tree below has already failed. resetError re-mounts the boundary's children;
// a full reload is the reliable escape hatch, so we offer both.
const ErrorFallback = ({ resetError }) => (
  <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
    <div className="max-w-md w-full bg-white border border-stone-200 rounded-2xl shadow-sm p-8 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-4">
        <AlertTriangle size={22} className="text-amber-500" />
      </div>
      <h1 className="text-xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Something went wrong</h1>
      <p className="text-sm text-stone-600 mt-2">
        An unexpected error interrupted the page. It's been reported to our team automatically. You can try again or reload.
      </p>
      <div className="flex items-center justify-center gap-2 mt-6">
        <button onClick={() => (typeof resetError === "function" ? resetError() : window.location.reload())} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">
          <RotateCw size={15} /> Try again
        </button>
        <button onClick={() => window.location.reload()} className="border border-stone-300 text-stone-700 hover:border-stone-400 text-sm font-medium px-4 py-2 rounded-lg">
          Reload page
        </button>
      </div>
    </div>
  </div>
);

export default ErrorFallback;
