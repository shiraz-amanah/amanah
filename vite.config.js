import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Sentry source-map upload runs ONLY when SENTRY_AUTH_TOKEN is present (set in the
// Vercel build env). Local / token-less builds skip it and stay green, and — key —
// source maps are only *emitted* when we're going to upload+delete them, so no
// `.map` files ever ship to the public dist. org + project also come from env, so
// nothing Sentry-related is hardcoded in the repo.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN

export default defineConfig({
  // Dev-only: forward /api/* to the Vercel functions running on :3000 (via
  // `vercel dev`), since `vite` alone doesn't serve serverless functions. No
  // effect on `vite build` / production (Vercel serves /api directly there).
  server: { proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } } },
  build: { sourcemap: !!sentryAuthToken },
  plugins: [
    react(),
    ...(sentryAuthToken
      ? [sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: sentryAuthToken,
          // Upload the maps to Sentry, then delete them from dist so they're never
          // served to the public.
          sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
        })]
      : []),
  ],
})
