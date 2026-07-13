import { useState } from "react";
import { Loader2, Upload, Download, Check, X, AlertCircle, Mail } from "lucide-react";
import { createStaffWizardInvite, updateMosqueStaff } from "../auth";
import { sendStaffWizardEmail } from "../lib/resend";

// Session RBAC-D — bulk staff import, re-surfaced on the ONBOARDING SESSION
// model (migration 133). Each valid CSV row mints a stub mosque_staff directory
// row + an onboarding session via createStaffWizardInvite (NOT the old
// wizard_token stub, NOT the login-invite createStaffInvite path), then the
// admin can send each person their remote onboarding link (sendStaffWizardEmail).
//
// EMAIL GUARD (the fix for the transposed junk rows migration 134 backstops):
//   • reject rows whose email is missing or fails the format regex,
//   • reject rows whose NAME field looks like an email — the transposition
//     signature (email typed into the name column),
//   • every skipped row carries a human reason.
// The regex matches migration 134's CHECK, so the client rejects exactly what
// the DB would (the CHECK is still the backstop if anything slips past).
//
// CSV columns: name, role, email, phone, start_date. name + a valid email are
// required; role/phone/start_date are applied to the stub row (the wizard's
// Employment step can still overwrite role).

const COLS = ["name", "role", "email", "phone", "start_date"];
const TEMPLATE = "name,role,email,phone,start_date\nYusuf Ali,Imam,yusuf@example.com,07700900000,2024-01-15\n";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Minimal CSV parser: handles double-quoted fields with embedded commas/quotes.
function parseCsv(text) {
  const out = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (!line.trim()) continue;
    const cells = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ",") { cells.push(cur); cur = ""; }
      else cur += c;
    }
    cells.push(cur);
    out.push(cells.map((s) => s.trim()));
  }
  return out;
}

// Per-row validation → null if valid, else a human reason (drives the skip list).
function rowIssue(r) {
  if (!r.name) return "missing name";
  if (EMAIL_RE.test(r.name)) return "name looks like an email — check your columns are in order";
  if (!r.email) return "missing email";
  if (!EMAIL_RE.test(r.email)) return "invalid email format";
  return null;
}

const MosqueBulkImport = ({ mosqueId, onDone, onClose }) => {
  const [rows, setRows] = useState(null);   // parsed staff objects
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null); // { created:[{staffId,token,name,email}], skipped:[{name,reason}] }
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState(null);
  const [inviteTone, setInviteTone] = useState("ok"); // 'ok' | 'warn'

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "amanah-staff-import-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (file) => {
    setError(null); setResult(null);
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) { setError("CSV needs a header row + at least one staff row."); return; }
    const header = parsed[0].map((h) => h.toLowerCase().replace(/\s+/g, "_"));
    const idx = Object.fromEntries(COLS.map((c) => [c, header.indexOf(c)]));
    if (idx.name === -1 || idx.email === -1) { setError("CSV must have at least 'name' and 'email' columns."); return; }
    const staffRows = parsed.slice(1).map((cells) => ({
      name: (cells[idx.name] || "").trim(),
      role: idx.role > -1 ? (cells[idx.role] || "").trim() : "",
      email: idx.email > -1 ? (cells[idx.email] || "").trim() : "",
      phone: idx.phone > -1 ? (cells[idx.phone] || "").trim() : "",
      start_date: idx.start_date > -1 ? (cells[idx.start_date] || "").trim() : "",
    }));
    setRows(staffRows);
  };

  const validRows = rows ? rows.filter((r) => !rowIssue(r)) : [];
  const invalidRows = rows ? rows.filter((r) => rowIssue(r)) : [];

  const doImport = async () => {
    setImporting(true); setError(null);
    const created = [], skipped = invalidRows.map((r) => ({ name: r.name || "(no name)", reason: rowIssue(r) }));
    for (const r of validRows) {
      // Mints stub directory row + onboarding session (same lowercased email in
      // both → 055 link invariant holds).
      const { data, error: e } = await createStaffWizardInvite({ mosqueId, name: r.name, email: r.email });
      if (e || !data?.staffId) { skipped.push({ name: r.name, reason: e?.message || "invite not created" }); continue; }
      // Apply the optional CSV fields to the stub row (wizard can still overwrite role).
      const patch = {};
      if (r.role) patch.role = r.role;
      if (r.phone) patch.phone = r.phone;
      if (r.start_date) patch.start_date = r.start_date;
      if (Object.keys(patch).length) await updateMosqueStaff(data.staffId, patch);
      created.push({ staffId: data.staffId, token: data.token, name: r.name, email: r.email });
    }
    setImporting(false);
    setResult({ created, skipped });
    onDone?.();
  };

  // Send each imported person their remote onboarding link. Respects the email
  // helper's {ok,error}: only count a real send.
  const inviteAll = async () => {
    const list = result?.created || [];
    if (list.length === 0) { setInviteTone("warn"); setInviteMsg("Nothing to invite."); return; }
    setInviteBusy(true); setInviteMsg(null);
    let sent = 0;
    const failures = [];
    for (const c of list) {
      const mail = await sendStaffWizardEmail({ token: c.token });
      if (!mail.ok) { failures.push(`${c.name || c.email}: email failed (${mail.error})`); continue; }
      sent++;
    }
    setInviteBusy(false);
    if (failures.length) {
      setInviteTone("warn");
      setInviteMsg(`Sent ${sent} of ${list.length}. ${failures.length} failed — ${failures.slice(0, 3).join("; ")}${failures.length > 3 ? "…" : ""}`);
    } else {
      setInviteTone("ok");
      setInviteMsg(`Onboarding links sent to all ${sent} imported staff.`);
    }
    onDone?.();
  };

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider">Bulk import staff (remote onboarding)</h3>
        <div className="flex items-center gap-2">
          <button onClick={downloadTemplate} className="text-xs text-emerald-800 hover:underline inline-flex items-center gap-1"><Download size={12} /> Template</button>
          {onClose && <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X size={16} /></button>}
        </div>
      </div>
      {error && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}

      {!result && (
        <>
          <label className="flex items-center justify-center gap-2 border border-dashed border-stone-300 hover:border-emerald-500 rounded-xl py-4 cursor-pointer text-sm text-stone-600">
            <Upload size={16} /> Choose a CSV file
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>

          {rows && (
            <div className="space-y-2">
              <p className="text-sm text-stone-700">{validRows.length} valid · {invalidRows.length} will be skipped (missing/invalid email or swapped columns)</p>
              <div className="border border-stone-100 rounded-lg overflow-hidden">
                <table className="hidden md:table w-full text-xs">
                  <thead className="bg-stone-50 text-stone-500"><tr><th className="text-left px-2 py-1.5">Name</th><th className="text-left px-2 py-1.5">Role</th><th className="text-left px-2 py-1.5">Email</th><th className="text-left px-2 py-1.5">Issue</th></tr></thead>
                  <tbody>
                    {rows.slice(0, 6).map((r, i) => {
                      const issue = rowIssue(r);
                      return (
                        <tr key={i} className={`border-t border-stone-100 ${issue ? "bg-rose-50" : ""}`}>
                          <td className="px-2 py-1.5">{r.name || <span className="text-rose-600">—</span>}</td>
                          <td className="px-2 py-1.5">{r.role || "—"}</td>
                          <td className="px-2 py-1.5 text-stone-500">{r.email || <span className="text-rose-600">—</span>}</td>
                          <td className="px-2 py-1.5 text-rose-600">{issue || ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {/* Mobile — one card per preview row */}
                <div className="md:hidden divide-y divide-stone-100">
                  {rows.slice(0, 6).map((r, i) => {
                    const issue = rowIssue(r);
                    return (
                      <div key={i} className={`px-3 py-2 ${issue ? "bg-rose-50" : ""}`}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-stone-800">{r.name || <span className="text-rose-600">— missing name</span>}</p>
                          <span className="text-[11px] text-stone-500 shrink-0">{r.role || ""}</span>
                        </div>
                        <p className="text-[11px] text-stone-500 truncate">{r.email || <span className="text-rose-600">missing email</span>}</p>
                        {issue && <p className="text-[11px] text-rose-600">{issue}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
              {rows.length > 6 && <p className="text-xs text-stone-400">+ {rows.length - 6} more rows</p>}
              <button onClick={doImport} disabled={importing || validRows.length === 0} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{importing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Import {validRows.length} staff</button>
            </div>
          )}
        </>
      )}

      {result && (
        <div className="space-y-3">
          <p className="text-sm text-stone-800"><strong>{result.created.length} imported</strong>{result.skipped.length ? `, ${result.skipped.length} skipped` : ""}.</p>
          {result.skipped.length > 0 && <ul className="text-xs text-stone-500 list-disc pl-5">{result.skipped.slice(0, 8).map((s, i) => <li key={i}>{s.name} — {s.reason}</li>)}</ul>}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={inviteAll} disabled={inviteBusy || result.created.length === 0} className="border border-emerald-300 text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 text-sm font-medium px-3 py-2 rounded-lg inline-flex items-center gap-1.5">{inviteBusy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Send onboarding links</button>
            {onClose && <button onClick={onClose} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2">Done</button>}
          </div>
          {inviteMsg && <p className={`text-sm ${inviteTone === "warn" ? "text-amber-700" : "text-emerald-700"}`}>{inviteMsg}</p>}
        </div>
      )}
    </div>
  );
};

export default MosqueBulkImport;
