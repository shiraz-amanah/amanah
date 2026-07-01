import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import {
  Loader2, Plus, AlertCircle, ArrowLeft, ChevronRight, QrCode, MapPinned, Hand,
  Users, UserCheck, CircleDot, Radio, X, Lock, Download,
} from "lucide-react";
import {
  getCommunitySessions, createCommunitySession, closeCommunitySession,
  setCommunitySessionHeadcount, getSessionAttendance, subscribeToCommunityAttendance,
} from "../auth";

// Mosque dashboard → Community → Visitor register. Open a session, display its
// QR at the entrance, and watch named + anonymous check-ins arrive live
// (Supabase realtime). Named = registered members (member_id set); anonymous =
// QR-form visitors + a manual headcount added after close. Geofence check-ins
// feed the same record (Phase 3b). Owner CRUD gated by RLS (migration 101).

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const cardCls = "bg-white border border-stone-200 rounded-2xl p-5 md:p-6";
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
const methodIcon = { qr: QrCode, geofence: MapPinned, manual: Hand };

const isOpen = (s) => !s.closed_at && (!s.closes_at || new Date(s.closes_at) > new Date());

// ---- One session: QR + live feed + breakdown ----
const SessionDetail = ({ session: initial, mosqueId, onBack, onChanged }) => {
  const [session, setSession] = useState(initial);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [qrUrl, setQrUrl] = useState(null);
  const [headcount, setHeadcount] = useState(String(initial.manual_headcount || 0));
  const [busy, setBusy] = useState(false);
  const seen = useRef(new Set());

  const open = isOpen(session);
  const checkInUrl = `${window.location.origin}/check-in?mosque=${mosqueId}&session=${session.id}`;

  // Generate the QR data-URL locally (no network, no PII leaves the device).
  useEffect(() => {
    QRCode.toDataURL(checkInUrl, { width: 320, margin: 1, color: { dark: "#1c1917", light: "#ffffff" } })
      .then(setQrUrl).catch((e) => console.error("QR generation failed:", e));
  }, [checkInUrl]);

  // Initial attendance load.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    getSessionAttendance(session.id)
      .then((a) => { if (alive) { seen.current = new Set(a.map((r) => r.id)); setRows(a); } })
      .catch((e) => { if (alive) setErr(e?.message || "Couldn't load check-ins."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [session.id]);

  // Realtime: prepend new check-ins as they arrive (dedup by id).
  useEffect(() => {
    const unsub = subscribeToCommunityAttendance(session.id, (raw) => {
      if (seen.current.has(raw.id)) return;
      seen.current.add(raw.id);
      setRows((xs) => [raw, ...xs]);
    });
    return unsub;
  }, [session.id]);

  const named = rows.filter((r) => r.member_id).length;
  const anonRows = rows.length - named;
  const manual = session.manual_headcount || 0;
  const firstTime = rows.filter((r) => r.is_first_time).length;
  const qrCount = rows.filter((r) => r.check_in_method === "qr").length;
  const geoCount = rows.filter((r) => r.check_in_method === "geofence").length;
  const totalFootfall = rows.length + manual;

  const close = async () => {
    setBusy(true); setErr(null);
    const { data, error } = await closeCommunitySession(session.id);
    setBusy(false);
    if (error) { setErr(error.message || "Couldn't close the session."); return; }
    setSession(data); onChanged?.();
  };
  const saveHeadcount = async () => {
    setBusy(true); setErr(null);
    const { data, error } = await setCommunitySessionHeadcount(session.id, headcount);
    setBusy(false);
    if (error) { setErr(error.message || "Couldn't save the headcount."); return; }
    setSession(data); onChanged?.();
  };

  const displayName = (r) => r.member?.name || r.name || "Anonymous visitor";

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm text-stone-600 hover:text-stone-900 inline-flex items-center gap-1.5"><ArrowLeft size={15} /> Back to sessions</button>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{session.name}</h2>
          <p className="text-sm text-stone-600">{fmtDate(session.session_date)}</p>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full font-medium uppercase tracking-wider ${open ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-stone-100 text-stone-500 border border-stone-200"}`}>
          {open ? <><Radio size={10} /> Open</> : <><Lock size={10} /> Closed</>}
        </span>
      </div>
      {err && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {err}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* QR + controls */}
        <div className={cardCls}>
          {open ? (
            <>
              <p className="text-sm font-medium text-stone-900 mb-1">Scan to check in</p>
              <p className="text-xs text-stone-500 mb-4">Display this at the entrance. Members scan with their phone camera — no app needed.</p>
              {qrUrl ? (
                <img src={qrUrl} alt="Check-in QR code" className="w-56 h-56 mx-auto rounded-xl border border-stone-200" />
              ) : <div className="w-56 h-56 mx-auto flex items-center justify-center text-stone-300"><Loader2 size={24} className="animate-spin" /></div>}
              {qrUrl && (
                <div className="text-center mt-3">
                  <a href={qrUrl} download={`checkin-${session.name.replace(/\s+/g, "-").toLowerCase()}.png`} className="text-xs text-emerald-800 hover:text-emerald-900 inline-flex items-center gap-1"><Download size={12} /> Download QR</a>
                </div>
              )}
              <button onClick={close} disabled={busy} className="w-full mt-4 border border-stone-300 hover:bg-stone-50 text-stone-700 text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center justify-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />} Close session</button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-stone-900 mb-1">Session closed</p>
              <p className="text-xs text-stone-500 mb-4">Add a manual headcount for any footfall beyond the named + QR check-ins.</p>
              <label className={labelCls}>Manual anonymous headcount</label>
              <div className="flex gap-2">
                <input type="number" min="0" className={inputCls} value={headcount} onChange={(e) => setHeadcount(e.target.value)} />
                <button onClick={saveHeadcount} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5 shrink-0">{busy ? <Loader2 size={14} className="animate-spin" /> : "Save"}</button>
              </div>
            </>
          )}
        </div>

        {/* Breakdown */}
        <div className={cardCls}>
          <p className="text-sm font-medium text-stone-900 mb-3">Attendance</p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between"><span className="text-stone-600 inline-flex items-center gap-1.5"><UserCheck size={14} className="text-emerald-700" /> Named check-ins</span><span className="font-semibold text-stone-900 tabular-nums">{named}</span></div>
            <div className="flex items-center justify-between"><span className="text-stone-600 inline-flex items-center gap-1.5"><Users size={14} className="text-stone-400" /> Anonymous visitors</span><span className="font-semibold text-stone-900 tabular-nums">{anonRows + manual}</span></div>
            <div className="flex items-center justify-between border-t border-stone-100 pt-2 mt-2"><span className="text-stone-900 font-medium inline-flex items-center gap-1.5"><CircleDot size={14} className="text-emerald-700" /> Total footfall</span><span className="font-bold text-stone-900 tabular-nums">{totalFootfall}</span></div>
            <div className="flex items-center justify-between"><span className="text-stone-600">First-time visitors</span><span className="font-semibold text-stone-900 tabular-nums">{firstTime}</span></div>
          </div>
          <div className="border-t border-stone-100 mt-3 pt-3">
            <p className="text-[10px] uppercase tracking-wider text-stone-400 font-medium mb-2">Check-in method</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between"><span className="text-stone-600 inline-flex items-center gap-1.5"><QrCode size={13} className="text-stone-400" /> QR scan</span><span className="text-stone-900 tabular-nums">{qrCount}</span></div>
              <div className="flex items-center justify-between"><span className="text-stone-600 inline-flex items-center gap-1.5"><MapPinned size={13} className="text-stone-400" /> Geofence</span><span className="text-stone-900 tabular-nums">{geoCount}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Live feed */}
      <div className={cardCls}>
        <p className="text-sm font-medium text-stone-900 mb-3 flex items-center gap-1.5">{open && <Radio size={13} className="text-emerald-600 animate-pulse" />} Check-in feed ({rows.length})</p>
        {loading ? <div className="flex justify-center py-6 text-stone-400"><Loader2 size={18} className="animate-spin" /></div> : rows.length > 0 ? (
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {rows.map((r) => {
              const MIcon = methodIcon[r.check_in_method] || QrCode;
              return (
                <div key={r.id} className="flex items-center gap-2.5 text-sm py-1">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-medium ${r.member_id ? "bg-emerald-50 text-emerald-800" : "bg-stone-100 text-stone-400"}`}>{r.member_id ? (r.member?.name || "M").slice(0, 1).toUpperCase() : <Users size={13} />}</span>
                  <span className="flex-1 min-w-0">
                    <span className="text-stone-800 truncate flex items-center gap-1.5">{displayName(r)} {r.is_first_time && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wide">New</span>}</span>
                  </span>
                  <MIcon size={13} className="text-stone-400 shrink-0" />
                  <span className="text-xs text-stone-400 shrink-0 tabular-nums">{fmtTime(r.checked_in_at)}</span>
                </div>
              );
            })}
          </div>
        ) : <p className="text-sm text-stone-400 text-center py-4">No check-ins yet{open ? " — waiting for the first scan…" : "."}</p>}
      </div>
    </div>
  );
};

// ---- Sessions list ----
const CommunityVisitorRegister = ({ mosqueId }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [autoClose, setAutoClose] = useState("2"); // hours; "" = no auto-close
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const refresh = () => getCommunitySessions(mosqueId).then(setSessions);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getCommunitySessions(mosqueId)
      .then((s) => { if (alive) setSessions(s); })
      .catch((e) => { if (alive) setErr(e?.message || "Couldn't load sessions."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  const openSession = async () => {
    setErr(null);
    if (!name.trim()) { setErr("Give the session a name (e.g. Jumu'ah)."); return; }
    setBusy(true);
    const closesAt = autoClose ? new Date(Date.now() + Number(autoClose) * 3600e3).toISOString() : null;
    const { data, error } = await createCommunitySession({ mosqueId, name: name.trim(), closesAt });
    setBusy(false);
    if (error) { setErr(error.message || "Couldn't open the session."); return; }
    setName(""); setShowForm(false);
    await refresh();
    setSelectedId(data.id); // jump straight into the new session
  };

  const selected = selectedId ? sessions.find((s) => s.id === selectedId) : null;
  if (selected) return <SessionDetail session={selected} mosqueId={mosqueId} onBack={() => setSelectedId(null)} onChanged={refresh} />;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Visitor register</h2>
          <p className="text-sm text-stone-600">Open a session and display its QR at the entrance. Check-ins arrive live.</p>
        </div>
        {!showForm && <button onClick={() => setShowForm(true)} className="shrink-0 bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Plus size={14} /> Open session</button>}
      </div>
      {err && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {err}</p>}

      {showForm && (
        <div className={cardCls}>
          <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">Open a check-in session</h3>
          <div className="space-y-3">
            <div><label className={labelCls}>Session name</label><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jumu'ah" /></div>
            <div><label className={labelCls}>Auto-close after</label>
              <select className={inputCls} value={autoClose} onChange={(e) => setAutoClose(e.target.value)}>
                <option value="2">2 hours</option>
                <option value="3">3 hours</option>
                <option value="6">6 hours</option>
                <option value="">Don't auto-close (I'll close it manually)</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={openSession} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Open session</button>
              <button onClick={() => { setShowForm(false); setName(""); setErr(null); }} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2 inline-flex items-center gap-1"><X size={14} /> Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loading ? <div className="flex justify-center py-8 text-stone-400"><Loader2 size={20} className="animate-spin" /></div> : sessions.length > 0 ? (
        <div className="space-y-2">
          {sessions.map((s) => {
            const open = isOpen(s);
            return (
              <button key={s.id} onClick={() => setSelectedId(s.id)} className="w-full bg-white border border-stone-200 rounded-xl p-4 flex items-center gap-3 text-left hover:border-emerald-300 group">
                <span className={`w-2 h-2 rounded-full shrink-0 ${open ? "bg-emerald-500" : "bg-stone-300"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-900 group-hover:text-emerald-800">{s.name}</p>
                  <p className="text-xs text-stone-500">{fmtDate(s.session_date)} · {open ? "Open" : "Closed"}</p>
                </div>
                <ChevronRight size={16} className="text-stone-300 group-hover:text-stone-500 shrink-0" />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
          <QrCode className="mx-auto text-stone-300 mb-3" size={32} />
          <p className="text-sm text-stone-500">No sessions yet. Open one to start taking check-ins.</p>
        </div>
      )}
    </div>
  );
};

export default CommunityVisitorRegister;
