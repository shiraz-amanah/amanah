import { useState } from "react";
import { Loader2, Check, AlertCircle, Save, Upload, Plus, X } from "lucide-react";
import { MOSQUE_SERVICES, MOSQUE_FACILITIES } from "../data/mosqueTaxonomy";
import { updateMosqueProfile } from "../auth";
import { uploadMosqueLogo, uploadMosquePhoto, removeMosquePhoto } from "../lib/storage";

const MAX_PHOTOS = 10;

// Mosque owner self-service profile editor (dashboard → Profile tab, Session U
// Day 1). `mosque` is the transformed row held as App's myMosque (raw snake_case
// fields are present via transformMosque's row spread, so we read them directly).
// On save we patch only whitelisted columns via updateMosqueProfile (RLS scopes
// the write to the owner), then call onSaved(rawUpdatedRow) so the parent can
// re-transform and keep myMosque in sync. Logo + photo gallery upload land in a
// follow-up commit; this covers the text/selection fields.

const TEXT_FIELDS = [
  { k: "name", l: "Mosque name", type: "text" },
  { k: "phone", l: "Phone", type: "tel" },
  { k: "email", l: "Email", type: "email" },
  { k: "website_url", l: "Website", type: "url", placeholder: "https://" },
  { k: "donation_url", l: "Donation link", type: "url", placeholder: "https:// (PayPal, GoFundMe, bank…)" },
];

// Preset toggle pills + custom add/delete, backing a text[] of enabled values.
// Presets toggle on/off; custom entries (values not in `presets`) render as
// deletable pills. Custom values store the raw text — the public page renders
// unknown values via its `|| value` fallback. Same pill style throughout.
const TagPicker = ({ presets, values, onChange, placeholder }) => {
  const [text, setText] = useState("");
  const presetVals = new Set(presets.map((p) => p.v));
  const custom = values.filter((v) => !presetVals.has(v));
  const pill = "text-xs px-2.5 py-1.5 rounded-lg border transition-colors inline-flex items-center gap-1";
  const toggle = (v) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  const add = () => {
    const val = text.trim();
    if (val && !values.some((v) => v.toLowerCase() === val.toLowerCase())) onChange([...values, val]);
    setText("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const on = values.includes(p.v);
          return (
            <button key={p.v} type="button" onClick={() => toggle(p.v)} className={`${pill} ${on ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-white border-stone-300 text-stone-600 hover:border-stone-400"}`}>
              {on && <Check size={11} />}{p.l}
            </button>
          );
        })}
        {custom.map((v) => (
          <span key={v} className={`${pill} bg-emerald-50 border-emerald-300 text-emerald-800`}>
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="text-emerald-700 hover:text-emerald-900 -mr-0.5"><X size={11} /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm"
        />
        <button type="button" onClick={add} className="border border-stone-300 hover:border-stone-400 text-stone-700 text-sm font-medium px-3 py-2 rounded-lg inline-flex items-center gap-1 flex-shrink-0"><Plus size={14} /> Add</button>
      </div>
    </div>
  );
};

const MosqueProfileEditor = ({ mosque, onSaved }) => {
  const [form, setForm] = useState(() => ({
    name: mosque?.name || "",
    description: mosque?.description || mosque?.bio || "",
    address: mosque?.address || "",
    city: mosque?.city || "",
    postcode: mosque?.postcode || "",
    phone: mosque?.phone || "",
    email: mosque?.email || "",
    website_url: mosque?.website_url || "",
    donation_url: mosque?.donation_url || "",
    services: Array.isArray(mosque?.services) ? [...mosque.services] : [],
    facilities: Array.isArray(mosque?.facilities) ? [...mosque.facilities] : [],
    logo_url: mosque?.logo_url || "",
    photos: Array.isArray(mosque?.photos) ? [...mosque.photos] : [],
  }));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  // Media (logo/gallery) persist IMMEDIATELY on upload — separate state so an
  // in-flight upload doesn't disable the main text-field Save button.
  const [media, setMedia] = useState({ logo: false, photo: false, err: null });

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };

  // Persist a media-only patch right after upload so logos/photos aren't lost if
  // the owner forgets to hit Save. onSaved keeps App's myMosque in sync.
  const persistMedia = async (patch) => {
    const { data, error: err } = await updateMosqueProfile(mosque.id, patch);
    if (err) { setMedia((m) => ({ ...m, err: err.message || "Couldn't save upload." })); return false; }
    onSaved?.(data);
    return true;
  };
  const handleLogo = async (file) => {
    if (!file) return;
    setMedia((m) => ({ ...m, logo: true, err: null }));
    const { url, error: e } = await uploadMosqueLogo(file, mosque.id);
    if (e || !url) { setMedia((m) => ({ ...m, logo: false, err: e || "Upload failed." })); return; }
    await persistMedia({ logo_url: url });
    setForm((f) => ({ ...f, logo_url: url }));
    setMedia((m) => ({ ...m, logo: false }));
  };
  const handleAddPhoto = async (file) => {
    if (!file) return;
    if (form.photos.length >= MAX_PHOTOS) { setMedia((m) => ({ ...m, err: `Up to ${MAX_PHOTOS} photos.` })); return; }
    setMedia((m) => ({ ...m, photo: true, err: null }));
    const { url, error: e } = await uploadMosquePhoto(file, mosque.id);
    if (e || !url) { setMedia((m) => ({ ...m, photo: false, err: e || "Upload failed." })); return; }
    const next = [...form.photos, url];
    await persistMedia({ photos: next });
    setForm((f) => ({ ...f, photos: next }));
    setMedia((m) => ({ ...m, photo: false }));
  };
  const handleRemovePhoto = async (url) => {
    const next = form.photos.filter((p) => p !== url);
    setForm((f) => ({ ...f, photos: next }));
    await persistMedia({ photos: next });
    removeMosquePhoto(url); // best-effort storage cleanup
  };

  const validUrl = (u) => !u || /^https?:\/\//i.test(u);

  const handleSave = async () => {
    setError(null);
    if (!form.name.trim()) { setError("Mosque name can't be empty."); return; }
    if (!validUrl(form.website_url) || !validUrl(form.donation_url)) {
      setError("Website and donation links must start with http:// or https://"); return;
    }
    setSaving(true);
    const patch = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      postcode: form.postcode.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      website_url: form.website_url.trim() || null,
      donation_url: form.donation_url.trim() || null,
      services: form.services,
      facilities: form.facilities,
      logo_url: form.logo_url || null,
      photos: form.photos,
    };
    const { data, error: err } = await updateMosqueProfile(mosque.id, patch);
    setSaving(false);
    if (err) { setError(err.message || "Couldn't save. Try again."); return; }
    setSaved(true);
    onSaved?.(data);
  };

  const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
  const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
  const cardCls = "bg-white border border-stone-200 rounded-2xl p-5 md:p-6";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Edit profile</h2>
          <p className="text-sm text-stone-600">Changes appear on your public mosque page.</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : saved ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save changes</>}
        </button>
      </div>
      {error && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}

      {/* Logo & photos — upload persists immediately (no need to hit Save). */}
      <div className={cardCls}>
        <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">Logo &amp; photos</h3>
        {media.err && <p className="text-sm text-rose-700 flex items-center gap-1.5 mb-3"><AlertCircle size={14} /> {media.err}</p>}
        <div className="flex items-start gap-5 flex-wrap">
          <div>
            <p className={labelCls}>Logo</p>
            <label className="flex w-24 h-24 rounded-xl border border-dashed border-stone-300 hover:border-emerald-500 cursor-pointer overflow-hidden bg-stone-50 items-center justify-center">
              {form.logo_url ? <img src={form.logo_url} alt="logo" className="w-full h-full object-cover" /> : media.logo ? <Loader2 size={18} className="animate-spin text-stone-400" /> : <Upload size={18} className="text-stone-400" />}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogo(e.target.files?.[0])} />
            </label>
          </div>
          <div className="flex-1 min-w-[220px]">
            <p className={labelCls}>Photo gallery ({form.photos.length}/{MAX_PHOTOS})</p>
            <div className="flex flex-wrap gap-2">
              {form.photos.map((p) => (
                <div key={p} className="relative w-20 h-20 rounded-lg overflow-hidden border border-stone-200 group">
                  <img src={p} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => handleRemovePhoto(p)} className="absolute top-0.5 right-0.5 bg-black/60 hover:bg-black/80 text-white rounded-full p-0.5"><X size={12} /></button>
                </div>
              ))}
              {form.photos.length < MAX_PHOTOS && (
                <label className="flex w-20 h-20 rounded-lg border border-dashed border-stone-300 hover:border-emerald-500 cursor-pointer bg-stone-50 items-center justify-center">
                  {media.photo ? <Loader2 size={16} className="animate-spin text-stone-400" /> : <Plus size={16} className="text-stone-400" />}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleAddPhoto(e.target.files?.[0])} />
                </label>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Basics */}
      <div className={cardCls}>
        <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">Basics</h3>
        <div className="space-y-3">
          <div><label className={labelCls}>Mosque name</label><input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div><label className={labelCls}>About</label><textarea rows={4} className={inputCls + " resize-none"} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Tell your community about the mosque…" /></div>
        </div>
      </div>

      {/* Address */}
      <div className={cardCls}>
        <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">Address</h3>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="md:col-span-3"><label className={labelCls}>Street address</label><input className={inputCls} value={form.address} onChange={(e) => set("address", e.target.value)} /></div>
          <div><label className={labelCls}>City</label><input className={inputCls} value={form.city} onChange={(e) => set("city", e.target.value)} /></div>
          <div><label className={labelCls}>Postcode</label><input className={inputCls} value={form.postcode} onChange={(e) => set("postcode", e.target.value)} /></div>
        </div>
      </div>

      {/* Contact + links */}
      <div className={cardCls}>
        <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">Contact &amp; links</h3>
        <div className="grid md:grid-cols-2 gap-3">
          {TEXT_FIELDS.filter((f) => f.k !== "name").map((f) => (
            <div key={f.k}><label className={labelCls}>{f.l}</label><input type={f.type} placeholder={f.placeholder} className={inputCls} value={form[f.k]} onChange={(e) => set(f.k, e.target.value)} /></div>
          ))}
        </div>
      </div>

      {/* Services */}
      <div className={cardCls}>
        <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">Services offered</h3>
        <TagPicker presets={MOSQUE_SERVICES} values={form.services} onChange={(v) => set("services", v)} placeholder="Add a custom service…" />
      </div>

      {/* Facilities */}
      <div className={cardCls}>
        <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">Facilities</h3>
        <TagPicker presets={MOSQUE_FACILITIES} values={form.facilities} onChange={(v) => set("facilities", v)} placeholder="Add a custom facility…" />
      </div>
    </div>
  );
};

export default MosqueProfileEditor;
