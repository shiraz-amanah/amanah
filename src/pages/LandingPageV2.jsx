import { useState } from "react";
import { ShieldCheck, Sparkles, Check, X } from "lucide-react";
import LegalFooter from "../components/LegalFooter";
import "../styles/amanahTheme.css";

// Landing page V2 (Session LANDING-V2) — the approved pure-SaaS editorial design.
// Amanah is B2B SaaS: the mosque admin is the ONLY buyer this page speaks to.
// No audience switcher, no scholar marketplace, no parent/scholar sections as
// audiences — parents appear ONCE, as a feature sold to the mosque.
//
// Brand colours come EXCLUSIVELY from the amanahTheme.css tokens (via the `T` map)
// so the theme can later roll into the dashboards as a token change, not a rewrite
// (future THEME-1). Light-theme neutrals (`L`) have no brand token — they're the
// page's local surface/ink palette. No gradients, shadows or blur anywhere; the
// only motion is the hero's rotating Islamic-star pattern (ported from
// feature/landing-redesign) and the eyebrow dot pulse. Only reuses LegalFooter.

// --- Brand tokens (single source of truth: src/styles/amanahTheme.css) ---
const T = {
  green: "var(--amanah-green)",
  greenBright: "var(--amanah-green-bright)",
  greenTint: "var(--amanah-green-tint)",
  greenDeep: "var(--amanah-green-deep)",
  dark: "var(--amanah-dark)",
  dark2: "var(--amanah-dark-2)",
  serif: "var(--amanah-serif)",
  w90: "var(--amanah-white-90)",
  w55: "var(--amanah-white-55)",
  w35: "var(--amanah-white-35)",
  wBorder: "var(--amanah-white-border)",
};

// --- Light-surface neutrals (no brand token exists for these) ---
const L = {
  white: "#fff",
  ink: "#1c1917",
  muted: "#78716c",
  faint: "#a8a29e",
  border: "#e7e5e4",
  surface: "#f7f6f3",
  surface2: "#f5f5f4",
  chapterNum: "#B4B2A9",
  amber: "#b45309",
};

const serifHead = { fontFamily: T.serif, fontWeight: 400, letterSpacing: "-0.02em", margin: 0 };
const inputS = { width: "100%", fontSize: 14, color: L.ink, border: `1px solid ${L.border}`, borderRadius: 10, padding: "10px 12px", outline: "none", background: L.white };
const DEMO_TIMES = ["Morning", "Afternoon", "Evening"];

// Single shared content rail: every section centres its content on this one
// max-width via `mx-auto` (THEME-1 c3). Previously each section set its own
// width (640/900/1000) and the dark sections had no mx-auto, so the column
// visibly shifted left↔centre while scrolling. One rail = one fixed column.
const RAIL = 1080;
const railClass = "mx-auto w-full";

const solidBtn = { fontSize: 14, fontWeight: 500, color: "#fff", background: T.green, borderRadius: 8, padding: "12px 24px", border: "none", cursor: "pointer" };
const ghostBtn = { fontSize: 14, color: "#fff", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "12px 24px", background: "transparent", cursor: "pointer" };

const Dot = ({ color = T.greenBright, size = 6 }) => (
  <span className="lpv-pulse" style={{ width: size, height: size, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
);

const artCard = { background: L.white, border: `0.5px solid ${L.border}`, borderRadius: 12, padding: 18 };
const tile = { background: L.surface2, border: `0.5px solid ${L.border}`, borderRadius: 10, padding: "10px 10px" };

const LivePill = ({ children }) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap" style={{ fontSize: 10, color: T.green, background: "rgba(26,122,60,0.08)", border: "0.5px solid rgba(26,122,60,0.25)", borderRadius: 20, padding: "3px 8px" }}>
    <Dot color={T.green} size={5} /> {children}
  </span>
);

// ---- Product-chapter artifacts (hand-built to match the live product) ----
const RegisterArtifact = () => (
  <div style={artCard}>
    <div className="flex items-center justify-between gap-2">
      <span style={{ fontSize: 11, letterSpacing: "0.06em", color: L.faint, textTransform: "uppercase" }}>Tajweed · Saturday register</span>
      <LivePill>Live now</LivePill>
    </div>
    <div className="grid grid-cols-3 gap-2 mt-3">
      {[["23/25", "Present"], ["Al-Baqarah", "Class hifz"], ["94%", "Homework in"]].map(([v, l]) => (
        <div key={l} style={tile}>
          <p style={{ fontSize: 14, color: L.ink, fontWeight: 600 }}>{v}</p>
          <p style={{ fontSize: 11, color: L.muted, marginTop: 2 }}>{l}</p>
        </div>
      ))}
    </div>
  </div>
);

const OfstedArtifact = () => (
  <div style={artCard} className="flex items-center justify-between gap-4">
    <div>
      <p style={{ ...serifHead, fontSize: 40, color: T.green, lineHeight: 1 }}>92/100</p>
      <p style={{ fontSize: 11, color: L.muted, marginTop: 6 }}>Ofsted readiness</p>
      <p style={{ fontSize: 12, color: L.muted, marginTop: 8, lineHeight: 1.5 }}>1 DBS renewal due in 18 days — reminder already sent</p>
    </div>
    <span style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(26,122,60,0.1)", color: T.green, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <ShieldCheck size={22} />
    </span>
  </div>
);

const MoneyArtifact = () => {
  const rows = [
    { l: "Tuition collected this month", v: "£3,840", c: L.ink },
    { l: "Outstanding (reminders sent)", v: "£240", c: L.amber },
    { l: "Platform fee on donations", v: "£0 — always", c: T.green },
  ];
  return (
    <div style={artCard}>
      {rows.map((r, i) => (
        <div key={r.l} className="flex items-center justify-between gap-3" style={{ padding: "10px 0", borderTop: i === 0 ? "none" : `0.5px solid ${L.border}` }}>
          <span style={{ fontSize: 13, color: L.muted }}>{r.l}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: r.c, whiteSpace: "nowrap" }}>{r.v}</span>
        </div>
      ))}
    </div>
  );
};

const ParentNotifArtifact = () => (
  <div style={artCard} className="flex items-start gap-3">
    <span style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(26,122,60,0.1)", color: T.green, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>AA</span>
    <div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-2">
        <p style={{ fontSize: 13, fontWeight: 600, color: L.ink }}>Adam memorised Al-Fatiha</p>
        <span style={{ fontSize: 11, color: L.faint, whiteSpace: "nowrap" }}>Just now</span>
      </div>
      <p style={{ fontSize: 12, color: L.muted, marginTop: 3, lineHeight: 1.5 }}>MashAllah — surah 1 of 114 complete</p>
    </div>
  </div>
);

const AiArtifact = () => (
  <div style={artCard}>
    <div className="flex items-start gap-2">
      <Sparkles size={15} style={{ color: T.green, marginTop: 2, flexShrink: 0 }} />
      <p style={{ fontSize: 14, fontStyle: "italic", color: L.ink, lineHeight: 1.4 }}>Which families haven't paid this term?</p>
    </div>
    <div style={{ background: T.greenTint, borderRadius: 10, padding: "12px 14px", marginTop: 12 }}>
      <p style={{ fontSize: 14, color: T.greenDeep, lineHeight: 1.55 }}>3 families outstanding — £240 total. Last reminder 14 days ago.</p>
    </div>
    {/* Non-functional demo link */}
    <span style={{ display: "inline-block", marginTop: 12, fontSize: 13, fontWeight: 500, color: T.green, textDecoration: "underline" }}>Send reminder</span>
  </div>
);

const CHAPTERS = [
  { num: "01", title: "The madrasah, handled",
    body: "Registers in seconds. Hifz tracked ayah by ayah. Homework, rewards and reports — no spreadsheet in sight.",
    artifact: <RegisterArtifact /> },
  { num: "02", title: "Staff, contracts and DBS — inspection-ready",
    body: "Right to Work, DBS expiry tracking, UK contracts with e-sign, ijazah records. Amanah watches the deadlines so you don't have to.",
    artifact: <OfstedArtifact /> },
  { num: "03", title: "Money, without the chasing",
    body: "Monthly tuition collected automatically. Reminders sent for you. Donations pass through at 0% — always.",
    artifact: <MoneyArtifact /> },
  { num: "04", title: "Parents get their own app",
    body: "Hifz progress live. Class notifications. One-tap fee payment. No more chasing the teacher on WhatsApp — sold to you, loved by them.",
    artifact: <ParentNotifArtifact /> },
  { num: "05", title: "Ask your mosque anything",
    body: "Plain English in, answers from your own live data out.",
    artifact: <AiArtifact /> },
];

const LEDGER = [
  ["14 WhatsApp groups", "nobody reads all of them"],
  ["fees_FINAL_v3(2).xlsx", "last opened by someone who left"],
  ["A paper register", "with tea on it"],
  ["The treasurer's memory", "he's on Hajj until March"],
  ["DBS certificates", "in a drawer, somewhere"],
];

const PROOF = [
  { n: "£0", l: "to start, forever", green: false },
  { n: "2.5%", l: "only when you collect fees", green: false },
  { n: "0%", l: "on donations, always", green: true },
  { n: "BD1", l: "built in Bradford · ICO registered", green: false },
];

const PRICING = [
  ["Starter — everything to run your madrasah", "Free forever"],
  ["Payments — tuition, subscriptions, dunning", "2.5% per transaction"],
  ["Pro — WhatsApp, AI, full mosque management", "£49/mo · launching soon"],
];

// Book-a-demo modal. Submits to send-transactional intent 'demo_request'
// (unauthenticated — recipient fixed server-side to the platform owner).
const DemoModal = ({ onClose }) => {
  const [form, setForm] = useState({ name: "", mosqueName: "", email: "", phone: "", preferredTime: "Morning" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.mosqueName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setErr("Please fill in your name, mosque, and a valid email."); return;
    }
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/send-transactional", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "demo_request", ...form }) });
      const j = await res.json().catch(() => ({}));
      if (j?.ok) setDone(true); else setErr("Something went wrong. Please try again or email us directly.");
    } catch { setErr("Something went wrong. Please try again."); }
    setBusy(false);
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: L.white, borderRadius: 16, padding: 28, width: "100%", maxWidth: 440, position: "relative" }}>
        <button onClick={onClose} aria-label="Close" style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", color: L.faint }}><X size={18} /></button>
        {done ? (
          <div className="text-center" style={{ padding: "16px 0" }}>
            <span style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(26,122,60,0.12)", color: T.green, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Check size={22} strokeWidth={3} /></span>
            <p style={{ ...serifHead, fontSize: 20, color: L.ink, marginTop: 14 }}>Thanks! We'll be in touch within 24 hours.</p>
          </div>
        ) : (
          <>
            <h3 style={{ ...serifHead, fontSize: 22, color: L.ink }}>Book a demo</h3>
            <p style={{ fontSize: 14, color: L.muted, marginTop: 6, lineHeight: 1.5 }}>We'll show you Amanah live and set up your mosque in under 10 minutes.</p>
            <form onSubmit={submit} className="mt-4 space-y-3">
              <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Your name" style={inputS} />
              <input value={form.mosqueName} onChange={(e) => set("mosqueName", e.target.value)} placeholder="Mosque name" style={inputS} />
              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="Email address" style={inputS} />
              <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Phone number (optional)" style={inputS} />
              <select value={form.preferredTime} onChange={(e) => set("preferredTime", e.target.value)} style={inputS}>
                {DEMO_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {err && <p style={{ fontSize: 12, color: "#b91c1c" }}>{err}</p>}
              <button type="submit" disabled={busy} style={{ width: "100%", fontSize: 14, fontWeight: 500, color: "#fff", background: T.green, borderRadius: 10, padding: "12px", border: "none", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy ? "Sending…" : "Request a demo →"}</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

const LandingPageV2 = ({ onSignIn }) => {
  const [showDemo, setShowDemo] = useState(false);
  const openDemo = () => setShowDemo(true);
  const go = (role) => onSignIn?.(role);

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: L.white }}>
      <style>{`
        @keyframes lpvPulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        .lpv-pulse { animation: lpvPulse 2s ease-in-out infinite; }
        @keyframes lpvSlowRotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .lpv-pattern-rotate { animation: lpvSlowRotate 120s linear infinite; transform-origin: center; }
        .lpv-dark em { color: var(--amanah-green-bright); font-style: italic; }
        .lpv-light em { color: var(--amanah-green); font-style: italic; }
      `}</style>

      {/* ===== SECTION 1 — NAV ===== */}
      <nav className="lpv-dark px-5 md:px-12" style={{ background: T.dark, borderBottom: `0.5px solid ${T.wBorder}`, paddingTop: 18, paddingBottom: 18 }}>
        <div className={`${railClass} flex items-center justify-between gap-4`} style={{ maxWidth: RAIL }}>
          <a href="/" className="flex items-center gap-2.5 shrink-0">
            <span style={{ width: 30, height: 30, borderRadius: 8, background: T.green, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ShieldCheck size={16} style={{ color: "#eafaf0" }} />
            </span>
            <span style={{ fontSize: 17, color: "#fff", fontWeight: 500 }}>Amanah</span>
          </a>
          <div className="hidden md:flex items-center" style={{ gap: 28 }}>
            <a href="#product" style={{ fontSize: 13, color: T.w55 }}>Product</a>
            <a href="#pricing" style={{ fontSize: 13, color: T.w55 }}>Pricing</a>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={() => go("mosque")} style={{ fontSize: 14, color: "#fff", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "8px 16px", background: "transparent", cursor: "pointer" }}>Sign in</button>
            <button onClick={openDemo} style={{ fontSize: 14, fontWeight: 500, color: "#fff", background: T.green, borderRadius: 8, padding: "8px 16px", border: "none", cursor: "pointer" }}>Book a demo →</button>
          </div>
        </div>
      </nav>

      {/* ===== SECTION 2 — HERO ===== */}
      <section className="lpv-dark px-5 md:px-12" style={{ background: T.dark, position: "relative", overflow: "hidden", paddingTop: 80, paddingBottom: 60 }}>
        {/* Rotating Islamic geometric star pattern (ported from feature/landing-redesign) */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ opacity: 0.2 }}>
          <svg className="lpv-pattern-rotate absolute" style={{ top: "-30%", left: "-10%", width: "120%", height: "160%" }} viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="lpvIslamicStar" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse">
                <g transform="translate(60 60)" stroke="rgba(251, 191, 36, 0.4)" strokeWidth="1" fill="none">
                  <polygon points="0,-40 11,-11 40,0 11,11 0,40 -11,11 -40,0 -11,-11" />
                  <rect x="-28" y="-28" width="56" height="56" transform="rotate(45)" />
                  <rect x="-28" y="-28" width="56" height="56" />
                  <circle r="6" fill="rgba(251, 191, 36, 0.3)" />
                </g>
              </pattern>
            </defs>
            <rect width="800" height="800" fill="url(#lpvIslamicStar)" />
          </svg>
        </div>

        <div className={`relative ${railClass} lg:grid lg:grid-cols-[1fr_auto] lg:items-center lg:gap-12`} style={{ maxWidth: RAIL }}>
          {/* LEFT — copy column */}
          <div style={{ maxWidth: 640 }}>
          {/* Eyebrow pill */}
          <div className="inline-flex items-center gap-2" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: T.greenBright, border: "1px solid rgba(74,222,128,0.25)", background: "rgba(74,222,128,0.05)", borderRadius: 20, padding: "6px 12px" }}>
            <Dot /> The operating system for UK mosques
          </div>

          {/* Headline */}
          <h1 style={{ ...serifHead, fontSize: 52, lineHeight: 1.08, color: "#fff", marginTop: 28 }} className="max-md:!text-[38px]">
            Your mosque.<br />Finally has a<br /><em>brain.</em>
          </h1>

          {/* Sub */}
          <p style={{ fontSize: 17, color: T.w55, lineHeight: 1.6, maxWidth: 420, marginTop: 24 }}>
            Madrasah, staff, payments and parents — one platform, built for the way mosques actually run.
          </p>

          {/* CTAs */}
          <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 36 }}>
            <button onClick={openDemo} style={solidBtn}>Book a demo →</button>
            <button onClick={() => go("mosque")} style={ghostBtn}>See it live →</button>
          </div>

          {/* Proof bar */}
          <div className="flex items-center flex-wrap gap-x-3 gap-y-2" style={{ marginTop: 32 }}>
            {["Free to start", "0% on donations, always", "ICO registered · UK built"].map((t, i) => (
              <span key={t} className="flex items-center gap-3">
                {i > 0 && <span style={{ color: T.w35 }}>·</span>}
                <span style={{ fontSize: 13, color: T.w35 }}>{t}</span>
              </span>
            ))}
          </div>
          </div>

          {/* RIGHT — floating Ofsted-readiness card (dark glass, desktop ≥1024px only) */}
          <div className="hidden lg:flex justify-end">
            <div style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "18px 22px", maxWidth: 300 }}>
              <div className="flex items-start justify-between gap-3">
                <p style={{ ...serifHead, fontSize: 34, color: T.greenBright, lineHeight: 1 }}>92/100</p>
                <ShieldCheck size={20} style={{ color: T.greenBright, flexShrink: 0 }} />
              </div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 8 }}>Ofsted readiness</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 6, lineHeight: 1.5 }}>1 DBS renewal due in 18 days — reminder already sent</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== SECTION 3 — THE PROBLEM LEDGER ===== */}
      <section className="lpv-dark px-5 md:px-12" style={{ background: T.dark, borderTop: `0.5px solid ${T.wBorder}`, paddingTop: 64, paddingBottom: 72 }}>
        <div className={railClass} style={{ maxWidth: RAIL }}>
          <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: T.w35 }}>Right now</p>
          <h2 style={{ ...serifHead, fontSize: 36, color: "#fff", marginTop: 14, lineHeight: 1.15 }}>Your mosque runs on:</h2>

          <div style={{ marginTop: 28 }}>
            {LEDGER.map(([left, right]) => (
              <div key={left} className="flex flex-col md:flex-row md:items-center md:justify-between gap-1 md:gap-4" style={{ padding: "16px 0", borderBottom: "0.5px solid rgba(255,255,255,0.1)" }}>
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 15, color: "rgba(255,255,255,0.75)" }}>{left}</span>
                <span style={{ fontSize: 12, color: T.w35, fontStyle: "italic" }}>{right}</span>
              </div>
            ))}
          </div>

          <p style={{ ...serifHead, fontSize: 28, color: T.greenBright, marginTop: 36 }}>Amanah replaces all of it.</p>
        </div>
      </section>

      {/* ===== SECTION 4 — PRODUCT CHAPTERS ===== */}
      <section id="product" className="lpv-light px-5 md:px-12" style={{ background: L.white, paddingTop: 72, paddingBottom: 72 }}>
        <div className={railClass} style={{ maxWidth: RAIL }}>
          <div className="space-y-16">
            {CHAPTERS.map((c) => (
              // justify-center: the number+560 content is capped below the rail
              // width, so centre the pair within the rail instead of hugging the
              // left (which left the whole right half of wide screens empty).
              <div key={c.num} className="flex justify-center gap-5 md:gap-6">
                <div style={{ ...serifHead, fontSize: 56, color: L.chapterNum, lineHeight: 1, flexShrink: 0 }} className="max-md:!text-[40px]">{c.num}</div>
                {/* Content column capped so heading, body and the artifact card
                    all share ONE measure — the card fills its column instead of
                    floating narrow with empty space to its right. */}
                <div className="min-w-0 flex-1" style={{ maxWidth: 560 }}>
                  <h3 style={{ ...serifHead, fontSize: 26, color: L.ink, lineHeight: 1.2 }}>{c.title}</h3>
                  <p style={{ fontSize: 15, color: L.muted, lineHeight: 1.6, marginTop: 10 }}>{c.body}</p>
                  <div style={{ marginTop: 18 }}>{c.artifact}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SECTION 5 — PROOF STRIP ===== */}
      <section className="lpv-light px-5 md:px-12" style={{ background: L.surface, borderTop: `0.5px solid ${L.border}`, borderBottom: `0.5px solid ${L.border}`, paddingTop: 40, paddingBottom: 40 }}>
        {/* Narrow (640) inner measure, CENTRED on the rail — same reasoning as
            pricing: at the full 1080 the four stats spread so far apart they
            read as four unrelated things, not one proof cluster. */}
        <div className={`${railClass} grid grid-cols-2 md:grid-cols-4 gap-8`} style={{ maxWidth: 640 }}>
          {PROOF.map((p) => (
            <div key={p.l} className="text-center">
              <p style={{ ...serifHead, fontSize: 30, color: p.green ? T.green : L.ink }}>{p.n}</p>
              <p style={{ fontSize: 11, color: L.muted, marginTop: 6, lineHeight: 1.4 }}>{p.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== SECTION 6 — PRICING ===== */}
      <section id="pricing" className="lpv-light px-5 md:px-12" style={{ background: L.white, paddingTop: 64, paddingBottom: 64 }}>
        {/* Pricing keeps a narrow inner measure (640) but stays CENTRED on the
            rail — consistency of the rail, not the measure. At the full 1080
            the plan name and price sat a viewport apart and read like a
            spreadsheet; this is the section where the buyer decides to book. */}
        <div className={railClass} style={{ maxWidth: 640 }}>
          <h2 style={{ ...serifHead, fontSize: 30, color: L.ink, textAlign: "center", lineHeight: 1.2 }}>
            Pay for what you use. <em>Nothing else.</em>
          </h2>

          <div style={{ marginTop: 32 }}>
            {PRICING.map(([left, right]) => (
              <div key={left} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-4" style={{ padding: "18px 0", borderBottom: `0.5px solid ${L.border}` }}>
                <span style={{ fontSize: 15, color: L.ink }}>{left}</span>
                <span style={{ fontSize: 15, color: L.muted, whiteSpace: "nowrap" }}>{right}</span>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 12, color: L.muted, marginTop: 20, textAlign: "center", lineHeight: 1.6 }}>
            Donations are always 0%. Stripe processing fees (≈1.4% + 20p) apply separately.
          </p>

          <div className="text-center" style={{ marginTop: 28 }}>
            <button onClick={openDemo} style={{ ...solidBtn, padding: "14px 32px" }}>Book a demo →</button>
          </div>
        </div>
      </section>

      {/* ===== SECTION 7 — FINAL CTA ===== */}
      <section className="lpv-dark px-5 md:px-12" style={{ background: T.dark, paddingTop: 72, paddingBottom: 72, textAlign: "center" }}>
        <div className={railClass} style={{ maxWidth: RAIL }}>
          <h2 style={{ ...serifHead, fontSize: 40, color: "#fff", lineHeight: 1.15 }} className="max-md:!text-[32px]">
            Give your mosque<br />a <em>brain.</em>
          </h2>
          <p style={{ fontSize: 14, color: T.w55, marginTop: 16, lineHeight: 1.6 }}>
            Set up in an afternoon. Free until you collect your first fee.
          </p>
          <div style={{ marginTop: 28 }}>
            <button onClick={openDemo} style={{ ...solidBtn, padding: "14px 32px" }}>Book a demo →</button>
          </div>
        </div>
      </section>

      {/* ===== SECTION 8 — FOOTER ===== */}
      <footer className="px-5 md:px-12" style={{ background: T.dark, borderTop: `0.5px solid ${T.wBorder}`, paddingTop: 40, paddingBottom: 40 }}>
        <div className={railClass} style={{ maxWidth: RAIL }}>
          <LegalFooter className="text-stone-500" />
        </div>
      </footer>

      {showDemo && <DemoModal onClose={() => setShowDemo(false)} />}
    </div>
  );
};

export default LandingPageV2;
