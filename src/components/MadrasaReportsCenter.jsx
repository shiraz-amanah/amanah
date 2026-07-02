import { useState, useEffect } from "react";
import { Loader2, ChevronLeft, Download, FileText, FileJson } from "lucide-react";
import {
  getClassAttendance, getClassHifz, getClassHomework, getClassHomeworkCompletions,
  getClassRewards, getClassWaitlist, getMadrasaRoster, getExportRoster,
  getStudentAttendance, getHifzProgress, getStudentCompletions, getStudentRewards,
  getStudentReports, getStudentWaitlist, getMyMadrasaEnrollments, isPositiveReward,
} from "../auth";
import { downloadCSV, downloadJSON } from "../lib/csv";
import { surahName } from "../data/surahs";

const downloadPdf = (args) => import("../lib/madrasaReportPdf").then((m) => m.downloadTablePdf(args));

const ATT_CHAR = { present: "P", absent: "A", late: "L", excused: "E" };
const shortDate = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const safe = (s) => (s || "report").replace(/[^a-z0-9]+/gi, "-").toLowerCase();

// Per-class reports (owner/teacher data) + mosque-wide GDPR / bulk exports
// (owner only). No new migration — composes existing reads + the 083
// madrasa_export_roster definer RPC. Native CSV + lazy jsPDF.
const REPORTS = [
  { v: "register", label: "Class register", scope: "class", needsDates: true },
  { v: "attendance", label: "Term attendance summary", scope: "class" },
  { v: "hifz", label: "Hifz progress", scope: "class" },
  { v: "homework", label: "Homework completion", scope: "class" },
  { v: "rewards", label: "Rewards summary", scope: "class" },
  { v: "waitlist", label: "Waiting list", scope: "class" },
  { v: "gdpr", label: "Student data export (GDPR)", scope: "student" },
  { v: "bulk", label: "Bulk student export", scope: "mosque" },
];

const MadrasaReportsCenter = ({ classes = [], mosqueId, mosqueName, onBack }) => {
  const [type, setType] = useState("register");
  const [classId, setClassId] = useState(classes[0]?.id || "");
  const [studentId, setStudentId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [roster, setRoster] = useState([]); // export_roster rows (per enrolment): students + contact + attendance
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState(null); // { title, subtitle, columns, rows, json? }

  // export_roster once — drives bulk export + the GDPR student picker + contact.
  useEffect(() => { getExportRoster(mosqueId).then(setRoster).catch(() => {}); }, [mosqueId]);

  const def = REPORTS.find((r) => r.v === type);
  const className = (id) => classes.find((c) => c.id === id)?.name || "Class";
  const students = Array.from(new Map(roster.map((r) => [r.student_id, r.student_name])).entries()).map(([id, name]) => ({ id, name }));

  const generate = async () => {
    setLoading(true); setErr(""); setPreview(null);
    try {
      const p = await build();
      if (p) setPreview(p);
    } catch (e) { console.error("report generate failed:", e); setErr("Couldn't generate that report."); }
    setLoading(false);
  };

  async function build() {
    if (def.scope === "class" && !classId) { setErr("Pick a class."); return null; }
    const cName = className(classId);

    if (type === "register") {
      const rows = await getClassAttendance(classId, { from: from || undefined, to: to || undefined });
      const dates = [...new Set(rows.map((r) => r.session_date))].sort();
      const byStu = {};
      rows.forEach((r) => { const sid = r.student?.id || r.student_id; (byStu[sid] = byStu[sid] || { student: r.student?.name || "Student" })[r.session_date] = ATT_CHAR[r.status] || "·"; });
      const columns = [{ label: "Student", get: (x) => x.student, width: 2 }, ...dates.map((d) => ({ label: shortDate(d), get: (x) => x[d] || "–" }))];
      return { title: `Class register — ${cName}`, subtitle: dates.length ? `${shortDate(dates[0])} to ${shortDate(dates[dates.length - 1])} · ${dates.length} sessions` : "No sessions", columns, rows: Object.values(byStu) };
    }

    if (type === "attendance") {
      const rows = await getClassAttendance(classId);
      const byStu = {};
      rows.forEach((r) => { const sid = r.student?.id || r.student_id; const s = byStu[sid] = byStu[sid] || { student: r.student?.name || "Student", present: 0, absent: 0, late: 0, excused: 0 }; if (r.status in s) s[r.status]++; });
      const out = Object.values(byStu).map((s) => { const total = s.present + s.absent + s.late + s.excused; return { ...s, total, rate: pct(s.present, total) }; }).sort((a, b) => b.rate - a.rate);
      const columns = [{ label: "Student", get: (x) => x.student, width: 2 }, { label: "Present", key: "present" }, { label: "Absent", key: "absent" }, { label: "Late", key: "late" }, { label: "Excused", key: "excused" }, { label: "Total", key: "total" }, { label: "Rate %", get: (x) => `${x.rate}%` }];
      return { title: `Attendance summary — ${cName}`, subtitle: `${out.length} students`, columns, rows: out };
    }

    if (type === "hifz") {
      const rows = await getClassHifz(classId);
      const byStu = {};
      rows.forEach((r) => { const sid = r.student?.id || r.student_id; const s = byStu[sid] = byStu[sid] || { student: r.student?.name || "Student", top: 0, entries: 0, last: null, quality: null }; s.entries++; if ((r.surah_number || 0) >= s.top) { s.top = r.surah_number || 0; } if (!s.last) { s.last = r.session_date; s.quality = r.quality; } });
      const out = Object.values(byStu).map((s) => ({ student: s.student, surah: s.top ? `${surahName(s.top)} (${s.top})` : "—", entries: s.entries, last: s.last ? shortDate(s.last) : "—", quality: s.quality || "—" })).sort((a, b) => 0);
      const columns = [{ label: "Student", get: (x) => x.student, width: 2 }, { label: "Latest surah", get: (x) => x.surah, width: 2 }, { label: "Entries", key: "entries" }, { label: "Last session", key: "last" }, { label: "Latest quality", get: (x) => x.quality }];
      return { title: `Hifz progress — ${cName}`, subtitle: `${out.length} students`, columns, rows: out };
    }

    if (type === "homework") {
      const [hw, comps, ros] = await Promise.all([getClassHomework(classId), getClassHomeworkCompletions(classId), getMadrasaRoster(classId)]);
      const assigned = hw.length;
      const compByStu = {}; comps.forEach((c) => { compByStu[c.student_id] = (compByStu[c.student_id] || 0) + 1; });
      const out = ros.filter((e) => e.status === "active").map((e) => { const sid = e.student?.id || e.student_id; const done = compByStu[sid] || 0; return { student: e.student?.name || "Student", completed: done, assigned, rate: pct(done, assigned) }; }).sort((a, b) => b.rate - a.rate);
      const columns = [{ label: "Student", get: (x) => x.student, width: 2 }, { label: "Completed", key: "completed" }, { label: "Assigned", key: "assigned" }, { label: "Rate %", get: (x) => `${x.rate}%` }];
      return { title: `Homework completion — ${cName}`, subtitle: `${assigned} tasks set`, columns, rows: out };
    }

    if (type === "rewards") {
      const [rw, ros] = await Promise.all([getClassRewards(classId), getMadrasaRoster(classId)]);
      const byStu = {};
      ros.filter((e) => e.status === "active").forEach((e) => { byStu[e.student?.id || e.student_id] = { student: e.student?.name || "Student", star: 0, merit: 0, achievement: 0 }; });
      rw.forEach((r) => { const s = byStu[r.student_id]; if (s && r.type in s) s[r.type]++; });
      const out = Object.values(byStu).map((s) => ({ ...s, total: s.star + s.merit + s.achievement })).sort((a, b) => b.total - a.total);
      const columns = [{ label: "Student", get: (x) => x.student, width: 2 }, { label: "Stars", key: "star" }, { label: "Merits", key: "merit" }, { label: "Achievements", key: "achievement" }, { label: "Total", key: "total" }];
      return { title: `Rewards summary — ${cName}`, subtitle: "Ranked by positive rewards", columns, rows: out };
    }

    if (type === "waitlist") {
      const rows = await getClassWaitlist(classId);
      const out = rows.map((r, i) => ({ position: i + 1, student: r.student?.name || "Student", joined: shortDate(r.created_at), status: r.status }));
      const columns = [{ label: "#", key: "position" }, { label: "Child", get: (x) => x.student, width: 2 }, { label: "Joined", key: "joined" }, { label: "Status", key: "status" }];
      return { title: `Waiting list — ${cName}`, subtitle: `${out.length} waiting/offered`, columns, rows: out };
    }

    if (type === "bulk") {
      const columns = [
        { label: "Student", get: (x) => x.student_name, width: 2 }, { label: "Age", key: "age" },
        { label: "Parent", get: (x) => x.parent_name, width: 2 }, { label: "Parent email", get: (x) => x.parent_email, width: 2 },
        { label: "Parent phone", get: (x) => x.parent_phone }, { label: "Class", get: (x) => x.class_name, width: 2 },
        { label: "Attendance %", get: (x) => `${pct(x.present, x.present + x.absent + x.late + x.excused)}%` },
      ];
      return { title: `Bulk student export — ${mosqueName || "mosque"}`, subtitle: `${roster.length} enrolments`, columns, rows: roster };
    }

    if (type === "gdpr") {
      if (!studentId) { setErr("Pick a student."); return null; }
      const [att, hifz, comps, rewards, reports, wl, enrol] = await Promise.all([
        getStudentAttendance(studentId), getHifzProgress(studentId), getStudentCompletions(studentId),
        getStudentRewards(studentId), getStudentReports(studentId), getStudentWaitlist(studentId), getMyMadrasaEnrollments().catch(() => []),
      ]);
      const mine = roster.filter((r) => r.student_id === studentId);
      const contact = mine[0] ? { student: mine[0].student_name, age: mine[0].age, parent_name: mine[0].parent_name, parent_email: mine[0].parent_email, parent_phone: mine[0].parent_phone } : { student: students.find((s) => s.id === studentId)?.name };
      const json = {
        exported_at: new Date().toISOString(), mosque: mosqueName, student: contact,
        classes: mine.map((r) => r.class_name),
        attendance: att.map((r) => ({ date: r.session_date, status: r.status, class: r.class?.name })),
        hifz: hifz.map((r) => ({ surah: r.surah_number, status: r.status, quality: r.quality, date: r.session_date })),
        homework_completed: comps.length, rewards: rewards.map((r) => ({ type: r.type, note: r.note, at: r.awarded_at })),
        reports: reports.map((r) => ({ term: r.term, comment: r.teacher_comment, published_at: r.published_at })),
        waitlist: wl.map((r) => ({ class: r.class?.name, status: r.status, position: r.position, joined: r.created_at })),
      };
      // a flat event log for the CSV view/export
      const events = [
        ...att.map((r) => ({ category: "attendance", date: r.session_date, detail: `${r.status}${r.class?.name ? ` · ${r.class.name}` : ""}` })),
        ...hifz.map((r) => ({ category: "hifz", date: r.session_date, detail: `${surahName(r.surah_number)} · ${r.status}${r.quality ? ` · ${r.quality}` : ""}` })),
        ...rewards.map((r) => ({ category: "reward", date: (r.awarded_at || "").slice(0, 10), detail: `${r.type}${r.note ? ` · ${r.note}` : ""}` })),
        ...reports.map((r) => ({ category: "report", date: (r.published_at || "").slice(0, 10), detail: r.term })),
        ...wl.map((r) => ({ category: "waitlist", date: (r.created_at || "").slice(0, 10), detail: `${r.status}${r.class?.name ? ` · ${r.class.name}` : ""}` })),
      ].sort((a, b) => (a.date < b.date ? 1 : -1));
      const columns = [{ label: "Category", key: "category" }, { label: "Date", key: "date" }, { label: "Detail", get: (x) => x.detail, width: 3 }];
      return { title: `Data export — ${contact.student || "student"}`, subtitle: `Subject access record · ${mosqueName || ""}`, columns, rows: events, json };
    }
    return null;
  }

  const doCSV = () => preview && downloadCSV(`${safe(preview.title)}.csv`, preview.rows, preview.columns);
  const doPDF = () => preview && downloadPdf({ title: preview.title, subtitle: preview.subtitle, columns: preview.columns, rows: preview.rows, filename: `${safe(preview.title)}.pdf` });
  const doJSON = () => preview?.json && downloadJSON(`${safe(preview.title)}.json`, preview.json);

  const sel = "text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/30 bg-white";

  return (
    <div>
      <button onClick={onBack} className="text-sm text-stone-600 hover:text-stone-900 inline-flex items-center gap-1.5 mb-4"><ChevronLeft size={15} /> Back to classes</button>
      <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Reports &amp; exports</h2>
      <p className="text-sm text-stone-600 mb-5">Generate registers, summaries and exports. GDPR and bulk exports are mosque-admin only.</p>

      <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3 mb-5">
        <div className="flex flex-wrap gap-2">
          <select value={type} onChange={(e) => { setType(e.target.value); setPreview(null); }} className={sel}>
            {REPORTS.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
          </select>
          {def.scope === "class" && (
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className={sel}>
              <option value="">Select class…</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {def.scope === "student" && (
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className={sel}>
              <option value="">Select student…</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {def.needsDates && (<>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={sel} title="From" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={sel} title="To" />
          </>)}
          <button onClick={generate} disabled={loading} className="text-sm font-medium bg-emerald-900 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-40">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Generate
          </button>
        </div>
        {err && <p className="text-xs text-rose-600">{err}</p>}
      </div>

      {preview && (
        <div className="bg-white border border-stone-200 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-stone-900">{preview.title}</p>
              {preview.subtitle && <p className="text-xs text-stone-500">{preview.subtitle}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={doCSV} className="text-[12px] px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:border-emerald-300 hover:text-emerald-700 inline-flex items-center gap-1"><Download size={12} /> CSV</button>
              {preview.json && <button onClick={doJSON} className="text-[12px] px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:border-emerald-300 hover:text-emerald-700 inline-flex items-center gap-1"><FileJson size={12} /> JSON</button>}
              <button onClick={doPDF} className="text-[12px] px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:border-emerald-300 hover:text-emerald-700 inline-flex items-center gap-1"><Download size={12} /> PDF</button>
            </div>
          </div>
          {preview.rows.length === 0 ? <p className="text-sm text-stone-400 py-4">No data for this selection.</p> : (
            <div className="overflow-x-auto">
              <table className="hidden md:table w-full text-xs">
                <thead><tr className="text-left text-stone-500 border-b border-stone-200">{preview.columns.map((c, i) => <th key={i} className="py-1.5 pr-3 font-medium whitespace-nowrap">{c.label}</th>)}</tr></thead>
                <tbody>{preview.rows.slice(0, 200).map((row, ri) => (
                  <tr key={ri} className="border-b border-stone-50">{preview.columns.map((c, ci) => <td key={ci} className="py-1.5 pr-3 text-stone-700 whitespace-nowrap">{typeof c.get === "function" ? c.get(row) : row[c.key]}</td>)}</tr>
                ))}</tbody>
              </table>
              {/* Mobile — one card per row; first column is the title, rest are label:value */}
              <div className="md:hidden divide-y divide-stone-100">
                {preview.rows.slice(0, 200).map((row, ri) => {
                  const val = (c) => (typeof c.get === "function" ? c.get(row) : row[c.key]);
                  return (
                    <div key={ri} className="py-2.5">
                      <p className="text-sm font-medium text-stone-800">{val(preview.columns[0])}</p>
                      {preview.columns.length > 1 && (
                        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
                          {preview.columns.slice(1).map((c, ci) => (
                            <p key={ci} className="text-[11px] text-stone-600"><span className="text-stone-400">{c.label}:</span> {val(c)}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {preview.rows.length > 200 && <p className="text-[11px] text-stone-400 mt-2">Showing first 200 of {preview.rows.length} — export for the full set.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MadrasaReportsCenter;
