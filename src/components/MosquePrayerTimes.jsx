import { Clock, Moon, Info } from "lucide-react";
import { PRAYERS, JUMUAH_AR, normalizePrayerTimes } from "../data/prayerNames";
import MosqueRamadanCalendar from "./MosqueRamadanCalendar";

// Public prayer-times card — the first thing a visitor sees after the header.
// Shows each prayer's Adhan + Iqamah, English + Arabic names, a prominent
// Jumu'ah block, last-updated, seasonal note, and (in Ramadan mode) a green
// banner + Ramadan times + the 30-day calendar. Premium emerald/stone palette.

const normRamadan = (r) => {
  const out = {};
  for (const { k } of PRAYERS) { const v = r?.[k]; out[k] = (v && typeof v === "object") ? { adhan: v.adhan || "", iqamah: v.iqamah || "" } : { adhan: "", iqamah: v || "" }; }
  return out;
};
const hasAny = (pt) => PRAYERS.some((p) => pt[p.k]?.adhan || pt[p.k]?.iqamah);
const fmtUpdated = (iso) => { try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); } catch { return null; } };

const MosquePrayerTimes = ({ mosque }) => {
  const ramadan = !!mosque.ramadan_active;
  const pt = normalizePrayerTimes(mosque.prayer_times);
  const rt = normRamadan(mosque.ramadan_times);
  const times = ramadan && hasAny(rt) ? rt : pt;
  const jumuah = pt.jumuah || {};
  const info = mosque.jummuah_info || null;
  const updated = mosque.prayer_times_updated_at ? fmtUpdated(mosque.prayer_times_updated_at) : null;
  const calendar = Array.isArray(mosque.ramadan_calendar) ? mosque.ramadan_calendar : [];

  const nothing = !hasAny(times) && !jumuah.iqamah && !mosque.jumuah_time;

  return (
    <section className="rounded-2xl overflow-hidden border border-emerald-200 shadow-sm bg-white">
      {/* Geometric accent strip */}
      <div className="h-1.5 bg-[repeating-linear-gradient(45deg,#047857,#047857_8px,#0f766e_8px,#0f766e_16px)] opacity-80" />

      {ramadan && (
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-800 text-white px-5 py-3 flex items-center gap-2">
          <Moon size={16} /> <span className="text-sm font-medium">Ramadan {mosque.ramadan_year || ""} times in effect</span>
        </div>
      )}

      <div className="p-5 md:p-6">
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <h2 className="text-lg font-semibold text-stone-900 inline-flex items-center gap-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><Clock size={18} className="text-emerald-700" /> Prayer times</h2>
          {updated && <span className="text-[11px] text-stone-400">Updated {updated}</span>}
        </div>

        {nothing ? (
          <p className="text-sm text-stone-500 inline-flex items-center gap-1.5"><Info size={14} /> Contact the mosque for prayer times.</p>
        ) : (
          <>
            {/* Daily prayers — Adhan + Iqamah */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {PRAYERS.map((p) => (
                <div key={p.k} className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 text-center">
                  <p className="text-sm font-semibold text-stone-900">{p.en}</p>
                  <p className="text-[13px] text-emerald-800 mb-2" dir="rtl" lang="ar" style={{ fontFamily: "'Amiri', serif" }}>{p.ar}</p>
                  <div className="flex items-center justify-center gap-2 text-xs">
                    <div><p className="text-[9px] uppercase tracking-wider text-stone-400">Adhan</p><p className="font-mono text-stone-700">{times[p.k]?.adhan || "—"}</p></div>
                    <div className="w-px h-6 bg-emerald-200" />
                    <div><p className="text-[9px] uppercase tracking-wider text-emerald-600">Iqamah</p><p className="font-mono font-semibold text-emerald-800">{times[p.k]?.iqamah || "—"}</p></div>
                  </div>
                </div>
              ))}
            </div>

            {/* Jumu'ah */}
            {(jumuah.iqamah || jumuah.khutbah1 || mosque.jumuah_time || info?.sessions?.length) && (
              <div className="mt-4 rounded-xl bg-emerald-900 text-white p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm font-semibold inline-flex items-center gap-2">Jumu'ah <span className="text-emerald-200" dir="rtl" lang="ar" style={{ fontFamily: "'Amiri', serif" }}>{JUMUAH_AR}</span></p>
                  <div className="flex items-center gap-4 text-sm font-mono">
                    {jumuah.khutbah1 && <span><span className="text-emerald-300 text-[10px] font-sans uppercase tracking-wider mr-1">Khutbah</span>{jumuah.khutbah1}{jumuah.khutbah2 ? ` / ${jumuah.khutbah2}` : ""}</span>}
                    <span><span className="text-emerald-300 text-[10px] font-sans uppercase tracking-wider mr-1">Iqamah</span>{jumuah.iqamah || mosque.jumuah_time || "—"}</span>
                  </div>
                </div>
                {info?.sessions?.length > 0 && (
                  <ul className="mt-3 grid sm:grid-cols-2 gap-2">
                    {info.sessions.map((s, i) => (
                      <li key={i} className="text-xs bg-emerald-800/60 rounded-lg px-3 py-2">
                        <span className="font-mono font-medium">{s.time || "—"}</span>{s.location ? ` · ${s.location}` : ""}{s.language ? ` · ${s.language}` : ""}{s.notes ? <span className="block text-emerald-200/90 mt-0.5">{s.notes}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
                {info?.notes && <p className="text-xs text-emerald-200/90 mt-2">{info.notes}</p>}
              </div>
            )}

            {pt.seasonal_note && <p className="text-xs text-stone-500 mt-3 inline-flex items-center gap-1.5"><Info size={13} /> {pt.seasonal_note}</p>}
          </>
        )}
      </div>

      {/* Ramadan 30-day calendar */}
      {ramadan && calendar.length > 0 && <MosqueRamadanCalendar mosque={mosque} calendar={calendar} />}
    </section>
  );
};

export default MosquePrayerTimes;
