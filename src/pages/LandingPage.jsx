import { useState } from "react";
import { Sparkles, Check, X, BookOpen, Star, CreditCard, MessageCircle, Video, Building2, Receipt, ShieldCheck } from "lucide-react";
import LegalFooter from "../components/LegalFooter";

// Landing page redesign (feature/landing-redesign). Self-contained: colours are
// inline hex per the spec (no gradients/shadows/blur — except the hero's rotating
// Islamic-star pattern, replicated exactly from PublicHome per the brief); layout +
// responsiveness via Tailwind; the audience switcher + demo modal are local state.
// Wired to the root route in App.jsx. Only reuses LegalFooter from existing code.

const serif = { fontFamily: "Georgia, 'Times New Roman', serif" };
const inputS = { width: "100%", fontSize: 14, color: "#1c1917", border: "1px solid #e7e5e4", borderRadius: 10, padding: "10px 12px", outline: "none", background: "#fff" };
const DEMO_TIMES = ["Morning", "Afternoon", "Evening"];

const AUD = {
  mosque: {
    tab: "I run a mosque",
    headline: <>Your mosque.<br />Finally has a<br /><em>brain.</em></>,
    sub: "Classes, fees, attendance, live lessons, Hifz tracking, Jumu'ah, donations, WhatsApp — one platform. Built for the way mosques actually run.",
    primary: "Book a demo →",
    secondary: "See it live →",
    role: "mosque",
  },
  parent: {
    tab: "I'm a parent",
    headline: <>Your child's deen,<br />always <em>in sight.</em></>,
    sub: "See Hifz progress live. Get notified when class starts. Pay fees in one tap. No WhatsApp chasing the teacher.",
    primary: "Find a class →",
    secondary: "See parent dashboard →",
    role: "user",
  },
  scholar: {
    tab: "I'm a scholar",
    headline: <>Teach with confidence.<br />Get paid <em>on time.</em></>,
    sub: "Your schedule, your students, your payments — all in one place. DBS-verified listing included.",
    primary: "Become a scholar →",
    secondary: "See how it works →",
    role: "imam",
  },
};

const FEATURES = [
  { icon: BookOpen, color: "#1a7a3c", name: "Madrasah management", tag: "Core",
    desc: "Classes, enrolment, teachers, timetables, homework — everything a madrasah coordinator needs, without the spreadsheets." },
  { icon: Star, color: "#1a7a3c", name: "Hifz tracking", tag: "Unique to Amanah",
    desc: "Per-ayah memorisation progress. Parents see it live. Teachers log it in seconds. AI homework feedback coming soon." },
  { icon: CreditCard, color: "#2563eb", name: "Fees & subscriptions", tag: "Live",
    desc: "Monthly and termly tuition. One-off payments. Free trials. Automatic dunning. Stripe-powered. 2.5% platform fee — nothing else." },
  { icon: MessageCircle, color: "#d97706", name: "WhatsApp notifications", tag: "Coming soon",
    desc: "Send attendance alerts, fee reminders, Jumu'ah announcements directly from Amanah. Replaces your broadcast group." },
  { icon: Video, color: "#7c3aed", name: "Live lessons", tag: "Live",
    desc: "Built-in video lessons. Parents join from their dashboard. Auto-attendance when they join. No Zoom, no Google Meet." },
  { icon: Building2, color: "#0d9488", name: "Full mosque management", tag: "Roadmap",
    desc: "Prayer timetables, Jumu'ah, events, room bookings, donations, Nikah documentation — the whole mosque, not just the madrasah." },
];

const TAG_TONE = {
  "Live": { bg: "rgba(26,122,60,0.1)", color: "#1a7a3c" },
  "Unique to Amanah": { bg: "rgba(26,122,60,0.1)", color: "#1a7a3c" },
  "Coming soon": { bg: "rgba(217,119,6,0.1)", color: "#b45309" },
  "Roadmap": { bg: "rgba(120,113,108,0.1)", color: "#78716c" },
  "Core": { bg: "rgba(120,113,108,0.1)", color: "#57534e" },
};

const mutedW = (a) => `rgba(255,255,255,${a})`;
const glass = { background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 20 };

const Dot = ({ color = "#4ade80", size = 6 }) => (
  <span className="lp-pulse" style={{ width: size, height: size, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
);

const HeroCards = () => (
  <div className="flex flex-col gap-3">
    {/* Card 1 — AI bar */}
    <div style={glass}>
      <div className="flex items-center justify-between mb-3">
        <span style={{ fontSize: 12, color: mutedW(0.5) }}>Ask your data</span>
        <span className="inline-flex items-center gap-1.5" style={{ fontSize: 10, color: "#4ade80", background: "rgba(74,222,128,0.08)", border: "0.5px solid rgba(74,222,128,0.25)", borderRadius: 20, padding: "3px 8px" }}>
          <Dot size={5} /> AI
        </span>
      </div>
      <div className="flex items-start gap-2" style={{ background: "rgba(0,0,0,0.25)", border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 12px" }}>
        <Sparkles size={14} style={{ color: "#4ade80", marginTop: 2, flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: 13, fontStyle: "italic", color: mutedW(0.45), lineHeight: 1.4 }}>Which students missed class 3 times this month?</p>
          <p style={{ fontSize: 13, color: "#4ade80", marginTop: 6, lineHeight: 1.4 }}>↳ 4 students — Yusuf A, Fatima K, Ibrahim S, Aisha M</p>
        </div>
      </div>
    </div>

    {/* Card 2 — Stats */}
    <div style={glass}>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <span style={{ fontSize: 12, color: mutedW(0.5) }}>Madrasah overview</span>
        <span className="inline-flex items-center gap-1.5" style={{ fontSize: 10, color: "#4ade80", background: "rgba(74,222,128,0.08)", border: "0.5px solid rgba(74,222,128,0.25)", borderRadius: 20, padding: "3px 8px" }}>
          <Dot size={5} /> 3 classes live now
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[["247", "Students"], ["£3,840", "This month"], ["94%", "Attendance"]].map(([v, l]) => (
          <div key={l} style={{ background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 8px" }}>
            <p style={{ fontSize: 16, color: "#fff", fontWeight: 500 }}>{v}</p>
            <p style={{ fontSize: 11, color: mutedW(0.4), marginTop: 2 }}>{l}</p>
          </div>
        ))}
      </div>
    </div>

    {/* Card 3 — Hifz card */}
    <div style={glass}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(74,222,128,0.12)", color: "#4ade80", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>AA</span>
          <div className="min-w-0">
            <p style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Adam Ahmed</p>
            <p style={{ fontSize: 11, color: mutedW(0.4) }}>Tajweed · Yr 3 · Masjid Nur</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap" style={{ fontSize: 10, color: "#4ade80", background: "rgba(74,222,128,0.08)", border: "0.5px solid rgba(74,222,128,0.25)", borderRadius: 20, padding: "3px 8px" }}>
          <Dot size={5} /> In lesson
        </span>
      </div>
      <div className="flex items-center justify-between mt-3" style={{ fontSize: 12 }}>
        <span style={{ color: mutedW(0.6) }}>Al-Baqarah · Ayah 1–8</span>
        <span dir="rtl" style={{ color: mutedW(0.35), fontSize: 14 }}>البقرة</span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: "rgba(255,255,255,0.08)", marginTop: 8, overflow: "hidden" }}>
        <div style={{ width: "3%", height: "100%", background: "#4ade80" }} />
      </div>
      <p style={{ fontSize: 11, color: mutedW(0.4), marginTop: 6 }}>1 of 114 surahs · 3% complete</p>
    </div>
  </div>
);

const CheckItem = ({ children }) => (
  <li className="flex items-start gap-2.5">
    <span style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(26,122,60,0.12)", color: "#1a7a3c", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
      <Check size={11} strokeWidth={3} />
    </span>
    <span style={{ fontSize: 14, color: "#44403c", lineHeight: 1.5 }}>{children}</span>
  </li>
);

const NotifCard = ({ icon: Icon, color, title, body, time }) => (
  <div className="flex items-start gap-3" style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: 10, padding: 12 }}>
    <span style={{ width: 34, height: 34, borderRadius: 8, background: `${color}1a`, color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon size={16} />
    </span>
    <div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-2">
        <p style={{ fontSize: 13, fontWeight: 600, color: "#1c1917" }}>{title}</p>
        <span style={{ fontSize: 11, color: "#a8a29e", whiteSpace: "nowrap" }}>{time}</span>
      </div>
      <p style={{ fontSize: 12, color: "#78716c", marginTop: 2, lineHeight: 1.5 }}>{body}</p>
    </div>
  </div>
);

const PricingCard = ({ name, price, badge, desc, features, highlight }) => (
  <div style={{ background: "#fff", border: highlight ? "1.5px solid #1a7a3c" : "1px solid #e7e5e4", borderRadius: 14, padding: 24, position: "relative" }}>
    {badge && (
      <span style={{ position: "absolute", top: -10, left: 24, fontSize: 11, fontWeight: 600, color: "#fff", background: "#1a7a3c", borderRadius: 20, padding: "3px 12px" }}>{badge}</span>
    )}
    <p style={{ fontSize: 15, fontWeight: 600, color: "#1c1917" }}>{name}</p>
    <p style={{ fontSize: 14, color: "#1a7a3c", fontWeight: 500, marginTop: 2 }}>{price}</p>
    <p style={{ fontSize: 13, color: "#78716c", marginTop: 10, lineHeight: 1.5 }}>{desc}</p>
    <ul className="mt-4 space-y-2">
      {features.map((f) => (
        <li key={f} className="flex items-start gap-2" style={{ fontSize: 13, color: "#44403c" }}>
          <Check size={14} strokeWidth={2.5} style={{ color: "#1a7a3c", marginTop: 1, flexShrink: 0 }} /> {f}
        </li>
      ))}
    </ul>
  </div>
);

// Book-a-demo modal (Fix 5). Real page (not an iframe) so position:fixed is fine.
// Submits to send-transactional intent 'demo_request' (unauthenticated).
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
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 440, position: "relative" }}>
        <button onClick={onClose} aria-label="Close" style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", color: "#a8a29e" }}><X size={18} /></button>
        {done ? (
          <div className="text-center" style={{ padding: "16px 0" }}>
            <span style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(26,122,60,0.12)", color: "#1a7a3c", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Check size={22} strokeWidth={3} /></span>
            <p style={{ ...serif, fontSize: 20, color: "#1c1917", marginTop: 14 }}>Thanks! We'll be in touch within 24 hours.</p>
          </div>
        ) : (
          <>
            <h3 style={{ ...serif, fontSize: 22, color: "#1c1917" }}>Book a demo</h3>
            <p style={{ fontSize: 14, color: "#78716c", marginTop: 6, lineHeight: 1.5 }}>We'll show you Amanah live and set up your mosque in under 10 minutes.</p>
            <form onSubmit={submit} className="mt-4 space-y-3">
              <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Your name" style={inputS} />
              <input value={form.mosqueName} onChange={(e) => set("mosqueName", e.target.value)} placeholder="Mosque name" style={inputS} />
              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="Email address" style={inputS} />
              <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Phone number (optional)" style={inputS} />
              <select value={form.preferredTime} onChange={(e) => set("preferredTime", e.target.value)} style={inputS}>
                {DEMO_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {err && <p style={{ fontSize: 12, color: "#b91c1c" }}>{err}</p>}
              <button type="submit" disabled={busy} style={{ width: "100%", fontSize: 14, fontWeight: 500, color: "#fff", background: "#1a7a3c", borderRadius: 10, padding: "12px", border: "none", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy ? "Sending…" : "Request a demo →"}</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

const LandingPage = ({ onSignIn, onNavigate }) => {
  const [aud, setAud] = useState("mosque");
  const [showDemo, setShowDemo] = useState(false);
  const a = AUD[aud];
  const go = (role) => onSignIn?.(role);

  const navLink = { fontSize: 13, color: "rgba(255,255,255,0.55)" };
  const ghostBtn = { fontSize: 14, color: "#fff", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "8px 16px", background: "transparent" };
  const solidBtn = { fontSize: 14, fontWeight: 500, color: "#fff", background: "#1a7a3c", borderRadius: 10, padding: "14px 28px", border: "none" };

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#fff" }}>
      <style>{`
        @keyframes lpPulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        .lp-pulse { animation: lpPulse 2s ease-in-out infinite; }
        @keyframes lpSlowRotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .lp-pattern-rotate { animation: lpSlowRotate 120s linear infinite; transform-origin: center; }
        .lp-dark em { color:#4ade80; font-style:italic; }
        .lp-light em { color:#1a7a3c; font-style:italic; }
      `}</style>

      {/* ===== SECTION 1 — NAV ===== */}
      <nav className="lp-dark" style={{ background: "#0a1a0f", borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center justify-between gap-4" style={{ padding: "18px 24px" }}>
          <a href="/" className="flex items-center gap-2.5 shrink-0">
            <span style={{ width: 30, height: 30, borderRadius: 8, background: "#1a7a3c", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ShieldCheck size={16} style={{ color: "#eafaf0" }} />
            </span>
            <span style={{ fontSize: 17, color: "#fff", fontWeight: 500 }}>Amanah</span>
          </a>
          <div className="hidden md:flex items-center" style={{ gap: 32 }}>
            <a href="#mosque-pitch" style={navLink}>For mosques</a>
            <a href="#parents" style={navLink}>For parents</a>
            <a href="#scholars" style={navLink}>Find a scholar</a>
            <a href="#pricing" style={navLink}>Pricing</a>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={() => go()} style={ghostBtn}>Sign in</button>
            <button onClick={() => setShowDemo(true)} style={{ fontSize: 14, fontWeight: 500, color: "#fff", background: "#1a7a3c", borderRadius: 8, padding: "8px 16px", border: "none" }}>Book a demo →</button>
          </div>
        </div>
      </nav>

      {/* ===== SECTION 2 — HERO ===== */}
      <section className="lp-dark" style={{ background: "#0a1a0f", position: "relative", overflow: "hidden" }}>
        {/* Rotating Islamic geometric star pattern (replicated from PublicHome) */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ opacity: 0.2 }}>
          <svg className="lp-pattern-rotate absolute" style={{ top: "-30%", left: "-10%", width: "120%", height: "160%" }} viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="lpIslamicStar" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse">
                <g transform="translate(60 60)" stroke="rgba(251, 191, 36, 0.4)" strokeWidth="1" fill="none">
                  <polygon points="0,-40 11,-11 40,0 11,11 0,40 -11,11 -40,0 -11,-11" />
                  <rect x="-28" y="-28" width="56" height="56" transform="rotate(45)" />
                  <rect x="-28" y="-28" width="56" height="56" />
                  <circle r="6" fill="rgba(251, 191, 36, 0.3)" />
                </g>
              </pattern>
            </defs>
            <rect width="800" height="800" fill="url(#lpIslamicStar)" />
          </svg>
        </div>

        <div className="relative grid grid-cols-1 md:grid-cols-2 items-center max-w-[1200px] mx-auto" style={{ gap: 80, padding: "80px 24px 60px" }}>
          {/* LEFT */}
          <div>
            {/* Switcher */}
            <div className="inline-flex" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", padding: 3, borderRadius: 10 }}>
              {Object.entries(AUD).map(([k, v]) => (
                <button key={k} onClick={() => setAud(k)} style={{
                  fontSize: 13, padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                  background: aud === k ? "rgba(255,255,255,0.08)" : "transparent",
                  color: aud === k ? "#fff" : "rgba(255,255,255,0.4)",
                }}>{v.tab}</button>
              ))}
            </div>

            {/* Eyebrow — 20px below switcher, 28px above headline */}
            <div className="inline-flex items-center gap-2" style={{ fontSize: 11, color: "#4ade80", border: "1px solid rgba(74,222,128,0.2)", background: "rgba(74,222,128,0.05)", borderRadius: 20, padding: "6px 12px", marginTop: 20, marginBottom: 28 }}>
              <Dot /> The Islamic education platform
            </div>

            {/* Headline */}
            <h1 style={{ ...serif, fontSize: 52, fontWeight: 400, lineHeight: 1.1, letterSpacing: "-0.02em", color: "#fff", margin: 0 }} className="max-md:!text-[38px]">
              {a.headline}
            </h1>

            {/* Subheading */}
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, maxWidth: 420, marginTop: 24, marginBottom: 40 }}>
              {a.sub}
            </p>

            {/* CTAs */}
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={aud === "mosque" ? () => setShowDemo(true) : () => go(a.role)} style={solidBtn}>{a.primary}</button>
              <button onClick={() => go(a.role)} style={{ fontSize: 14, color: "#fff", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "14px 28px", background: "transparent" }}>{a.secondary}</button>
            </div>

            {/* Proof bar + trusted mosques bar — mosque only */}
            {aud === "mosque" && (
              <>
                <div className="flex items-center flex-wrap gap-x-4 gap-y-2 mt-8">
                  {["2 min to set up a class", "0% on donations — always", "UK-based · ICO registered"].map((t, i) => (
                    <span key={t} className="flex items-center gap-4">
                      {i > 0 && <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.1)" }} />}
                      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{t}</span>
                    </span>
                  ))}
                </div>
                <div style={{ marginTop: 24 }}>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 12 }}>Trusted by mosques across the UK</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {["MN", "BC", "MR", "AI", "+12 mosques"].map((m) => {
                      const wide = m.startsWith("+");
                      return (
                        <span key={m} style={{ height: 32, minWidth: 32, width: wide ? "auto" : 32, padding: wide ? "0 10px" : 0, borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.3)", fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{m}</span>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* RIGHT */}
          <HeroCards />
        </div>
      </section>

      {/* ===== SECTION 3 — MOSQUE PITCH ===== */}
      <section id="mosque-pitch" className="lp-light" style={{ background: "#fff" }}>
        <div className="max-w-[1200px] mx-auto" style={{ padding: "72px 24px" }}>
          <div className="text-center max-w-[560px] mx-auto">
            <p style={{ fontSize: 11, color: "#1a7a3c", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Everything in one place</p>
            <h2 style={{ ...serif, fontSize: 38, color: "#1c1917", marginTop: 10, lineHeight: 1.15 }}>Not 12 different apps. <em>One platform.</em></h2>
            <p style={{ fontSize: 16, color: "#78716c", marginTop: 14, lineHeight: 1.6 }}>Mosques currently use WhatsApp for comms, Excel for fees, paper registers for attendance, and nothing for Hifz. Amanah replaces all of it.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mt-12" style={{ gap: 1, background: "#e7e5e4", border: "1px solid #e7e5e4", borderRadius: 14, overflow: "hidden" }}>
            {FEATURES.map((f) => (
              <div key={f.name} className="flex flex-col" style={{ background: "#fff", padding: "28px 24px" }}>
                <span style={{ width: 40, height: 40, borderRadius: 10, background: `${f.color}1a`, color: f.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <f.icon size={20} />
                </span>
                <div className="flex items-center gap-2 mt-4 flex-wrap">
                  <p style={{ fontSize: 14, fontWeight: 500, color: "#1c1917" }}>{f.name}</p>
                  <span style={{ fontSize: 11, borderRadius: 20, padding: "2px 8px", ...(TAG_TONE[f.tag] || TAG_TONE.Core) }}>{f.tag}</span>
                </div>
                <p style={{ fontSize: 13, color: "#78716c", marginTop: 8, lineHeight: 1.55 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SECTION 4 — AI SPLIT ===== */}
      <section className="lp-light" style={{ background: "#fafaf9" }}>
        <div className="grid grid-cols-1 md:grid-cols-2 items-center max-w-[1200px] mx-auto" style={{ gap: 64, padding: "72px 24px" }}>
          <div>
            <p style={{ fontSize: 11, color: "#1a7a3c", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>For mosque admins</p>
            <h3 style={{ ...serif, fontSize: 28, color: "#1c1917", marginTop: 10 }}>Ask your mosque <em>anything.</em></h3>
            <p style={{ fontSize: 15, color: "#78716c", marginTop: 12, lineHeight: 1.6 }}>Type a question in plain English. Amanah answers from your own live data — attendance, fees, Hifz progress, waiting lists.</p>
            <ul className="mt-5 space-y-2.5">
              <CheckItem>Which students are 3+ weeks behind on fees?</CheckItem>
              <CheckItem>How many students joined this term vs last?</CheckItem>
              <CheckItem>Which class has the worst attendance this month?</CheckItem>
              <CheckItem>Generate a summary for tonight's committee meeting.</CheckItem>
            </ul>
            <a href="#" style={{ display: "inline-block", marginTop: 20, fontSize: 14, color: "#1a7a3c", fontWeight: 500 }}>See AI features →</a>
          </div>

          {/* AI bar mockup */}
          <div style={{ background: "#f5f5f4", border: "1px solid #e7e5e4", borderRadius: 16, padding: 20 }}>
            <p style={{ fontSize: 11, color: "#a8a29e", textTransform: "uppercase", letterSpacing: "0.06em" }}>AI admin bar — Masjid Nur</p>
            <div className="flex items-center gap-2 mt-3" style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: 10, padding: "10px 14px" }}>
              <Sparkles size={15} style={{ color: "#1a7a3c" }} />
              <span style={{ fontSize: 14, fontStyle: "italic", color: "#a8a29e" }}>Ask anything about your mosque…</span>
            </div>
            <div style={{ background: "#EAF3DE", borderRadius: 10, padding: 14, marginTop: 12 }}>
              <p style={{ fontSize: 14, fontStyle: "italic", color: "#3B6D11" }}>Which families haven't paid this term?</p>
              <p style={{ fontSize: 14, color: "#27500A", marginTop: 8, lineHeight: 1.55 }}>3 families with outstanding balances: Ahmed (£60), Khan (£120), Malik (£60). Total outstanding: £240. Last reminder sent 14 days ago.</p>
              <div className="flex items-center gap-2 mt-3">
                {["Send reminder", "View all fees"].map((t) => (
                  <span key={t} style={{ fontSize: 12, fontWeight: 500, color: "#27500A", background: "#fff", border: "1px solid rgba(39,80,10,0.2)", borderRadius: 20, padding: "5px 12px" }}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== SECTION 5 — PARENT SPLIT ===== */}
      <section id="parents" className="lp-light" style={{ background: "#fff" }}>
        <div className="grid grid-cols-1 md:grid-cols-2 items-center max-w-[1200px] mx-auto" style={{ gap: 64, padding: "72px 24px" }}>
          <div className="md:order-1">
            <p style={{ fontSize: 11, color: "#1a7a3c", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>For parents</p>
            <h3 style={{ ...serif, fontSize: 28, color: "#1c1917", marginTop: 10 }}>Your child's Islamic education, <em>in your pocket.</em></h3>
            <p style={{ fontSize: 15, color: "#78716c", marginTop: 12, lineHeight: 1.6 }}>See Hifz progress live. Get notified when class is starting. Pay fees in seconds. All in one place — no WhatsApp chasing the teacher.</p>
            <ul className="mt-5 space-y-2.5">
              <CheckItem>Live Hifz &amp; surah progress per child</CheckItem>
              <CheckItem>Instant notification when class goes live</CheckItem>
              <CheckItem>One-tap fee payment, subscription management</CheckItem>
              <CheckItem>Homework, rewards, attendance — all visible</CheckItem>
            </ul>
            <button onClick={() => go("user")} style={{ display: "inline-block", marginTop: 20, fontSize: 14, color: "#1a7a3c", fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: 0 }}>See parent dashboard →</button>
          </div>
          <div className="md:order-2 flex flex-col gap-2">
            <NotifCard icon={Video} color="#1a7a3c" title="Tajweed class is starting" body="Adam's class with Ustadha Fatima is live now. Tap to join." time="Just now" />
            <NotifCard icon={Star} color="#1a7a3c" title="Adam memorised Al-Fatiha" body="MashAllah! Surah 1 of 114 complete. Hifz log updated." time="Yesterday · 4:30 PM" />
            <NotifCard icon={Receipt} color="#d97706" title="Fee collected — £30.00" body="Monthly subscription · Masjid Nur tajweed. Next: 8 Aug." time="8 Jul · 12:10 PM" />
          </div>
        </div>
      </section>

      {/* ===== SECTION 6 — PRICING ===== */}
      <section id="pricing" className="lp-light" style={{ background: "#fff" }}>
        <div className="max-w-[1200px] mx-auto" style={{ padding: "0 24px 72px" }}>
          <div style={{ background: "#f5f5f4", border: "1px solid #e7e5e4", borderRadius: 16, padding: 40 }}>
            <div className="text-center max-w-[560px] mx-auto">
              <p style={{ fontSize: 11, color: "#1a7a3c", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Simple pricing</p>
              <h2 style={{ ...serif, fontSize: 32, color: "#1c1917", marginTop: 10 }}>Pay for what you use. <em>Nothing else.</em></h2>
              <p style={{ fontSize: 15, color: "#78716c", marginTop: 12, lineHeight: 1.6 }}>No monthly fee to get started. Amanah takes 2.5% on tuition fees collected — that's it. Donations are always 0%.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 mt-8" style={{ gap: 16 }}>
              <PricingCard name="Starter" price="Free forever"
                desc="Classes, attendance, Hifz tracking, parent dashboard, live lessons."
                features={["Unlimited students", "Unlimited classes", "Live video lessons", "Hifz tracking", "Parent dashboard"]} />
              <PricingCard name="With payments" price="2.5% per transaction" badge="Most mosques" highlight
                desc="Everything in Starter, plus fee collection, subscriptions, and donations."
                features={["Subscription tuition fees", "One-off payments", "Donations (0% platform fee)", "Automatic dunning", "Stripe-powered payouts"]} />
              <PricingCard name="Pro" price="£49/month (launching soon)"
                desc="WhatsApp, AI Q&A, prayer timetables, full mosque management, RBAC permissions."
                features={["WhatsApp notifications", "AI admin Q&A", "Prayer timetables", "Room bookings", "Employee permissions"]} />
            </div>

            <div className="text-center mt-8">
              <button onClick={() => go("mosque")} style={{ fontSize: 14, fontWeight: 500, color: "#fff", background: "#1a7a3c", borderRadius: 10, padding: "14px 32px", border: "none" }}>Get Amanah for your mosque →</button>
              <p style={{ fontSize: 12, color: "#a8a29e", marginTop: 14, lineHeight: 1.5 }}>Stripe processing fees (≈1.4% + 20p) apply separately to all transactions. ICO registered · UK company · DBS-checked scholars</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== SECTION 7 — SCHOLAR CTA BANNER ===== */}
      <section id="scholar" className="lp-dark" style={{ background: "#0d1f12" }}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 max-w-[1200px] mx-auto" style={{ padding: "64px 24px" }}>
          <div className="max-w-[560px]">
            <h2 style={{ ...serif, fontSize: 28, color: "#fff" }}>Are you a scholar or imam?</h2>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", marginTop: 10, lineHeight: 1.6 }}>Join Amanah. Offer your services. Get bookings. Grow your impact — with safeguarding already sorted.</p>
          </div>
          <button onClick={() => go("imam")} className="shrink-0 self-start md:self-auto" style={{ fontSize: 14, fontWeight: 500, color: "#fff", background: "#1a7a3c", borderRadius: 10, padding: "14px 28px", border: "none" }}>Become a scholar →</button>
        </div>
      </section>

      {/* ===== SECTION 8 — FOOTER ===== */}
      <footer style={{ background: "#0a1a0f" }}>
        <div className="max-w-[1200px] mx-auto" style={{ padding: "40px 24px" }}>
          <div className="flex flex-wrap gap-x-5 gap-y-2 mb-6" style={{ fontSize: 13 }}>
            <button onClick={() => go("mosque")} style={{ color: "rgba(255,255,255,0.55)", background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13 }}>For Mosques</button>
            <button onClick={() => go("imam")} style={{ color: "rgba(255,255,255,0.55)", background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13 }}>Become a Scholar</button>
            <a href="#" style={{ color: "rgba(255,255,255,0.55)" }}>Safeguarding</a>
            <a href="/privacy-policy" style={{ color: "rgba(255,255,255,0.55)" }}>Privacy Policy</a>
            <a href="/terms" style={{ color: "rgba(255,255,255,0.55)" }}>Terms of Service</a>
            <a href="/cookies" style={{ color: "rgba(255,255,255,0.55)" }}>Cookie Policy</a>
          </div>
          <LegalFooter className="text-stone-500" />
        </div>
      </footer>

      {showDemo && <DemoModal onClose={() => setShowDemo(false)} />}
    </div>
  );
};

export default LandingPage;
