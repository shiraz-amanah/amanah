import { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { useOverlay, overlayBack } from "../lib/useOverlay";
import { surahName, surahNameAr } from "../data/surahs";

// The Qur'an & Hifz hero — the dominant per-child anchor. Used on BOTH the
// Overview snapshot (withLog=false) and the Progress section (withLog=true, adds
// the "View full log" expander). Design is unchanged from the original card; this
// is a straight extraction so both places share one source of truth.

// Subtle Islamic octagram (khatam) watermark — white strokes at low opacity over
// the emerald gradient. id is per-student so multiple heroes don't collide.
const HifzWatermark = ({ id }) => (
  <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
    <defs>
      <pattern id={id} width="64" height="64" patternUnits="userSpaceOnUse" patternTransform="rotate(0)">
        <g fill="none" stroke="#ffffff" strokeOpacity="0.13" strokeWidth="1">
          <polygon points="32,2 62,32 32,62 2,32" />
          <rect x="11" y="11" width="42" height="42" />
          <polygon points="32,12 52,32 32,52 12,32" strokeOpacity="0.09" />
        </g>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill={`url(#${id})`} />
  </svg>
);

const MadrasaHifzHero = ({ student, hifz = [], withLog = false }) => {
  const [showLog, setShowLog] = useState(false);
  // Registering the log as an overlay makes the browser/mobile Back button
  // dismiss it and return the parent to the section (not leave the dashboard).
  useOverlay(withLog && showLog, () => setShowLog(false));

  const firstName = (student.name || "Your child").split(" ")[0];
  if (hifz.length === 0) {
    return (
      <div className="rounded-2xl bg-emerald-50/60 border border-emerald-100 p-5 text-center">
        <BookOpen className="mx-auto text-emerald-300 mb-1.5" size={22} />
        <p className="text-xs text-stone-500">Hifz progress will appear here once {firstName}'s teacher logs a lesson.</p>
      </div>
    );
  }

  const topSurah = Math.max(...hifz.map((e) => e.surah_number || 0));
  const latestHifz = hifz[0] || null; // getHifzProgress returns session_date desc
  const currentSurah = latestHifz?.surah_number || topSurah;
  const memorizedCount = new Set(hifz.filter((e) => e.status === "memorized").map((e) => e.surah_number)).size;
  const progressThisWeek = hifz.some((e) => e.session_date && new Date(e.session_date + "T00:00:00").getTime() >= Date.now() - 7 * 864e5);
  const hifzGrade = latestHifz?.quality ? latestHifz.quality.replace(/_/g, " ") : null;
  const hifzPct = Math.min(100, Math.round((memorizedCount / 114) * 100));
  const lastLessonLabel = latestHifz?.session_date ? new Date(latestHifz.session_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;
  const positionText = latestHifz?.ayah_from ? `Ayah ${latestHifz.ayah_from}${latestHifz.ayah_to && latestHifz.ayah_to !== latestHifz.ayah_from ? `–${latestHifz.ayah_to}` : ""}` : null;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-700 via-emerald-800 to-emerald-900 text-white p-5 shadow-sm">
      <HifzWatermark id={`zellij-${student.id}`} />
      <div className="relative">
        <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-100/80 font-semibold inline-flex items-center gap-1.5"><BookOpen size={12} /> Qur'an &amp; Hifz</p>
        {currentSurah >= 1 && <p dir="rtl" lang="ar" className="text-4xl md:text-5xl leading-snug mt-1.5 text-white" style={{ fontFamily: "'Amiri', 'Scheherazade New', 'Noto Naskh Arabic', 'Times New Roman', serif", fontWeight: 700 }}>{surahNameAr(currentSurah)}</p>}
        <p className="text-lg md:text-xl font-semibold mt-1 leading-tight text-emerald-50/95" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{surahName(currentSurah)}</p>
        {positionText && <p className="text-sm text-emerald-50/90 mt-0.5">{positionText}</p>}
        {(lastLessonLabel || hifzGrade) && <p className="text-xs text-emerald-100/70 mt-1">{lastLessonLabel ? `Last lesson ${lastLessonLabel}` : ""}{lastLessonLabel && hifzGrade ? " · " : ""}{hifzGrade || ""}</p>}
        <div className="mt-3.5">
          <div className="h-2.5 bg-emerald-950/40 rounded-full overflow-hidden"><div className="h-full bg-white rounded-full transition-all" style={{ width: `${hifzPct}%` }} /></div>
          <div className="flex items-center justify-between mt-1.5 text-[11px] text-emerald-100/80"><span>{memorizedCount}/114 surahs memorised</span><span>{hifzPct}%</span></div>
        </div>
        <p className="text-sm font-medium text-white/95 mt-3.5">{progressThisWeek ? `✨ MashAllah — ${firstName} made progress this week!` : `May Allah bless ${firstName}'s journey 🤲`}</p>
        {withLog && (
          <>
            <button onClick={() => (showLog ? overlayBack() : setShowLog(true))} className="mt-3 text-[11px] text-emerald-100/90 hover:text-white inline-flex items-center gap-1">{showLog ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {showLog ? "Hide log" : "View full log"}</button>
            {showLog && <ul className="mt-2 space-y-1 bg-emerald-950/25 rounded-lg p-3">{hifz.slice(0, 10).map((e) => (
              <li key={e.id} className="text-xs text-emerald-50/90 flex items-center justify-between gap-2"><span>{surahName(e.surah_number)}</span><span className="text-emerald-100/60">{e.session_date}</span></li>
            ))}</ul>}
          </>
        )}
      </div>
    </div>
  );
};

export default MadrasaHifzHero;
