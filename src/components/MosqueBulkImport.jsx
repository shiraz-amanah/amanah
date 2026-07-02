import { useState } from "react";
import { Loader2, Upload, Download, Check, X, AlertCircle, Mail } from "lucide-react";
import { createMosqueStaff, createStaffInvite, updateMosqueStaff } from "../auth";
import { sendStaffInviteEmail } from "../lib/resend";

// HR → Team → bulk staff import (Session V chunk 3). CSV columns:
// name, role, email, phone, start_date, staff_type. Preview + validate (name +
// role required) before inserting; invalid rows skipped with a summary; then
// optionally invite the imported staff who have emails. Operates on mosque_staff
// via the existing createMosqueStaff (admin-insert RLS).

const COLS = ["name", "role", "email", "phone", "start_date", "staff_type"];
const TEMPLATE = "name,role,email,phone,start_date,staff_type\nYusuf Ali,Imam,yusuf@example.com,07700900000,2024-01-15,permanent\n";

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

const MosqueBulkImport = ({ mosqueId, onDone, onClose }) => {
  const [rows, setRows] = useState(null);   // parsed staff objects
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null); // { created:[{id,email,name}], skipped:[{row,reason}] }
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState(null);

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
    if (idx.name === -1 || idx.role === -1) { setError("CSV must have at least 'name' and 'role' columns."); return; }
    const staffRows = parsed.slice(1).map((cells) => ({
      name: (cells[idx.name] || "").trim(),
      role: (cells[idx.role] || "").trim(),
      email: idx.email > -1 ? (cells[idx.email] || "").trim() : "",
      phone: idx.phone > -1 ? (cells[idx.phone] || "").trim() : "",
      start_date: idx.start_date > -1 ? (cells[idx.start_date] || "").trim() : "",
      staff_type: idx.staff_type > -1 ? ((cells[idx.staff_type] || "").trim().toLowerCase() === "temporary" ? "temporary" : "permanent") : "permanent",
    }));
    setRows(staffRows);
  };

  const valid = (r) => r.name && r.role;
  const validRows = rows ? rows.filter(valid) : [];
  const invalidRows = rows ? rows.filter((r) => !valid(r)) : [];

  const doImport = async () => {
    setImporting(true); setError(null);
    const created = [], skipped = invalidRows.map((r) => ({ name: r.name || "(no name)", reason: !r.name ? "missing name" : "missing role" }));
    for (const r of validRows) {
      const { data, error: e } = await createMosqueStaff({
        mosqueId, name: r.name, role: r.role, staff_type: r.staff_type,
        email: r.email || null, phone: r.phone || null, start_date: r.start_date || null,
      });
      if (e) skipped.push({ name: r.name, reason: e.message || "insert failed" });
      else created.push({ id: data.id, name: data.name, email: r.email });
    }
    setImporting(false);
    setResult({ created, skipped });
    onDone?.();
  };

  const inviteAll = async () => {
    const withEmail = (result?.created || []).filter((c) => c.email);
    if (withEmail.length === 0) { setInviteMsg("No imported staff have email addresses."); return; }
    setInviteBusy(true); setInviteMsg(null);
    let sent = 0;
    for (const c of withEmail) {
      const { data, error: e } = await createStaffInvite({ mosqueId, email: c.email, name: c.name, role: "" });
      if (!e && data?.token) { await sendStaffInviteEmail({ token: data.token }); await updateMosqueStaff(c.id, { invite_status: "invited" }); sent++; }
    }
    setInviteBusy(false);
    setInviteMsg(`Invited ${sent} of ${withEmail.length} staff with emails.`);
    onDone?.();
  };

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider">Bulk import staff</h3>
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
              <p className="text-sm text-stone-700">{validRows.length} valid · {invalidRows.length} will be skipped (missing name/role)</p>
              <div className="border border-stone-100 rounded-lg overflow-hidden">
                <table className="hidden md:table w-full text-xs">
                  <thead className="bg-stone-50 text-stone-500"><tr><th className="text-left px-2 py-1.5">Name</th><th className="text-left px-2 py-1.5">Role</th><th className="text-left px-2 py-1.5">Email</th><th className="text-left px-2 py-1.5">Type</th></tr></thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i} className={`border-t border-stone-100 ${valid(r) ? "" : "bg-rose-50"}`}>
                        <td className="px-2 py-1.5">{r.name || <span className="text-rose-600">—</span>}</td>
                        <td className="px-2 py-1.5">{r.role || <span className="text-rose-600">—</span>}</td>
                        <td className="px-2 py-1.5 text-stone-500">{r.email || ""}</td>
                        <td className="px-2 py-1.5">{r.staff_type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Mobile — one card per preview row */}
                <div className="md:hidden divide-y divide-stone-100">
                  {rows.slice(0, 5).map((r, i) => (
                    <div key={i} className={`px-3 py-2 ${valid(r) ? "" : "bg-rose-50"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-stone-800">{r.name || <span className="text-rose-600">— missing name</span>}</p>
                        <span className="text-[11px] text-stone-500 shrink-0">{r.staff_type}</span>
                      </div>
                      <p className="text-[11px] text-stone-500 truncate">{r.role || <span className="text-rose-600">missing role</span>}{r.email ? ` · ${r.email}` : ""}</p>
                    </div>
                  ))}
                </div>
              </div>
              {rows.length > 5 && <p className="text-xs text-stone-400">+ {rows.length - 5} more rows</p>}
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
            <button onClick={inviteAll} disabled={inviteBusy} className="border border-emerald-300 text-emerald-800 hover:bg-emerald-50 text-sm font-medium px-3 py-2 rounded-lg inline-flex items-center gap-1.5">{inviteBusy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Send invites to imported staff</button>
            {onClose && <button onClick={onClose} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2">Done</button>}
          </div>
          {inviteMsg && <p className="text-sm text-emerald-700">{inviteMsg}</p>}
        </div>
      )}
    </div>
  );
};

export default MosqueBulkImport;
