import { useState, useEffect } from "react";
import {
  Loader2, Plus, Pencil, Archive, Check, X, AlertCircle, GraduationCap,
  Users, Clock, MapPin, ChevronLeft, Trash2,
} from "lucide-react";
import { getMadrasaClasses, createMadrasaClass, updateMadrasaClass, getMadrasaRoster, getMadrasaEnrollmentCounts, getMosqueStaff } from "../auth";
import MadrasaAttendance from "./MadrasaAttendance";

// Madrasa Phase 1a — admin class management. Create/edit/archive classes,
// assign a teacher (mosque_staff), set schedule/capacity/room, and view each
// class's roster. Students enrol parent-side (Phase 1b) so rosters are empty
// until then.

const SUBJECTS = [["quran", "Qur'an"], ["hifz", "Hifz"], ["arabic", "Arabic"], ["islamic_studies", "Islamic Studies"], ["other", "Other"]];
const SUBJECT_LABEL = Object.fromEntries(SUBJECTS);
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const Field = ({ label, children }) => (<div><label className={labelCls}>{label}</label>{children}</div>);

const blank = { name: "", subject: "quran", teacher_staff_id: "", schedule: [], term: "", capacity: "", room: "" };
const scheduleText = (sch) => Array.isArray(sch) && sch.length ? sch.map((s) => `${(s.day || "").slice(0, 3)} ${s.start || ""}–${s.end || ""}`).join(", ") : "—";

const MosqueMadrasa = ({ mosqueId, mosque }) => {
  const [classes, setClasses] = useState([]);
  const [counts, setCounts] = useState({});
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const [rosterClass, setRosterClass] = useState(null); // class object when viewing detail
  const [detailMode, setDetailMode] = useState("roster"); // roster | attendance
  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  const reload = () => {
    setLoading(true);
    Promise.all([getMadrasaClasses(mosqueId), getMadrasaEnrollmentCounts(mosqueId), getMosqueStaff(mosqueId)])
      .then(([c, cnt, s]) => { setClasses(c || []); setCounts(cnt || {}); setStaff((s || []).filter((x) => !x.archived)); })
      .catch((e) => console.error("madrasa load failed:", e))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [mosqueId]);

  const openAdd = () => { setForm(blank); setEditingId(null); setError(null); setShowForm(true); };
  const openEdit = (c) => {
    setForm({ name: c.name || "", subject: c.subject || "quran", teacher_staff_id: c.teacher_staff_id || "", schedule: Array.isArray(c.schedule) ? c.schedule : [], term: c.term || "", capacity: c.capacity ?? "", room: c.room || "" });
    setEditingId(c.id); setError(null); setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) { setError("Class name is required."); return; }
    setBusy(true); setError(null);
    const payload = {
      name: form.name.trim(), subject: form.subject,
      teacher_staff_id: form.teacher_staff_id || null,
      schedule: form.schedule.filter((s) => s.day),
      term: form.term.trim() || null,
      capacity: form.capacity === "" ? null : Number(form.capacity),
      room: form.room.trim() || null,
    };
    const r = editingId ? await updateMadrasaClass(editingId, payload) : await createMadrasaClass({ mosqueId, ...payload });
    setBusy(false);
    if (r.error) { setError(r.error.message || "Couldn't save the class."); return; }
    setShowForm(false); reload();
  };

  const archive = async (c) => {
    const { error: e } = await updateMadrasaClass(c.id, { status: c.status === "archived" ? "active" : "archived" });
    if (e) setError(e.message); else reload();
  };

  const openRoster = async (c) => {
    setRosterClass(c); setDetailMode("roster"); setRosterLoading(true);
    const r = await getMadrasaRoster(c.id);
    setRoster(r); setRosterLoading(false);
  };

  // Schedule row editor
  const addSlot = () => set("schedule", [...form.schedule, { day: "Monday", start: "", end: "" }]);
  const setSlot = (i, k, v) => set("schedule", form.schedule.map((s, idx) => idx === i ? { ...s, [k]: v } : s));
  const rmSlot = (i) => set("schedule", form.schedule.filter((_, idx) => idx !== i));

  // ---- Roster view ----
  if (rosterClass) {
    return (
      <div>
        <button onClick={() => setRosterClass(null)} className="text-sm text-stone-600 hover:text-stone-900 inline-flex items-center gap-1.5 mb-4"><ChevronLeft size={15} /> Back to classes</button>
        <div className="mb-4">
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{rosterClass.name}</h2>
          <p className="text-sm text-stone-600">{SUBJECT_LABEL[rosterClass.subject]}{rosterClass.teacher?.name ? ` · ${rosterClass.teacher.name}` : ""} · {scheduleText(rosterClass.schedule)}</p>
        </div>
        <div className="flex gap-1 border-b border-stone-200 mb-5">
          {[["roster", "Roster"], ["attendance", "Attendance"]].map(([v, l]) => (
            <button key={v} onClick={() => setDetailMode(v)} className={`px-3 py-2 text-sm font-medium border-b-2 ${detailMode === v ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}>{l}</button>
          ))}
        </div>
        {detailMode === "attendance" ? (
          <MadrasaAttendance classObj={rosterClass} />
        ) : rosterLoading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
          : roster.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
              <Users className="mx-auto text-stone-300 mb-3" size={36} />
              <p className="text-stone-600 text-sm max-w-md mx-auto">No students enrolled yet. Parents enrol their children into this class from their Amanah dashboard.</p>
            </div>
          ) : (
            <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">{roster.map((e) => (
              <li key={e.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-stone-900 truncate">{e.student?.name || "Student"}</p>
                  <p className="text-xs text-stone-500">{[e.student?.age ? `age ${e.student.age}` : null, e.student?.relation].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap ${e.status === "active" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-stone-50 border-stone-200 text-stone-500"}`}>{e.status}</span>
              </li>
            ))}</ul>
          )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Madrasa</h2>
          <p className="text-sm text-stone-600">Your classes, teachers and rosters.</p>
        </div>
        {!showForm && <button onClick={openAdd} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Plus size={14} /> New class</button>}
      </div>

      {error && <p className="text-sm text-rose-700 flex items-center gap-1.5 mb-4"><AlertCircle size={14} /> {error}</p>}

      {showForm && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6 space-y-3 mb-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider">{editingId ? "Edit class" : "New class"}</h3>
            <button onClick={() => setShowForm(false)} className="text-stone-400 hover:text-stone-700"><X size={16} /></button>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Class name"><input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Beginners Qur'an" /></Field>
            <Field label="Subject"><select className={inputCls} value={form.subject} onChange={(e) => set("subject", e.target.value)}>{SUBJECTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Teacher"><select className={inputCls} value={form.teacher_staff_id} onChange={(e) => set("teacher_staff_id", e.target.value)}><option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Term"><input className={inputCls} value={form.term} onChange={(e) => set("term", e.target.value)} placeholder="e.g. Autumn 2026" /></Field>
            <Field label="Capacity"><input type="number" min="0" className={inputCls} value={form.capacity} onChange={(e) => set("capacity", e.target.value)} /></Field>
            <Field label="Room"><input className={inputCls} value={form.room} onChange={(e) => set("room", e.target.value)} /></Field>
          </div>
          <div>
            <label className={labelCls}>Schedule</label>
            {form.schedule.length > 0 && (
              <div className="space-y-2 mb-2">{form.schedule.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                  <select className={inputCls} value={s.day} onChange={(e) => setSlot(i, "day", e.target.value)}>{DAYS.map((d) => <option key={d} value={d}>{d}</option>)}</select>
                  <input type="time" className={inputCls} value={s.start} onChange={(e) => setSlot(i, "start", e.target.value)} />
                  <input type="time" className={inputCls} value={s.end} onChange={(e) => setSlot(i, "end", e.target.value)} />
                  <button onClick={() => rmSlot(i)} className="text-stone-400 hover:text-rose-600 p-1"><Trash2 size={14} /></button>
                </div>
              ))}</div>
            )}
            <button onClick={addSlot} className="text-xs font-medium text-emerald-800 hover:text-emerald-900">+ Add a day/time</button>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowForm(false)} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2">Cancel</button>
            <button onClick={save} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {editingId ? "Save" : "Create class"}</button>
          </div>
        </div>
      )}

      {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
        : classes.length === 0 && !showForm ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
            <GraduationCap className="mx-auto text-stone-300 mb-3" size={36} />
            <p className="text-stone-600 text-sm max-w-md mx-auto">No classes yet. Create your first class to start building your madrasa.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {classes.map((c) => (
              <div key={c.id} className={`flex items-center gap-3 bg-white border rounded-2xl p-4 ${c.status === "archived" ? "border-stone-200 opacity-70" : "border-stone-200"}`}>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0"><GraduationCap size={18} className="text-emerald-700" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-900 truncate flex items-center gap-2">{c.name}
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600">{SUBJECT_LABEL[c.subject] || c.subject}</span>
                    {c.status === "archived" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500">Archived</span>}
                  </p>
                  <p className="text-xs text-stone-500 truncate flex items-center gap-2 mt-0.5">
                    {c.teacher?.name && <span>{c.teacher.name}</span>}
                    <span className="inline-flex items-center gap-1"><Clock size={11} /> {scheduleText(c.schedule)}</span>
                    {c.room && <span className="inline-flex items-center gap-1"><MapPin size={11} /> {c.room}</span>}
                  </p>
                </div>
                <span className="text-xs text-stone-600 inline-flex items-center gap-1 whitespace-nowrap"><Users size={12} /> {counts[c.id] || 0}{c.capacity ? `/${c.capacity}` : ""}</span>
                <button onClick={() => openRoster(c)} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-emerald-300 text-emerald-800 hover:bg-emerald-50">Roster</button>
                <button onClick={() => openEdit(c)} className="text-stone-400 hover:text-emerald-700 p-1.5"><Pencil size={14} /></button>
                <button onClick={() => archive(c)} title={c.status === "archived" ? "Unarchive" : "Archive"} className="text-stone-400 hover:text-rose-700 p-1.5"><Archive size={14} /></button>
              </div>
            ))}
          </div>
        )}
    </div>
  );
};

export default MosqueMadrasa;
