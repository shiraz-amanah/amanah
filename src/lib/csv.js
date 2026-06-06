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
