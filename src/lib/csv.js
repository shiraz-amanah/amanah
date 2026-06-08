// Native CSV / JSON export (Phase 3E). No papaparse — RFC-4180 quoting: wrap a
// field in double quotes if it contains a comma, quote or newline, and double any
// internal quotes. columns: [{ label, key } | { label, get(row) }].
function cell(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows, columns) {
  const head = columns.map((c) => cell(c.label)).join(",");
  const body = (rows || []).map((r) =>
    columns.map((c) => cell(typeof c.get === "function" ? c.get(r) : r[c.key])).join(",")
  ).join("\r\n");
  return body ? `${head}\r\n${body}` : head;
}

function save(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function downloadCSV(filename, rows, columns) {
  save(filename, toCSV(rows, columns), "text/csv;charset=utf-8;");
}

export function downloadJSON(filename, obj) {
  save(filename, JSON.stringify(obj, null, 2), "application/json;charset=utf-8;");
}

// RFC-4180 CSV parser (no papaparse). Handles quoted fields, embedded commas,
// embedded newlines, and "" escaped quotes. Returns { headers, rows } where each
// row is an object keyed by the (trimmed, lower-cased) header. Strips a UTF-8 BOM
// and tolerates both \r\n and \n line endings.
export function parseCSV(text) {
  const records = [];
  let field = "", row = [], inQuotes = false;
  const s = (text || "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); records.push(row); field = ""; row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); records.push(row); }
  // Drop fully-empty trailing lines.
  const clean = records.filter((r) => r.some((v) => (v || "").trim() !== ""));
  if (!clean.length) return { headers: [], rows: [] };
  const headers = clean[0].map((h) => (h || "").trim().toLowerCase());
  const rows = clean.slice(1).map((r) => {
    const o = {};
    headers.forEach((h, idx) => { o[h] = (r[idx] ?? "").trim(); });
    return o;
  });
  return { headers, rows };
}
