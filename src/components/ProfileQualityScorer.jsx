import { useState, useEffect, useRef } from "react";
import { Sparkles, CheckCircle2, RefreshCw, Loader2 } from "lucide-react";

// AI profile-quality scorer for the scholar dashboard. Self-contained:
// on "Analyse my profile" it POSTs the scholar's real data to
// /api/score-profile and renders the score, grade, summary, strengths and
// prioritised improvements. Degrades gracefully if the API is unavailable
// (including local `npm run dev` where the /api route 404s).

// Map the snake_case scholar row (as held by ScholarDashboard) to the
// camelCase payload the scoring function expects.
function toPayload(s) {
  return {
    name: s?.name ?? null,
    bio: s?.bio ?? null,
    title: s?.title ?? null,
    city: s?.city ?? null,
    categories: s?.categories ?? [],
    languages: s?.languages ?? [],
    packages: s?.packages ?? [],
    rating: s?.rating ?? null,
    reviewCount: s?.review_count ?? 0,
    dbsVerified: !!s?.dbs_verified,
    ijazahVerified: !!s?.ijazah_verified,
  };
}

const scoreColour = (n) => {
  if (n >= 80) return { ring: "text-emerald-600", text: "text-emerald-700", bg: "bg-emerald-50" };
  if (n >= 60) return { ring: "text-amber-500", text: "text-amber-700", bg: "bg-amber-50" };
  return { ring: "text-rose-500", text: "text-rose-700", bg: "bg-rose-50" };
};

const PRIORITY_STYLES = {
  high: { dot: "bg-rose-500", chip: "bg-rose-100 text-rose-700", border: "border-rose-200" },
  medium: { dot: "bg-amber-500", chip: "bg-amber-100 text-amber-700", border: "border-amber-200" },
  low: { dot: "bg-stone-400", chip: "bg-stone-100 text-stone-600", border: "border-stone-200" },
};

// Circular score gauge (SVG ring).
const ScoreCircle = ({ score }) => {
  const c = scoreColour(score);
  const r = 34;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className="relative w-24 h-24 flex-shrink-0">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeWidth="7" className="text-stone-100" />
        <circle
          cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round"
          className={c.ring}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-semibold ${c.text}`} style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{score}</span>
        <span className="text-[10px] text-stone-400 -mt-0.5">/ 100</span>
      </div>
    </div>
  );
};

const ProfileQualityScorer = ({ scholar }) => {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const analyse = () => {
    setLoading(true);
    setError(false);
    fetch("/api/score-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scholar: toPayload(scholar) }),
    })
      .then((res) => res.json().catch(() => ({})))
      .then((body) => {
        if (body?.ok && body.result) setResult(body.result);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  // Auto re-analyse after a profile save. We only re-run once the scholar has
  // already been analysed (a result exists) so we don't fire spurious API calls
  // on first mount or in local dev (where /api/score-profile 404s). Keyed on a
  // content signature so it fires when the editor's onScholarUpdate refreshes
  // the row — not on every render. `analysedRef` avoids re-running on the result
  // state change itself (which would loop).
  const analysedRef = useRef(false);
  useEffect(() => { if (result) analysedRef.current = true; }, [result]);
  const sig = JSON.stringify(toPayload(scholar));
  useEffect(() => {
    if (analysedRef.current && !loading) analyse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const grade = result?.grade;
  const c = result ? scoreColour(result.score) : null;

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6 mb-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <Sparkles className="text-emerald-700" size={16} />
          </div>
          <h3 className="text-base font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Profile quality</h3>
        </div>
        {result && !loading && (
          <button onClick={analyse} className="flex items-center gap-1.5 text-xs font-medium text-emerald-800 hover:text-emerald-900 transition-colors">
            <RefreshCw size={13} /> Re-analyse
          </button>
        )}
      </div>

      {!result && !loading && !error && (
        <>
          <p className="text-sm text-stone-600 mb-4">See how your profile looks to parents and get AI suggestions to improve it.</p>
          <button onClick={analyse} className="inline-flex items-center gap-2 bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all hover:scale-[1.02] active:scale-95">
            <Sparkles size={15} /> Analyse my profile
          </button>
        </>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-stone-500 py-4">
          <Loader2 size={16} className="animate-spin" /> Analysing your profile…
        </div>
      )}

      {error && !loading && (
        <div className="py-2">
          <p className="text-sm text-stone-500 mb-3">Profile analysis is unavailable right now.</p>
          <button onClick={analyse} className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800 hover:text-emerald-900">
            <RefreshCw size={13} /> Try again
          </button>
        </div>
      )}

      {result && !loading && (
        <div className="mt-3">
          {/* Score + grade + summary */}
          <div className="flex items-start gap-4 mb-5">
            <ScoreCircle score={result.score} />
            <div className="flex-1 min-w-0">
              {grade && (
                <span className={`inline-block text-sm font-semibold px-2.5 py-0.5 rounded-full mb-1.5 ${c.bg} ${c.text}`}>
                  Grade {grade}
                </span>
              )}
              <p className="text-sm text-stone-700 leading-relaxed">{result.summary}</p>
            </div>
          </div>

          {/* Strengths */}
          {Array.isArray(result.strengths) && result.strengths.length > 0 && (
            <div className="mb-5">
              <p className="text-xs uppercase tracking-wider text-stone-500 font-medium mb-2">Strengths</p>
              <ul className="space-y-1.5">
                {result.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-stone-700">
                    <CheckCircle2 size={15} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Improvements */}
          {Array.isArray(result.improvements) && result.improvements.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-stone-500 font-medium mb-2">Suggested improvements</p>
              <div className="space-y-2.5">
                {result.improvements.map((imp, i) => {
                  const p = PRIORITY_STYLES[imp.priority] || PRIORITY_STYLES.low;
                  return (
                    <div key={i} className={`border ${p.border} rounded-xl p-3.5`}>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${p.chip}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`}></span>
                          {imp.priority}
                        </span>
                        <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">{imp.field}</span>
                      </div>
                      <p className="text-sm text-stone-800">{imp.issue}</p>
                      <p className="text-sm text-stone-600 mt-1">{imp.suggestion}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProfileQualityScorer;
