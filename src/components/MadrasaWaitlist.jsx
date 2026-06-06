import { useState, useEffect } from "react";
import { Loader2, Clock, ArrowUp, ArrowDown, UserPlus, ListOrdered } from "lucide-react";
import { getMadrasaRoster, getClassWaitlist, reorderWaitlist } from "../auth";
import { sendMadrasaWaitlistOffer } from "../lib/email";

// Relative 48h-offer countdown, computed at render (refresh re-derives it).
const countdown = (iso) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h >= 1 ? `expires in ${h}h ${m}m` : `expires in ${m}m`;
};

// Admin/teacher waiting-list panel for one class (081 RLS). Shows seats, the
// position-ordered queue (admin reorders with ▲/▼), and any live offers with
// their 48h countdown. "Offer next seat" fires the make_next_offer RPC via the
// madrasa_waitlist_offer email intent (server-side reap + capacity gate).
const MadrasaWaitlist = ({ classObj }) => {
  const [activeCount, setActiveCount] = useState(0);
  const [waiting, setWaiting] = useState([]);
  const [offered, setOffered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offering, setOffering] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([getMadrasaRoster(classObj.id), getClassWaitlist(classObj.id)])
      .then(([roster, wl]) => {
        setActiveCount((roster || []).filter((e) => e.status === "active").length);
        setWaiting((wl || []).filter((r) => r.status === "waiting"));
        setOffered((wl || []).filter((r) => r.status === "offered"));
      })
      .catch((e) => console.error("waitlist load failed:", e))
      .finally(() => setLoading(false));
  };
  useEffect(() => { setMsg(""); load(); /* eslint-disable-next-line */ }, [classObj.id]);

  const cap = classObj.capacity;
  const taken = activeCount + offered.length;
  const freeSeat = cap == null || taken < cap;

  const offerNext = async () => {
    if (offering || waiting.length === 0) return;
    setOffering(true); setMsg("");
    const r = await sendMadrasaWaitlistOffer(classObj.id).catch(() => ({ ok: false }));
    setOffering(false);
    if (!r?.ok) setMsg("Couldn't make an offer just now.");
    else if (!r.offered) setMsg(freeSeat ? "The waiting list is empty." : "No free seat right now.");
    else if (r.sent) setMsg("Offered the place to the next child — email sent.");
    else setMsg("Offered the place — that parent has email turned off, so please let them know directly.");
    load();
  };

  // Swap a waiting row's position with its neighbour, then refetch.
  const move = async (index, dir) => {
    const j = index + dir;
    if (reordering || j < 0 || j >= waiting.length) return;
    setReordering(true);
    const a = waiting[index], b = waiting[j];
    await reorderWaitlist(a.id, b.position);
    await reorderWaitlist(b.id, a.position);
    setReordering(false);
    load();
  };

  const nameOf = (r) => r.student?.name || "Student";

  if (loading) return <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>;

  return (
    <div className="space-y-5">
      {/* Seats + offer action */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-stone-700">
          <span className="font-medium text-stone-900">{activeCount}{cap != null ? `/${cap}` : ""}</span> enrolled
          {cap == null && <span className="text-stone-400"> · no cap</span>}
          <span className="text-stone-400"> · </span>
          {waiting.length} waiting{offered.length > 0 ? ` · ${offered.length} offered` : ""}
        </div>
        <button onClick={offerNext} disabled={offering || waiting.length === 0}
          className="inline-flex items-center gap-1.5 text-sm font-medium bg-emerald-900 text-white px-4 py-2 rounded-lg disabled:opacity-40 hover:bg-emerald-800">
          {offering ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Offer next seat
        </button>
      </div>
      {msg && <p className="text-xs text-stone-600 -mt-2">{msg}</p>}

      {/* Live offers */}
      {offered.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-2">Outstanding offers</p>
          <ul className="space-y-2">{offered.map((r) => (
            <li key={r.id} className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-stone-900 truncate">{nameOf(r)}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full border bg-white border-amber-200 text-amber-700 inline-flex items-center gap-1 shrink-0">
                <Clock size={11} /> {r.offer_expires_at ? countdown(r.offer_expires_at) : "offered"}
              </span>
            </li>
          ))}</ul>
        </div>
      )}

      {/* Waiting queue */}
      {waiting.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
          <ListOrdered className="mx-auto text-stone-300 mb-3" size={36} />
          <p className="text-stone-600 text-sm max-w-md mx-auto">No one is waiting. When this class is full, parents can join the waiting list from their Amanah dashboard.</p>
        </div>
      ) : (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-2">Waiting list</p>
          <ul className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">{waiting.map((r, i) => (
            <li key={r.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-medium text-stone-400 w-5 text-center shrink-0">{i + 1}</span>
                <span className="font-medium text-stone-900 truncate">{nameOf(r)}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => move(i, -1)} disabled={reordering || i === 0} title="Move up"
                  className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent"><ArrowUp size={14} /></button>
                <button onClick={() => move(i, 1)} disabled={reordering || i === waiting.length - 1} title="Move down"
                  className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent"><ArrowDown size={14} /></button>
              </div>
            </li>
          ))}</ul>
        </div>
      )}
    </div>
  );
};

export default MadrasaWaitlist;
