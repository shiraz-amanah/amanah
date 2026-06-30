import { useState } from "react";
import { Loader2, Check, Save, AlertCircle, Moon } from "lucide-react";
import { updateMosqueProfile } from "../auth";
import { PRAYERS } from "../data/prayerNames";
import TimePair from "./TimePair";

// Mosque admin — Ramadan mode toggle + Ramadan prayer times (Adhan + Iqamah).
// Extracted from MosquePrayerEditor so all Ramadan editing lives on the Ramadan
// sub-tab alongside the 30-day calendar (MosqueRamadanEditor). Self-saving:
// writes ramadan_active + ramadan_times and bumps prayer_times_updated_at (the
// public prayer card reads ramadan_active to decide which times to show). The
// partial update leaves prayer_times / jummuah_info untouched — those are saved
// independently by MosquePrayerEditor on the Prayer-times tab.

const cardCls = "bg-white border border-stone-200 rounded-2xl p-5 md:p-6";

function normalizeRamadan(r) {
  const out = {};
  for (const { k } of PRAYERS) { const v = r?.[k]; out[k] = (v && typeof v === "object") ? { adhan: v.adhan || "", iqamah: v.iqamah || "" } : { adhan: "", iqamah: v || "" }; }
  return out;
}

const MosqueRamadanMode = ({ mosque, onSaved }) => {
  const [ramadanActive, setRamadanActive] = useState(!!mosque?.ramadan_active);
  const [rt, setRt] = useState(() => normalizeRamadan(mosque?.ramadan_times));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const setRamadan = (k, field, v) => { setRt((r) => ({ ...r, [k]: { ...r[k], [field]: v } })); setSaved(false); };

  const save = async () => {
    setError(null); setSaving(true);
    const patch = {
      ramadan_active: ramadanActive,
      ramadan_times: ramadanActive ? rt : (mosque?.ramadan_times || null),
      prayer_times_updated_at: new Date().toISOString(),
    };
    const { data, error: err } = await updateMosqueProfile(mosque.id, patch);
    setSaving(false);
    if (err) { setError(err.message || "Couldn't save."); return; }
    setSaved(true); onSaved?.(data);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider inline-flex items-center gap-1.5"><Moon size={13} className="text-emerald-700" /> Ramadan mode &amp; times</h3>
        <button onClick={save} disabled={saving} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : saved ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save Ramadan times</>}
        </button>
      </div>
      {error && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}

      <div className={cardCls}>
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-medium text-stone-500 uppercase tracking-wider inline-flex items-center gap-1.5"><Moon size={13} className="text-emerald-700" /> Ramadan mode</h4>
          <button onClick={() => { setRamadanActive((v) => !v); setSaved(false); }} className={`relative w-11 h-6 rounded-full transition-colors ${ramadanActive ? "bg-emerald-600" : "bg-stone-300"}`}><span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${ramadanActive ? "translate-x-5" : "translate-x-0.5"}`} /></button>
        </div>
        <p className="text-xs text-stone-500 mt-2">When on, your public profile shows these Ramadan times, a green Ramadan banner, and your 30-day calendar (below).</p>
        {ramadanActive && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
            {PRAYERS.map((p) => (
              <TimePair key={p.k} value={rt[p.k]} labelEn={p.en} labelAr={p.ar}
                onAdhan={(v) => setRamadan(p.k, "adhan", v)} onIqamah={(v) => setRamadan(p.k, "iqamah", v)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MosqueRamadanMode;
