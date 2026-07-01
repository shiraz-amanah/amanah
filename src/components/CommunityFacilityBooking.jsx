import { useState, useEffect } from "react";
import { Loader2, CalendarCheck, Plus, X, AlertCircle, Ban, Send } from "lucide-react";
import { getActiveMosqueFacilities, getMyFacilityBookings, requestFacilityBooking, cancelFacilityBooking } from "../auth";
import { sendFacilityBookingCancelled } from "../lib/email";

// Community tab → request a mosque facility. Lists the mosque's bookable spaces,
// a request form (definer RPC pins requester + derives the mosque), and the
// member's own requests with status + cancel. Paid bookings show the estimated
// price + "payment arranged separately" (Stripe later).

const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const cardCls = "bg-white border border-stone-200 rounded-2xl p-5 md:p-6";
const money = (v) => (v == null ? null : `£${Number(v).toFixed(2)}`);
const PURPOSES = ["Nikah", "Aqiqah", "Study circle", "Community event", "Private hire", "Other"];
const fmtDay = (iso) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const fmtTime = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const STATUS = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-800 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  cancelled: "bg-stone-100 text-stone-500 border-stone-200",
};

const blank = { facilityId: "", purpose: "Nikah", date: "", start: "", end: "", attendees: "", notes: "" };

const CommunityFacilityBooking = ({ mosque, memberName }) => {
  const [facilities, setFacilities] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const reload = () => Promise.all([getActiveMosqueFacilities(mosque.id), getMyFacilityBookings()])
    .then(([f, b]) => { setFacilities(f); setMyBookings((b || []).filter((x) => x.mosque_id === mosque.id)); });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([getActiveMosqueFacilities(mosque.id), getMyFacilityBookings()])
      .then(([f, b]) => { if (alive) { setFacilities(f); setMyBookings((b || []).filter((x) => x.mosque_id === mosque.id)); } })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosque.id]);

  const selFac = facilities.find((f) => f.id === form.facilityId);
  const estHours = form.date && form.start && form.end ? (new Date(`${form.date}T${form.end}`) - new Date(`${form.date}T${form.start}`)) / 3600000 : 0;
  const estPrice = selFac?.hourly_rate != null && estHours > 0 ? selFac.hourly_rate * estHours : null;

  const submit = async () => {
    setErr(null);
    if (!form.facilityId) { setErr("Choose a facility."); return; }
    if (!form.date || !form.start || !form.end) { setErr("Pick a date, start and end time."); return; }
    const start = new Date(`${form.date}T${form.start}`);
    const end = new Date(`${form.date}T${form.end}`);
    if (end <= start) { setErr("End time must be after the start time."); return; }
    setBusy(true);
    const { error } = await requestFacilityBooking({
      facilityId: form.facilityId, purpose: form.purpose, notes: form.notes,
      start: start.toISOString(), end: end.toISOString(),
      attendees: form.attendees ? Number(form.attendees) : null,
      name: memberName || "Member", email: "", phone: "",
    });
    setBusy(false);
    if (error) { setErr(error.message || "Couldn't send the request."); return; }
    setForm(blank); setShowForm(false); reload();
  };

  const cancel = async (b) => {
    const { error } = await cancelFacilityBooking(b.id);
    if (error) { setErr(error.message); return; }
    sendFacilityBookingCancelled(b.id).catch(() => {});
    reload();
  };

  if (loading) return null;
  if (!facilities.length && !myBookings.length) return null; // nothing bookable + no history → hide

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm font-semibold text-stone-900 flex items-center gap-1.5"><CalendarCheck size={15} className="text-emerald-700" /> Book a facility</p>
        {facilities.length > 0 && !showForm && <button onClick={() => setShowForm(true)} className="text-sm text-emerald-800 hover:text-emerald-900 font-medium inline-flex items-center gap-1"><Plus size={14} /> Request</button>}
      </div>
      {err && <p className="text-sm text-rose-700 mb-2 flex items-center gap-1.5"><AlertCircle size={14} /> {err}</p>}

      {showForm && (
        <div className="border border-stone-200 rounded-xl p-4 mb-4 space-y-3 bg-stone-50/50">
          <div><label className={labelCls}>Facility</label>
            <select className={inputCls} value={form.facilityId} onChange={(e) => setForm({ ...form, facilityId: e.target.value })}>
              <option value="">Select a space…</option>
              {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}{f.hourly_rate != null ? ` — ${money(f.hourly_rate)}/hr` : " — free"}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Purpose</label>
            <select className={inputCls} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })}>
              {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><label className={labelCls}>Date</label><input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div><label className={labelCls}>Start</label><input type="time" className={inputCls} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
            <div><label className={labelCls}>End</label><input type="time" className={inputCls} value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></div>
          </div>
          <div><label className={labelCls}>Expected attendees</label><input type="number" min="0" className={inputCls} value={form.attendees} onChange={(e) => setForm({ ...form, attendees: e.target.value })} /></div>
          <div><label className={labelCls}>Notes (optional)</label><textarea rows={2} className={inputCls + " resize-none"} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          {estPrice != null && <p className="text-xs text-stone-500">Estimated <span className="font-medium text-stone-700">{money(estPrice)}</span> — payment will be arranged separately with the mosque.</p>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send request</button>
            <button onClick={() => { setForm(blank); setShowForm(false); setErr(null); }} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2 inline-flex items-center gap-1"><X size={14} /> Cancel</button>
          </div>
        </div>
      )}

      {myBookings.length ? (
        <div className="space-y-2">
          {myBookings.map((b) => (
            <div key={b.id} className="flex items-center gap-2.5 text-sm">
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium uppercase tracking-wider shrink-0 ${STATUS[b.status] || STATUS.cancelled}`}>{b.status}</span>
              <span className="flex-1 min-w-0 truncate text-stone-700">{b.facility?.name} · {b.purpose}</span>
              <span className="text-xs text-stone-400 shrink-0">{fmtDay(b.start_at)} {fmtTime(b.start_at)}</span>
              {(b.status === "pending" || b.status === "approved") && (
                <button onClick={() => cancel(b)} title="Cancel" className="text-stone-400 hover:text-rose-700 p-1 shrink-0"><Ban size={13} /></button>
              )}
            </div>
          ))}
        </div>
      ) : !showForm && <p className="text-sm text-stone-400">Request a space for a Nikah, Aqiqah, study circle or event.</p>}
    </div>
  );
};

export default CommunityFacilityBooking;
