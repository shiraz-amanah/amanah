import { useState, useEffect, useMemo, useRef } from "react";
import { Camera, Loader2, Check, X, Plus, Trash2, Star, Lock } from "lucide-react";
import { CATEGORIES } from "../data/categories";
import { uploadScholarAvatar } from "../lib/storage";
import { updateScholarProfile } from "../auth";

// Scholar self-service profile editor (dashboard → Profile tab). Edits the
// caller's own scholar row via the update_scholar_profile SECURITY DEFINER RPC
// (migration 040) — name (read-only)/title/bio/avatar_url/categories/languages/
// packages only; never verification/status/rating/slug.
//
// `scholar` is the RAW snake_case DB row held by ScholarDashboard (myScholar):
// name, title, bio, avatar_url, avatar_initials, avatar_gradient, categories,
// languages, packages, rating, review_count. On a successful save we call
// onScholarUpdate with the same raw shape so myScholar stays in sync.

const TITLE_MAX = 80;
const MIN_BIO = 100;            // chars — completeness threshold
const MAX_CATEGORIES = 5;
const LANGUAGE_SUGGESTIONS = ["English", "Arabic", "Urdu", "Bengali", "Punjabi", "Somali", "Turkish", "French"];

// Map a raw scholar.packages entry to the editor's working shape. The persisted
// jsonb shape is { name, duration, price, desc, popular? } (what the wizard
// writes and PublicScholarDetail/booking read); `enabled` is editor-only.
const toEditorPackage = (p) => ({
  name: p?.name || "",
  desc: p?.desc || "",
  duration: p?.duration || "",
  price: p?.price ?? "",
  popular: !!p?.popular,
  enabled: true,
});

const blankPackage = () => ({ name: "", desc: "", duration: "", price: "", popular: false, enabled: true });

const initialsFrom = (scholar) =>
  scholar?.avatar_initials ||
  (scholar?.name || "")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() ||
  "?";

const ScholarProfileEditor = ({ scholar, onScholarUpdate }) => {
  // Name is read-only (changing it needs support). We deliberately DON'T hold it
  // in form state — it's derived straight from the prop below as `scholarName`,
  // so it always reflects the latest scholar row regardless of async-load timing.
  const [title, setTitle] = useState(scholar?.title || "");
  const [bio, setBio] = useState(scholar?.bio || "");
  const [categories, setCategories] = useState(scholar?.categories || []);
  const [languages, setLanguages] = useState(scholar?.languages || []);
  const [langDraft, setLangDraft] = useState("");
  const [packages, setPackages] = useState(() => (scholar?.packages || []).filter(Boolean).map(toEditorPackage));

  // Photo: existing saved URL + an optionally-chosen new File (previewed via an
  // object URL, only uploaded on save).
  const [avatarUrl, setAvatarUrl] = useState(scholar?.avatar_url || null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const fileRef = useRef(null);

  const [status, setStatus] = useState("idle"); // idle | saving | saved | error
  const [errorMsg, setErrorMsg] = useState("");

  // Read-only name, derived directly from the prop (not form state).
  const scholarName = scholar?.name || "";

  // Re-seed when the dashboard's scholar actually arrives. myScholar loads
  // async, so on a hard refresh the initial props are empty; this hydrates the
  // form once the real row lands. Keyed on id so it fires once (undefined→id)
  // and again only if a different scholar loads — it won't clobber in-progress
  // edits, since the id is stable while editing. Post-save sync re-seeds with
  // the same values we just wrote, which is a no-op for the user.
  useEffect(() => {
    setTitle(scholar?.title || "");
    setBio(scholar?.bio || "");
    setCategories(scholar?.categories || []);
    setLanguages(scholar?.languages || []);
    setPackages((scholar?.packages || []).filter(Boolean).map(toEditorPackage));
    setAvatarUrl(scholar?.avatar_url || null);
    setPhotoFile(null);
    setPhotoPreview(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scholar?.id]);

  // Revoke the object URL when it changes / on unmount to avoid a leak.
  useEffect(() => {
    if (!photoPreview) return;
    return () => URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const dirty = () => { setStatus("idle"); setErrorMsg(""); };

  const onPickPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    dirty();
  };

  const toggleCategory = (id) => {
    setCategories((prev) => {
      if (prev.includes(id)) return prev.filter((c) => c !== id);
      if (prev.length >= MAX_CATEGORIES) return prev; // cap silently; hint shown in UI
      return [...prev, id];
    });
    dirty();
  };

  const addLanguage = (raw) => {
    const v = (raw ?? langDraft).trim();
    if (!v) return;
    setLanguages((prev) => (prev.some((l) => l.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v]));
    setLangDraft("");
    dirty();
  };
  const removeLanguage = (l) => { setLanguages((prev) => prev.filter((x) => x !== l)); dirty(); };

  const updatePackage = (i, patch) => {
    setPackages((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
    dirty();
  };
  const addPackage = () => { setPackages((prev) => [...prev, blankPackage()]); dirty(); };
  const removePackage = (i) => { setPackages((prev) => prev.filter((_, idx) => idx !== i)); dirty(); };

  // ---- Completeness (client-side only) ----
  const hasPhoto = !!(photoPreview || avatarUrl);
  const enabledPackages = packages.filter((p) => p.enabled);
  const checks = useMemo(() => ([
    { ok: hasPhoto, points: 20, label: "Add a profile photo" },
    { ok: title.trim().length > 0, points: 15, label: "Add a title / headline" },
    { ok: bio.trim().length > MIN_BIO, points: 20, label: `Write a bio of at least ${MIN_BIO} characters` },
    { ok: categories.length >= 1, points: 15, label: "Select at least one subject" },
    { ok: languages.length >= 1, points: 10, label: "Add at least one language" },
    { ok: enabledPackages.length >= 1, points: 20, label: "Add at least one package" },
  ]), [hasPhoto, title, bio, categories.length, languages.length, enabledPackages.length]);
  const score = checks.reduce((s, c) => (c.ok ? s + c.points : s), 0);
  const missing = checks.filter((c) => !c.ok);

  const previewInitials = initialsFrom(scholar);
  const previewImg = photoPreview || avatarUrl;
  const previewCategories = categories
    .map((id) => CATEGORIES.find((c) => c.id === id))
    .filter(Boolean)
    .slice(0, 2);

  // ---- Save ----
  const save = async () => {
    setErrorMsg("");
    // Hard validation (separate from the soft completeness score).
    if (categories.length < 1) { setStatus("error"); setErrorMsg("Select at least one subject."); return; }
    if (enabledPackages.length < 1) { setStatus("error"); setErrorMsg("At least one package must be enabled."); return; }
    const badPkg = enabledPackages.find((p) => !p.name.trim() || !(Number(p.price) > 0));
    if (badPkg) { setStatus("error"); setErrorMsg("Each enabled package needs a name and a price above £0."); return; }

    setStatus("saving");
    try {
      // 1. Upload the new photo first (if one was chosen) so the URL is final
      //    before we write the row.
      let finalAvatarUrl = avatarUrl;
      if (photoFile) {
        const { url, error: upErr } = await uploadScholarAvatar(photoFile, scholar?.id);
        if (upErr) { setStatus("error"); setErrorMsg(upErr); return; }
        finalAvatarUrl = url;
      }

      // 2. Persist only enabled packages, in the canonical jsonb shape.
      const persistedPackages = enabledPackages.map((p) => ({
        name: p.name.trim(),
        duration: p.duration.trim(),
        price: Number(p.price) || 0,
        desc: p.desc.trim(),
        ...(p.popular ? { popular: true } : {}),
      }));

      const { error } = await updateScholarProfile({
        name: scholarName,
        title: title.trim(),
        bio: bio.trim(),
        avatarUrl: finalAvatarUrl,
        languages,
        categories,
        packages: persistedPackages,
      });
      if (error) {
        console.error("Save profile failed:", error?.code, error?.message, error);
        setStatus("error");
        setErrorMsg("Couldn't save your profile — try again.");
        return;
      }

      // 3. Sync the dashboard's myScholar (raw snake_case row).
      setAvatarUrl(finalAvatarUrl);
      setPhotoFile(null);
      setPhotoPreview(null);
      onScholarUpdate && onScholarUpdate({
        ...scholar,
        title: title.trim(),
        bio: bio.trim(),
        avatar_url: finalAvatarUrl,
        languages,
        categories,
        packages: persistedPackages,
      });
      setStatus("saved");
    } catch (e) {
      console.error("Save profile failed:", e?.message, e);
      setStatus("error");
      setErrorMsg("Couldn't save your profile — try again.");
    }
  };

  const saving = status === "saving";

  // Shared input styling.
  const inputCls = "w-full px-3 py-2 text-sm border border-stone-300 rounded-xl bg-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors";
  const labelCls = "block text-xs uppercase tracking-wider text-stone-500 font-medium mb-1.5";

  return (
    <div>
      {/* ---- Completeness bar ---- */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6 mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-stone-900">Profile {score}% complete</span>
          {score === 100 && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium"><Check size={14} /> All set</span>
          )}
        </div>
        <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-700 rounded-full transition-all duration-500" style={{ width: `${score}%` }} />
        </div>
        {missing.length > 0 && (
          <ul className="mt-3 space-y-1">
            {missing.map((m, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-stone-600">
                <span className="w-1.5 h-1.5 rounded-full bg-stone-300 flex-shrink-0" />
                {m.label} <span className="text-stone-400">(+{m.points})</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_20rem] gap-5 items-start">
        {/* ============ EDITOR COLUMN ============ */}
        <div className="space-y-5 min-w-0">
          {/* ---- Profile photo ---- */}
          <section className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6">
            <h3 className="text-base font-semibold text-stone-900 mb-4" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Profile photo</h3>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="w-24 h-24 rounded-full ring-2 ring-emerald-500 ring-offset-2 overflow-hidden flex-shrink-0 bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center text-white text-3xl font-semibold" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
                {previewImg ? (
                  <img src={previewImg} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span>{previewInitials}</span>
                )}
              </div>
              <div>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPickPhoto} className="hidden" />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-2 border border-stone-300 hover:border-emerald-500 hover:text-emerald-800 text-stone-700 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                >
                  <Camera size={15} /> Change photo
                </button>
                <p className="text-xs text-stone-400 mt-2">JPG, PNG or WebP · max 5MB</p>
              </div>
            </div>
          </section>

          {/* ---- Basic info ---- */}
          <section className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6 space-y-4">
            <h3 className="text-base font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Basic info</h3>

            <div>
              <label className={labelCls}>Full name</label>
              <div className="relative" title="Contact support to change your name">
                <input value={scholarName} readOnly disabled className={`${inputCls} bg-stone-100 text-stone-500 cursor-not-allowed pr-9`} />
                <Lock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400" />
              </div>
              <p className="text-xs text-stone-400 mt-1">Contact support to change your name.</p>
            </div>

            <div>
              <label className={labelCls}>Title / headline</label>
              <input
                value={title}
                maxLength={TITLE_MAX}
                onChange={(e) => { setTitle(e.target.value); dirty(); }}
                placeholder="Qualified Qur'an Teacher | Bradford"
                className={inputCls}
              />
              <p className="text-xs text-stone-400 mt-1 text-right">{title.length}/{TITLE_MAX}</p>
            </div>

            <div>
              <label className={labelCls}>Bio</label>
              <textarea
                value={bio}
                rows={5}
                onChange={(e) => { setBio(e.target.value); dirty(); }}
                placeholder="Describe your Islamic education background, teaching experience, and approach..."
                className={`${inputCls} resize-y`}
              />
              <p className={`text-xs mt-1 text-right ${bio.trim().length > MIN_BIO ? "text-emerald-600" : "text-stone-400"}`}>
                {bio.trim().length} characters{bio.trim().length <= MIN_BIO ? ` · ${MIN_BIO}+ encouraged` : ""}
              </p>
            </div>
          </section>

          {/* ---- Categories ---- */}
          <section className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Subjects</h3>
              <span className="text-xs text-stone-400">{categories.length}/{MAX_CATEGORIES}</span>
            </div>
            <p className="text-xs text-stone-500 mb-3">Choose 1–{MAX_CATEGORIES} subjects you teach.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CATEGORIES.map((cat) => {
                const selected = categories.includes(cat.id);
                const atCap = !selected && categories.length >= MAX_CATEGORIES;
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleCategory(cat.id)}
                    disabled={atCap}
                    className={`flex items-center gap-2 text-left px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      selected
                        ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                        : atCap
                        ? "border-stone-200 bg-stone-50 text-stone-300 cursor-not-allowed"
                        : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                    }`}
                  >
                    <Icon size={15} className={selected ? "text-emerald-600 flex-shrink-0" : "text-stone-400 flex-shrink-0"} />
                    <span className="truncate">{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ---- Languages ---- */}
          <section className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6">
            <h3 className="text-base font-semibold text-stone-900 mb-3" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Languages</h3>
            {languages.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {languages.map((l) => (
                  <span key={l} className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 text-sm font-medium pl-3 pr-2 py-1 rounded-full border border-emerald-200">
                    {l}
                    <button type="button" onClick={() => removeLanguage(l)} aria-label={`Remove ${l}`} className="text-emerald-600 hover:text-emerald-900">
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              value={langDraft}
              onChange={(e) => setLangDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLanguage(); } }}
              placeholder="Type a language and press Enter"
              className={inputCls}
            />
            <div className="flex flex-wrap gap-1.5 mt-3">
              {LANGUAGE_SUGGESTIONS.filter((s) => !languages.some((l) => l.toLowerCase() === s.toLowerCase())).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => addLanguage(s)}
                  className="inline-flex items-center gap-1 text-xs text-stone-600 border border-stone-200 hover:border-emerald-400 hover:text-emerald-800 px-2.5 py-1 rounded-full transition-colors"
                >
                  <Plus size={11} /> {s}
                </button>
              ))}
            </div>
          </section>

          {/* ---- Packages ---- */}
          <section className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Packages</h3>
              <button type="button" onClick={addPackage} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:text-emerald-900">
                <Plus size={13} /> Add package
              </button>
            </div>
            {packages.length === 0 && (
              <p className="text-sm text-stone-400 mb-3">No packages yet — add one so parents can book you.</p>
            )}
            <div className="space-y-3">
              {packages.map((pkg, i) => (
                <div key={i} className={`rounded-xl border p-4 ${pkg.enabled ? "border-stone-200 bg-white" : "border-stone-200 bg-stone-50 opacity-70"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <button
                      type="button"
                      onClick={() => updatePackage(i, { enabled: !pkg.enabled })}
                      role="switch"
                      aria-checked={pkg.enabled}
                      aria-label={`Package ${i + 1} ${pkg.enabled ? "enabled" : "disabled"}`}
                      className="inline-flex items-center gap-2 text-xs font-medium text-stone-600"
                    >
                      <span className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${pkg.enabled ? "bg-emerald-600" : "bg-stone-300"}`}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${pkg.enabled ? "translate-x-4" : ""}`} />
                      </span>
                      {pkg.enabled ? "Enabled" : "Disabled"}
                    </button>
                    <button type="button" onClick={() => removePackage(i)} aria-label="Remove package" className="text-stone-400 hover:text-rose-600 transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2.5">
                    <input value={pkg.name} onChange={(e) => updatePackage(i, { name: e.target.value })} placeholder="Package name" className={inputCls} />
                    <input value={pkg.duration} onChange={(e) => updatePackage(i, { duration: e.target.value })} placeholder="Duration e.g. 45 min" className={inputCls} />
                    <input value={pkg.desc} onChange={(e) => updatePackage(i, { desc: e.target.value })} placeholder="Short description" className={`${inputCls} sm:col-span-2`} />
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-stone-400">£</span>
                      <input value={pkg.price} onChange={(e) => updatePackage(i, { price: e.target.value })} type="number" min="0" placeholder="Price" className={`${inputCls} pl-6`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ---- Save ---- */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-70 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-all hover:scale-[1.02] active:scale-95 disabled:hover:scale-100"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : null}
              {saving ? "Saving…" : "Save profile"}
            </button>
            {status === "saved" && !saving && (
              <span className="inline-flex items-center gap-1 text-sm text-emerald-700 font-medium"><Check size={15} /> Saved</span>
            )}
            {status === "error" && !saving && (
              <span className="text-sm text-rose-700">{errorMsg || "Couldn't save — try again."}</span>
            )}
          </div>
        </div>

        {/* ============ LIVE PREVIEW COLUMN ============ */}
        <div className="lg:sticky lg:top-4">
          <p className="text-xs uppercase tracking-wider text-stone-400 font-medium mb-2">Preview</p>
          <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0 bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center text-white text-lg font-semibold" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
                {previewImg ? <img src={previewImg} alt="" className="w-full h-full object-cover" /> : <span>{previewInitials}</span>}
              </div>
              <div className="min-w-0">
                <p className="text-base font-semibold text-stone-900 truncate" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{scholarName || "Your name"}</p>
                <p className="text-xs text-stone-500 line-clamp-2">{title || "Your title / headline"}</p>
                <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium mt-1">
                  <Star size={11} fill="currentColor" /> {Number(scholar?.rating || 0).toFixed(1)} ({scholar?.review_count || 0})
                </span>
              </div>
            </div>
            {previewCategories.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {previewCategories.map((c) => (
                  <span key={c.id} className="text-[11px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">{c.name}</span>
                ))}
              </div>
            )}
            <p className="text-xs text-stone-600 leading-relaxed line-clamp-4">
              {bio.trim() || "Your bio will appear here as you write it."}
            </p>
          </div>
          <p className="text-[11px] text-stone-400 mt-2">This is how parents see your card.</p>
        </div>
      </div>
    </div>
  );
};

export default ScholarProfileEditor;
