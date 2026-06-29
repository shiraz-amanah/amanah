import { useState, useEffect } from "react";
import { Loader2, Trophy, Trash2, Users } from "lucide-react";
import { getMadrasaRoster, getClassRewards, awardReward, deleteReward, isPositiveReward } from "../auth";
import { sendMadrasaRewardAwarded } from "../lib/email";

// type → emoji / label / pill colour. Only the positive types live here now —
// star/merit/achievement (email the parent + count to the leaderboard). The
// warning/concern incident path moved to the dedicated Behaviour tab (098),
// where it carries severity/category/follow-up and is internal-by-default.
const TYPES = [
  { v: "star",        emoji: "⭐", label: "Star",        cls: "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100" },
  { v: "merit",       emoji: "🏅", label: "Merit",       cls: "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100" },
  { v: "achievement", emoji: "🏆", label: "Achievement", cls: "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100" },
];
const META = Object.fromEntries(TYPES.map((t) => [t.v, t]));
const dateText = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// Teacher/admin behaviour + rewards board for one class (083 RLS). Quick-award per
// student (positive types email the parent), a stars leaderboard, and the history
// log. "This term" = all rewards for this class (a class is term-scoped).
const MadrasaRewards = ({ classObj }) => {
  const [roster, setRoster] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [awarding, setAwarding] = useState(null); // `${studentId}:${type}` in flight
  const [msg, setMsg] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([getMadrasaRoster(classObj.id), getClassRewards(classObj.id)])
      .then(([r, rw]) => { setRoster((r || []).filter((e) => e.status === "active")); setRewards(rw || []); })
      .catch((e) => console.error("rewards load failed:", e))
      .finally(() => setLoading(false));
  };
  useEffect(() => { setMsg(""); load(); /* eslint-disable-next-line */ }, [classObj.id]);

  const award = async (studentId, type) => {
    if (awarding) return;
    setAwarding(`${studentId}:${type}`); setMsg("");
    const { data, error } = await awardReward({ classId: classObj.id, studentId, mosqueId: classObj.mosque_id, type, note: note.trim() || null });
    setAwarding(null);
    if (error || !data) { setMsg("Couldn't award that just now."); return; }
    // Email only positive rewards the parent is allowed to see (098). Quick-awards
    // here default visible_to_parent true, so this is belt-and-braces — but it keeps
    // the email gate identical to the Behaviour tab (never email an internal note).
    if (isPositiveReward(type) && data.visible_to_parent !== false) sendMadrasaRewardAwarded(data.id).catch(() => {});
    setNote("");
    setMsg(`${META[type].label} awarded — parent emailed.`);
    load();
  };

  const remove = async (id) => {
    const prev = rewards;
    setRewards((p) => p.filter((r) => r.id !== id));
    const { error } = await deleteReward(id);
    if (error) setRewards(prev);
  };

  const nameOf = (r) => r.student?.name || roster.find((e) => (e.student?.id || e.student_id) === r.student_id)?.student?.name || "Student";

  // Incidents (warning/concern) now live in the Behaviour tab — this board is
  // positive-only, so its history shows positive rewards and nothing else.
  const positiveRewards = rewards.filter((r) => isPositiveReward(r.type));

  // positive-reward counts per student → leaderboard + per-roster badge
  const positiveByStudent = {};
  for (const r of positiveRewards) positiveByStudent[r.student_id] = (positiveByStudent[r.student_id] || 0) + 1;
  const leaderboard = roster
    .map((e) => ({ id: e.student?.id || e.student_id, name: e.student?.name || "Student", stars: positiveByStudent[e.student?.id || e.student_id] || 0 }))
    .filter((x) => x.stars > 0)
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 5);

  if (loading) return <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>;

  return (
    <div className="space-y-5">
      {/* Award */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the next award…"
          className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/30" />
        {msg && <p className="text-xs text-stone-600">{msg}</p>}
        {roster.length === 0 ? (
          <div className="text-center py-6"><Users className="mx-auto text-stone-300 mb-2" size={28} /><p className="text-stone-500 text-sm">No students enrolled yet.</p></div>
        ) : (
          <ul className="divide-y divide-stone-100">{roster.map((e) => {
            const sid = e.student?.id || e.student_id;
            const stars = positiveByStudent[sid] || 0;
            return (
              <li key={e.id} className="py-2.5 flex items-center justify-between gap-3 flex-wrap">
                <span className="text-sm font-medium text-stone-900 inline-flex items-center gap-2">{e.student?.name || "Student"}{stars > 0 && <span className="text-[11px] text-amber-700">⭐ {stars}</span>}</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {TYPES.map((t) => (
                    <button key={t.v} onClick={() => award(sid, t.v)} disabled={awarding === `${sid}:${t.v}`} title={t.label}
                      className={`text-[12px] px-2 py-1 rounded-lg border font-medium disabled:opacity-40 ${t.cls}`}>
                      {awarding === `${sid}:${t.v}` ? <Loader2 size={12} className="animate-spin inline" /> : <>{t.emoji} {t.label}</>}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}</ul>
        )}
      </div>

      {/* Leaderboard (positive only) */}
      {leaderboard.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-3 flex items-center gap-1.5"><Trophy size={12} /> Top stars this term</p>
          <ol className="space-y-1.5">{leaderboard.map((s, i) => (
            <li key={s.id} className="flex items-center justify-between text-sm">
              <span className="text-stone-800"><span className="text-stone-400 mr-2">{i + 1}.</span>{s.name}</span>
              <span className="text-amber-700 font-medium">⭐ {s.stars}</span>
            </li>
          ))}</ol>
        </div>
      )}

      {/* History */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-2">Recent awards</p>
        {positiveRewards.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center"><p className="text-stone-500 text-sm">No rewards logged yet.</p></div>
        ) : (
          <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">{positiveRewards.map((r) => (
            <li key={r.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="text-stone-900 truncate"><span className="mr-1">{META[r.type]?.emoji}</span><span className="font-medium">{nameOf(r)}</span> · {META[r.type]?.label || r.type}</p>
                <p className="text-[11px] text-stone-500 truncate">{r.note ? `${r.note} · ` : ""}{dateText(r.awarded_at)}</p>
              </div>
              <button onClick={() => remove(r.id)} title="Delete" className="text-stone-400 hover:text-rose-600 p-1 shrink-0"><Trash2 size={14} /></button>
            </li>
          ))}</ul>
        )}
      </div>
    </div>
  );
};

export default MadrasaRewards;
