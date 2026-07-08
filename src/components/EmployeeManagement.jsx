import { useState, useEffect, useCallback } from "react";
import {
  Users, UserPlus, Loader2, Check, ChevronLeft, ChevronRight, Mail, Clock,
  ShieldCheck, Pause, Play, RotateCw, Trash2, AlertCircle, X,
} from "lucide-react";
import {
  MODULES, ROLE_PRESET_META, ROLE_LABELS, getDefaultPermissions, detectPreset,
} from "../lib/employeePermissions";
import {
  getMosqueEmployees, getMadrasaClasses, inviteMosqueEmployee,
  updateEmployeePermissions, setEmployeeStatus, resendEmployeeInvite, removeEmployee,
} from "../auth";
import { sendEmployeeInvite } from "../lib/email";
import { invalidateEmployeePermissions } from "../lib/useEmployeePermissions";

// ============================================================================
// EmployeeManagement — mosque People → Employees. Owner-only surface (gated by
// employee_management + the owner bypass upstream). Two modes: the employee list
// and a 3-step invite/edit panel with the full permission toggle matrix.
// ============================================================================

const F_SERIF = { fontFamily: "'Fraunces', Georgia, serif" };

const STATUS_BADGE = {
  pending:   { label: "Pending",   cls: "bg-amber-50 text-amber-700 border-amber-200" },
  active:    { label: "Active",    cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  suspended: { label: "Suspended", cls: "bg-stone-100 text-stone-500 border-stone-200" },
};

// 3-pill segmented control for a scope module (own / all / none).
function ScopeControl({ value, onChange }) {
  const opts = [
    { v: "own", label: "Own classes" },
    { v: "all", label: "All classes" },
    { v: false, label: "No access" },
  ];
  return (
    <div className="inline-flex rounded-lg border border-stone-200 bg-stone-50 p-0.5">
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => onChange(o.v)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
              active ? "bg-white text-emerald-800 shadow-sm" : "text-stone-500 hover:text-stone-700"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// On/off switch for a boolean module.
function ToggleSwitch({ value, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!value}
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${value ? "bg-emerald-600" : "bg-stone-300"}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${value ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

// The 13-row toggle matrix. `permissions` is the JSONB object; onChange(key, value).
function PermissionMatrix({ permissions, onChange }) {
  return (
    <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden">
      {MODULES.map((m) => (
        <div key={m.key} className="flex items-center justify-between gap-4 px-4 py-3 bg-white">
          <div className="min-w-0">
            <p className="text-sm font-medium text-stone-800">{m.label}</p>
            <p className="text-xs text-stone-400 truncate">{m.hint}</p>
          </div>
          <div className="shrink-0">
            {m.type === "scope" ? (
              <ScopeControl value={permissions[m.key] ?? false} onChange={(v) => onChange(m.key, v)} />
            ) : (
              <ToggleSwitch value={!!permissions[m.key]} onChange={(v) => onChange(m.key, v)} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const EmployeeManagement = ({ mosqueId }) => {
  const [employees, setEmployees] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("list"); // list | form
  const [step, setStep] = useState(1);
  const [editingId, setEditingId] = useState(null); // null = invite; else edit
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(null); // { kind, text }
  const [actioningId, setActioningId] = useState(null);

  const load = useCallback(() => {
    if (!mosqueId) return;
    setLoading(true);
    Promise.all([getMosqueEmployees(mosqueId), getMadrasaClasses(mosqueId)])
      .then(([emps, cls]) => { setEmployees(emps); setClasses(cls); })
      .catch((err) => console.error("[EmployeeManagement] load", err?.message))
      .finally(() => setLoading(false));
  }, [mosqueId]);

  useEffect(() => { load(); }, [load]);

  const showsClassAssignment = form && Object.values(form.permissions).includes("own");

  const startInvite = () => {
    setEditingId(null);
    setForm({ name: "", email: "", rolePreset: null, permissions: getDefaultPermissions("custom"), assignedClasses: [] });
    setStep(1);
    setMode("form");
    setBanner(null);
  };

  const startEdit = (emp) => {
    setEditingId(emp.id);
    setForm({ name: emp.invitedName, email: emp.invitedEmail, rolePreset: emp.rolePreset, permissions: { ...emp.permissions }, assignedClasses: [...emp.assignedClasses] });
    setStep(2); // skip basic info when editing
    setMode("form");
    setBanner(null);
  };

  const pickPreset = (presetKey) => {
    setForm((f) => ({ ...f, rolePreset: presetKey, permissions: getDefaultPermissions(presetKey) }));
  };

  const setPerm = (key, value) => {
    setForm((f) => {
      const permissions = { ...f.permissions, [key]: value };
      return { ...f, permissions, rolePreset: detectPreset(permissions) };
    });
  };

  const toggleClass = (classId) => {
    setForm((f) => {
      const has = f.assignedClasses.includes(classId);
      return { ...f, assignedClasses: has ? f.assignedClasses.filter((c) => c !== classId) : [...f.assignedClasses, classId] };
    });
  };

  const submit = async () => {
    if (!form) return;
    setBusy(true); setBanner(null);
    const rolePreset = detectPreset(form.permissions);
    // Only persist assigned classes when some module is scoped to "own".
    const assignedClasses = Object.values(form.permissions).includes("own") ? form.assignedClasses : [];
    try {
      if (editingId) {
        const { error } = await updateEmployeePermissions({ employeeId: editingId, permissions: form.permissions, assignedClasses, rolePreset });
        if (error) throw new Error(error.message || "Couldn't save permissions.");
        invalidateEmployeePermissions(mosqueId);
        setBanner({ kind: "ok", text: "Permissions updated." });
      } else {
        const { data, error } = await inviteMosqueEmployee({ mosqueId, email: form.email.trim(), name: form.name.trim(), rolePreset, permissions: form.permissions, assignedClasses });
        if (error) throw new Error(mapInviteError(error));
        const emailRes = await sendEmployeeInvite(data.employeeId);
        setBanner({
          kind: "ok",
          text: emailRes?.ok
            ? `Invitation sent to ${form.email.trim()}. The link expires in 24 hours.`
            : `Invite created, but the email failed to send (${emailRes?.error || "unknown"}). Use “Resend invite” from the list.`,
        });
      }
      setMode("list");
      load();
    } catch (err) {
      setBanner({ kind: "err", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const doAction = async (emp, action) => {
    setActioningId(emp.id); setBanner(null);
    try {
      if (action === "suspend") { await setEmployeeStatus(emp.id, "suspended"); invalidateEmployeePermissions(mosqueId); }
      else if (action === "reactivate") { await setEmployeeStatus(emp.id, "active"); invalidateEmployeePermissions(mosqueId); }
      else if (action === "resend") {
        const { data, error } = await resendEmployeeInvite(emp.id);
        if (error) throw new Error("Couldn't refresh the invite.");
        const emailRes = await sendEmployeeInvite(emp.id);
        setBanner(emailRes?.ok
          ? { kind: "ok", text: `New invite sent to ${emp.invitedEmail}. Expires in 24 hours.` }
          : { kind: "err", text: `New link created but email failed (${emailRes?.error || "unknown"}).` });
      } else if (action === "remove") {
        if (!window.confirm(`Remove ${emp.invitedName}? This revokes their access.`)) { setActioningId(null); return; }
        await removeEmployee(emp.id); invalidateEmployeePermissions(mosqueId);
      }
      load();
    } catch (err) {
      setBanner({ kind: "err", text: err.message });
    } finally {
      setActioningId(null);
    }
  };

  // ---- render ----
  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-emerald-700" size={26} /></div>;
  }

  const bannerEl = banner && (
    <div className={`mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
      banner.kind === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-700"
    }`}>
      {banner.kind === "ok" ? <Check size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
      <span>{banner.text}</span>
      <button onClick={() => setBanner(null)} className="ml-auto text-stone-400 hover:text-stone-600"><X size={15} /></button>
    </div>
  );

  if (mode === "form") return (
    <div className="max-w-2xl">
      <button onClick={() => setMode("list")} className="mb-4 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-700"><ChevronLeft size={16} /> Back to employees</button>
      {bannerEl}
      <div className="bg-white border border-stone-200 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-stone-900 mb-1" style={F_SERIF}>
          {editingId ? `Edit ${form.name}'s permissions` : "Invite an employee"}
        </h2>
        {!editingId && <p className="text-sm text-stone-500 mb-5">Step {step} of 3</p>}

        {/* Step 1 — basic info + preset */}
        {step === 1 && !editingId && (
          <div className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-stone-700">Full name</span>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" placeholder="Aisha Rahman" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-stone-700">Email</span>
                <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" placeholder="aisha@example.com" />
              </label>
            </div>
            <div>
              <p className="text-sm font-medium text-stone-700 mb-2">Choose a starting role</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {ROLE_PRESET_META.map((r) => {
                  const active = form.rolePreset === r.key;
                  return (
                    <button key={r.key} type="button" onClick={() => pickPreset(r.key)}
                      className={`text-left rounded-xl border p-4 transition ${active ? "border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500" : "border-stone-200 hover:border-stone-300"}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <ShieldCheck size={15} className={active ? "text-emerald-600" : "text-stone-400"} />
                        <span className="text-sm font-semibold text-stone-800">{r.label}</span>
                      </div>
                      <p className="text-xs text-stone-500 leading-relaxed">{r.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end">
              <button
                disabled={!form.name.trim() || !/.+@.+\..+/.test(form.email) || !form.rolePreset}
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-1 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm font-medium">
                Continue <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — permission matrix (+ class assignment) */}
        {step === 2 && (
          <div className="space-y-5">
            <p className="text-sm text-stone-500">Fine-tune access. Presets are a starting point — every toggle is independently adjustable.</p>
            <PermissionMatrix permissions={form.permissions} onChange={setPerm} />

            {showsClassAssignment && (
              <div className="rounded-xl border border-stone-200 p-4">
                <p className="text-sm font-medium text-stone-700 mb-1">Assign to classes</p>
                <p className="text-xs text-stone-400 mb-3">“Own classes” access applies to the classes selected here.</p>
                {classes.length === 0 ? (
                  <p className="text-sm text-stone-400">No classes yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {classes.map((c) => {
                      const on = form.assignedClasses.includes(c.id);
                      return (
                        <button key={c.id} type="button" onClick={() => toggleClass(c.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${on ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-stone-600 border-stone-300 hover:border-stone-400"}`}>
                          {on && <Check size={12} className="inline mr-1" />}{c.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between">
              {editingId ? <span /> : (
                <button onClick={() => setStep(1)} className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-700"><ChevronLeft size={16} /> Back</button>
              )}
              {editingId ? (
                <button disabled={busy} onClick={submit} className="inline-flex items-center gap-1.5 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-medium">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save permissions
                </button>
              ) : (
                <button onClick={() => setStep(3)} className="inline-flex items-center gap-1 bg-emerald-900 hover:bg-emerald-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium">Review <ChevronRight size={16} /></button>
              )}
            </div>
          </div>
        )}

        {/* Step 3 — review + send */}
        {step === 3 && !editingId && (
          <div className="space-y-5">
            <div className="rounded-xl border border-stone-200 divide-y divide-stone-100">
              <Row label="Name" value={form.name} />
              <Row label="Email" value={form.email} />
              <Row label="Role" value={ROLE_LABELS[detectPreset(form.permissions)]} />
              <Row label="Full access to" value={summarise(form.permissions) || "—"} />
              {showsClassAssignment && <Row label="Assigned classes" value={classes.filter((c) => form.assignedClasses.includes(c.id)).map((c) => c.name).join(", ") || "None yet"} />}
            </div>
            <p className="text-xs text-stone-400">A branded invitation with a 24-hour magic link will be emailed to {form.email}.</p>
            <div className="flex justify-between">
              <button onClick={() => setStep(2)} className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-700"><ChevronLeft size={16} /> Back</button>
              <button disabled={busy} onClick={submit} className="inline-flex items-center gap-1.5 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-medium">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Send invitation
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ---- list mode ----
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-stone-900 flex items-center gap-2" style={F_SERIF}><Users size={18} className="text-emerald-700" /> Employees</h2>
          <p className="text-sm text-stone-500">Invite team members and control exactly what they can access.</p>
        </div>
        <button onClick={startInvite} className="inline-flex items-center gap-1.5 bg-emerald-900 hover:bg-emerald-800 text-white px-4 py-2.5 rounded-xl text-sm font-medium"><UserPlus size={16} /> Invite employee</button>
      </div>
      {bannerEl}

      {employees.length === 0 ? (
        <div className="text-center py-16 bg-white border border-dashed border-stone-200 rounded-2xl">
          <Users className="mx-auto text-stone-300 mb-3" size={32} />
          <p className="text-stone-600 font-medium">No employees yet.</p>
          <p className="text-sm text-stone-400 mb-4">Invite your first team member to get started.</p>
          <button onClick={startInvite} className="inline-flex items-center gap-1.5 bg-emerald-900 hover:bg-emerald-800 text-white px-4 py-2.5 rounded-xl text-sm font-medium"><UserPlus size={16} /> Invite employee</button>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white border border-stone-200 rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-stone-400 border-b border-stone-100">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Classes</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {employees.map((emp) => {
                const badge = STATUS_BADGE[emp.status] || STATUS_BADGE.pending;
                const clsNames = classes.filter((c) => emp.assignedClasses.includes(c.id)).map((c) => c.name);
                const busyRow = actioningId === emp.id;
                return (
                  <tr key={emp.id} className="hover:bg-stone-50/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-stone-800">{emp.profileName || emp.invitedName}</p>
                      <p className="text-xs text-stone-400">{emp.invitedEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-stone-600">{ROLE_LABELS[emp.rolePreset] || "Custom"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${badge.cls}`}>{badge.label}</span>
                      {emp.status === "pending" && emp.inviteExpiresAt && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs text-stone-400"><Clock size={11} />{expiryLabel(emp.inviteExpiresAt)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-stone-500 text-xs">{clsNames.length ? clsNames.join(", ") : (Object.values(emp.permissions).includes("own") ? "—" : "All / n/a")}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {busyRow ? <Loader2 size={15} className="animate-spin text-stone-400" /> : (
                          <>
                            <IconBtn title="Edit permissions" onClick={() => startEdit(emp)}><ShieldCheck size={15} /></IconBtn>
                            {emp.status === "pending" && <IconBtn title="Resend invite" onClick={() => doAction(emp, "resend")}><RotateCw size={15} /></IconBtn>}
                            {emp.status === "active" && <IconBtn title="Suspend" onClick={() => doAction(emp, "suspend")}><Pause size={15} /></IconBtn>}
                            {emp.status === "suspended" && <IconBtn title="Reactivate" onClick={() => doAction(emp, "reactivate")}><Play size={15} /></IconBtn>}
                            <IconBtn title="Remove" danger onClick={() => doAction(emp, "remove")}><Trash2 size={15} /></IconBtn>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Small presentational helpers.
function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-xs uppercase tracking-wide text-stone-400">{label}</span>
      <span className="text-sm text-stone-800 text-right">{value}</span>
    </div>
  );
}
function IconBtn({ title, onClick, children, danger }) {
  return (
    <button title={title} onClick={onClick}
      className={`p-1.5 rounded-lg border border-transparent hover:border-stone-200 hover:bg-stone-100 ${danger ? "text-rose-500 hover:text-rose-600" : "text-stone-500 hover:text-stone-700"}`}>
      {children}
    </button>
  );
}

// Comma list of modules the employee has any access to (for the review summary).
function summarise(permissions) {
  return MODULES.filter((m) => permissions[m.key]).map((m) => m.label).join(", ");
}
function expiryLabel(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const hrs = Math.round(ms / 3.6e6);
  return hrs <= 1 ? "expires soon" : `expires in ${hrs}h`;
}
function mapInviteError(error) {
  const m = error?.message || "";
  if (m.includes("employee_already_invited")) return "That email already has a pending or active invite for this mosque.";
  if (m.includes("assigned_class_not_in_mosque")) return "One of the selected classes doesn't belong to this mosque.";
  if (m.includes("not_mosque_owner")) return "Only the mosque owner can invite employees.";
  return "Couldn't create the invitation. Please try again.";
}

export default EmployeeManagement;
