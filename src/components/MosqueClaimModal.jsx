import { useState } from "react";
import { X, Loader2, Check, AlertCircle, BadgeCheck } from "lucide-react";
import { submitMosqueClaim } from "../auth";
import { sendMosqueClaimReceived } from "../lib/email";

// "Is this your mosque?" claim form for an unclaimed listing. Submits via the
// anon-safe guarded RPC, then fires the anon-safe confirmation/alert emails.
const ROLES = ["Imam", "Chair", "Secretary", "Treasurer", "Administrator", "Other"];
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || "").trim());
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 outline-none text-sm";
const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";

const MosqueClaimModal = ({ mosque, onClose }) => {
  const [form, setForm] = useState({ name: "", role: "", email: "", phone: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) { setError("Please enter your name."); return; }
    if (!isEmail(form.email)) { setError("Please enter a valid email address."); return; }
    setBusy(true); setError("");
    const { claimId, error: err } = await submitMosqueClaim({
      mosqueId: mosque.id, name: form.name.trim(), role: form.role || null,
      email: form.email.trim(), phone: form.phone.trim() || null, note: form.note.trim() || null,
    });
    if (err) { setBusy(false); setError(err.message || "Couldn't submit your claim. Please try again."); return; }
    if (claimId) sendMosqueClaimReceived(claimId).catch(() => {});
    setBusy(false); setDone(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-stone-900/40" onClick={busy ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-stone-200 px-5 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-stone-900 inline-flex items-center gap-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><BadgeCheck size={18} className="text-brand-700" /> Claim this mosque</h3>
          <button onClick={onClose} disabled={busy} className="text-stone-400 hover:text-stone-700 p-1 disabled:opacity-40"><X size={18} /></button>
        </div>

        <div className="p-5">
          {done ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center mx-auto mb-3"><Check size={22} /></div>
              <p className="text-sm font-medium text-stone-900">Claim submitted</p>
              <p className="text-sm text-stone-600 mt-1">We've emailed you a confirmation and our team will review your request. Once approved, you'll receive a link to set up your mosque admin account.</p>
              <button onClick={onClose} className="mt-4 bg-brand-900 hover:bg-brand-800 text-white text-sm font-medium px-5 py-2 rounded-lg">Done</button>
            </div>
          ) : (
            <div className="space-y-3">
              <div><label className={labelCls}>Mosque</label><input className={inputCls + " bg-stone-50 text-stone-500"} value={mosque.name} disabled /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Your name</label><input autoFocus className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
                <div><label className={labelCls}>Your role</label><select className={inputCls} value={form.role} onChange={(e) => set("role", e.target.value)}><option value="">—</option>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
                <div><label className={labelCls}>Email</label><input type="email" className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@mosque.org" /></div>
                <div><label className={labelCls}>Phone</label><input type="tel" className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
              </div>
              <div><label className={labelCls}>How are you connected to the mosque?</label><textarea rows={3} className={inputCls + " resize-none"} value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="e.g. I've been the imam here for 6 years…" /></div>
              <p className="text-[11px] text-stone-400">Our team verifies every claim manually before granting access. We'll email you with the outcome.</p>
              {error && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}
              <button onClick={submit} disabled={busy} className="w-full bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium py-2.5 rounded-lg inline-flex items-center justify-center gap-1.5">{busy ? <Loader2 size={15} className="animate-spin" /> : <BadgeCheck size={15} />} Submit claim</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MosqueClaimModal;
