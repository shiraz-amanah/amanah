// Madrasah star-student / at-risk scoring (item 6). Pure + client-side so the
// badges never depend on the AI/API key — the assistant narrates, this decides
// the badges. Shared by Analytics (named lists) and the Students list (row
// badges) so the logic stays in one place.
//
// Star students: top 3 by a combined score of attendance + Hifz progress +
// homework completion + positive rewards (each normalised, weighted).
// At-risk: 2+ consecutive absences, OR no Hifz logged in 30 days (only once
// they've started attending), OR homework completion under 50%.

const MS_DAY = 864e5;
const POSITIVE = new Set(["star", "merit", "achievement"]);

export function computeStarsAndRisk({ enrollments = [], attendance = [], hifz = [], homework = [], completions = [], rewards = [] }) {
  const active = enrollments.filter((e) => e.status === "active");
  const sids = active.map((e) => e.student?.id || e.student_id).filter(Boolean);
  const nameById = {}, classById = {};
  for (const e of active) {
    const sid = e.student?.id || e.student_id;
    nameById[sid] = e.student?.name || "Student";
    classById[sid] = e.class?.id || e.class_id;
  }

  // Attendance: rate + most-recent consecutive-absence run.
  const attBy = {};
  for (const a of attendance) {
    const s = (attBy[a.student_id] ||= { rows: [], ok: 0, total: 0 });
    s.rows.push(a); s.total += 1;
    if (a.status === "present" || a.status === "late") s.ok += 1;
  }
  const attRate = (sid) => { const s = attBy[sid]; return s && s.total ? s.ok / s.total : null; };
  const consecutiveAbsences = (sid) => {
    const s = attBy[sid]; if (!s) return 0;
    const sorted = [...s.rows].sort((a, b) => (b.session_date || "").localeCompare(a.session_date || ""));
    let n = 0; for (const r of sorted) { if (r.status === "absent") n += 1; else break; }
    return n;
  };

  // Hifz: distinct memorised surahs + most recent entry date.
  const hifzBy = {};
  for (const h of hifz) {
    const s = (hifzBy[h.student_id] ||= { mem: new Set(), last: null });
    if (h.status === "memorized") s.mem.add(h.surah_number);
    if (!s.last || (h.session_date || "") > s.last) s.last = h.session_date;
  }
  const memCount = (sid) => hifzBy[sid]?.mem.size || 0;
  const hifzStaleDays = (sid) => { const l = hifzBy[sid]?.last; return l ? (Date.now() - new Date(l + "T00:00:00").getTime()) / MS_DAY : Infinity; };

  // Homework: completed / assigned-to-their-class.
  const compBy = {}; for (const c of completions) compBy[c.student_id] = (compBy[c.student_id] || 0) + 1;
  const hwByClass = {}; for (const h of homework) hwByClass[h.class_id] = (hwByClass[h.class_id] || 0) + 1;
  const hwRate = (sid) => { const assigned = hwByClass[classById[sid]] || 0; return assigned ? Math.min(1, (compBy[sid] || 0) / assigned) : null; };

  // Positive rewards.
  const rewBy = {}; for (const r of rewards) if (POSITIVE.has(r.type)) rewBy[r.student_id] = (rewBy[r.student_id] || 0) + 1;

  const maxMem = Math.max(1, ...sids.map(memCount));
  const maxRew = Math.max(1, ...sids.map((s) => rewBy[s] || 0));

  const scoreById = {};
  for (const sid of sids) {
    const a = attRate(sid) ?? 0;
    const hm = memCount(sid) / maxMem;
    const hw = hwRate(sid) ?? 0;
    const rw = (rewBy[sid] || 0) / maxRew;
    scoreById[sid] = a * 0.35 + hm * 0.25 + hw * 0.25 + rw * 0.15;
  }

  const stars = [...sids]
    .sort((a, b) => scoreById[b] - scoreById[a])
    .filter((sid) => scoreById[sid] > 0)
    .slice(0, 3)
    .map((sid) => ({ sid, name: nameById[sid], classId: classById[sid], score: scoreById[sid] }));

  const atRisk = [];
  for (const sid of sids) {
    const reasons = [];
    const ca = consecutiveAbsences(sid);
    if (ca >= 2) reasons.push(`${ca} absences in a row`);
    if ((attBy[sid]?.total || 0) > 0 && hifzStaleDays(sid) > 30) reasons.push("no Hifz in 30 days");
    const hr = hwRate(sid);
    if (hr != null && hr < 0.5) reasons.push("homework under 50%");
    if (reasons.length) atRisk.push({ sid, name: nameById[sid], classId: classById[sid], reasons });
  }

  return {
    scoreById, stars, atRisk,
    starSet: new Set(stars.map((s) => s.sid)),
    riskSet: new Set(atRisk.map((r) => r.sid)),
  };
}
