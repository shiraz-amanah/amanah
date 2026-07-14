import { useState, useEffect } from "react";
import {
  Loader2, Plus, Pencil, Archive, Check, X, AlertCircle, GraduationCap,
  Users, Clock, MapPin, ChevronRight, ChevronLeft, Trash2, CalendarClock, List,
} from "lucide-react";
import { getMadrasaClasses, createMadrasaClass, updateMadrasaClass, getMadrasaEnrollmentCounts, getMosqueStaff } from "../auth";
import MadrasaClassWorkspace from "./MadrasaClassWorkspace";
import MadrasaStudents from "./MadrasaStudents";
import MadrasaAnalytics from "./MadrasaAnalytics";
import MadrasaEnrolWizard from "./MadrasaEnrolWizard";
import MadrasaAssistant from "./MadrasaAssistant";
import MadrasaReportsCenter from "./MadrasaReportsCenter";
import MadrasaWaitingList from "./MadrasaWaitingList";
import MadrasaFees from "./MadrasaFees";
import MadrasaStudentProfile from "./MadrasaStudentProfile";
import MadrasaTimetable from "./MadrasaTimetable";
import { useOverlay, overlayBack } from "../lib/useOverlay";

// Madrasa Phase 1a — admin class management. Create/edit/archive classes,
// assign a teacher (mosque_staff), set schedule/capacity/room, and view each
// class's roster. Content-only: the unified MosqueSidebar owns section nav and
// passes the active section as `sub` (classes/students/analytics/reports). The
// class drill-down lives here in the content pane — opening a class shows its
// header + a Back control + the self-contained MadrasaClassWorkspace (its own
// tab bar, uncontrolled, exactly like the teacher staff portal). No class tabs
// leak into the sidebar. `onSubChange` lets in-page actions (Reports back) move
// the active section.

const SUBJECTS = [["quran", "Qur'an"], ["hifz", "Hifz"], ["arabic", "Arabic"], ["islamic_studies", "Islamic Studies"], ["other", "Other"]];
const SUBJECT_LABEL = Object.fromEntries(SUBJECTS);
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 outline-none text-sm";
const Field = ({ label, children }) => (<div><label className={labelCls}>{label}</label>{children}</div>);

const blank = { name: "", subject: "quran", teacher_staff_id: "", schedule: [], term: "", capacity: "", room: "", has_hifz: false, delivery_mode: "in_person" };
const DELIVERY_MODES = [
  ["in_person", "In-person only", "No live lesson — register is marked in person."],
  ["remote", "Remote only", "Live video lesson is the primary way this class runs."],
  ["hybrid", "Hybrid", "Both — in-person register plus an optional live lesson."],
];
const scheduleText = (sch) => Array.isArray(sch) && sch.length ? sch.map((s) => `${(s.day || "").slice(0, 3)} ${s.start || ""}–${s.end || ""}`).join(", ") : "—";

const MosqueMadrasa = ({ mosqueId, mosque, onMosqueUpdate, sub, onSubChange, restrictClassIds = null }) => {
  const section = sub || "classes"; // active sidebar section
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

  const [detailClass, setDetailClass] = useState(null);  // class open in the content pane (drill-down)
  const [classView, setClassView] = useState("list");    // Classes section: list | timetable
  const [showEnrol, setShowEnrol] = useState(false);     // Path A add-student wizard
  const [studentsKey, setStudentsKey] = useState(0);     // bump to refresh the Students list after enrol
  const [profileCtx, setProfileCtx] = useState(null);    // { enrollment, classObj } — full student profile (Layer 3)

  // The Layer-3 student profile is a true drill-down — register it as an overlay
  // so browser Back closes it instead of leaving the dashboard. (Section nav is
  // URL-backed via `sub`; the class drill-down is in-page `detailClass` state.)
  useOverlay(!!profileCtx, () => setProfileCtx(null));

  // Open the full student profile from the overview Students tab. classObj is the
  // student's enrolment class (resolved by MadrasaStudents from its classes list).
  const openStudent = (enrollment, classObj) => setProfileCtx({ enrollment, classObj });

  const reload = () => {
    setLoading(true);
    Promise.all([getMadrasaClasses(mosqueId), getMadrasaEnrollmentCounts(mosqueId), getMosqueStaff(mosqueId)])
      .then(([c, cnt, s]) => {
        // RBAC — a class-scoped ("own") employee only sees their assigned classes.
        // Filtering the master list here cascades the scope to the students,
        // analytics, reports and timetable panes (all derive from `classes`).
        const scoped = restrictClassIds ? (c || []).filter((x) => restrictClassIds.includes(x.id)) : (c || []);
        setClasses(scoped); setCounts(cnt || {}); setStaff((s || []).filter((x) => !x.archived));
      })
      .catch((e) => console.error("madrasa load failed:", e))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [mosqueId, JSON.stringify(restrictClassIds)]);

  const openAdd = () => { setForm(blank); setEditingId(null); setError(null); setShowForm(true); };
  const openEdit = (c) => {
    setForm({ name: c.name || "", subject: c.subject || "quran", teacher_staff_id: c.teacher_staff_id || "", schedule: Array.isArray(c.schedule) ? c.schedule : [], term: c.term || "", capacity: c.capacity ?? "", room: c.room || "", has_hifz: c.has_hifz ?? false, delivery_mode: c.delivery_mode || "in_person" });
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
      has_hifz: !!form.has_hifz,
      delivery_mode: form.delivery_mode || "in_person",
    };
    const r = editingId ? await updateMadrasaClass(editingId, payload) : await createMadrasaClass({ mosqueId, ...payload });
    setBusy(false);
    if (r.error) { setError(r.error.message || "Couldn't save the class."); return; }
    setShowForm(false); reload();
  };

  const archive = async (c) => {
    const { error: e } = await updateMadrasaClass(c.id, { status: c.status === "archived" ? "active" : "archived" });
    if (e) setError(e.message); else { if (detailClass?.id === c.id) closeClass(); reload(); }
  };

  // Content-pane drill-down. Opening a class shows it in the content pane under the
  // Classes section (the workspace owns its own tabs). `detailClass` is REMEMBERED
  // across sidebar section changes: navigating to All students / Analytics / Reports
  // hides the workspace (it only renders under section === "classes") but keeps the
  // class in state, so clicking Classes lands the user back in the class they were
  // in. Only "Back to classes" (closeClass) fully clears the context.
  const openClass = (idOrObj) => {
    const c = typeof idOrObj === "string" ? (classes.find((x) => x.id === idOrObj) || null) : idOrObj;
    if (!c) return;
    setDetailClass(c);
    if (section !== "classes") onSubChange?.("classes"); // drill-down lives under Classes
  };
  const closeClass = () => setDetailClass(null);

  // The "All students" student profile (profileCtx) renders ahead of any section,
  // so it must be cleared when the sidebar section changes — otherwise clicking
  // Classes/Analytics/Reports leaves you stuck on the profile (Bug 1). Unlike
  // detailClass (remembered & restored), the All-students profile is *left* on nav.
  useEffect(() => { setProfileCtx(null); }, [section]);

  // Schedule row editor
  const addSlot = () => set("schedule", [...form.schedule, { day: "Monday", start: "", end: "" }]);
  const setSlot = (i, k, v) => set("schedule", form.schedule.map((s, idx) => idx === i ? { ...s, [k]: v } : s));
  const rmSlot = (i) => set("schedule", form.schedule.filter((_, idx) => idx !== i));

  // ---- Classes section (list / timetable + create-edit form) ----
  const classesSection = (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        {!showForm && classes.length > 0 ? (
          <div className="inline-flex bg-stone-100 rounded-lg p-0.5">
            <button onClick={() => setClassView("list")} className={`text-xs font-medium px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 ${classView === "list" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800"}`}><List size={13} /> List</button>
            <button onClick={() => setClassView("timetable")} className={`text-xs font-medium px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 ${classView === "timetable" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800"}`}><CalendarClock size={13} /> Timetable</button>
          </div>
        ) : <span />}
        {!showForm && <button onClick={openAdd} className="bg-brand-900 hover:bg-brand-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Plus size={14} /> New class</button>}
      </div>

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
            <button onClick={addSlot} className="text-xs font-medium text-brand-800 hover:text-brand-900">+ Add a day/time</button>
          </div>
          <div>
            <label className={labelCls}>Delivery mode</label>
            <select className={inputCls} value={form.delivery_mode} onChange={(e) => set("delivery_mode", e.target.value)}>
              {DELIVERY_MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <p className="text-[11px] text-stone-400 mt-1">{DELIVERY_MODES.find(([v]) => v === form.delivery_mode)?.[2]}</p>
          </div>
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={!!form.has_hifz} onChange={(e) => set("has_hifz", e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-stone-300 text-brand-700 focus:ring-brand-500" />
            <span className="text-sm text-stone-700">This class includes Hifz (Qur'an memorisation)<span className="block text-[11px] text-stone-400">Adds a Hifz tab for tracking surah progress. Leave off for non-memorisation classes.</span></span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowForm(false)} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2">Cancel</button>
            <button onClick={save} disabled={busy} className="bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {editingId ? "Save" : "Create class"}</button>
          </div>
        </div>
      )}

      {classView === "timetable" && classes.length > 0 && (
        <MadrasaTimetable classes={classes.filter((c) => c.status !== "archived")} />
      )}

      {classView === "list" && (loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
        : classes.length === 0 && !showForm ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
            <GraduationCap className="mx-auto text-stone-300 mb-3" size={36} />
            <p className="text-stone-600 text-sm max-w-md mx-auto">No classes yet. Create your first class to start building your madrasah.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {classes.map((c) => (
              <div key={c.id} className={`flex items-center gap-3 bg-white border rounded-2xl p-4 transition-all ${c.status === "archived" ? "border-stone-200 opacity-70" : "border-stone-200 hover:border-brand-300 hover:shadow-sm"}`}>
                <button onClick={() => openClass(c)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0"><GraduationCap size={18} className="text-brand-700" /></div>
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
                  <ChevronRight size={16} className="text-stone-300 shrink-0" />
                </button>
                <button onClick={() => openEdit(c)} className="text-stone-400 hover:text-brand-700 p-1.5"><Pencil size={14} /></button>
                <button onClick={() => archive(c)} title={c.status === "archived" ? "Unarchive" : "Archive"} className="text-stone-400 hover:text-rose-700 p-1.5"><Archive size={14} /></button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );

  // ---- Content pane — driven by the active `section` (+ class / profile drill-down) ----
  const renderContent = () => {
    if (profileCtx) {
      return (
        <MadrasaStudentProfile
          enrollment={profileCtx.enrollment}
          classObj={profileCtx.classObj}
          mosqueId={mosqueId}
          mosqueName={mosque?.name}
          onBack={() => overlayBack()}
          onChanged={() => { setStudentsKey((k) => k + 1); reload(); }}
        />
      );
    }

    // Class drill-down — only ever under the Classes section. The workspace runs
    // self-contained (its own tab bar), same as the teacher staff portal.
    if (section === "classes" && detailClass) {
      return (
        <div>
          <button onClick={closeClass} className="inline-flex items-center gap-1 text-sm font-medium text-stone-500 hover:text-stone-800 mb-4">
            <ChevronLeft size={16} /> Back to classes
          </button>
          {/* Class name + meta now live in the workspace's smart header (Session BF).
              onNavigateSection lets the Class-tab fee + waiting tiles deep-link to the
              universal Madrasah sections (and marks this as the owner context). */}
          <MadrasaClassWorkspace classObj={detailClass} mosqueName={mosque?.name} onNavigateSection={(s) => onSubChange?.(s)} />
        </div>
      );
    }

    if (section === "reports") {
      return <MadrasaReportsCenter classes={classes} mosqueId={mosqueId} mosqueName={mosque?.name} onBack={() => onSubChange?.("classes")} />;
    }

    // Universal waiting-list console (cross-class) — no assistant, admin-only.
    if (section === "waitinglist") {
      return <MadrasaWaitingList mosqueId={mosqueId} />;
    }

    // Fees module (cross-class, owner-only, record-keeping).
    if (section === "fees") {
      return <MadrasaFees mosqueId={mosqueId} mosqueName={mosque?.name} />;
    }

    // Remaining section views show the assistant above their content (as before).
    return (
      <>
        <MadrasaAssistant mosqueId={mosqueId} />
        <div className="mb-5" />
        {error && <p className="text-sm text-rose-700 flex items-center gap-1.5 mb-4"><AlertCircle size={14} /> {error}</p>}
        {section === "students" && <MadrasaStudents key={studentsKey} mosqueId={mosqueId} classes={classes} mosqueName={mosque?.name} onOpenStudent={openStudent} onAddStudent={() => setShowEnrol(true)} />}
        {section === "analytics" && <MadrasaAnalytics mosqueId={mosqueId} classes={classes} onOpenClass={openClass} mosque={mosque} onMosqueUpdate={onMosqueUpdate} />}
        {section === "classes" && classesSection}
      </>
    );
  };

  // The class drill-down renders its own header; section views get the Madrasah heading.
  const inClass = section === "classes" && detailClass;

  return (
    <div>
      {!inClass && (
        <div className="mb-6">
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Madrasah</h2>
          <p className="text-sm text-stone-600">Your classes, teachers and rosters.</p>
        </div>
      )}

      {renderContent()}

      {showEnrol && <MadrasaEnrolWizard mosqueId={mosqueId} classes={classes} onClose={() => setShowEnrol(false)} onDone={() => { setStudentsKey((k) => k + 1); reload(); }} />}
    </div>
  );
};

export default MosqueMadrasa;
