import { useState, useEffect, useMemo } from "react";
import { Loader2, Hourglass, UserPlus, X, Mail, Phone, Clock, ListOrdered } from "lucide-react";
import { getMosqueWaitlist, cancelWaitlist } from "../auth";
import { sendMadrasaWaitlistOfferSpecific } from "../lib/email";

// Universal (cross-class) waiting-list console — mosque owner only. One view of
// every LIVE (waiting/offered) request across all classes, from the
// get_mosque_waitlist RPC (parent contact resolved server-side). The admin can
// offer a freed seat to ANY row (madrasa_waitlist_offer_specific — skips the
// queue) or remove a request. No reordering here (that stays per-class); this is
// the birds-eye console, not the per-class queue editor.

const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const countdown = (iso) => {
  if (!iso) return "offered";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h >= 1 ? `expires in ${h}h ${m}m` : `expires in ${m}m`;
};

const MadrasaWaitingList = ({ mosqueId }) => {
  const [rows, setRows] = useState(null);       // null = loading
  const [classFilter, setClassFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState("");

  const load = () => {
    getMosqueWaitlist(mosqueId)
      .then((r) => setRows(r || []))
      .catch((e) => { console.error("mosque waitlist load failed:", e); setRows([]); });
  };
  useEffect(() => { setRows(null); setMsg(""); setClassFilter("all"); load(); /* eslint-disable-next-line */ }, [mosqueId]);

  // Distinct classes present in the list → filter chips.
  const classes = useMemo(() => {
    const m = new Map();
    for (const r of rows || []) if (!m.has(r.class_id)) m.set(r.class_id, r.class_name || "Class");
    return [...m.entries()];
  }, [rows]);
  const shown = (rows || []).filter((r) => classFilter === "all" || r.class_id === classFilter);

  const offer = async (r) => {
    if (busyId) return;
    setBusyId(r.waitlist_id); setMsg("");
    const res = await sendMadrasaWaitlistOfferSpecific(r.waitlist_id).catch(() => ({ ok: false }));
    setBusyId(null);
    if (!res?.ok) setMsg("Couldn't make an offer just now.");
    else if (!res.offered) setMsg(`No free seat in ${r.class_name || "that class"} right now — a place must open up first.`);
    else if (res.sent) setMsg(`Seat offered to ${r.student_name} — email sent to the parent.`);
    else setMsg(`Seat offered to ${r.student_name} — that parent has email off, so please let them know directly.`);
    load();
  };

  const remove = async (r) => {
    if (busyId) return;
    setBusyId(r.waitlist_id); setMsg("");
    const { error } = await cancelWaitlist(r.waitlist_id);
    setBusyId(null);
    if (error) { setMsg("Couldn't remove that request."); return; }
    setMsg(`${r.student_name} removed from the waiting list.`);
    load();
  };

  return (
    <div>
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-stone-900 inline-flex items-center gap-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
          <Hourglass size={18} className="text-emerald-700" /> Waiting list
        </h3>
        <p className="text-sm text-stone-600 mt-0.5">Every pending request across your classes. Offer a freed seat, or remove a request.</p>
      </div>

      {msg && <div className="mb-4 text-sm bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl px-3 py-2">{msg}</div>}

      {rows == null ? (
        <div className="flex justify-center py-16 text-stone-400"><Loader2 size={22} className="animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center">
          <ListOrdered className="mx-auto text-stone-300 mb-3" size={40} />
          <p className="text-stone-600 text-sm max-w-md mx-auto">No one is on the waiting list. When a class is full, parents can join its waiting list from their Amanah dashboard.</p>
        </div>
      ) : (
        <>
          {/* Class filter */}
          {classes.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-4">
              <button onClick={() => setClassFilter("all")} className={`text-[12px] font-medium px-3 py-1.5 rounded-full border whitespace-nowrap ${classFilter === "all" ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}>
                All classes <span className="text-stone-400">{rows.length}</span>
              </button>
              {classes.map(([cid, cname]) => (
                <button key={cid} onClick={() => setClassFilter(cid)} className={`text-[12px] font-medium px-3 py-1.5 rounded-full border whitespace-nowrap ${classFilter === cid ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}>
                  {cname} <span className="text-stone-400">{rows.filter((r) => r.class_id === cid).length}</span>
                </button>
              ))}
            </div>
          )}

          <div className="space-y-2">
            {shown.map((r) => {
              const offered = r.status === "offered";
              const busy = busyId === r.waitlist_id;
              return (
                <div key={r.waitlist_id} className="bg-white border border-stone-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span className="mt-0.5 text-xs font-semibold text-stone-400 w-6 text-center shrink-0" title="Position in this class's queue">#{r.queue_position}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-stone-900 truncate">{r.student_name || "Student"}</p>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">{r.class_name || "Class"}</span>
                        {offered && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 inline-flex items-center gap-1">
                            <Clock size={11} /> {countdown(r.offer_expires_at)}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-stone-500 mt-0.5">Requested {fmtDate(r.created_at)}{r.parent_name ? ` · ${r.parent_name}` : ""}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {r.parent_email && <a href={`mailto:${r.parent_email}`} className="text-[11px] text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1"><Mail size={11} /> {r.parent_email}</a>}
                        {r.parent_phone && <a href={`tel:${r.parent_phone}`} className="text-[11px] text-stone-600 hover:text-stone-900 inline-flex items-center gap-1"><Phone size={11} /> {r.parent_phone}</a>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => offer(r)} disabled={busy || offered}
                      title={offered ? "Already offered — awaiting the parent's response" : "Offer a freed seat to this child"}
                      className="inline-flex items-center gap-1.5 text-sm font-medium bg-emerald-900 text-white px-3.5 py-2 rounded-lg disabled:opacity-40 hover:bg-emerald-800">
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} {offered ? "Offered" : "Offer seat"}
                    </button>
                    <button onClick={() => remove(r)} disabled={busy} title="Remove from the waiting list"
                      className="inline-flex items-center gap-1 text-sm font-medium border border-stone-300 text-stone-600 hover:border-rose-300 hover:text-rose-700 px-3 py-2 rounded-lg disabled:opacity-40">
                      <X size={14} /> Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {shown.length === 0 && <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-sm text-stone-500">No requests for this class.</div>}
        </>
      )}
    </div>
  );
};

export default MadrasaWaitingList;
