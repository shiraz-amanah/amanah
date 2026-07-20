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
import { GripVertical, Plus, Pencil, Check, X, Trash2, Lock, Loader2 } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getMosqueRolesAll, createMosqueRole, updateMosqueRole, reorderMosqueRoles, deleteMosqueRole, getMosqueStaffList } from "../lib/staffHelpers";
import { getMadrasaClasses } from "../auth";

// 165 preset set (matches update_employee_permissions). "" = None set (null).
const PRESET_OPTIONS = [
  ["coordinator", "Coordinator"], ["teacher", "Teacher"], ["treasurer", "Treasurer"],
  ["receptionist", "Receptionist"], ["viewer", "Viewer"], ["custom", "Custom"],
];
const PRESET_NEEDS_CLASSES = (p) => p === "teacher" || p === "custom";

// One role's permission-defaults editor (preset + conditional class multi-select).
function RoleDefaultsRow({ role, classes, canEdit, onSaved }) {
  const [preset, setPreset] = useState(role.default_role_preset || "");
  const [picked, setPicked] = useState(new Set(role.default_assigned_classes || []));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const dirty = (preset || "") !== (role.default_role_preset || "")
    || JSON.stringify([...picked].sort()) !== JSON.stringify([...(role.default_assigned_classes || [])].sort());

  const toggleClass = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const save = async () => {
    setBusy(true); setNote(null);
    const classesArr = PRESET_NEEDS_CLASSES(preset) ? [...picked] : [];
    const { error } = await updateMosqueRole(role.id, {
      default_role_preset: preset || null,
      default_assigned_classes: preset ? classesArr : null,
    });
    setBusy(false);
    if (error) { setNote("Couldn't save — try again."); return; }
    onSaved(role.id, { default_role_preset: preset || null, default_assigned_classes: preset ? classesArr : null });
  };
  const clear = async () => {
    setBusy(true); setNote(null);
    const { error } = await updateMosqueRole(role.id, { default_role_preset: null, default_assigned_classes: null });
    setBusy(false);
    if (error) { setNote("Couldn't clear — try again."); return; }
    setPreset(""); setPicked(new Set());
    onSaved(role.id, { default_role_preset: null, default_assigned_classes: null });
  };

  const selCls = "border border-stone-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400";
  return (
    <div className="py-3 border-b border-stone-100 last:border-0">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-stone-800 w-40 shrink-0">{role.name}</span>
        <select value={preset} onChange={(e) => setPreset(e.target.value)} disabled={!canEdit} className={selCls}>
          <option value="">None set</option>
          {PRESET_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {canEdit && dirty && <button onClick={save} disabled={busy} className="text-sm bg-brand-600 hover:bg-brand-700 text-white px-2.5 py-1 rounded-lg">{busy ? "…" : "Save"}</button>}
        {canEdit && role.default_role_preset && !dirty && <button onClick={clear} disabled={busy} className="text-xs text-stone-400 hover:text-rose-600">Clear</button>}
      </div>
      {PRESET_NEEDS_CLASSES(preset) && (
        <div className="mt-2 ml-40 pl-3 flex flex-wrap gap-x-4 gap-y-1">
          {classes.length === 0 ? <span className="text-xs text-stone-400">No classes yet.</span> : classes.map((c) => (
            <label key={c.id} className="inline-flex items-center gap-1.5 text-xs text-stone-600">
              <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggleClass(c.id)} disabled={!canEdit} />
              {c.name || c.class_name || "Class"}
            </label>
          ))}
        </div>
      )}
      {note && <p className="text-xs text-rose-600 mt-1 ml-40 pl-3">{note}</p>}
    </div>
  );
}

function RoleRow({ role, usage, canEdit, editing, editName, setEditName, onEditStart, onEditSave, onEditCancel, onToggle, onDelete, rowBusy, note }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: role.id, disabled: !canEdit });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  return (
    <li ref={setNodeRef} style={style} className={`flex items-center gap-2 border rounded-xl px-3 py-2 bg-white ${role.is_active ? "border-stone-200" : "border-stone-200 bg-stone-50"}`}>
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
          {role.is_default
            ? <span className="text-stone-300 p-1" title="Default role — can't be deleted"><Lock size={14} /></span>
            : <button onClick={onDelete} disabled={rowBusy} className="text-stone-400 hover:text-rose-600 p-1" aria-label="Delete"><Trash2 size={14} /></button>}
        </div>
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
  const [classes, setClasses] = useState([]);  // madrasa_classes for the defaults section

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
        <p className="text-sm text-stone-500">The roles available when adding or editing a staff member. Drag to reorder; deactivate a role to hide it from the dropdown without changing existing staff.</p>
      </div>

      <div className="bg-white border border-stone-200 rounded-2xl p-4 md:p-5 max-w-2xl">
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
                      rowBusy={rowBusyId === role.id} note={notes[role.id]} />
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

      {/* Permissions defaults — the "master key": a default access preset per role,
          auto-applied to a staff member's dashboard permissions when the role is
          assigned via the Employment editor (migration 165). */}
      {roles !== null && roles.length > 0 && (
        <div className="mt-6 bg-white border border-stone-200 rounded-2xl p-4 md:p-5 max-w-2xl">
          <h3 className="text-sm font-semibold text-stone-800 mb-1">Permissions defaults</h3>
          <p className="text-xs text-stone-500 mb-3">Set a default dashboard access level per role. When a staff member is given this role, these permissions are applied automatically. Leave as “None set” to change permissions manually only.</p>
          <div>
            {roles.map((role) => (
              <RoleDefaultsRow key={role.id} role={role} classes={classes} canEdit={canEdit}
                onSaved={(id, patch) => setRoles((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
