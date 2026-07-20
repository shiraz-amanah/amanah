// src/components/MosqueStaffRoles.jsx
// ====================================================================
// D2 — Mosque People → Staff roles. Owner/admin management of the per-mosque
// mosque_roles list that feeds the D1 role dropdown. Add / rename / toggle active
// / drag-reorder go through RLS writes; delete goes through the guarded
// delete_mosque_role RPC (migration 164). Usage counts are computed client-side
// from get_mosque_staff_list (active workforce only), matching the RPC's rule.
//
// mosque_roles.role is referenced by NAME (decoupled text) — renaming a role does
// NOT relabel staff already assigned the old name (logged in NOTES).
// ====================================================================
import { useEffect, useState } from "react";
// Icon note: the spec named Tabler icons (ti-pencil / ti-adjustments-horizontal);
// this project is on lucide-react throughout, so the equivalents are Pencil and
// SlidersHorizontal. No new icon dependency added.
import { GripVertical, Plus, Pencil, Check, X, Trash2, Lock, Loader2, SlidersHorizontal } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getMosqueRolesAll, createMosqueRole, updateMosqueRole, reorderMosqueRoles, deleteMosqueRole, getMosqueStaffList } from "../lib/staffHelpers";
import { getMadrasaClasses } from "../auth";
// Permission model single source of truth (migration 125 shape). The editor is
// driven off MODULES so adding a module never needs a change here.
import { MODULES, EMPTY_PERMISSIONS, getDefaultPermissions, detectPreset } from "../lib/employeePermissions";

// 165 preset set (matches update_employee_permissions). "" = None set (null).
const PRESET_OPTIONS = [
  ["coordinator", "Coordinator"], ["teacher", "Teacher"], ["treasurer", "Treasurer"],
  ["receptionist", "Receptionist"], ["viewer", "Viewer"], ["custom", "Custom"],
];

// Shared permission controls — same shapes as GrantAccessModal so the role-default
// editor and the per-person editor read identically.
const Toggle = ({ on, onClick, disabled }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    className={`w-10 h-6 rounded-full transition-colors relative shrink-0 disabled:opacity-50 ${on ? "bg-brand-500" : "bg-stone-300"}`}>
    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
  </button>
);
const ScopeControl = ({ value, onChange, disabled }) => (
  <div className="inline-flex rounded-lg border border-stone-200 overflow-hidden shrink-0">
    {[[false, "None"], ["own", "Own"], ["all", "All"]].map(([v, l]) => (
      <button key={String(v)} type="button" disabled={disabled} onClick={() => onChange(v)}
        className={`text-xs px-2.5 py-1 disabled:opacity-50 ${value === v ? "bg-brand-600 text-white" : "bg-white text-stone-500 hover:bg-stone-50"}`}>{l}</button>
    ))}
  </div>
);

// One role's permission-defaults editor. Rendered INLINE beneath its own role row
// (toggled by that row's sliders icon) — this replaces the old separate
// "Permissions defaults" section, which repeated the whole role list a second
// time further down the page.
function RolePermissionsPanel({ role, classes, canEdit, onSaved }) {
  // Editor state seeds from the saved granular blob if there is one, else by
  // expanding the saved preset, else an all-false slate. "Start from preset" only
  // RE-SEEDS these controls — nothing is written until Save.
  const [perms, setPerms] = useState(() =>
    role.default_permissions
      ? { ...EMPTY_PERMISSIONS, ...role.default_permissions }
      : (role.default_role_preset ? getDefaultPermissions(role.default_role_preset) : { ...EMPTY_PERMISSIONS }));
  const [preset, setPreset] = useState(() =>
    role.default_permissions ? detectPreset(role.default_permissions) : (role.default_role_preset || ""));
  const [picked, setPicked] = useState(new Set(role.default_assigned_classes || []));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  // The class picker follows the SAME rule as GrantAccessModal: it appears when
  // any scope module is set to "own" (not on a preset-name guess), because that
  // is exactly when assigned_classes carries meaning.
  const usesOwn = MODULES.some((m) => m.type === "scope" && perms[m.key] === "own");

  const savedPerms = role.default_permissions || null;
  const dirty = JSON.stringify(perms) !== JSON.stringify(savedPerms ? { ...EMPTY_PERMISSIONS, ...savedPerms } : null)
    || JSON.stringify([...picked].sort()) !== JSON.stringify([...(role.default_assigned_classes || [])].sort());

  const setModule = (key, value) => { setPerms((p) => ({ ...p, [key]: value })); setNote(null); };
  const seedFromPreset = (key) => {
    setPreset(key);
    // "" (None set) → clean slate; a named preset → its shape. Editor state only.
    setPerms(key ? getDefaultPermissions(key) : { ...EMPTY_PERMISSIONS });
    setNote(null);
  };
  const toggleClass = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const save = async () => {
    setBusy(true); setNote(null);
    const classesArr = usesOwn ? [...picked] : [];
    const patch = {
      default_permissions: perms,
      default_assigned_classes: classesArr,
      // Keep the stored label coherent with the blob rather than leaving a stale
      // preset name next to permissions that no longer match it.
      default_role_preset: detectPreset(perms),
    };
    const { error } = await updateMosqueRole(role.id, patch);
    setBusy(false);
    if (error) { setNote("Couldn't save — try again."); return; }
    setPreset(patch.default_role_preset);
    onSaved(role.id, patch);
  };

  // Clear wipes ALL THREE default columns, not just default_permissions. Nulling
  // the blob alone would silently fall back to default_role_preset (the 167
  // priority chain), so a button labelled "Clear" would leave defaults active.
  const clear = async () => {
    setBusy(true); setNote(null);
    const patch = { default_permissions: null, default_assigned_classes: null, default_role_preset: null };
    const { error } = await updateMosqueRole(role.id, patch);
    setBusy(false);
    if (error) { setNote("Couldn't clear — try again."); return; }
    setPerms({ ...EMPTY_PERMISSIONS }); setPreset(""); setPicked(new Set());
    onSaved(role.id, patch);
  };

  const selCls = "border border-stone-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400";
  const hasDefaults = !!(role.default_permissions || role.default_role_preset);
  return (
    <div className="mt-2 pt-3 border-t border-stone-100">
      <p className="text-xs text-stone-500 mb-2.5">
        Default dashboard access for anyone given this role — applied automatically when the role is assigned. Individual staff can still be adjusted on their own profile.
      </p>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <label className="text-xs font-medium text-stone-500">Start from preset</label>
        <select value={preset} onChange={(e) => seedFromPreset(e.target.value)} disabled={!canEdit} className={selCls}>
          <option value="">None set</option>
          {PRESET_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className="text-xs text-stone-400">Seeds the toggles below — nothing saves until you press Save.</span>
      </div>

      <div className="space-y-1 rounded-xl border border-stone-100 px-3 py-1.5">
        {MODULES.map((m) => (
          <div key={m.key} className="flex items-center justify-between gap-3 py-1.5 border-b border-stone-50 last:border-0">
            <div className="min-w-0">
              <div className="text-sm text-stone-800">{m.label}</div>
              <div className="text-xs text-stone-400">{m.hint}</div>
            </div>
            {m.type === "scope"
              ? <ScopeControl value={perms[m.key] ?? false} onChange={(v) => setModule(m.key, v)} disabled={!canEdit} />
              : <Toggle on={!!perms[m.key]} onClick={() => setModule(m.key, !perms[m.key])} disabled={!canEdit} />}
          </div>
        ))}
      </div>

      {usesOwn && (
        <div className="mt-2.5">
          <p className="text-xs font-medium text-stone-500 mb-1">
            Assigned classes <span className="text-stone-400">(for “own classes” scope)</span>
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {classes.length === 0 ? <span className="text-xs text-stone-400">No classes yet.</span> : classes.map((c) => (
              <label key={c.id} className="inline-flex items-center gap-1.5 text-xs text-stone-600">
                <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggleClass(c.id)} disabled={!canEdit} />
                {c.name || c.class_name || "Class"}
              </label>
            ))}
          </div>
        </div>
      )}

      {canEdit && (
        <div className="flex items-center gap-3 mt-3">
          <button onClick={save} disabled={busy || !dirty}
            className="text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg">
            {busy ? "…" : "Save"}
          </button>
          {hasDefaults && (
            <button onClick={clear} disabled={busy} className="text-xs text-stone-400 hover:text-rose-600 underline">Clear defaults</button>
          )}
        </div>
      )}
      {note && <p className="text-xs text-rose-600 mt-1.5">{note}</p>}
    </div>
  );
}

function RoleRow({ role, usage, canEdit, editing, editName, setEditName, onEditStart, onEditSave, onEditCancel, onToggle, onDelete, rowBusy, note, permOpen, onTogglePerm, classes, onPermSaved }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: role.id, disabled: !canEdit });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  // 167: the dot marks "this role has defaults configured" — either the granular
  // blob OR the older preset label counts, since either one drives the auto-apply.
  const hasPreset = !!(role.default_permissions || role.default_role_preset);
  return (
    <li ref={setNodeRef} style={style} className={`border rounded-xl px-3 py-2 bg-white ${role.is_active ? "border-stone-200" : "border-stone-200 bg-stone-50"}`}>
    <div className="flex items-center gap-2">
      {canEdit && (
        <button {...attributes} {...listeners} className="cursor-grab text-stone-300 hover:text-stone-500 touch-none" aria-label="Reorder"><GripVertical size={16} /></button>
      )}
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") onEditSave(); if (e.key === "Escape") onEditCancel(); }}
              className="flex-1 border border-stone-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            <button onClick={onEditSave} disabled={rowBusy} className="text-emerald-600 hover:text-emerald-800" aria-label="Save"><Check size={16} /></button>
            <button onClick={onEditCancel} className="text-stone-400 hover:text-stone-600" aria-label="Cancel"><X size={16} /></button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${role.is_active ? "text-stone-800" : "text-stone-400"}`}>{role.name}</span>
            {role.is_default && <Lock size={12} className="text-stone-400 shrink-0" title="Default role — can't be deleted" />}
            {!role.is_active && <span className="text-xs text-stone-400">(inactive)</span>}
            {usage > 0 && <span className="text-xs text-stone-400">· {usage} staff</span>}
          </div>
        )}
        {note && <p className="text-xs text-amber-600 mt-0.5">{note}</p>}
      </div>
      {canEdit && !editing && (
        <div className="flex items-center gap-1 shrink-0">
          <label className="inline-flex items-center gap-1 text-xs text-stone-500 mr-1 cursor-pointer">
            <input type="checkbox" checked={role.is_active} onChange={onToggle} disabled={rowBusy} /> Active
          </label>
          <button onClick={onEditStart} className="text-stone-400 hover:text-brand-700 p-1" aria-label="Rename"><Pencil size={14} /></button>
          {/* Permissions defaults toggle. Accent when this row's panel is open,
              muted when closed; an accent dot marks a role that already has a
              preset saved, so configured roles are visible at a glance without
              opening each one. */}
          <button onClick={onTogglePerm}
            className={`relative p-1 ${permOpen ? "text-brand-600" : "text-stone-400 hover:text-brand-700"}`}
            aria-label="Permission defaults" aria-expanded={permOpen}
            title={hasPreset ? "Permission defaults (set)" : "Permission defaults"}>
            <SlidersHorizontal size={14} />
            {hasPreset && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-brand-600" />}
          </button>
          {role.is_default
            ? <span className="text-stone-300 p-1" title="Default role — can't be deleted"><Lock size={14} /></span>
            : <button onClick={onDelete} disabled={rowBusy} className="text-stone-400 hover:text-rose-600 p-1" aria-label="Delete"><Trash2 size={14} /></button>}
        </div>
      )}
    </div>
    {permOpen && canEdit && (
      <RolePermissionsPanel role={role} classes={classes} canEdit={canEdit} onSaved={onPermSaved} />
    )}
    </li>
  );
}

export default function MosqueStaffRoles({ mosqueId, mosque, authedUser }) {
  const canEdit = !!(authedUser?.id && mosque?.user_id && authedUser.id === mosque.user_id);
  const [roles, setRoles] = useState(null);   // null = loading
  const [usage, setUsage] = useState({});      // roleName → active-staff count
  const [addName, setAddName] = useState("");
  const [addErr, setAddErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rowBusyId, setRowBusyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [notes, setNotes] = useState({});      // roleId → transient inline note
  const [classes, setClasses] = useState([]);  // madrasa_classes for the permissions panels
  // Which row's inline permissions panel is open. Single id (not a Set) — that IS
  // the "only one open at a time" rule; opening another row replaces it.
  const [openPermId, setOpenPermId] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => { if (mosqueId) getMadrasaClasses(mosqueId).then(setClasses).catch(() => {}); }, [mosqueId]);

  const load = () => {
    Promise.all([getMosqueRolesAll(mosqueId), getMosqueStaffList(mosqueId)])
      .then(([rs, staff]) => {
        setRoles(rs);
        const u = {};
        for (const s of (staff || [])) {
          if (s.archived || s.status === "offboarded") continue;
          if (s.role) u[s.role] = (u[s.role] || 0) + 1;
        }
        setUsage(u);
      })
      .catch(() => setRoles([]));
  };
  useEffect(() => { if (mosqueId) load(); /* eslint-disable-next-line */ }, [mosqueId]);

  const setNote = (id, text) => setNotes((n) => ({ ...n, [id]: text }));

  const doAdd = async () => {
    if (!addName.trim()) return;
    setBusy(true); setAddErr(null);
    const { data, error } = await createMosqueRole(mosqueId, addName);
    setBusy(false);
    if (error) { setAddErr(error === "duplicate" ? "A role with that name already exists." : "Couldn't add the role — please try again."); return; }
    setRoles((rs) => [...(rs || []), data]);
    setAddName("");
  };

  const doRenameSave = async (id) => {
    const name = editName.trim();
    if (!name) return;
    setRowBusyId(id); setNote(id, null);
    const { data, error } = await updateMosqueRole(id, { name });
    setRowBusyId(null);
    if (error) { setNote(id, error === "duplicate" ? "That name clashes with another role." : "Couldn't rename — try again."); return; }
    setRoles((rs) => rs.map((r) => (r.id === id ? { ...r, name: data.name } : r)));
    setEditingId(null);
  };

  const doToggle = async (role) => {
    setRowBusyId(role.id);
    const { data, error } = await updateMosqueRole(role.id, { is_active: !role.is_active });
    setRowBusyId(null);
    if (!error) setRoles((rs) => rs.map((r) => (r.id === role.id ? { ...r, is_active: data.is_active } : r)));
  };

  const doDelete = async (role) => {
    setNote(role.id, null);
    if (!window.confirm(`Delete the role “${role.name}”?`)) return;
    setRowBusyId(role.id);
    const res = await deleteMosqueRole(role.id);
    setRowBusyId(null);
    if (res?.deleted) { setRoles((rs) => rs.filter((r) => r.id !== role.id)); return; }
    if (res?.reason === "in_use") setNote(role.id, `Used by ${res.used_by} staff member${res.used_by === 1 ? "" : "s"} — deactivate instead.`);
    else if (res?.reason === "default") setNote(role.id, "Default roles can't be deleted.");
    else setNote(role.id, "Couldn't delete — please try again.");
  };

  const onDragEnd = async (e) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = roles.findIndex((r) => r.id === active.id);
    const newIdx = roles.findIndex((r) => r.id === over.id);
    const next = arrayMove(roles, oldIdx, newIdx);
    setRoles(next); // optimistic
    const { error } = await reorderMosqueRoles(next.map((r) => r.id));
    if (error) load(); // revert to server order on failure
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Staff roles</h2>
        <p className="text-sm text-stone-500">The roles available when adding or editing a staff member. Drag to reorder; deactivate a role to hide it from the dropdown without changing existing staff. Use the sliders icon on a role to set the dashboard permissions anyone with that role gets by default.</p>
      </div>

      {/* Widened from max-w-2xl: the inline permissions editor carries 13 module
          rows with label+hint on the left and a 3-way control on the right, which
          cramped badly at the old width. */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 md:p-5 max-w-3xl">
        {roles === null ? (
          <div className="py-8 flex justify-center text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
        ) : (
          <>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={roles.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-2">
                  {roles.map((role) => (
                    <RoleRow key={role.id} role={role} usage={usage[role.name] || 0} canEdit={canEdit}
                      editing={editingId === role.id} editName={editName} setEditName={setEditName}
                      onEditStart={() => { setEditingId(role.id); setEditName(role.name); setNote(role.id, null); }}
                      onEditSave={() => doRenameSave(role.id)} onEditCancel={() => setEditingId(null)}
                      onToggle={() => doToggle(role)} onDelete={() => doDelete(role)}
                      rowBusy={rowBusyId === role.id} note={notes[role.id]}
                      permOpen={openPermId === role.id}
                      onTogglePerm={() => setOpenPermId((id) => (id === role.id ? null : role.id))}
                      classes={classes}
                      onPermSaved={(id, patch) => setRoles((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
            {roles.length === 0 && <p className="text-sm text-stone-400 py-4 text-center">No roles yet.</p>}

            {canEdit && (
              <div className="mt-4 pt-4 border-t border-stone-100">
                <div className="flex items-center gap-2">
                  <input value={addName} onChange={(e) => { setAddName(e.target.value); setAddErr(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") doAdd(); }}
                    placeholder="Add a role, e.g. Safeguarding Lead"
                    className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                  <button onClick={doAdd} disabled={busy || !addName.trim()} className="text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg inline-flex items-center gap-1.5">
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
                  </button>
                </div>
                {addErr && <p className="text-xs text-rose-600 mt-1.5">{addErr}</p>}
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}
