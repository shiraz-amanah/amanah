import { useState, useEffect } from "react";
import {
  Loader2, Plus, Pencil, Archive, Check, X, AlertCircle, GraduationCap,
  Users, Clock, MapPin, ChevronLeft, ChevronRight, Trash2, FileText, CalendarCheck, BookOpen,
} from "lucide-react";
import { getMadrasaClasses, createMadrasaClass, updateMadrasaClass, getMadrasaEnrollmentCounts, getMosqueStaff } from "../auth";
import MadrasaClassWorkspace from "./MadrasaClassWorkspace";
import MadrasaAssistant from "./MadrasaAssistant";
import MadrasaReportsCenter from "./MadrasaReportsCenter";

// Madrasa Phase 1a — admin class management. Create/edit/archive classes,
// assign a teacher (mosque_staff), set schedule/capacity/room, and view each
// class's roster. Students enrol parent-side (Phase 1b) so rosters are empty
// until then.

const SUBJECTS = [["quran", "Qur'an"], ["hifz", "Hifz"], ["arabic", "Arabic"], ["islamic_studies", "Islamic Studies"], ["other", "Other"]];
const SUBJECT_LABEL = Object.fromEntries(SUBJECTS);
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
// Primary Madrasah sub-nav — the class workspace's 4 tabs, lifted to page level
// so they're always visible. Selecting a class applies the active tab to its
// expanded workspace.
const CLASS_TABS = [["students", "Students", Users], ["attendance", "Attendance", CalendarCheck], ["classwork", "Classwork", BookOpen], ["records", "Records", FileText]];

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
  const [classTab, setClassTab] = useState("students"); // persistent workspace sub-nav
  const [showReports, setShowReports] = useState(false); // reports & exports view

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

  // Toggle the inline workspace open/closed for a class (accordion under the card).
  const openRoster = (c) => setRosterClass((prev) => (prev?.id === c.id ? null : c));

  // Schedule row editor
  const addSlot = () => set("schedule", [...form.schedule, { day: "Monday", start: "", end: "" }]);
  const setSlot = (i, k, v) => set("schedule", form.schedule.map((s, idx) => idx === i ? { ...s, [k]: v } : s));
  const rmSlot = (i) => set("schedule", form.schedule.filter((_, idx) => idx !== i));

  // ---- Reports & exports view (owner only — this whole tab is the owner's) ----
  if (showReports) {
    return <MadrasaReportsCenter classes={classes} mosqueId={mosqueId} mosqueName={mosque?.name} onBack={() => setShowReports(false)} />;
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Madrasah</h2>
          <p className="text-sm text-stone-600">Your classes, teachers and rosters.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowReports(true)} className="border border-stone-300 text-stone-700 hover:border-emerald-300 hover:text-emerald-700 text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><FileText size={14} /> Reports</button>
          {!showForm && <button onClick={openAdd} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Plus size={14} /> New class</button>}
        </div>
      </div>

      <MadrasaAssistant mosqueId={mosqueId} />

      {error && <p className="text-sm text-rose-700 flex items-center gap-1.5 mb-4"><AlertCircle size={14} /> {error}</p>}

      {/* Primary Madrasah sub-nav — always visible. Selecting a class applies
          the active tab to its expanded workspace. */}
      <div className="flex gap-1 border-b border-stone-200 mb-4 overflow-x-auto">
        {CLASS_TABS.map(([v, l, Icon]) => (
          <button key={v} onClick={() => setClassTab(v)} className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap inline-flex items-center gap-1.5 ${classTab === v ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}><Icon size={14} /> {l}</button>
        ))}
      </div>

      {!rosterClass && classes.length > 0 && (
        <div className="bg-stone-50 border border-dashed border-stone-300 rounded-2xl p-5 text-center mb-4">
          <p className="text-sm text-stone-500">Select a class below to view its {(CLASS_TABS.find((t) => t[0] === classTab)?.[1] || "details").toLowerCase()}.</p>
        </div>
      )}

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
            <p className="text-stone-600 text-sm max-w-md mx-auto">No classes yet. Create your first class to start building your madrasah.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {classes.map((c) => (
              <div key={c.id} className="space-y-2">
                <div className={`flex items-center gap-3 bg-white border rounded-2xl p-4 transition-all ${c.status === "archived" ? "border-stone-200 opacity-70" : rosterClass?.id === c.id ? "border-emerald-300 ring-1 ring-emerald-100" : "border-stone-200 hover:border-emerald-300 hover:shadow-sm"}`}>
                  {/* Whole card toggles the inline class workspace; edit/archive
                      stay as separate sibling buttons (no nested buttons). */}
                  <button onClick={() => openRoster(c)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
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
                    <ChevronRight size={16} className={`text-stone-300 shrink-0 transition-transform ${rosterClass?.id === c.id ? "rotate-90" : ""}`} />
                  </button>
                  <button onClick={() => openEdit(c)} className="text-stone-400 hover:text-emerald-700 p-1.5"><Pencil size={14} /></button>
                  <button onClick={() => archive(c)} title={c.status === "archived" ? "Unarchive" : "Archive"} className="text-stone-400 hover:text-rose-700 p-1.5"><Archive size={14} /></button>
                </div>

                {/* Inline workspace — indented under its card (left connector)
                    so it clearly belongs to this class, not the whole page. */}
                {rosterClass?.id === c.id && (
                  <div className="ml-4 md:ml-6 pl-4 md:pl-5 border-l-2 border-emerald-200">
                    <div className="bg-white border border-stone-200 rounded-2xl p-4 md:p-5">
                      <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-stone-100">
                        <div className="min-w-0">
                          <h3 className="text-lg font-semibold text-stone-900 truncate" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{c.name}</h3>
                          <p className="text-xs text-stone-500 truncate">{SUBJECT_LABEL[c.subject] || c.subject}{c.teacher?.name ? ` · ${c.teacher.name}` : ""}{c.room ? ` · ${c.room}` : ""}</p>
                        </div>
                        <button onClick={() => setRosterClass(null)} className="text-sm text-stone-500 hover:text-stone-900 inline-flex items-center gap-1 shrink-0"><X size={15} /> Close</button>
                      </div>
                      <MadrasaClassWorkspace classObj={c} tab={classTab} mosqueName={mosque?.name} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
    </div>
  );
};

export default MosqueMadrasa;
