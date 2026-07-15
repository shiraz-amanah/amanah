/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // Avatar gradients (avatar_gradient column) are assigned at runtime by the
  // Postgres `handle_new_user` trigger and never appear as literal class
  // strings in source, so Tailwind's content scan would purge them — the
  // result is a transparent `bg-gradient-to-br` and invisible white-on-white
  // initials. Safelist the project palette (the 8 hues in the campaign
  // `gradients` array in App.jsx) at the avatar shade pattern
  // `from-{hue}-400 to-{hue}-700`. Explicit strings, not a regex `pattern`:
  // a pattern expands across variants and tripled the CSS bundle. If the
  // trigger ever assigns a hue outside this palette, add it here.
  safelist: [
    "from-emerald-400", "to-emerald-700",
    "from-amber-400", "to-amber-700",
    "from-rose-400", "to-rose-700",
    "from-indigo-400", "to-indigo-700",
    "from-purple-400", "to-purple-700",
    "from-sky-400", "to-sky-700",
    "from-stone-400", "to-stone-700",
    "from-teal-400", "to-teal-700",
  ],
  theme: {
    extend: {
      // COLOUR SYSTEM SPLIT (Job A/C). `brand` (decorative: buttons, nav, logo,
      // accents) and `success` (positive status signals: Active/Paid/Verified/
      // Approved/Confirmed/DBS) are two DISTINCT tokens. Job C flipped `brand` to
      // the forest green anchored on the landing's #1a7a3c; `success` stays on
      // Tailwind's emerald verbatim, so every "Active"/"Paid"/"Verified"/DBS badge
      // is UNCHANGED by the flip. That separation is the whole point of the split
      // — do NOT collapse these back into one, and do NOT retint `success`.
      colors: {
        brand: {
          // Job C flip: forest green anchored on the landing's #1a7a3c (pinned at
          // 700, the workhorse shade). Perceptually-even Tailwind `green` ramp for
          // the rest, so #1a7a3c sits cleanly between 600 (#16a34a) and 800 (#166534).
          50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80',
          500: '#22c55e', 600: '#16a34a', 700: '#1a7a3c', 800: '#166534', 900: '#14532d', 950: '#052e16',
        },
        success: {
          50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399',
          500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b', 950: '#022c22',
        },
      },
      // Serif heading token leads with Fraunces (loaded in index.html), then
      // Georgia, then generic serif. Available as the `font-serif` utility for
      // Job C to migrate the ~inline `'Fraunces', Georgia, serif` styles onto.
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
