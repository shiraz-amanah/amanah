import { useState, useEffect } from "react";
import { ShieldCheck, MapPin, Heart, Clock, Globe, Phone, HandCoins, Calendar, Pin, CheckCircle2, X, GraduationCap, BadgeCheck } from "lucide-react";
import { MOSQUE_SERVICES, MOSQUE_FACILITIES, PRAYER_KEYS, PRAYER_LABELS, MOSQUE_EVENT_TYPES } from "../data/mosqueTaxonomy";
import { getMosqueUpcomingEvents, getMosqueAnnouncements, getMosqueTeam, getMosqueScholars } from "../auth";
import MosquePrayerTimes from "../components/MosquePrayerTimes";
import MosqueDonateModal from "../components/MosqueDonateModal";
import MosqueClaimModal from "../components/MosqueClaimModal";
import { CAL_TYPE } from "../data/academicCalendar";
import { CATEGORIES } from "../data/categories";

const CATEGORY_NAME = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.name]));
const calFmt = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch { return d; } };

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
  const [events, setEvents] = useState([]);
  const [anns, setAnns] = useState([]);
  const [team, setTeam] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const [showDonate, setShowDonate] = useState(false);
  const [showClaim, setShowClaim] = useState(false);

  useEffect(() => {
    const id = mosque?.id;
    if (!id) return;
    let alive = true;
    Promise.all([getMosqueUpcomingEvents(id, 5), getMosqueAnnouncements(id), getMosqueTeam(id), getMosqueScholars(id)])
      .then(([e, a, t, sc]) => { if (alive) { setEvents(e); setAnns(a); setTeam(t); setTeachers(sc || []); } })
      .catch((err) => console.error("MosqueProfile load failed:", err));
    return () => { alive = false; };
  }, [mosque?.id]);

  const scholarInitials = (s) => (s?.avatar_initials || (s?.name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("")).toUpperCase();

  if (!mosque) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="text-sm text-stone-400">Loading mosque…</div>
      </div>
    );
  }

  const facilities = Array.isArray(mosque.facilities) ? mosque.facilities : [];
  const services = Array.isArray(mosque.services) ? mosque.services : [];
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
        {/* Donate + claim CTAs */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowDonate(true)} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-5 py-2.5 rounded-xl inline-flex items-center gap-2 shadow-sm"><HandCoins size={16} /> Donate to this mosque</button>
          {!mosque.user_id && (
            <button onClick={() => setShowClaim(true)} className="border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 text-sm font-medium px-5 py-2.5 rounded-xl inline-flex items-center gap-2"><BadgeCheck size={16} /> Is this your mosque? Claim this listing</button>
          )}
        </div>

        {/* Prayer times — the first thing a visitor sees */}
        <MosquePrayerTimes mosque={mosque} />

        {/* Madrasah academic calendar — upcoming term & holiday dates */}
        {(() => {
          const today = new Date().toISOString().slice(0, 10);
          const cal = (Array.isArray(mosque.academic_calendar) ? mosque.academic_calendar : [])
            .filter((e) => e.type !== "report_deadline" && (e.end_date || e.start_date) >= today)
            .sort((a, b) => a.start_date.localeCompare(b.start_date));
          if (cal.length === 0) return null;
          return (
            <Section title="Madrasah — term & holiday dates">
              <ul className="divide-y divide-stone-100">
                {cal.map((e, i) => {
                  const t = CAL_TYPE[e.type] || CAL_TYPE.term;
                  const single = !e.end_date || e.end_date === e.start_date;
                  return (
                    <li key={i} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="text-sm text-stone-800 inline-flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-sm ${t.dot}`} /> {e.name}</span>
                      <span className="text-xs text-stone-500 text-right">{calFmt(e.start_date)}{single ? "" : ` → ${calFmt(e.end_date)}`}</span>
                    </li>
                  );
                })}
              </ul>
            </Section>
          );
        })()}

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


        {/* Services */}
        {services.length > 0 && (
          <Section title="Services offered">
            <div className="flex flex-wrap gap-2">
              {services.map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg">
                  <CheckCircle2 size={13} className="text-emerald-600" /> {MOSQUE_SERVICES.find((x) => x.v === s)?.l || s}
                </span>
              ))}
            </div>
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

        {/* Our Teachers (platform scholars linked to this mosque). Clicking a
            card opens the scholar's full Amanah profile. */}
        {teachers.length > 0 && (
          <Section title="Our teachers">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {teachers.map((s) => {
                const subs = (Array.isArray(s.subjects) ? s.subjects : []).map((id) => CATEGORY_NAME[id] || id);
                return (
                  <button key={s.id} onClick={() => onScholar?.(s)} className="text-left bg-stone-50 border border-stone-200 hover:border-emerald-300 hover:shadow-sm transition-all rounded-xl p-3">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 overflow-hidden">
                        {s.avatar_url ? <img src={s.avatar_url} alt="" className="w-full h-full object-cover" /> : scholarInitials(s)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-stone-900 truncate flex items-center gap-1.5"><GraduationCap size={13} className="text-emerald-700 shrink-0" /> {s.name}</p>
                        <p className="text-xs text-stone-500 truncate">{[s.title, s.city].filter(Boolean).join(" · ") || "Scholar"}</p>
                        {s.dbs_verified && <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5"><ShieldCheck size={10} /> DBS verified</span>}
                      </div>
                    </div>
                    {subs.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {subs.slice(0, 3).map((n) => <span key={n} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white border border-stone-200 text-stone-600">{n}</span>)}
                        {subs.length > 3 && <span className="text-[10px] text-stone-400">+{subs.length - 3}</span>}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {/* Our Team (staff — safe-shape via get_mosque_team RPC) */}
        {team.length > 0 && (
          <Section title="Our team">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {team.map((m) => (
                <div key={m.id} className="flex items-center gap-3 bg-stone-50 border border-stone-200 rounded-xl p-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 overflow-hidden">
                    {m.photo_url ? <img src={m.photo_url} alt="" className="w-full h-full object-cover" /> : initialsOf(m)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate flex items-center gap-1.5">{m.name}
                      {m.staff_type === "temporary" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">Visiting</span>}
                    </p>
                    <p className="text-xs text-stone-500 truncate">{m.role}</p>
                  </div>
                </div>
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
                  <div className="w-11 h-11 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {e.image_url ? <img src={e.image_url} alt="" className="w-full h-full object-cover" /> : <Calendar size={16} className="text-emerald-700" />}
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
                  {a.image_url && <img src={a.image_url} alt="" className="mt-2 rounded-lg max-h-56 w-auto object-cover" />}
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

      {showDonate && <MosqueDonateModal mosque={mosque} onClose={() => setShowDonate(false)} />}
      {showClaim && <MosqueClaimModal mosque={mosque} onClose={() => setShowClaim(false)} />}

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
