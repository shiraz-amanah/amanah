import { useState, useEffect } from "react";
import { Loader2, Award, Download, Users } from "lucide-react";
import { getMadrasaRoster, buildReportSummary } from "../auth";
import { CERT_TYPES } from "../lib/madrasaCertificate";

// jsPDF is heavy — lazy-load the generator on download so it stays out of the
// main bundle (same pattern as the 2C report PDF).
const generate = (args) => import("../lib/madrasaCertificate").then((m) => m.downloadCertificate(args));

// Teacher/admin certificate generator for one class (Phase 3C). No new data —
// attendance/Hifz/homework come from the existing buildReportSummary RPC; custom
// is free text. PDFs are generated + downloaded client-side, never stored.
const MadrasaCertificates = ({ classObj, mosqueName }) => {
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState({});      // studentId → cert type
  const [custom, setCustom] = useState({});  // studentId → custom text
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setLoading(true); setErr("");
    getMadrasaRoster(classObj.id)
      .then((r) => setRoster((r || []).filter((e) => e.status === "active")))
      .catch((e) => console.error("certificates load failed:", e))
      .finally(() => setLoading(false));
  }, [classObj.id]);

  const make = async (sid, name) => {
    const t = type[sid] || "attendance";
    if (busy) return;
    setBusy(sid); setErr("");
    try {
      let data = {};
      if (t === "custom") {
        if (!(custom[sid] || "").trim()) { setErr("Enter the achievement text for the custom certificate."); setBusy(null); return; }
        data = { text: custom[sid].trim() };
      } else {
        const s = await buildReportSummary(classObj.id, sid);
        if (!s) { setErr("Couldn't load this student's records."); setBusy(null); return; }
        if (t === "attendance") {
          const a = s.attendance || {};
          const total = a.total ?? ((a.present || 0) + (a.absent || 0) + (a.late || 0) + (a.excused || 0));
          data = { present: a.present || 0, total };
        } else if (t === "hifz") {
          data = { surahNumber: s.hifz?.last_surah || null };
        } else if (t === "homework") {
          data = { completed: s.homework?.completed || 0, assigned: s.homework?.assigned || 0 };
        }
      }
      await generate({ type: t, childName: name, className: classObj.name, teacherName: classObj.teacher?.name || "", mosqueName, term: classObj.term, data });
    } catch (e) {
      console.error("certificate generate failed:", e); setErr("Couldn't generate the certificate.");
    }
    setBusy(null);
  };

  if (loading) return <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>;
  if (roster.length === 0) return (
    <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
      <Users className="mx-auto text-stone-300 mb-3" size={36} /><p className="text-stone-600 text-sm">No students enrolled — nobody to certify yet.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-500 flex items-center gap-1.5"><Award size={13} /> Generate a branded PDF certificate per student. Attendance, Hifz and homework pull from the class records; custom is your own text. Downloads to your device — nothing is stored.</p>
      {err && <p className="text-xs text-rose-600">{err}</p>}
      <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">{roster.map((e) => {
        const sid = e.student?.id || e.student_id;
        const name = e.student?.name || "Student";
        const t = type[sid] || "attendance";
        return (
          <li key={e.id} className="px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-sm font-medium text-stone-900">{name}</span>
              <div className="flex items-center gap-2">
                <select value={t} onChange={(ev) => setType((p) => ({ ...p, [sid]: ev.target.value }))}
                  className="text-sm px-2.5 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/30">
                  {CERT_TYPES.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
                </select>
                <button onClick={() => make(sid, name)} disabled={busy === sid}
                  className="text-[12px] px-3 py-1.5 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white font-medium inline-flex items-center gap-1.5 disabled:opacity-40">
                  {busy === sid ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Download
                </button>
              </div>
            </div>
            {t === "custom" && (
              <input value={custom[sid] || ""} onChange={(ev) => setCustom((p) => ({ ...p, [sid]: ev.target.value }))}
                placeholder="e.g. completed the Year 1 Tajweed programme with distinction"
                className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/30" />
            )}
          </li>
        );
      })}</ul>
    </div>
  );
};

export default MadrasaCertificates;
