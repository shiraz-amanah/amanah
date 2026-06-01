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
    extend: {},
  },
  plugins: [],
}
