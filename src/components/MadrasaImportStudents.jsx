import { useState, useRef } from "react";
import { Loader2, X, Upload, Download, FileSpreadsheet, Check, AlertCircle, AlertTriangle, CheckCircle2, ChevronLeft } from "lucide-react";
import { adminEnrolStudent } from "../auth";
import { sendMadrasaParentWelcome } from "../lib/email";
import { downloadCSV, parseCSV } from "../lib/csv";

// Bulk student import (Session AM). A whole Madrasah intake from a spreadsheet:
// download a template → fill it → upload → validated preview → bulk enrol via
// the existing madrasa_admin_enrol_student RPC + per-row parent welcome email.
// No migration: the RPC already accepts every template column.

const TEMPLATE_COLUMNS = [
  { label: "child_name", key: "child_name" }, { label: "dob", key: "dob" },
  { label: "gender", key: "gender" }, { label: "relation", key: "relation" },
  { label: "parent_email", key: "parent_email" }, { label: "parent_name", key: "parent_name" },
  { label: "class_name", key: "class_name" },
];
const SAMPLE_ROW = { child_name: "Yusuf Ahmed", dob: "2016-04-23", gender: "male", relation: "son", parent_email: "parent@example.com", parent_name: "Fatima Ahmed", class_name: "" };

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || "").trim());
const normGender = (g) => { const v = (g || "").trim().toLowerCase(); if (["male", "m", "boy"].includes(v)) return "male"; if (["female", "f", "girl"].includes(v)) return "female"; return v || null; };

// Accepts YYYY-MM-DD or DD/MM/YYYY (UK). Returns { ok, value: ISO|null, reason }.
const parseDob = (raw) => {
  const v = (raw || "").trim();
  if (!v) return { ok: true, value: null }; // dob is optional; valid only when present
  let y, m, d, mm;
  if ((mm = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { y = +mm[1]; m = +mm[2]; d = +mm[3]; }
  else if ((mm = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) { d = +mm[1]; m = +mm[2]; y = +mm[3]; }
  else return { ok: false, reason: "dob must be YYYY-MM-DD or DD/MM/YYYY" };
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return { ok: false, reason: "dob is not a real date" };
  if (dt.getTime() > Date.now()) return { ok: false, reason: "dob is in the future" };
  return { ok: true, value: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
};

const MadrasaImportStudents = ({ mosqueId, classes = [], onClose, onDone }) => {
  const [rows, setRows] = useState(null);      // validated rows (step 2)
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);  // { added, emails, errors }
  const fileRef = useRef(null);

  const activeClasses = classes.filter((c) => c.status !== "archived");
  const classByName = new Map(activeClasses.map((c) => [(c.name || "").trim().toLowerCase(), c]));

  const downloadTemplate = () => downloadCSV("madrasah-students-template.csv", [SAMPLE_ROW], TEMPLATE_COLUMNS);

  const validate = (raw, idx) => {
    const errors = [];
    const name = (raw.child_name || "").trim();
    const email = (raw.parent_email || "").trim();
    if (!name) errors.push("child_name is required");
    if (!email) errors.push("parent_email is required");
    else if (!isEmail(email)) errors.push("parent_email is not a valid email");
    const dob = parseDob(raw.dob);
    if (!dob.ok) errors.push(dob.reason);
    const className = (raw.class_name || "").trim();
    let classId = null, cls = null;
    if (className) {
      cls = classByName.get(className.toLowerCase());
      if (!cls) errors.push(`class_name "${className}" doesn't match a class`);
      else classId = cls.id;
    }
    return {
      rowNum: idx + 2, // +1 header, +1 to 1-index
      name, email, dobIso: dob.value, gender: normGender(raw.gender), relation: (raw.relation || "").trim() || null,
      parentName: (raw.parent_name || "").trim() || null, className, classLabel: cls?.name || (className ? className : "Unassigned"),
      classId, errors,
    };
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(""); setResult(null); setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { headers, rows: parsed } = parseCSV(String(reader.result || ""));
        const missing = ["child_name", "parent_email"].filter((h) => !headers.includes(h));
        if (missing.length) { setParseError(`The file is missing required column(s): ${missing.join(", ")}. Download the template for the exact format.`); setRows(null); return; }
        if (!parsed.length) { setParseError("The file has no data rows."); setRows(null); return; }
        setRows(parsed.map(validate));
      } catch (err) { setParseError("Couldn't read that file. Make sure it's a CSV exported from the template."); setRows(null); }
    };
    reader.onerror = () => setParseError("Couldn't read that file.");
    reader.readAsText(file);
    e.target.value = ""; // allow re-selecting the same file
  };

  const valid = (rows || []).filter((r) => r.errors.length === 0);
  const invalid = (rows || []).filter((r) => r.errors.length > 0);

  const runImport = async () => {
    if (!valid.length || importing) return;
    setImporting(true); setProgress({ done: 0, total: valid.length });
    let added = 0, emails = 0, errs = 0;
    for (let i = 0; i < valid.length; i++) {
      const r = valid[i];
      try {
        const res = await adminEnrolStudent({
          mosqueId, classId: r.classId || null, name: r.name, dob: r.dobIso, gender: r.gender,
          relation: r.relation, parentEmail: r.email, parentName: r.parentName,
        });
        if (res.error) { errs++; }
        else {
          added++;
          if (res.data?.student_id) { try { await sendMadrasaParentWelcome(res.data.student_id); emails++; } catch { /* email best-effort */ } }
        }
      } catch { errs++; }
      setProgress({ done: i + 1, total: valid.length });
    }
    setImporting(false); setResult({ added, emails, errors: errs });
    if (added > 0) onDone?.();
  };

  const reset = () => { setRows(null); setFileName(""); setParseError(""); setResult(null); setProgress({ done: 0, total: 0 }); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-stone-900/40" onClick={importing ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-stone-200 px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-stone-900 inline-flex items-center gap-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><FileSpreadsheet size={18} className="text-emerald-700" /> Import students</h3>
            <p className="text-xs text-stone-500">{rows ? "Step 2 of 2 — review &amp; confirm" : "Step 1 of 2 — download the template, fill it in, upload"}</p>
          </div>
          <button onClick={onClose} disabled={importing} className="text-stone-400 hover:text-stone-700 p-1 disabled:opacity-40"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Result summary */}
          {result ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-3"><Check size={22} /></div>
              <p className="text-sm font-medium text-stone-900">Import complete</p>
              <p className="text-sm text-stone-600 mt-1">{result.added} student{result.added === 1 ? "" : "s"} added · {result.emails} welcome email{result.emails === 1 ? "" : "s"} sent{result.errors ? ` · ${result.errors} error${result.errors === 1 ? "" : "s"}` : ""}</p>
              {result.errors > 0 && <p className="text-xs text-amber-700 mt-2">{result.errors} row{result.errors === 1 ? "" : "s"} couldn't be enrolled. They were skipped — re-upload just those rows to retry.</p>}
              <div className="flex justify-center gap-2 mt-4">
                <button onClick={reset} className="text-sm font-medium border border-stone-300 text-stone-700 px-4 py-2 rounded-lg hover:border-stone-400">Import more</button>
                <button onClick={onClose} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-5 py-2 rounded-lg">Done</button>
              </div>
            </div>
          ) : !rows ? (
            /* ---- Step 1: template + upload ---- */
            <>
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
                <p className="text-sm font-medium text-stone-900 mb-1">1. Download the template</p>
                <p className="text-xs text-stone-500 mb-3">Columns: child_name, dob, gender, relation, parent_email, parent_name, class_name. <span className="text-stone-400">child_name and parent_email are required; dob is YYYY-MM-DD or DD/MM/YYYY; class_name must match one of your class names (leave blank to enrol later).</span></p>
                <button onClick={downloadTemplate} className="text-sm font-medium border border-stone-300 text-stone-700 hover:border-emerald-300 hover:text-emerald-700 px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Download size={14} /> Download CSV template</button>
                {activeClasses.length > 0 && <p className="text-[11px] text-stone-400 mt-2">Your classes: {activeClasses.map((c) => c.name).join(", ")}</p>}
              </div>
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
                <p className="text-sm font-medium text-stone-900 mb-1">2. Upload your completed file</p>
                <p className="text-xs text-stone-500 mb-3">We'll validate every row before anything is created.</p>
                <button onClick={() => fileRef.current?.click()} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Upload size={14} /> Choose CSV file</button>
                <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
                {fileName && !parseError && <span className="text-xs text-stone-500 ml-3">{fileName}</span>}
              </div>
              {parseError && <p className="text-sm text-rose-700 flex items-start gap-1.5"><AlertCircle size={15} className="mt-0.5 shrink-0" /> {parseError}</p>}
            </>
          ) : (
            /* ---- Step 2: preview + confirm ---- */
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <button onClick={reset} disabled={importing} className="text-sm text-stone-600 hover:text-stone-900 inline-flex items-center gap-1 disabled:opacity-40"><ChevronLeft size={15} /> Choose a different file</button>
                <div className="flex items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={13} /> {valid.length} valid</span>
                  {invalid.length > 0 && <span className="inline-flex items-center gap-1 text-rose-700"><AlertTriangle size={13} /> {invalid.length} with errors</span>}
                </div>
              </div>

              <div className="border border-stone-200 rounded-xl overflow-hidden">
                <div className="max-h-[44vh] overflow-y-auto">
                  <table className="hidden md:table w-full text-xs">
                    <thead className="bg-stone-50 text-stone-500 sticky top-0">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-medium">Row</th><th className="px-3 py-2 font-medium">Child</th>
                        <th className="px-3 py-2 font-medium">DOB</th><th className="px-3 py-2 font-medium">Parent email</th>
                        <th className="px-3 py-2 font-medium">Class</th><th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const ok = r.errors.length === 0;
                        return (
                          <tr key={r.rowNum} className={`border-t border-stone-100 ${ok ? "bg-emerald-50/40" : "bg-rose-50/50"}`}>
                            <td className="px-3 py-2 text-stone-400">{r.rowNum}</td>
                            <td className="px-3 py-2 text-stone-800">{r.name || <span className="text-stone-400">—</span>}</td>
                            <td className="px-3 py-2 text-stone-600">{r.dobIso || <span className="text-stone-400">—</span>}</td>
                            <td className="px-3 py-2 text-stone-600 truncate max-w-[160px]">{r.email || <span className="text-stone-400">—</span>}</td>
                            <td className="px-3 py-2 text-stone-600">{r.classLabel}</td>
                            <td className="px-3 py-2">{ok
                              ? <span className="text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 size={12} /> Ready</span>
                              : <span className="text-rose-700 inline-flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {r.errors.join("; ")}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {/* Mobile — one card per CSV row */}
                  <div className="md:hidden divide-y divide-stone-100">
                    {rows.map((r) => {
                      const ok = r.errors.length === 0;
                      return (
                        <div key={r.rowNum} className={`px-3 py-2 ${ok ? "bg-emerald-50/40" : "bg-rose-50/50"}`}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium text-stone-800 truncate"><span className="text-stone-400">#{r.rowNum}</span> {r.name || <span className="text-stone-400">—</span>}</p>
                            {ok
                              ? <span className="text-[11px] text-emerald-700 inline-flex items-center gap-1 shrink-0"><CheckCircle2 size={11} /> Ready</span>
                              : <span className="text-[11px] text-rose-700 inline-flex items-center gap-1 shrink-0"><AlertTriangle size={11} /> Error</span>}
                          </div>
                          <p className="text-[11px] text-stone-500 truncate">{r.dobIso || "—"} · {r.email || "—"} · {r.classLabel}</p>
                          {!ok && <p className="text-[11px] text-rose-700 mt-0.5">{r.errors.join("; ")}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {invalid.length > 0 && <p className="text-xs text-stone-500">Rows with errors are skipped. Fix them in your spreadsheet and re-upload, or proceed with the {valid.length} valid row{valid.length === 1 ? "" : "s"} now.</p>}

              {importing ? (
                <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
                  <p className="text-sm text-stone-700 inline-flex items-center gap-2 mb-2"><Loader2 size={15} className="animate-spin text-emerald-700" /> Enrolling students &amp; emailing parents… {progress.done}/{progress.total}</p>
                  <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden"><div className="h-full bg-emerald-600 rounded-full transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} /></div>
                </div>
              ) : (
                <div className="flex justify-end gap-2">
                  <button onClick={onClose} className="text-sm font-medium border border-stone-300 text-stone-700 px-4 py-2 rounded-lg hover:border-stone-400">Cancel</button>
                  <button onClick={runImport} disabled={!valid.length} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5"><Check size={15} /> Import {valid.length} student{valid.length === 1 ? "" : "s"}</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MadrasaImportStudents;
