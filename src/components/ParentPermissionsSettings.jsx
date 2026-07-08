import { useState, useEffect, useCallback } from "react";
import { Loader2, Check, ChevronDown, HeartHandshake, RotateCcw, AlertCircle } from "lucide-react";
import {
  getParentPermissions, upsertParentPermissions, resetClassParentPermissions, getMadrasaClasses,
} from "../auth";

// ============================================================================
// ParentPermissionsSettings — mosque Settings → Parent access. Owner-only.
// A. Mosque-wide defaults (class_id null row). B. Per-class overrides — each
// class can diverge from the default (shows a "Custom" badge + Reset link).
// ============================================================================

const F_SERIF = { fontFamily: "'Fraunces', Georgia, serif" };

const TOGGLES = [
  ["seeAttendance", "Parents can see attendance records"],
  ["seeProgressReports", "Parents can see progress reports"],
  ["seePastoralRewards", "Parents can see pastoral notes & rewards"],
  ["seeFeeAmounts", "Parents can see fee amounts"],
  ["seeClassPhotos", "Parents can see class photos"],
  ["messageTeacher", "Parents can message teachers directly"],
];

// DB column defaults are all-true; the mosque-wide row uses these until saved.
const DEFAULT_PERMS = TOGGLES.reduce((a, [k]) => ({ ...a, [k]: true }), {});

function Switch({ value, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={!!value} onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition shrink-0 ${value ? "bg-emerald-600" : "bg-stone-300"}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${value ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

function ToggleRows({ perms, onChange }) {
  return (
    <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden">
      {TOGGLES.map(([key, label]) => (
        <div key={key} className="flex items-center justify-between gap-4 px-4 py-3 bg-white">
          <span className="text-sm text-stone-700">{label}</span>
          <Switch value={perms[key]} onChange={(v) => onChange(key, v)} />
        </div>
      ))}
    </div>
  );
}

const pick = (obj) => TOGGLES.reduce((a, [k]) => ({ ...a, [k]: obj[k] }), {});
const differs = (a, b) => TOGGLES.some(([k]) => a[k] !== b[k]);

const ParentPermissionsSettings = ({ mosqueId }) => {
  const [classes, setClasses] = useState([]);
  const [defaults, setDefaults] = useState(DEFAULT_PERMS);
  const [overrides, setOverrides] = useState({}); // classId -> perms (draft, effective)
  const [savedOverrides, setSavedOverrides] = useState({}); // classId -> true if a DB row exists
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(new Set());
  const [savingKey, setSavingKey] = useState(null); // 'defaults' | classId
  const [banner, setBanner] = useState(null);

  const load = useCallback(() => {
    if (!mosqueId) return;
    setLoading(true);
    Promise.all([getParentPermissions(mosqueId), getMadrasaClasses(mosqueId)])
      .then(([rows, cls]) => {
        setClasses(cls);
        const wide = rows.find((r) => r.classId == null);
        const base = wide ? pick(wide) : DEFAULT_PERMS;
        setDefaults(base);
        const ovr = {}; const saved = {};
        rows.filter((r) => r.classId != null).forEach((r) => { ovr[r.classId] = pick(r); saved[r.classId] = true; });
        setOverrides(ovr);
        setSavedOverrides(saved);
      })
      .catch((err) => console.error("[ParentPermissions] load", err?.message))
      .finally(() => setLoading(false));
  }, [mosqueId]);

  useEffect(() => { load(); }, [load]);

  const effectiveFor = (classId) => overrides[classId] || defaults;

  const setDefault = (key, val) => setDefaults((d) => ({ ...d, [key]: val }));
  const setOverride = (classId, key, val) =>
    setOverrides((o) => ({ ...o, [classId]: { ...(o[classId] || defaults), [key]: val } }));

  const saveDefaults = async () => {
    setSavingKey("defaults"); setBanner(null);
    const { error } = await upsertParentPermissions({ mosqueId, classId: null, ...defaults });
    setSavingKey(null);
    setBanner(error ? { kind: "err", text: "Couldn't save the mosque-wide defaults." } : { kind: "ok", text: "Mosque-wide parent access saved." });
  };

  const saveClass = async (classId) => {
    setSavingKey(classId); setBanner(null);
    const { error } = await upsertParentPermissions({ mosqueId, classId, ...effectiveFor(classId) });
    setSavingKey(null);
    if (error) { setBanner({ kind: "err", text: "Couldn't save the class override." }); return; }
    setSavedOverrides((s) => ({ ...s, [classId]: true }));
    setBanner({ kind: "ok", text: "Class override saved." });
  };

  const resetClass = async (classId) => {
    setSavingKey(classId); setBanner(null);
    const { error } = await resetClassParentPermissions(mosqueId, classId);
    setSavingKey(null);
    if (error) { setBanner({ kind: "err", text: "Couldn't reset the class." }); return; }
    setOverrides((o) => { const n = { ...o }; delete n[classId]; return n; });
    setSavedOverrides((s) => { const n = { ...s }; delete n[classId]; return n; });
    setBanner({ kind: "ok", text: "Class reset to the mosque-wide defaults." });
  };

  const toggleExpand = (classId) => setExpanded((p) => { const n = new Set(p); n.has(classId) ? n.delete(classId) : n.add(classId); return n; });

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-emerald-700" size={26} /></div>;

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1 flex items-center gap-2" style={F_SERIF}>
          <HeartHandshake size={22} className="text-emerald-700" /> Parent access
        </h2>
        <p className="text-sm text-stone-600">Control what parents can see and do. Set a mosque-wide default, then override per class where needed.</p>
      </div>

      {banner && (
        <div className={`mb-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${banner.kind === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-700"}`}>
          {banner.kind === "ok" ? <Check size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}<span>{banner.text}</span>
        </div>
      )}

      {/* Section A — mosque-wide defaults */}
      <section className="mb-8">
        <h3 className="text-sm font-semibold text-stone-800 mb-3">Mosque-wide defaults</h3>
        <ToggleRows perms={defaults} onChange={setDefault} />
        <div className="flex justify-end mt-3">
          <button disabled={savingKey === "defaults"} onClick={saveDefaults}
            className="inline-flex items-center gap-1.5 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium">
            {savingKey === "defaults" ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save defaults
          </button>
        </div>
      </section>

      {/* Section B — per-class overrides */}
      <section>
        <h3 className="text-sm font-semibold text-stone-800 mb-3">Class-specific overrides</h3>
        {classes.length === 0 ? (
          <p className="text-sm text-stone-400">No classes yet.</p>
        ) : (
          <div className="space-y-2">
            {classes.map((c) => {
              const isOpen = expanded.has(c.id);
              const eff = effectiveFor(c.id);
              const isCustom = !!savedOverrides[c.id] || differs(eff, defaults);
              return (
                <div key={c.id} className="border border-stone-200 rounded-xl bg-white overflow-hidden">
                  <button onClick={() => toggleExpand(c.id)} className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-stone-50">
                    <span className="text-sm font-medium text-stone-800">{c.name}</span>
                    <span className="flex items-center gap-2">
                      {isCustom && <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">Custom</span>}
                      <ChevronDown size={16} className={`text-stone-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 border-t border-stone-100">
                      <ToggleRows perms={eff} onChange={(k, v) => setOverride(c.id, k, v)} />
                      <div className="flex items-center justify-between mt-3">
                        {savedOverrides[c.id] ? (
                          <button disabled={savingKey === c.id} onClick={() => resetClass(c.id)} className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700">
                            <RotateCcw size={13} /> Reset to defaults
                          </button>
                        ) : <span />}
                        <button disabled={savingKey === c.id} onClick={() => saveClass(c.id)}
                          className="inline-flex items-center gap-1.5 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium">
                          {savingKey === c.id ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save override
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default ParentPermissionsSettings;
