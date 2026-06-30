import { useState, useEffect } from "react";
import { Calendar, MapPin, ChevronRight, ArrowRight } from "lucide-react";
import { MOSQUE_EVENT_TYPES } from "../data/mosqueTaxonomy";
import { getUpcomingEvents } from "../auth";
import GeometricDivider from "./GeometricDivider";
import RecurrenceBadge from "./RecurrenceBadge";

// Homepage "Upcoming events" section (Session U Day 1; re-sited + redesigned in
// Session AL). Sits between the scholar categories and "Verified mosques near
// you". Shows the next 10 upcoming events across all ACTIVE mosques (RLS gates
// to active). Loads async with a skeleton so it never blocks the homepage; an
// Islamic geometric divider crowns the section. Cards horizontal-scroll on
// mobile, grid on desktop. Each card links to the mosque's public profile.

const typeLabel = (v) => MOSQUE_EVENT_TYPES.find((t) => t.v === v)?.l || v;
const fmtDate = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); } catch { return d; } };
const initials = (name) => (name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

const HomepageEvents = ({ onMosque, onViewAll }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getUpcomingEvents(10)
      .then((data) => { if (alive) setEvents(data || []); })
      .catch((e) => console.error("Homepage events load failed:", e))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // Nothing to show (and not loading) → render no section at all.
  if (!loading && events.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-5 md:px-6 py-8 md:py-12">
      <GeometricDivider className="mb-8 md:mb-10" />

      <div className="flex items-end justify-between mb-5 md:mb-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Upcoming events</h2>
          <p className="text-sm text-stone-600 mt-1">What's happening at mosques near you</p>
        </div>
        {onViewAll && (
          <button onClick={onViewAll} className="hidden sm:flex items-center gap-1 text-sm text-emerald-800 font-medium hover:gap-2 transition-all shrink-0">
            View all <ArrowRight size={14} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex md:grid md:grid-cols-3 gap-4 overflow-x-auto md:overflow-visible -mx-5 px-5 md:mx-0 md:px-0 pb-2 md:pb-0">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white border border-stone-200 rounded-2xl p-4 animate-pulse w-[80%] sm:w-72 md:w-auto shrink-0 md:shrink">
              <div className="h-4 bg-stone-100 rounded w-3/4 mb-2" />
              <div className="h-3 bg-stone-100 rounded w-1/2 mb-4" />
              <div className="h-3 bg-stone-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex md:grid md:grid-cols-3 gap-4 overflow-x-auto md:overflow-visible -mx-5 px-5 md:mx-0 md:px-0 pb-2 md:pb-0 snap-x snap-mandatory">
          {events.map((e) => {
            const m = e.mosque || {};
            return (
              <button
                key={e.id}
                onClick={() => m.slug && onMosque?.(m)}
                className="text-left bg-white border border-stone-200 rounded-2xl overflow-hidden hover:border-emerald-300 hover:shadow-sm transition-all group w-[80%] sm:w-72 md:w-auto shrink-0 md:shrink snap-start"
              >
                {e.image_url && <img src={e.image_url} alt="" className="w-full h-28 object-cover" />}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 overflow-hidden flex items-center justify-center flex-shrink-0 text-[10px] font-semibold text-emerald-800">
                      {m.logo_url ? <img src={m.logo_url} alt="" className="w-full h-full object-cover" /> : initials(m.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-stone-700 truncate">{m.name}</p>
                      {m.city && <p className="text-[11px] text-stone-400 flex items-center gap-0.5"><MapPin size={9} /> {m.city}</p>}
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-stone-900 mb-1 line-clamp-2">{e.title}</p>
                  <div className="flex items-center justify-between mt-2 gap-2">
                    <span className="text-xs text-stone-500 inline-flex items-center gap-1"><Calendar size={11} className="text-emerald-700" /> {fmtDate(e.date)}{e.time ? ` · ${e.time}` : ""}</span>
                    <span className="inline-flex items-center gap-1.5 shrink-0">
                      <RecurrenceBadge recurrence={e.recurrence} />
                      <span className="text-[10px] uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">{typeLabel(e.type)}</span>
                    </span>
                  </div>
                  <span className="text-xs text-emerald-700 font-medium inline-flex items-center gap-0.5 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">View mosque <ChevronRight size={12} /></span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default HomepageEvents;
