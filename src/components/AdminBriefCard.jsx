import { useState, useEffect } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { fmt } from "../lib/format";

// AI-generated admin morning brief. Self-contained: fetches /api/admin-brief
// on mount, shows a skeleton while loading, renders the brief + stat pills,
// and offers a refresh. Degrades to "Brief unavailable" on any failure
// (including local `npm run dev` where the /api route 404s).

const PILLS = [
  { key: "openFlags", label: "Open flags", urgent: true },
  { key: "pendingScholars", label: "Scholar apps" },
  { key: "pendingMosques", label: "Mosque apps" },
  { key: "dbsInProgress", label: "DBS in progress" },
  { key: "bookingsThisWeek", label: "Bookings · 7d" },
  { key: "donationsThisWeek", label: "Donations · 7d", money: true },
];

const AdminBriefCard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchBrief = () => {
    setLoading(true);
    setError(false);
    fetch("/api/admin-brief")
      .then((res) => res.json().catch(() => ({})))
      .then((body) => {
        if (body?.ok && body.brief) setData(body);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchBrief();
  }, []);

  return (
    <div className="bg-gradient-to-br from-emerald-50 via-white to-white border border-emerald-200 rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <Sparkles className="text-emerald-700" size={18} />
          </div>
          <h2 className="text-base font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>AI Brief</h2>
        </div>
        <button
          onClick={fetchBrief}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-medium text-emerald-800 hover:text-emerald-900 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="animate-pulse">
          <div className="h-3 bg-stone-200 rounded w-full mb-2"></div>
          <div className="h-3 bg-stone-200 rounded w-11/12 mb-2"></div>
          <div className="h-3 bg-stone-100 rounded w-3/4"></div>
        </div>
      ) : error ? (
        <p className="text-sm text-stone-500">Brief unavailable.</p>
      ) : (
        <>
          <p className="text-sm text-stone-700 leading-relaxed">{data.brief}</p>
          <div className="flex flex-wrap gap-2 mt-4">
            {PILLS.map(({ key, label, urgent, money }) => {
              const value = data.stats?.[key] ?? 0;
              const isUrgent = urgent && value > 0;
              return (
                <span
                  key={key}
                  className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${isUrgent ? "bg-rose-100 text-rose-700" : "bg-stone-100 text-stone-700"}`}
                >
                  {label}
                  <span className="font-semibold">{money ? fmt(value) : value}</span>
                </span>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default AdminBriefCard;
