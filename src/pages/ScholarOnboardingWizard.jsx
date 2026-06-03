import { useState, useEffect, useRef } from "react";
import {
  ChevronLeft, ChevronRight, Loader2, Check, X, Plus, Trash2,
  Upload, FileText, Image as ImageIcon, GraduationCap, Star,
} from "lucide-react";
import { CATEGORIES } from "../data/categories";
import { fmt } from "../lib/format";
import { uploadScholarAvatar, uploadPrivateDoc } from "../lib/storage";

// ============================================================================
// Scholar onboarding wizard (src/pages) — replaces the legacy in-App wizard.
// 5 steps: Profile → Packages → Credentials → DBS → Payment. Step 5 (payment)
// is only shown when the scholar needs a NEW DBS check; an existing-DBS scholar
// submits after step 4. On submit the application is created as status='pending'
// and the user lands on ScholarOnboardingSuccess.
//
// Draft persistence: the whole form is mirrored to sessionStorage so a refresh
// mid-wizard doesn't lose data. Steps 4–5 + submit are wired in the next commit.
// ============================================================================

const DRAFT_KEY = "scholar_onboarding_draft";
const STEP_LABELS = ["Profile", "Packages", "Credentials", "DBS", "Payment"];
const LANGUAGE_SUGGESTIONS = ["English", "Arabic", "Urdu", "Bengali", "Punjabi", "Somali"];

const SUGGESTED_PACKAGES = [
  { name: "Taster", description: "30 min intro session to see if we're a fit", duration: "30 min", price: 25, enabled: true },
  { name: "Standard", description: "4 × 45 min weekly sessions + progress notes", duration: "4 × 45 min", price: 90, enabled: true },
  { name: "Intensive", description: "12-week full term programme", duration: "12 weeks", price: 320, enabled: true },
];

const emptyForm = {
  // Step 1 — profile
  fullName: "", photoUrl: "", title: "", bio: "", subjects: [], languages: [], city: "",
  // Step 2 — packages
  packages: SUGGESTED_PACKAGES,
  // Step 3 — credentials
  ijazahDocUrl: "", ijazahDocName: "", qualificationDocUrl: "", qualificationDocName: "",
  specialties: [], yearsExperience: "",
  // Step 4 — DBS
  dbsOption: "new",
  legalName: "", dateOfBirth: "", nationalInsurance: "", idDocumentType: "", previousNames: "",
  addressHistory: [{ line1: "", line2: "", city: "", postcode: "", from: "", to: "" }],
  existingDbsNumber: "", existingDbsDate: "", existingDbsUrl: "", existingDbsName: "", enhancedConfirmed: false,
};

// ---- small shared pieces -------------------------------------------------

const FieldLabel = ({ children, hint }) => (
  <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">
    {children}{hint && <span className="ml-1 normal-case tracking-normal text-stone-400 font-normal">{hint}</span>}
  </label>
);

const TagInput = ({ value, onChange, suggestions = [], placeholder }) => {
  const [draft, setDraft] = useState("");
  const add = (tag) => {
    const t = tag.trim();
    if (!t || value.some((v) => v.toLowerCase() === t.toLowerCase())) return;
    onChange([...value, t]);
    setDraft("");
  };
  const remove = (tag) => onChange(value.filter((v) => v !== tag));
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-2.5 py-1 rounded-full">
            {tag}
            <button type="button" onClick={() => remove(tag)} className="hover:text-emerald-950"><X size={12} /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft); } }}
          placeholder={placeholder}
          className="flex-1 border border-stone-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
        />
        <button type="button" onClick={() => add(draft)} className="px-3 py-2 rounded-xl border border-stone-300 text-stone-700 hover:border-emerald-400 hover:text-emerald-800 text-sm font-medium">Add</button>
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())).map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-stone-200 text-stone-600 hover:border-emerald-400 hover:text-emerald-800">
              <Plus size={11} /> {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// File upload field for a private doc (PDF/image). Calls onUpload(file) which
// resolves to { path, name } on success; shows spinner + error inline.
const DocUploadField = ({ label, hint, fileName, uploading, error, onPick, onClear }) => {
  const ref = useRef(null);
  return (
    <div>
      <FieldLabel hint={hint}>{label}</FieldLabel>
      {fileName ? (
        <div className="flex items-center justify-between gap-3 border border-emerald-200 bg-emerald-50/50 rounded-xl px-3 py-2.5">
          <span className="inline-flex items-center gap-2 text-sm text-stone-800 min-w-0"><FileText size={15} className="text-emerald-700 flex-shrink-0" /> <span className="truncate">{fileName}</span></span>
          <button type="button" onClick={onClear} className="text-stone-400 hover:text-rose-600 flex-shrink-0"><Trash2 size={15} /></button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-2 border border-dashed border-stone-300 rounded-xl px-3 py-3 text-sm text-stone-600 hover:border-emerald-400 hover:text-emerald-800 disabled:opacity-60"
        >
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          {uploading ? "Uploading…" : "Upload PDF or image (max 10MB)"}
        </button>
      )}
      <input ref={ref} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }} />
      {error && <p className="text-xs text-rose-600 mt-1.5">{error}</p>}
    </div>
  );
};

// ---- live preview --------------------------------------------------------

const PreviewCard = ({ form }) => {
  const initials = (form.fullName || "").trim().split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "—";
  const enabled = (form.packages || []).filter((p) => p.enabled);
  const minPrice = enabled.length ? Math.min(...enabled.map((p) => Number(p.price) || 0)) : null;
  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="h-20 bg-gradient-to-br from-emerald-500 to-emerald-700" />
      <div className="px-5 pb-5 -mt-10">
        {form.photoUrl ? (
          <img src={form.photoUrl} alt="" className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-sm" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 border-4 border-white shadow-sm flex items-center justify-center text-white text-2xl font-semibold" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{initials}</div>
        )}
        <h3 className="mt-3 text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{form.fullName || "Your name"}</h3>
        <p className="text-sm text-stone-600">{form.title || "Your headline appears here"}</p>
        {form.city && <p className="text-xs text-stone-400 mt-0.5">{form.city}</p>}
        {form.subjects.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {form.subjects.map((id) => {
              const c = CATEGORIES.find((x) => x.id === id);
              return <span key={id} className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">{c?.name || id}</span>;
            })}
          </div>
        )}
        {form.bio && <p className="text-xs text-stone-500 mt-3 line-clamp-4 leading-relaxed">{form.bio}</p>}
        {minPrice != null && <p className="mt-3 text-sm font-semibold text-emerald-800">From {fmt(minPrice)}</p>}
      </div>
    </div>
  );
};

// ---- main wizard ---------------------------------------------------------

const ScholarOnboardingWizard = ({ authedUser, onSubmitted, onLogout }) => {
  const [form, setForm] = useState(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) return { ...emptyForm, ...JSON.parse(raw) };
    } catch { /* ignore corrupt draft */ }
    return emptyForm;
  });
  const [step, setStep] = useState(1);
  const [uploads, setUploads] = useState({});   // { field: bool } in-flight
  const [uploadErrors, setUploadErrors] = useState({});
  const [stepError, setStepError] = useState("");

  // Persist draft on every change.
  useEffect(() => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch { /* quota — ignore */ }
  }, [form]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const totalSteps = form.dbsOption === "existing" ? 4 : 5;

  // ---- uploads ----
  const handlePhoto = async (file) => {
    setUploads((u) => ({ ...u, photo: true }));
    setUploadErrors((e) => ({ ...e, photo: "" }));
    const { url, error } = await uploadScholarAvatar(file);
    setUploads((u) => ({ ...u, photo: false }));
    if (error) setUploadErrors((e) => ({ ...e, photo: error }));
    else set({ photoUrl: url });
  };

  const handleDoc = async (field, urlKey, nameKey, file) => {
    setUploads((u) => ({ ...u, [field]: true }));
    setUploadErrors((e) => ({ ...e, [field]: "" }));
    const bucket = field === "dbsCert" ? "dbs-certificates" : "credentials";
    const { path, error } = await uploadPrivateDoc(file, bucket);
    setUploads((u) => ({ ...u, [field]: false }));
    if (error) { setUploadErrors((e) => ({ ...e, [field]: error })); return; }
    set({ [urlKey]: path, [nameKey]: file.name });
  };

  // ---- validation per step ----
  const toggleSubject = (id) => {
    const has = form.subjects.includes(id);
    if (has) set({ subjects: form.subjects.filter((s) => s !== id) });
    else if (form.subjects.length < 5) set({ subjects: [...form.subjects, id] });
  };

  const validateStep = () => {
    if (step === 1) {
      if (!form.fullName.trim()) return "Add your full name.";
      if (!form.title.trim()) return "Add a headline.";
      if (!form.bio.trim()) return "Add a short bio.";
      if (form.subjects.length < 1) return "Pick at least one subject.";
      if (form.languages.length < 1) return "Add at least one language.";
      if (!form.city.trim()) return "Add the city you're based in.";
    }
    if (step === 2) {
      const enabled = form.packages.filter((p) => p.enabled);
      if (enabled.length < 1) return "Enable at least one package.";
      if (enabled.some((p) => !p.name.trim() || !(Number(p.price) > 0))) return "Each enabled package needs a name and a price.";
    }
    // step 3 is optional
    return "";
  };

  const next = () => {
    const err = validateStep();
    if (err) { setStepError(err); return; }
    setStepError("");
    setStep((s) => Math.min(totalSteps, s + 1));
  };
  const back = () => { setStepError(""); setStep((s) => Math.max(1, s - 1)); };

  // package helpers
  const updatePackage = (i, patch) => set({ packages: form.packages.map((p, idx) => idx === i ? { ...p, ...patch } : p) });
  const addPackage = () => set({ packages: [...form.packages, { name: "", description: "", duration: "", price: 0, enabled: true }] });
  const removePackage = (i) => set({ packages: form.packages.filter((_, idx) => idx !== i) });

  const showPreview = step <= 3;
  const bioCount = form.bio.trim().length;

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header + progress */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-5 md:px-6 py-3.5 flex items-center justify-between gap-3">
          <span className="text-lg font-semibold text-emerald-900 tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</span>
          <div className="flex items-center gap-4">
            <span className="text-xs text-stone-500">Step {step} of {totalSteps} · {STEP_LABELS[step - 1]}</span>
            {onLogout && <button onClick={onLogout} className="text-xs text-stone-400 hover:text-stone-700">Sign out</button>}
          </div>
        </div>
        <div className="h-1 bg-stone-100">
          <div className="h-full bg-emerald-600 transition-all duration-300" style={{ width: `${(step / totalSteps) * 100}%` }} />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-5 md:px-6 py-8">
        <div className={`grid gap-8 ${showPreview ? "lg:grid-cols-[1fr_320px]" : ""}`}>
          {/* Step content */}
          <div className="min-w-0">
            {step === 1 && (
              <Step1 form={form} set={set} toggleSubject={toggleSubject} bioCount={bioCount}
                onPhoto={handlePhoto} photoUploading={!!uploads.photo} photoError={uploadErrors.photo} />
            )}
            {step === 2 && (
              <Step2 form={form} updatePackage={updatePackage} addPackage={addPackage} removePackage={removePackage} />
            )}
            {step === 3 && (
              <Step3 form={form} set={set} handleDoc={handleDoc} uploads={uploads} uploadErrors={uploadErrors} />
            )}
            {(step === 4 || step === 5) && (
              <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-stone-400 text-sm">
                {STEP_LABELS[step - 1]} step — coming in the next commit.
              </div>
            )}

            {stepError && <p className="text-sm text-rose-600 mt-4">{stepError}</p>}

            {/* Nav */}
            <div className="flex items-center justify-between mt-8">
              <button
                onClick={back}
                disabled={step === 1}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-stone-600 hover:text-stone-900 disabled:opacity-40"
              >
                <ChevronLeft size={16} /> Back
              </button>
              <button
                onClick={next}
                className="inline-flex items-center gap-1.5 bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-all hover:scale-[1.02] active:scale-95"
              >
                Continue <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Preview (desktop only) */}
          {showPreview && (
            <div className="hidden lg:block">
              <div className="sticky top-24">
                <p className="text-[10px] uppercase tracking-wider text-stone-400 font-medium mb-2">Preview</p>
                <PreviewCard form={form} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---- Step 1: profile -----------------------------------------------------

const Step1 = ({ form, set, toggleSubject, bioCount, onPhoto, photoUploading, photoError }) => {
  const photoRef = useRef(null);
  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Your profile</h1>
      <p className="text-stone-600 text-sm mb-6">This is how parents will see you on Amanah.</p>

      <div className="space-y-5 bg-white border border-stone-200 rounded-2xl p-5 md:p-6">
        <div>
          <FieldLabel>Full name</FieldLabel>
          <input value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} placeholder="e.g. Ustadh Yusuf Ali"
            className="w-full border border-stone-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500" />
        </div>

        <div>
          <FieldLabel hint="(optional)">Profile photo</FieldLabel>
          <div className="flex items-center gap-3">
            {form.photoUrl
              ? <img src={form.photoUrl} alt="" className="w-16 h-16 rounded-full object-cover" />
              : <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center text-stone-300"><ImageIcon size={22} /></div>}
            <div>
              <button type="button" onClick={() => photoRef.current?.click()} disabled={photoUploading}
                className="inline-flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-700 hover:border-emerald-400 hover:text-emerald-800 disabled:opacity-60">
                {photoUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {photoUploading ? "Uploading…" : form.photoUrl ? "Replace photo" : "Upload photo"}
              </button>
              <p className="text-[11px] text-stone-400 mt-1">JPG, PNG or WebP · max 5MB</p>
            </div>
            <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = ""; }} />
          </div>
          {photoError && <p className="text-xs text-rose-600 mt-1.5">{photoError}</p>}
        </div>

        <div>
          <FieldLabel hint="(max 80 chars)">Headline</FieldLabel>
          <input value={form.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Qualified Quran Teacher | Bradford"
            className="w-full border border-stone-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500" />
          <p className="text-[11px] text-stone-400 mt-1 text-right">{form.title.length}/80</p>
        </div>

        <div>
          <FieldLabel hint="(min 100 characters encouraged)">Bio</FieldLabel>
          <textarea value={form.bio} onChange={(e) => set({ bio: e.target.value })} rows={5} placeholder="Tell parents about your background, teaching style, and experience…"
            className="w-full border border-stone-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 resize-none" />
          <p className={`text-[11px] mt-1 text-right ${bioCount >= 100 ? "text-emerald-600" : "text-stone-400"}`}>{bioCount} characters</p>
        </div>

        <div>
          <FieldLabel hint="(choose 1–5)">Subjects</FieldLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CATEGORIES.map((c) => {
              const on = form.subjects.includes(c.id);
              const atMax = !on && form.subjects.length >= 5;
              const Icon = c.icon;
              return (
                <button key={c.id} type="button" onClick={() => toggleSubject(c.id)} disabled={atMax}
                  className={`flex items-center gap-2 text-left px-3 py-2.5 rounded-xl border text-xs font-medium transition-colors ${on ? "bg-emerald-900 border-emerald-900 text-white" : atMax ? "bg-stone-50 border-stone-200 text-stone-300" : "bg-white border-stone-300 text-stone-700 hover:border-emerald-400"}`}>
                  <Icon size={15} className="flex-shrink-0" /> <span className="truncate">{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <FieldLabel hint="(at least 1)">Languages</FieldLabel>
          <TagInput value={form.languages} onChange={(v) => set({ languages: v })} suggestions={LANGUAGE_SUGGESTIONS} placeholder="Add a language" />
        </div>

        <div>
          <FieldLabel>City</FieldLabel>
          <input value={form.city} onChange={(e) => set({ city: e.target.value })} placeholder="e.g. Bradford"
            className="w-full border border-stone-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500" />
        </div>
      </div>
    </div>
  );
};

// ---- Step 2: packages ----------------------------------------------------

const Step2 = ({ form, updatePackage, addPackage, removePackage }) => (
  <div>
    <h1 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Your packages</h1>
    <p className="text-stone-600 text-sm mb-6">Set what you offer and your prices. Toggle off any you don't want to list.</p>

    <div className="space-y-4">
      {form.packages.map((p, i) => (
        <div key={i} className={`bg-white border rounded-2xl p-4 md:p-5 transition-opacity ${p.enabled ? "border-stone-200" : "border-stone-200 opacity-60"}`}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={p.enabled} onChange={(e) => updatePackage(i, { enabled: e.target.checked })} className="accent-emerald-600 w-4 h-4" />
              <span className="text-sm font-medium text-stone-700">{p.enabled ? "Enabled" : "Disabled"}</span>
            </label>
            <button type="button" onClick={() => removePackage(i)} className="text-stone-300 hover:text-rose-600"><Trash2 size={16} /></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Name</FieldLabel>
              <input value={p.name} onChange={(e) => updatePackage(i, { name: e.target.value })} placeholder="e.g. Standard"
                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
            </div>
            <div>
              <FieldLabel>Duration</FieldLabel>
              <input value={p.duration} onChange={(e) => updatePackage(i, { duration: e.target.value })} placeholder="e.g. 4 × 45 min"
                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel>Description</FieldLabel>
              <input value={p.description} onChange={(e) => updatePackage(i, { description: e.target.value })} placeholder="What's included"
                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
            </div>
            <div>
              <FieldLabel>Price (£)</FieldLabel>
              <input type="number" min="0" value={p.price} onChange={(e) => updatePackage(i, { price: e.target.value === "" ? "" : Number(e.target.value) })}
                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
            </div>
          </div>
        </div>
      ))}
    </div>

    <button type="button" onClick={addPackage} className="mt-4 inline-flex items-center gap-2 border border-dashed border-stone-300 rounded-xl px-4 py-2.5 text-sm text-stone-600 hover:border-emerald-400 hover:text-emerald-800">
      <Plus size={15} /> Add package
    </button>
  </div>
);

// ---- Step 3: credentials (optional) --------------------------------------

const Step3 = ({ form, set, handleDoc, uploads, uploadErrors }) => (
  <div>
    <div className="flex items-start gap-3 mb-6">
      <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-700 flex-shrink-0"><GraduationCap size={20} /></div>
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Add your qualifications <span className="text-stone-400 font-normal">(optional)</span></h1>
        <p className="text-stone-600 text-sm mt-1">Verified credentials build trust with parents and speed up your approval.</p>
      </div>
    </div>

    <div className="space-y-5 bg-white border border-stone-200 rounded-2xl p-5 md:p-6">
      <DocUploadField label="Ijazah or sanad document" fileName={form.ijazahDocName} uploading={!!uploads.ijazah} error={uploadErrors.ijazah}
        onPick={(f) => handleDoc("ijazah", "ijazahDocUrl", "ijazahDocName", f)} onClear={() => set({ ijazahDocUrl: "", ijazahDocName: "" })} />

      <DocUploadField label="Teaching qualification, degree, or other credential" fileName={form.qualificationDocName} uploading={!!uploads.qualification} error={uploadErrors.qualification}
        onPick={(f) => handleDoc("qualification", "qualificationDocUrl", "qualificationDocName", f)} onClear={() => set({ qualificationDocUrl: "", qualificationDocName: "" })} />

      <div>
        <FieldLabel hint="(optional)">Specialties</FieldLabel>
        <TagInput value={form.specialties} onChange={(v) => set({ specialties: v })} suggestions={["Tajweed", "Hifz", "Children's education"]} placeholder="e.g. Tajweed" />
      </div>

      <div>
        <FieldLabel hint="(optional)">Years of experience</FieldLabel>
        <input type="number" min="0" value={form.yearsExperience} onChange={(e) => set({ yearsExperience: e.target.value })} placeholder="e.g. 8"
          className="w-40 border border-stone-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500" />
      </div>
    </div>

    <p className="text-xs text-stone-400 mt-3 inline-flex items-center gap-1"><Star size={12} /> All fields here are optional — you can add credentials later from your dashboard.</p>
  </div>
);

export default ScholarOnboardingWizard;
