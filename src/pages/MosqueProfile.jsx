import { useState, useEffect } from "react";
import { ShieldCheck, MapPin, Heart, Clock, Globe, Phone, HandCoins, Calendar, Pin, CheckCircle2, X, GraduationCap } from "lucide-react";
import { MOSQUE_FACILITIES, PRAYER_KEYS, PRAYER_LABELS, MOSQUE_EVENT_TYPES } from "../data/mosqueTaxonomy";
import { getMosqueScholars, getMosqueUpcomingEvents, getMosqueAnnouncements } from "../auth";

// Public mosque profile (Session U Day 1). Replaces the old in-App MosqueDetail.
// Works for logged-out visitors — all reads are anon-safe (RLS public-read on
// mosques/mosque_scholars/mosque_events/mosque_announcements is gated to active
// mosques). `mosque` is the transformed row (App's selectedMosque); it may be
// null on a hard refresh of /mosque/:slug while App refetches by slug, so hooks
// stay unconditional and the null-guard sits after them. `header` is the shared
// <PublicHeader> element passed in from App (it depends on AudienceDrawer, which
// lives in App.jsx).

const initialsOf = (m) => (m?.name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const typeLabel = (v) => MOSQUE_EVENT_TYPES.find((t) => t.v === v)?.l || v;
const fmtDate = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); } catch { return d; } };

const Section = ({ title, children }) => (
  <section className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6">
    <h2 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">{title}</h2>
    {children}
  </section>
);

const MosqueProfile = ({ mosque, header, onScholar, isSaved, onToggleSave }) => {
  const [scholars, setScholars] = useState([]);
  const [events, setEvents] = useState([]);
  const [anns, setAnns] = useState([]);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    const id = mosque?.id;
    if (!id) return;
    let alive = true;
    Promise.all([getMosqueScholars(id), getMosqueUpcomingEvents(id, 5), getMosqueAnnouncements(id)])
      .then(([s, e, a]) => { if (alive) { setScholars(s); setEvents(e); setAnns(a); } })
      .catch((err) => console.error("MosqueProfile load failed:", err));
    return () => { alive = false; };
  }, [mosque?.id]);

  if (!mosque) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="text-sm text-stone-400">Loading mosque…</div>
      </div>
    );
  }

  const prayer = mosque.prayer_times || mosque.iqamaTimes || {};
  const hasPrayer = PRAYER_KEYS.some((k) => prayer[k]);
  const facilities = Array.isArray(mosque.facilities) ? mosque.facilities : [];
  const photos = Array.isArray(mosque.photos) ? mosque.photos : [];
  const heroPhoto = mosque.photo || mosque.photo_url || (photos[0] || null);

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      {header}

      {/* Hero */}
      <div className="relative h-64 md:h-80 bg-stone-900 overflow-hidden">
        {heroPhoto ? (
          <img src={heroPhoto} alt={mosque.name} className="w-full h-full object-cover opacity-90" onError={(e) => { e.target.style.display = "none"; }} />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-emerald-700 to-emerald-900 flex items-center justify-center">
            <span className="text-white text-7xl font-semibold tracking-wide" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{initialsOf(mosque)}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        {onToggleSave && (
          <button onClick={() => onToggleSave(mosque)} aria-label="Save mosque" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow">
            <Heart size={18} className={isSaved ? "fill-rose-600 text-rose-600" : "text-stone-600"} />
          </button>
        )}
        <div className="absolute bottom-0 left-0 right-0 p-5 md:p-8 max-w-5xl mx-auto flex items-end gap-4">
          {mosque.logo_url && (
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-white shadow-lg overflow-hidden flex-shrink-0 border-2 border-white">
              <img src={mosque.logo_url} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="text-white">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl md:text-4xl font-semibold" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{mosque.name}</h1>
              {mosque.verified && <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-medium"><ShieldCheck size={11} /> Verified</span>}
            </div>
            <p className="text-sm text-white/85 mt-1 flex items-center gap-1.5"><MapPin size={13} /> {[mosque.address, mosque.city, mosque.postcode].filter(Boolean).join(", ")}</p>
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-5 md:px-6 py-6 md:py-8 space-y-5">
        {/* About */}
        {(mosque.description || mosque.bio) && (
          <Section title="About"><p className="text-sm text-stone-700 leading-relaxed whitespace-pre-line">{mosque.description || mosque.bio}</p></Section>
        )}

        {/* Gallery */}
        {photos.length > 0 && (
          <Section title="Photos">
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
              {photos.map((p) => (
                <button key={p} onClick={() => setLightbox(p)} className="aspect-square rounded-lg overflow-hidden border border-stone-200 hover:opacity-90">
                  <img src={p} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Prayer times */}
        {(hasPrayer || mosque.jumuah_time) && (
          <Section title="Prayer times">
            {hasPrayer && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {PRAYER_KEYS.map((k) => (
                  <div key={k}>
                    <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-0.5">{PRAYER_LABELS[k]}</p>
                    <p className="text-sm text-emerald-700 font-mono font-medium">{prayer[k] || "—"}</p>
                  </div>
                ))}
              </div>
            )}
            {mosque.jumuah_time && (
              <div className="mt-3 pt-3 border-t border-stone-100 flex items-center gap-2 text-sm">
                <Clock size={14} className="text-emerald-700" />
                <span className="text-stone-700">Jumu'ah <span className="font-mono text-emerald-700 font-medium">{mosque.jumuah_time}</span>{mosque.jumuah_language ? ` · ${mosque.jumuah_language}` : ""}</span>
              </div>
            )}
          </Section>
        )}

        {/* Facilities */}
        {facilities.length > 0 && (
          <Section title="Facilities">
            <div className="flex flex-wrap gap-2">
              {facilities.map((f) => (
                <span key={f} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-stone-50 border border-stone-200 text-stone-700 rounded-lg">
                  <CheckCircle2 size={13} className="text-emerald-600" /> {MOSQUE_FACILITIES.find((x) => x.v === f)?.l || f}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Linked scholars */}
        {scholars.length > 0 && (
          <Section title="Scholars">
            <div className="grid sm:grid-cols-2 gap-3">
              {scholars.map((s) => (
                <button key={s.id} onClick={() => onScholar?.(s)} className="flex items-center gap-3 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-xl p-3 text-left transition-colors">
                  <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${s.avatar_gradient || "from-emerald-400 to-emerald-700"} flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 overflow-hidden`}>
                    {s.avatar_url ? <img src={s.avatar_url} alt="" className="w-full h-full object-cover" /> : (s.avatar_initials || initialsOf(s))}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{s.name}</p>
                    <p className="text-xs text-stone-500 truncate flex items-center gap-1"><GraduationCap size={11} /> {[s.title, s.city].filter(Boolean).join(" · ") || "Scholar"}</p>
                  </div>
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Upcoming events */}
        {events.length > 0 && (
          <Section title="Upcoming events">
            <div className="space-y-2">
              {events.map((e) => (
                <div key={e.id} className="flex items-center gap-3 border border-stone-100 rounded-xl p-3">
                  <div className="w-11 h-11 rounded-lg bg-emerald-50 border border-emerald-100 flex flex-col items-center justify-center flex-shrink-0">
                    <Calendar size={16} className="text-emerald-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{e.title}</p>
                    <p className="text-xs text-stone-500">{fmtDate(e.date)}{e.time ? ` · ${e.time}` : ""} · <span className="text-emerald-700">{typeLabel(e.type)}</span></p>
                    {e.description && <p className="text-xs text-stone-600 mt-0.5 line-clamp-2">{e.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Announcements */}
        {anns.length > 0 && (
          <Section title="Announcements">
            <div className="space-y-3">
              {anns.map((a) => (
                <div key={a.id} className="border-l-2 border-emerald-300 pl-3">
                  <p className="text-sm font-medium text-stone-900 flex items-center gap-1.5">{a.pinned && <Pin size={12} className="text-emerald-700" />} {a.title}</p>
                  {a.body && <p className="text-sm text-stone-600 mt-0.5 whitespace-pre-line">{a.body}</p>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Contact + donate */}
        <Section title="Get in touch">
          <div className="flex flex-wrap items-center gap-2">
            {mosque.donation_url && (
              <a href={mosque.donation_url} target="_blank" rel="noopener noreferrer" className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><HandCoins size={15} /> Donate</a>
            )}
            {mosque.website_url && (
              <a href={mosque.website_url} target="_blank" rel="noopener noreferrer" className="border border-stone-300 hover:border-stone-400 text-stone-700 text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Globe size={15} /> Website</a>
            )}
            {mosque.phone && (
              <a href={`tel:${mosque.phone}`} className="border border-stone-300 hover:border-stone-400 text-stone-700 text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Phone size={15} /> {mosque.phone}</a>
            )}
            {!mosque.donation_url && !mosque.website_url && !mosque.phone && <p className="text-sm text-stone-500">No contact details added yet.</p>}
          </div>
        </Section>
      </main>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => setLightbox(null)}><X size={24} /></button>
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
};

export default MosqueProfile;
