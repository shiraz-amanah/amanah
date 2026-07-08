import LegalFooter from "../components/LegalFooter";

// Shared chrome + prose helpers for the static legal pages (Privacy / Terms /
// Cookies). `header` is the shared <PublicHeader> element passed from App (same
// pattern as MosqueProfile — PublicHeader depends on App-local AudienceDrawer).
// Content pages compose the helpers below so the three policies stay consistent.

export const H1 = ({ children }) => (
  <h1 className="text-3xl md:text-4xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{children}</h1>
);
export const H2 = ({ children }) => (
  <h2 className="text-xl font-semibold text-stone-900 mt-9 mb-3" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{children}</h2>
);
export const H3 = ({ children }) => (
  <h3 className="text-base font-semibold text-stone-800 mt-6 mb-2">{children}</h3>
);
export const P = ({ children }) => (
  <p className="text-sm leading-relaxed text-stone-600 mb-4">{children}</p>
);
export const UL = ({ children }) => (
  <ul className="list-disc pl-5 space-y-1.5 text-sm leading-relaxed text-stone-600 mb-4">{children}</ul>
);
export const HR = () => <hr className="my-8 border-stone-200" />;
export const A = ({ href, children }) => (
  <a href={href} className="text-emerald-700 hover:underline" target={href?.startsWith("http") ? "_blank" : undefined} rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}>{children}</a>
);
export const Table = ({ head, rows }) => (
  <div className="overflow-x-auto mb-4">
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr>{head.map((h, i) => <th key={i} className="text-left font-semibold text-stone-700 border-b border-stone-300 py-2 pr-4 align-bottom">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className="align-top">{r.map((c, ci) => <td key={ci} className="border-b border-stone-100 py-2 pr-4 text-stone-600">{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  </div>
);

const PolicyLayout = ({ header, children }) => (
  <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
    {header}
    <main className="max-w-3xl mx-auto px-5 md:px-6 py-10 md:py-14">
      <article>{children}</article>
    </main>
    <div className="max-w-3xl mx-auto px-5 md:px-6 pb-10 pt-6 border-t border-stone-200">
      <LegalFooter />
    </div>
  </div>
);

export default PolicyLayout;
