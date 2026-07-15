import { useState, useEffect } from "react";
import {
  Loader2, Plus, Trash2, Pencil, AlertCircle, Check, X, CalendarCheck, Users, Clock,
  Building2, Archive, ArchiveRestore, ChevronRight, Ban, Inbox,
} from "lucide-react";
import {
  getMosqueFacilities, createMosqueFacility, updateMosqueFacility, deleteMosqueFacility,
  getMosqueBookings, setBookingStatus, cancelFacilityBooking,
} from "../auth";
import { sendFacilityBookingConfirmed, sendFacilityBookingCancelled } from "../lib/email";

// Mosque → Bookings. Three sections: Requests (pending queue, approve/reject),
// Calendar (approved bookings by date + facility), Facilities (register CRUD).
// Clash detection is enforced by the DB (105 EXCLUDE); approve surfaces a 23P01
// as a friendly message. Emails fire client-side (send-transactional intents).

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 outline-none text-sm";
const cardCls = "bg-white border border-stone-200 rounded-2xl p-5 md:p-6";
const money = (v) => (v == null ? null : `£${Number(v).toFixed(2)}`);
const fmtDay = (iso) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const fmtTime = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const dayKey = (iso) => new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const blankFac = { name: "", description: "", capacity: "", hourly_rate: "" };

const MosqueBookings = ({ mosqueId }) => {
  const [section, setSection] = useState("requests");
  const [facilities, setFacilities] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [showFac, setShowFac] = useState(false);
  const [fac, setFac] = useState(blankFac);
  const [facEditing, setFacEditing] = useState(null);
  const [facBusy, setFacBusy] = useState(false);

  const [rejecting, setRejecting] = useState(null); // booking id being rejected
  const [rejectNote, setRejectNote] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [facFilter, setFacFilter] = useState("all");

  const refresh = () => Promise.all([getMosqueFacilities(mosqueId), getMosqueBookings(mosqueId)])
    .then(([f, b]) => { setFacilities(f); setBookings(b); });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([getMosqueFacilities(mosqueId), getMosqueBookings(mosqueId)])
      .then(([f, b]) => { if (alive) { setFacilities(f); setBookings(b); } })
      .catch((e) => { if (alive) setErr(e?.message || "Couldn't load bookings."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  // ---- booking actions ----
  const approve = async (b) => {
    setErr(null); setBusyId(b.id);
    const { error } = await setBookingStatus(b.id, "approved");
    setBusyId(null);
    if (error) {
      setErr(error.code === "23P01"
        ? `"${b.facility?.name || "That space"}" is already booked for an overlapping time. Reject this, or ask them to pick another slot.`
        : (error.message || "Couldn't approve the booking."));
      return;
    }
    sendFacilityBookingConfirmed(b.id).catch(() => {});
    refresh();
  };
  const doReject = async (b) => {
    setBusyId(b.id);
    const { error } = await setBookingStatus(b.id, "rejected", rejectNote.trim() || null);
    setBusyId(null);
    if (error) { setErr(error.message); return; }
    sendFacilityBookingCancelled(b.id).catch(() => {});
    setRejecting(null); setRejectNote(""); refresh();
  };
  const cancel = async (b) => {
    setErr(null); setBusyId(b.id);
    const { error } = await cancelFacilityBooking(b.id, "Cancelled by the mosque");
    setBusyId(null);
    if (error) { setErr(error.message); return; }
    sendFacilityBookingCancelled(b.id).catch(() => {});
    refresh();
  };

  // ---- facility CRUD ----
  const saveFac = async () => {
    setErr(null);
    if (!fac.name.trim()) { setErr("A facility needs a name."); return; }
    setFacBusy(true);
    const fields = {
      name: fac.name.trim(), description: fac.description.trim() || null,
      capacity: fac.capacity ? Number(fac.capacity) : null,
      hourly_rate: fac.hourly_rate === "" ? null : Number(fac.hourly_rate),
    };
    const { error } = facEditing
      ? await updateMosqueFacility(facEditing, fields)
      : await createMosqueFacility({ mosqueId, ...fields, hourlyRate: fields.hourly_rate });
    setFacBusy(false);
    if (error) { setErr(error.message || "Couldn't save the facility."); return; }
    setFac(blankFac); setFacEditing(null); setShowFac(false); refresh();
  };
  const editFac = (f) => { setFacEditing(f.id); setFac({ name: f.name, description: f.description || "", capacity: f.capacity ?? "", hourly_rate: f.hourly_rate ?? "" }); setShowFac(true); };
  const toggleFacActive = async (f) => { const { error } = await updateMosqueFacility(f.id, { active: !f.active }); if (!error) refresh(); else setErr(error.message); };
  const removeFac = async (f) => { const { error } = await deleteMosqueFacility(f.id); if (error) setErr(error.message); else refresh(); };

  const pending = bookings.filter((b) => b.status === "pending");
  const approved = bookings.filter((b) => b.status === "approved" && new Date(b.end_at) >= new Date())
    .filter((b) => facFilter === "all" || b.facility_id === facFilter);
  const approvedByDay = approved.reduce((acc, b) => { (acc[dayKey(b.start_at)] ||= []).push(b); return acc; }, {});

  const Tab = ({ id, label, icon: Icon, count }) => (
    <button onClick={() => setSection(id)} className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium ${section === id ? "bg-brand-50 text-brand-800 border border-brand-200" : "text-stone-600 hover:bg-stone-100"}`}>
      <Icon size={15} /> {label}{count > 0 && <span className="bg-brand-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full">{count}</span>}
    </button>
  );

  const PriceLine = ({ b }) => b.quoted_price != null ? (
    <p className="text-xs text-stone-500 mt-0.5">{money(b.quoted_price)} · payment arranged separately</p>
  ) : <p className="text-xs text-stone-400 mt-0.5">Free</p>;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Bookings</h2>
        <p className="text-sm text-stone-600">Manage bookable spaces, approve requests, and see your booking calendar.</p>
      </div>
      {err && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {err}</p>}

      <div className="flex gap-1.5 flex-wrap">
        <Tab id="requests" label="Requests" icon={Inbox} count={pending.length} />
        <Tab id="calendar" label="Calendar" icon={CalendarCheck} count={0} />
        <Tab id="facilities" label="Facilities" icon={Building2} count={0} />
      </div>

      {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={22} className="animate-spin" /></div> : (
        <>
          {/* ---- Requests ---- */}
          {section === "requests" && (pending.length ? (
            <div className="space-y-3">
              {pending.map((b) => (
                <div key={b.id} className={cardCls}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-900">{b.purpose} <span className="text-stone-400 font-normal">· {b.facility?.name}</span></p>
                      <p className="text-xs text-stone-500 mt-0.5 inline-flex items-center gap-1"><Clock size={12} /> {fmtDay(b.start_at)} · {fmtTime(b.start_at)}–{fmtTime(b.end_at)}</p>
                      <p className="text-xs text-stone-500 mt-0.5">{b.requester_name}{b.requester_email ? ` · ${b.requester_email}` : ""}{b.attendees ? ` · ${b.attendees} attending` : ""}</p>
                      {b.notes && <p className="text-xs text-stone-600 mt-1.5 bg-stone-50 border border-stone-100 rounded-lg px-2.5 py-1.5">{b.notes}</p>}
                      <PriceLine b={b} />
                    </div>
                    <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wider font-medium">Pending</span>
                  </div>
                  {rejecting === b.id ? (
                    <div className="mt-3 space-y-2">
                      <textarea rows={2} className={inputCls + " resize-none"} placeholder="Reason (optional, shared with the requester)" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
                      <div className="flex gap-2">
                        <button onClick={() => doReject(b)} disabled={busyId === b.id} className="bg-rose-700 hover:bg-rose-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busyId === b.id ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />} Reject</button>
                        <button onClick={() => { setRejecting(null); setRejectNote(""); }} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => approve(b)} disabled={busyId === b.id} className="bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busyId === b.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve</button>
                      <button onClick={() => { setRejecting(b.id); setRejectNote(""); }} className="border border-stone-300 hover:bg-stone-50 text-stone-700 text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><X size={14} /> Reject</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center"><Inbox className="mx-auto text-stone-300 mb-3" size={32} /><p className="text-sm text-stone-500">No pending requests.</p></div>)}

          {/* ---- Calendar (approved) ---- */}
          {section === "calendar" && (
            <div className="space-y-4">
              {facilities.length > 0 && (
                <select className={inputCls + " sm:w-56"} value={facFilter} onChange={(e) => setFacFilter(e.target.value)}>
                  <option value="all">All facilities</option>
                  {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              )}
              {Object.keys(approvedByDay).length ? Object.entries(approvedByDay).map(([day, list]) => (
                <div key={day}>
                  <p className="text-xs uppercase tracking-wider text-stone-400 font-semibold mb-2">{day}</p>
                  <div className="space-y-2">
                    {list.map((b) => (
                      <div key={b.id} className="bg-white border border-stone-200 rounded-xl p-3 flex items-center gap-3">
                        <div className="w-1.5 h-10 rounded-full bg-brand-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-stone-900 truncate">{b.facility?.name} <span className="text-stone-400 font-normal">· {b.purpose}</span></p>
                          <p className="text-xs text-stone-500">{fmtTime(b.start_at)}–{fmtTime(b.end_at)} · {b.requester_name}{b.attendees ? ` · ${b.attendees} attending` : ""}</p>
                        </div>
                        <button onClick={() => cancel(b)} disabled={busyId === b.id} title="Cancel booking" className="text-stone-400 hover:text-rose-700 p-1.5">{busyId === b.id ? <Loader2 size={14} className="animate-spin" /> : <Ban size={15} />}</button>
                      </div>
                    ))}
                  </div>
                </div>
              )) : <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center"><CalendarCheck className="mx-auto text-stone-300 mb-3" size={32} /><p className="text-sm text-stone-500">No upcoming approved bookings.</p></div>}
            </div>
          )}

          {/* ---- Facilities ---- */}
          {section === "facilities" && (
            <div className="space-y-4">
              {!showFac && <button onClick={() => setShowFac(true)} className="bg-brand-900 hover:bg-brand-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Plus size={14} /> Add facility</button>}
              {showFac && (
                <div className={cardCls}>
                  <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">{facEditing ? "Edit facility" : "New facility"}</h3>
                  <div className="space-y-3">
                    <div><label className={labelCls}>Name</label><input className={inputCls} value={fac.name} onChange={(e) => setFac({ ...fac, name: e.target.value })} placeholder="e.g. Main prayer hall" /></div>
                    <div><label className={labelCls}>Description</label><textarea rows={2} className={inputCls + " resize-none"} value={fac.description} onChange={(e) => setFac({ ...fac, description: e.target.value })} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className={labelCls}>Capacity</label><input type="number" min="0" className={inputCls} value={fac.capacity} onChange={(e) => setFac({ ...fac, capacity: e.target.value })} /></div>
                      <div><label className={labelCls}>Hourly rate (£, blank = free)</label><input type="number" min="0" step="0.01" className={inputCls} value={fac.hourly_rate} onChange={(e) => setFac({ ...fac, hourly_rate: e.target.value })} /></div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveFac} disabled={facBusy} className="bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{facBusy ? <Loader2 size={14} className="animate-spin" /> : facEditing ? <Check size={14} /> : <Plus size={14} />} {facEditing ? "Update" : "Add facility"}</button>
                      <button onClick={() => { setFac(blankFac); setFacEditing(null); setShowFac(false); }} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2 inline-flex items-center gap-1"><X size={14} /> Cancel</button>
                    </div>
                  </div>
                </div>
              )}
              {facilities.length ? (
                <div className="space-y-2">
                  {facilities.map((f) => (
                    <div key={f.id} className={`bg-white border rounded-xl p-3 flex items-center gap-3 ${f.active ? "border-stone-200" : "border-stone-200 opacity-60"}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-900 flex items-center gap-2">{f.name} {!f.active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 uppercase tracking-wider">Archived</span>}</p>
                        <p className="text-xs text-stone-500">{f.capacity ? `Capacity ${f.capacity}` : "No capacity set"} · {f.hourly_rate != null ? `${money(f.hourly_rate)}/hr` : "Free"}</p>
                        {f.description && <p className="text-xs text-stone-500 mt-0.5 line-clamp-1">{f.description}</p>}
                      </div>
                      <button onClick={() => toggleFacActive(f)} title={f.active ? "Archive" : "Restore"} className="text-stone-400 hover:text-stone-700 p-1.5">{f.active ? <Archive size={14} /> : <ArchiveRestore size={14} />}</button>
                      <button onClick={() => editFac(f)} className="text-stone-400 hover:text-brand-700 p-1.5"><Pencil size={14} /></button>
                      <button onClick={() => removeFac(f)} className="text-stone-400 hover:text-rose-700 p-1.5"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              ) : <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center"><Building2 className="mx-auto text-stone-300 mb-3" size={32} /><p className="text-sm text-stone-500">No facilities yet. Add your bookable spaces.</p></div>}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MosqueBookings;
