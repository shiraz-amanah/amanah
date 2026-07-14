import { useState, useEffect } from "react";
import { Loader2, Check, X, CalendarClock, MapPin } from "lucide-react";
import { getCoverRequestsForScholar, updateCoverRequestStatus } from "../auth";

// Session W (7b) — recipient-facing cover requests. Lists structured requests
// sent by mosques; the recipient accepts or declines (updates cover_requests
// status under the 143 "Recipient respond" RLS, keyed on recipient_profile_id).
// On accept the mosque adds them to its temp staff from its own Rota → cover list.

const STATUS_CLS = {
  requested: "bg-amber-50 border-amber-200 text-amber-700",
  confirmed: "bg-success-50 border-success-200 text-success-700", // Job A: positive status -> success-*

  declined: "bg-stone-50 border-stone-200 text-stone-500",
};

const ScholarCoverRequests = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    setLoading(true);
    getCoverRequestsForScholar().then(setRows).catch((e) => console.error("cover load failed:", e)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const respond = async (id, status) => {
    setBusyId(id);
    const { error } = await updateCoverRequestStatus(id, status);
    setBusyId(null);
    if (!error) setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Cover requests</h2>
        <p className="text-sm text-stone-600">Mosques asking you to cover a period. Accept or decline below.</p>
      </div>

      {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
        : rows.length === 0 ? <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center"><CalendarClock className="mx-auto text-stone-300 mb-3" size={36} /><p className="text-stone-600 text-sm">No cover requests yet.</p></div>
        : (
        <ul className="space-y-3">{rows.map((r) => (
          <li key={r.id} className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <p className="font-semibold text-stone-900">{r.mosque?.name || "A mosque"}</p>
                {r.mosque?.city && <p className="text-xs text-stone-500 flex items-center gap-1"><MapPin size={11} /> {r.mosque.city}</p>}
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap capitalize ${STATUS_CLS[r.status] || STATUS_CLS.requested}`}>{r.status}</span>
            </div>
            <div className="text-sm text-stone-700 space-y-1">
              {(r.cover_type?.length > 0) && <p><span className="text-stone-500">Type:</span> {r.cover_type.join(", ")}</p>}
              {(r.sessions?.length > 0) && <p><span className="text-stone-500">Sessions:</span> {r.sessions.join(", ")}</p>}
              {(r.date_from || r.date_to) && <p><span className="text-stone-500">Dates:</span> {r.date_from || "—"}{r.date_to ? ` to ${r.date_to}` : ""}</p>}
              {r.notes && <p className="text-stone-600">{r.notes}</p>}
            </div>
            {r.status === "requested" && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-stone-100">
                <button onClick={() => respond(r.id, "confirmed")} disabled={busyId === r.id} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busyId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Accept</button>
                <button onClick={() => respond(r.id, "declined")} disabled={busyId === r.id} className="border border-stone-300 hover:border-stone-400 text-stone-700 text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><X size={14} /> Decline</button>
              </div>
            )}
          </li>
        ))}</ul>
      )}
    </div>
  );
};

export default ScholarCoverRequests;
