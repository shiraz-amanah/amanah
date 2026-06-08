import { useState, useEffect } from "react";
import { Loader2, Check, X, BadgeCheck, Mail, Phone, Clock, Building2 } from "lucide-react";
import { getMosqueClaims, updateMosqueClaimStatus } from "../auth";
import { sendMosqueClaimApproved } from "../lib/email";

// Platform admin → Claims. Pending mosque claims with Approve / Reject. Approving
// fires the signup-link email (mosque_claim_approved) to the claimant.
const fmt = (d) => { try { return new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return d; } };
const STATUS_STYLE = {
  pending: "bg-amber-50 border-amber-200 text-amber-700",
  approved: "bg-emerald-50 border-emerald-200 text-emerald-700",
  rejected: "bg-stone-100 border-stone-200 text-stone-500",
};

const AdminClaims = () => {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [busy, setBusy] = useState(null);

  const load = () => { setLoading(true); getMosqueClaims().then((c) => setClaims(c || [])).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  const act = async (claim, status) => {
    setBusy(claim.id);
    const { error } = await updateMosqueClaimStatus(claim.id, status);
    if (!error) {
      if (status === "approved") sendMosqueClaimApproved(claim.id).catch(() => {});
      setClaims((cs) => cs.map((c) => c.id === claim.id ? { ...c, status } : c));
    }
    setBusy(null);
  };

  const shown = claims.filter((c) => filter === "all" || c.status === filter);
  const pendingCount = claims.filter((c) => c.status === "pending").length;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold text-stone-900 tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Mosque claims</h2>
          <p className="text-sm text-stone-600">{pendingCount} pending review.</p>
        </div>
        <div className="flex gap-1 border border-stone-200 rounded-lg p-0.5">
          {["pending", "approved", "rejected", "all"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`text-xs font-medium px-3 py-1.5 rounded-md capitalize ${filter === f ? "bg-emerald-900 text-white" : "text-stone-600 hover:bg-stone-100"}`}>{f}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
      ) : shown.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center">
          <BadgeCheck className="mx-auto text-stone-300 mb-3" size={36} />
          <p className="text-stone-500 text-sm">No {filter === "all" ? "" : filter} claims.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((c) => (
            <div key={c.id} className="bg-white border border-stone-200 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-900 inline-flex items-center gap-1.5"><Building2 size={14} className="text-emerald-700" /> {c.mosque?.name || "Mosque"}{c.mosque?.city ? <span className="text-stone-400 font-normal">· {c.mosque.city}</span> : null}</p>
                  <p className="text-sm text-stone-700 mt-1.5"><span className="font-medium">{c.claimant_name}</span>{c.claimant_role ? ` · ${c.claimant_role}` : ""}</p>
                  <p className="text-xs text-stone-500 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="inline-flex items-center gap-1"><Mail size={11} /> {c.claimant_email}</span>
                    {c.claimant_phone && <span className="inline-flex items-center gap-1"><Phone size={11} /> {c.claimant_phone}</span>}
                    <span className="inline-flex items-center gap-1"><Clock size={11} /> {fmt(c.created_at)}</span>
                  </p>
                  {c.verification_note && <p className="text-xs text-stone-600 mt-2 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">{c.verification_note}</p>}
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full border capitalize shrink-0 ${STATUS_STYLE[c.status] || ""}`}>{c.status}</span>
              </div>
              {c.status === "pending" && (
                <div className="flex justify-end gap-2 mt-3">
                  <button onClick={() => act(c, "rejected")} disabled={busy === c.id} className="text-sm font-medium border border-stone-300 text-stone-600 hover:border-rose-300 hover:text-rose-700 px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50"><X size={14} /> Reject</button>
                  <button onClick={() => act(c, "approved")} disabled={busy === c.id} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busy === c.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve &amp; send link</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminClaims;
