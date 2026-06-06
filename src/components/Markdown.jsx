// Minimal, dependency-free Markdown renderer for AI assistant output. Handles
// the subset the model emits — ## headings, **bold**, *italic*, `code`,
// - / 1. lists, and GitHub-style | tables |. Renders to plain React elements
// (no dangerouslySetInnerHTML), so it's XSS-safe by construction and needs no
// sanitizer dependency. Anything it doesn't recognise falls through as text.

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g;

function renderInline(text, kp) {
  return String(text).split(INLINE).map((part, i) => {
    if (!part) return null;
    const key = `${kp}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={key} className="font-semibold text-stone-900">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={key} className="px-1 py-0.5 bg-stone-100 rounded text-[0.85em] font-mono">{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={key}>{part.slice(1, -1)}</em>;
    return <span key={key}>{part}</span>;
  });
}

const splitRow = (row) => row.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((s) => s.trim());
const isSeparator = (line) => line && line.includes("-") && /^\s*\|?[\s:|-]+\|?\s*$/.test(line);
const isHeading = (l) => /^#{1,6}\s+/.test(l);
const isUl = (l) => /^\s*[-*]\s+/.test(l);
const isOl = (l) => /^\s*\d+\.\s+/.test(l);

function parse(text) {
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { blocks.push({ type: "h", level: h[1].length, text: h[2] }); i++; continue; }

    // Table: a row with pipes followed by a dash separator row.
    if (line.includes("|") && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) { rows.push(splitRow(lines[i])); i++; }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    if (isUl(line)) {
      const items = [];
      while (i < lines.length && isUl(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, "")); i++; }
      blocks.push({ type: "ul", items });
      continue;
    }
    if (isOl(line)) {
      const items = [];
      while (i < lines.length && isOl(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, "")); i++; }
      blocks.push({ type: "ol", items });
      continue;
    }

    // Paragraph — gather consecutive non-blank, non-block lines.
    const para = [line]; i++;
    while (i < lines.length && lines[i].trim() && !isHeading(lines[i]) && !isUl(lines[i]) && !isOl(lines[i]) && !lines[i].includes("|")) { para.push(lines[i]); i++; }
    blocks.push({ type: "p", text: para.join(" ") });
  }
  return blocks;
}

const Markdown = ({ text, className = "" }) => {
  if (!text) return null;
  const blocks = parse(text);
  return (
    <div className={`space-y-2 text-sm text-stone-700 leading-relaxed ${className}`}>
      {blocks.map((b, i) => {
        if (b.type === "h") {
          const cls = b.level <= 2 ? "text-sm font-semibold text-stone-900 mt-1" : "text-[13px] font-semibold text-stone-800";
          return <p key={i} className={cls}>{renderInline(b.text, `h${i}`)}</p>;
        }
        if (b.type === "ul") return <ul key={i} className="list-disc pl-5 space-y-1">{b.items.map((it, j) => <li key={j}>{renderInline(it, `ul${i}-${j}`)}</li>)}</ul>;
        if (b.type === "ol") return <ol key={i} className="list-decimal pl-5 space-y-1">{b.items.map((it, j) => <li key={j}>{renderInline(it, `ol${i}-${j}`)}</li>)}</ol>;
        if (b.type === "table") {
          return (
            <div key={i} className="overflow-x-auto">
              <table className="w-full text-[13px] border border-stone-200 rounded-lg overflow-hidden">
                <thead className="bg-stone-50">
                  <tr>{b.header.map((c, j) => <th key={j} className="text-left font-semibold text-stone-700 px-2.5 py-1.5 border-b border-stone-200">{renderInline(c, `th${i}-${j}`)}</th>)}</tr>
                </thead>
                <tbody>
                  {b.rows.map((row, r) => (
                    <tr key={r} className="border-b border-stone-100 last:border-0">
                      {row.map((c, j) => <td key={j} className="px-2.5 py-1.5 align-top text-stone-700">{renderInline(c, `td${i}-${r}-${j}`)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={i}>{renderInline(b.text, `p${i}`)}</p>;
      })}
    </div>
  );
};

export default Markdown;
