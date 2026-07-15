import { useState } from "react";
import { X, Loader2, Send, AlertCircle } from "lucide-react";
import { createCoverRequest } from "../auth";

// Session W — structured cover request popup. Replaces the free-text message
// thread the substitute finder used to open. Writes a cover_requests row
// (061); the scholar accepts/declines from their side. Cover type + sessions
// are multi-select checkboxes.

const COVER_TYPES = [
  ["short", "Short cover (1–3 days)"], ["weekly", "Weekly"], ["monthly", "Monthly"],
  ["long_term", "Long-term"], ["event", "Event only"], ["jumuah", "Jumu'ah only"],
  ["ramadan", "Ramadan cover"], ["custom", "Custom"],
];
const SESSIONS = [
  ["fajr", "Fajr"], ["dhuhr", "Dhuhr"], ["asr", "Asr"], ["maghrib", "Maghrib"],
  ["isha", "Isha"], ["jumuah", "Jumu'ah"], ["taraweeh", "Taraweeh"], ["classes", "Classes"], ["all", "All"],
];

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1.5";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 outline-none text-sm";

const Chip = ({ active, onClick, children }) => (
  <button type="button" onClick={onClick} className={`text-xs px-2.5 py-1 rounded-full border ${active ? "bg-brand-50 border-brand-300 text-brand-800" : "bg-white border-stone-300 text-stone-600 hover:border-stone-400"}`}>{children}</button>
);

const MosqueCoverRequest = ({ scholar, mosqueId, onClose, onSent }) => {
  const [coverType, setCoverType] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const toggle = (list, setList, val) => setList(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]);

  const submit = async () => {
    if (coverType.length === 0 && sessions.length === 0) { setError("Pick at least one cover type or session."); return; }
    // recipient_profile_id (migration 143) is the identity key. A scholar's
    // user_id IS their profile id; an unclaimed scholar (no account) can't receive.
    if (!scholar.user_id) { setError("This scholar hasn't claimed their account yet, so they can't receive cover requests."); return; }
    setBusy(true); setError(null);
    const { error: e } = await createCoverRequest({ mosqueId, recipientProfileId: scholar.user_id, scholarId: scholar.id, coverType, sessions, dateFrom, dateTo, notes });
    setBusy(false);
    if (e) { setError(e.message || "Couldn't send the request."); return; }
    onSent?.();
  };

  return (
    <div className="fixed inset-0 z-40 bg-stone-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Request cover</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
        </div>
        <p className="text-sm text-stone-600 mb-4">Send <span className="font-medium text-stone-800">{scholar.name}</span> a structured cover request. They can accept or decline.</p>

        <div className="space-y-4">
          <div>
            <label className={labelCls}>Cover type</label>
            <div className="flex flex-wrap gap-1.5">{COVER_TYPES.map(([v, l]) => <Chip key={v} active={coverType.includes(v)} onClick={() => toggle(coverType, setCoverType, v)}>{l}</Chip>)}</div>
          </div>
          <div>
            <label className={labelCls}>Sessions</label>
            <div className="flex flex-wrap gap-1.5">{SESSIONS.map(([v, l]) => <Chip key={v} active={sessions.includes(v)} onClick={() => toggle(sessions, setSessions, v)}>{l}</Chip>)}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>From</label><input type="date" className={inputCls} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
            <div><label className={labelCls}>To</label><input type="date" className={inputCls} value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
          </div>
          <div><label className={labelCls}>Notes</label><textarea rows={3} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the scholar should know…" /></div>
          {error && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={onClose} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2">Cancel</button>
          <button onClick={submit} disabled={busy} className="bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send request</button>
        </div>
      </div>
    </div>
  );
};

export default MosqueCoverRequest;
