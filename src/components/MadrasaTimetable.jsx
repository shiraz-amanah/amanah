import { useMemo } from "react";
import { CalendarClock } from "lucide-react";

// Weekly timetable grid (094). Renders class sessions (madrasa_classes.schedule
// [{day,start,end}]) as emerald blocks positioned by day + time. Reused for a
// single class (class detail Timetable tab) and mosque-wide (Classes toggle).
// Overlapping sessions on the same day are split into lanes so clashes are
// visible. Pure renderer — no migration, schedule data already exists.

const DAYS = [
  ["Monday", "Mon"], ["Tuesday", "Tue"], ["Wednesday", "Wed"], ["Thursday", "Thu"],
  ["Friday", "Fri"], ["Saturday", "Sat"], ["Sunday", "Sun"],
];
const SUBJECT_LABEL = { quran: "Qur'an", hifz: "Hifz", arabic: "Arabic", islamic_studies: "Islamic Studies", other: "Other" };
const PX_PER_MIN = 0.9;
const toMin = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ""); return m ? +m[1] * 60 + +m[2] : null; };
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const MadrasaTimetable = ({ classes = [] }) => {
  // Flatten every class's schedule into placed sessions.
  const sessions = useMemo(() => {
    const out = [];
    for (const c of classes) {
      for (const s of (Array.isArray(c.schedule) ? c.schedule : [])) {
        const start = toMin(s.start), end = toMin(s.end);
        if (start == null) continue;
        out.push({ class: c, day: s.day, start, end: end != null && end > start ? end : start + 60 });
      }
    }
    return out;
  }, [classes]);

  const { minMin, maxMin } = useMemo(() => {
    if (!sessions.length) return { minMin: 9 * 60, maxMin: 19 * 60 };
    let lo = Infinity, hi = -Infinity;
    for (const s of sessions) { lo = Math.min(lo, s.start); hi = Math.max(hi, s.end); }
    return { minMin: Math.floor(lo / 60) * 60, maxMin: Math.ceil(hi / 60) * 60 };
  }, [sessions]);

  // Per day: assign overlapping sessions to lanes.
  const byDay = useMemo(() => {
    const map = {};
    for (const [full] of DAYS) map[full] = [];
    for (const s of sessions) if (map[s.day]) map[s.day].push(s);
    const out = {};
    for (const [full] of DAYS) {
      const list = map[full].slice().sort((a, b) => a.start - b.start);
      const laneEnds = [];
      list.forEach((s) => {
        let lane = laneEnds.findIndex((end) => end <= s.start);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(s.end); } else laneEnds[lane] = s.end;
        s._lane = lane;
      });
      out[full] = { list, lanes: Math.max(1, laneEnds.length) };
    }
    return out;
  }, [sessions]);

  const height = (maxMin - minMin) * PX_PER_MIN;
  const hourLines = [];
  for (let m = minMin; m <= maxMin; m += 60) hourLines.push(m);

  if (!sessions.length) {
    return (
      <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
        <CalendarClock className="mx-auto text-stone-300 mb-3" size={32} />
        <p className="text-stone-500 text-sm">No scheduled sessions yet. Add days &amp; times to a class in its settings.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-3 md:p-4 overflow-x-auto">
      <div className="min-w-[640px]">
        {/* Day headers */}
        <div className="grid" style={{ gridTemplateColumns: "44px repeat(7, 1fr)" }}>
          <div />
          {DAYS.map(([full, short]) => (
            <div key={full} className="text-center text-[11px] font-semibold text-stone-500 uppercase tracking-wider pb-2">{short}</div>
          ))}
        </div>
        {/* Grid body */}
        <div className="grid" style={{ gridTemplateColumns: "44px repeat(7, 1fr)" }}>
          {/* Time axis */}
          <div className="relative" style={{ height }}>
            {hourLines.map((m) => (
              <div key={m} className="absolute right-1 -translate-y-1/2 text-[10px] font-mono text-stone-400" style={{ top: (m - minMin) * PX_PER_MIN }}>{toHHMM(m)}</div>
            ))}
          </div>
          {/* Day columns */}
          {DAYS.map(([full]) => {
            const { list, lanes } = byDay[full];
            return (
              <div key={full} className="relative border-l border-stone-100" style={{ height }}>
                {hourLines.map((m) => <div key={m} className="absolute left-0 right-0 border-t border-stone-100" style={{ top: (m - minMin) * PX_PER_MIN }} />)}
                {list.map((s, i) => {
                  const c = s.class;
                  const top = (s.start - minMin) * PX_PER_MIN;
                  const h = Math.max(22, (s.end - s.start) * PX_PER_MIN);
                  const w = 100 / lanes;
                  return (
                    <div key={i} title={`${c.name} · ${toHHMM(s.start)}–${toHHMM(s.end)}${c.teacher?.name ? ` · ${c.teacher.name}` : ""}${c.room ? ` · ${c.room}` : ""}`}
                      className="absolute rounded-md bg-emerald-600 text-white px-1.5 py-1 overflow-hidden shadow-sm border border-emerald-700"
                      style={{ top, height: h, left: `calc(${s._lane * w}% + 2px)`, width: `calc(${w}% - 4px)` }}>
                      <p className="text-[10px] font-semibold leading-tight truncate">{c.name}</p>
                      <p className="text-[9px] text-emerald-50/90 leading-tight truncate">{toHHMM(s.start)}–{toHHMM(s.end)}</p>
                      {h > 44 && <p className="text-[9px] text-emerald-100/80 leading-tight truncate">{SUBJECT_LABEL[c.subject] || c.subject}{c.teacher?.name ? ` · ${c.teacher.name}` : ""}</p>}
                      {h > 58 && c.room && <p className="text-[9px] text-emerald-100/70 leading-tight truncate">{c.room}</p>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MadrasaTimetable;
