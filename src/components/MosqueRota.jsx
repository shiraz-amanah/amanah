import { useState, useEffect } from "react";
import { CalendarDays, Clock, Search, Loader2 } from "lucide-react";
import MosqueRotaBuilder from "./MosqueRotaBuilder";
import MosqueTimesheets from "./MosqueTimesheets";
import MosqueSubstituteFinder from "./MosqueSubstituteFinder";
import MosqueCoverRequest from "./MosqueCoverRequest";
import { createMosqueStaff, getCoverRequestsForMosque } from "../auth";

// Session W — Rota tab. Hosts the weekly rota builder, timesheets, and the
// substitute finder (moved here from the Staff directory). "Request cover"
// now opens the structured cover-request popup (cover_requests) instead of a
// message thread; sent requests + their status are listed below.

const SUBS = [["rota", "Rota", CalendarDays], ["timesheets", "Timesheets", Clock], ["finder", "Find substitute", Search]];
const todayStr = () => new Date().toISOString().slice(0, 10);
const STATUS_CLS = {
  requested: "bg-stone-50 border-stone-200 text-stone-500",
  confirmed: "bg-emerald-50 border-emerald-200 text-emerald-700",
  declined: "bg-rose-50 border-rose-200 text-rose-700",
};

const MosqueRota = ({ mosqueId, mosque }) => {
  const [sub, setSub] = useState("rota");
  const [coverScholar, setCoverScholar] = useState(null);
  const [requests, setRequests] = useState([]);
  const [reqLoading, setReqLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const loadRequests = () => {
    setReqLoading(true);
    getCoverRequestsForMosque(mosqueId)
      .then(setRequests)
      .catch((e) => console.error("cover requests load failed:", e))
      .finally(() => setReqLoading(false));
  };
  useEffect(() => { if (sub === "finder") loadRequests(); /* eslint-disable-next-line */ }, [sub, mosqueId]);

  const addTempFromScholar = async (sch) => {
    const { error } = await createMosqueStaff({
      mosqueId, name: sch.name, role: sch.title || "Cover", staff_type: "temporary",
      linked_scholar_id: sch.id, start_date: todayStr(),
      dbs_status: sch.dbs_verified ? "verified" : "not_checked",
    });
    if (error) { setToast("Couldn't add temp record."); return; }
    setToast(`${sch.name} added as temporary cover.`);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Rota</h2>
        <p className="text-sm text-stone-600">Weekly rota, timesheets and cover.</p>
      </div>

      <div className="flex gap-1 border-b border-stone-200 mb-5 overflow-x-auto">
        {SUBS.map(([v, l, Icon]) => (
          <button key={v} onClick={() => setSub(v)} className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap inline-flex items-center gap-1.5 ${sub === v ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}><Icon size={14} /> {l}</button>
        ))}
      </div>

      {toast && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-4">{toast}</p>}

      {sub === "rota" && <MosqueRotaBuilder mosqueId={mosqueId} />}
      {sub === "timesheets" && <MosqueTimesheets mosqueId={mosqueId} mosqueName={mosque?.name} />}
      {sub === "finder" && (
        <div className="space-y-6">
          <MosqueSubstituteFinder mosque={mosque} onRequestCover={(s) => setCoverScholar(s)} onAddToTemp={addTempFromScholar} />

          <div>
            <h3 className="text-sm font-semibold text-stone-900 mb-2">Cover requests</h3>
            {reqLoading ? <div className="flex justify-center py-4 text-stone-400"><Loader2 size={16} className="animate-spin" /></div>
              : requests.length === 0 ? <p className="text-sm text-stone-500">No cover requests sent yet.</p>
              : <ul className="divide-y divide-stone-100 bg-white border border-stone-200 rounded-2xl">{requests.map((r) => (
                  <li key={r.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-stone-800 truncate">{r.scholar?.name || "Scholar"}</p>
                      <p className="text-xs text-stone-500 truncate">{[...(r.cover_type || []), ...(r.sessions || [])].join(", ") || "—"}{r.date_from ? ` · ${r.date_from}${r.date_to ? `–${r.date_to}` : ""}` : ""}</p>
                    </div>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap capitalize ${STATUS_CLS[r.status] || STATUS_CLS.requested}`}>{r.status}</span>
                  </li>
                ))}</ul>}
          </div>
        </div>
      )}

      {coverScholar && (
        <MosqueCoverRequest
          scholar={coverScholar}
          mosqueId={mosqueId}
          onClose={() => setCoverScholar(null)}
          onSent={() => { setCoverScholar(null); setToast("Cover request sent."); loadRequests(); }}
        />
      )}
    </div>
  );
};

export default MosqueRota;
