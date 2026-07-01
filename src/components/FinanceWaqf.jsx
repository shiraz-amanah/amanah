import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Pencil, AlertCircle, Check, X, Gem, ShieldCheck, Award, Sparkles } from "lucide-react";
import {
  getWaqfAssets, createWaqfAsset, updateWaqfAsset, deleteWaqfAsset,
  getFinanceCampaigns, createFinanceCampaign, updateFinanceCampaign, deleteFinanceCampaign,
  getGovernanceCommittee,
} from "../auth";
import { downloadWaqfCertificate } from "../lib/waqfCertificate";
import { money } from "./FinanceSadaqah";
import { roleLabel } from "./GovernanceCommittee";

// Finance → Waqf. Endowment asset register (principal PROTECTED, shown separately
// from yield) + Waqf campaigns + a per-asset PDF certificate + trustee link to
// the Governance committee. Owner-only.

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const cardCls = "bg-white border border-stone-200 rounded-2xl p-5 md:p-6";
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

const blankAsset = { name: "", description: "", purpose: "", donor_name: "", endowed_date: "", principal_amount: "", yield_generated: "", yield_distributed: "", yield_notes: "", trustee_committee_member_id: "" };
const blankCamp = { name: "", description: "", target_amount: "", deadline: "" };
const num = (v) => (v === "" || v == null ? null : Number(v));

const FinanceWaqf = ({ mosqueId, mosqueName }) => {
  const [assets, setAssets] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [committee, setCommittee] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [af, setAf] = useState(blankAsset);
  const [aEditing, setAEditing] = useState(null);
  const [showA, setShowA] = useState(false);
  const [aBusy, setABusy] = useState(false);

  const [cf, setCf] = useState(blankCamp);
  const [cEditing, setCEditing] = useState(null);
  const [showC, setShowC] = useState(false);
  const [cBusy, setCBusy] = useState(false);

  const refresh = () => Promise.all([getWaqfAssets(mosqueId), getFinanceCampaigns(mosqueId, "waqf"), getGovernanceCommittee(mosqueId)])
    .then(([a, c, cm]) => { setAssets(a); setCampaigns(c); setCommittee(cm.filter((x) => x.active)); });

  useEffect(() => {
    let alive = true; setLoading(true);
    Promise.all([getWaqfAssets(mosqueId), getFinanceCampaigns(mosqueId, "waqf"), getGovernanceCommittee(mosqueId)])
      .then(([a, c, cm]) => { if (alive) { setAssets(a); setCampaigns(c); setCommittee(cm.filter((x) => x.active)); } })
      .catch((e) => { if (alive) setErr(e?.message || "Couldn't load."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  const totalPrincipal = assets.reduce((s, a) => s + Number(a.principal_amount), 0);
  const totalAvailable = assets.reduce((s, a) => s + (Number(a.yield_generated) - Number(a.yield_distributed)), 0);

  const saveAsset = async () => {
    setErr(null);
    if (!af.name.trim()) { setErr("A Waqf asset needs a name."); return; }
    setABusy(true);
    const fields = { name: af.name.trim(), description: af.description.trim() || null, purpose: af.purpose.trim() || null, donor_name: af.donor_name.trim() || null, endowed_date: af.endowed_date || null, principal_amount: num(af.principal_amount) ?? 0, yield_generated: num(af.yield_generated) ?? 0, yield_distributed: num(af.yield_distributed) ?? 0, yield_notes: af.yield_notes.trim() || null, trustee_committee_member_id: af.trustee_committee_member_id || null };
    const { error } = aEditing
      ? await updateWaqfAsset(aEditing, fields)
      : await createWaqfAsset({ mosqueId, name: fields.name, description: fields.description, purpose: fields.purpose, donorName: fields.donor_name, endowedDate: fields.endowed_date, principalAmount: fields.principal_amount, yieldGenerated: fields.yield_generated, yieldDistributed: fields.yield_distributed, yieldNotes: fields.yield_notes, trusteeCommitteeMemberId: fields.trustee_committee_member_id });
    setABusy(false);
    if (error) { setErr(error.message); return; }
    setAf(blankAsset); setAEditing(null); setShowA(false); refresh();
  };
  const editAsset = (a) => { setAEditing(a.id); setAf({ name: a.name, description: a.description || "", purpose: a.purpose || "", donor_name: a.donor_name || "", endowed_date: a.endowed_date || "", principal_amount: a.principal_amount ?? "", yield_generated: a.yield_generated ?? "", yield_distributed: a.yield_distributed ?? "", yield_notes: a.yield_notes || "", trustee_committee_member_id: a.trustee_committee_member_id || "" }); setShowA(true); };
  const removeAsset = async (id) => { const { error } = await deleteWaqfAsset(id); if (error) setErr(error.message); else refresh(); };

  const saveCamp = async () => {
    setErr(null);
    if (!cf.name.trim()) { setErr("A campaign needs a name."); return; }
    setCBusy(true);
    const fields = { name: cf.name.trim(), description: cf.description.trim() || null, target_amount: num(cf.target_amount), deadline: cf.deadline || null };
    const { error } = cEditing ? await updateFinanceCampaign(cEditing, fields) : await createFinanceCampaign({ mosqueId, kind: "waqf", ...fields, targetAmount: fields.target_amount });
    setCBusy(false);
    if (error) { setErr(error.message); return; }
    setCf(blankCamp); setCEditing(null); setShowC(false); refresh();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Waqf</h2>
        <p className="text-sm text-stone-600"><span className="text-stone-900 font-medium">{money(totalPrincipal)}</span> endowed (protected) · <span className="text-emerald-700 font-medium">{money(totalAvailable)}</span> yield available for distribution.</p>
      </div>
      {err && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {err}</p>}
      {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={22} className="animate-spin" /></div> : (
        <>
          {/* Asset register */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-lg font-semibold text-stone-900 flex items-center gap-1.5" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><Gem size={16} className="text-emerald-700" /> Waqf asset register</h3>
              {!showA && <button onClick={() => setShowA(true)} className="text-sm text-emerald-800 hover:text-emerald-900 font-medium inline-flex items-center gap-1"><Plus size={14} /> Add asset</button>}
            </div>
            {showA && (
              <div className={cardCls + " mb-3"}>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label className={labelCls}>Name</label><input className={inputCls} value={af.name} onChange={(e) => setAf({ ...af, name: e.target.value })} placeholder="e.g. Endowed shop unit" /></div>
                    <div><label className={labelCls}>Purpose</label><input className={inputCls} value={af.purpose} onChange={(e) => setAf({ ...af, purpose: e.target.value })} placeholder="e.g. Madrasah bursaries" /></div>
                    <div><label className={labelCls}>Donor</label><input className={inputCls} value={af.donor_name} onChange={(e) => setAf({ ...af, donor_name: e.target.value })} /></div>
                    <div><label className={labelCls}>Endowed date</label><input type="date" className={inputCls} value={af.endowed_date} onChange={(e) => setAf({ ...af, endowed_date: e.target.value })} /></div>
                    <div><label className={labelCls}>Principal (£, protected)</label><input type="number" min="0" step="0.01" className={inputCls} value={af.principal_amount} onChange={(e) => setAf({ ...af, principal_amount: e.target.value })} /></div>
                    <div><label className={labelCls}>Trustee</label><select className={inputCls} value={af.trustee_committee_member_id} onChange={(e) => setAf({ ...af, trustee_committee_member_id: e.target.value })}><option value="">None</option>{committee.map((c) => <option key={c.id} value={c.id}>{c.name} · {roleLabel(c.role)}</option>)}</select></div>
                    <div><label className={labelCls}>Yield generated (£, cumulative)</label><input type="number" min="0" step="0.01" className={inputCls} value={af.yield_generated} onChange={(e) => setAf({ ...af, yield_generated: e.target.value })} /></div>
                    <div><label className={labelCls}>Yield distributed (£, cumulative)</label><input type="number" min="0" step="0.01" className={inputCls} value={af.yield_distributed} onChange={(e) => setAf({ ...af, yield_distributed: e.target.value })} /></div>
                  </div>
                  <div><label className={labelCls}>Description / yield notes</label><textarea rows={2} className={inputCls + " resize-none"} value={af.description} onChange={(e) => setAf({ ...af, description: e.target.value })} /></div>
                  <div className="flex gap-2">
                    <button onClick={saveAsset} disabled={aBusy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{aBusy ? <Loader2 size={14} className="animate-spin" /> : aEditing ? <Check size={14} /> : <Plus size={14} />} {aEditing ? "Update" : "Add asset"}</button>
                    <button onClick={() => { setAf(blankAsset); setAEditing(null); setShowA(false); }} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2"><X size={14} className="inline" /> Cancel</button>
                  </div>
                </div>
              </div>
            )}
            {assets.length ? (
              <div className="space-y-2">
                {assets.map((a) => {
                  const available = Number(a.yield_generated) - Number(a.yield_distributed);
                  return (
                    <div key={a.id} className={cardCls}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-stone-900 flex items-center gap-2 flex-wrap">{a.name}
                            {a.trustee?.name && <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">Trustee: {a.trustee.name}</span>}
                          </p>
                          {a.purpose && <p className="text-xs text-stone-500 mt-0.5">{a.purpose}{a.donor_name ? ` · endowed by ${a.donor_name}` : ""}{a.endowed_date ? ` · ${fmtDate(a.endowed_date)}` : ""}</p>}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => downloadWaqfCertificate({ donorName: a.donor_name, amount: a.principal_amount, purpose: a.purpose, mosqueName, date: a.endowed_date })} title="Waqf certificate (PDF)" className="text-stone-400 hover:text-emerald-700 p-1"><Award size={14} /></button>
                          <button onClick={() => editAsset(a)} className="text-stone-400 hover:text-emerald-700 p-1"><Pencil size={13} /></button>
                          <button onClick={() => removeAsset(a.id)} className="text-stone-400 hover:text-rose-700 p-1"><Trash2 size={13} /></button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
                          <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-medium flex items-center gap-1"><ShieldCheck size={11} /> Principal</p>
                          <p className="text-base font-semibold text-stone-900 mt-0.5">{money(a.principal_amount)}</p>
                          <p className="text-[10px] text-emerald-700">protected · never spent</p>
                        </div>
                        <div className="bg-stone-50 border border-stone-100 rounded-lg p-2.5">
                          <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium">Yield generated</p>
                          <p className="text-base font-semibold text-stone-900 mt-0.5">{money(a.yield_generated)}</p>
                          <p className="text-[10px] text-stone-400">{money(a.yield_distributed)} distributed</p>
                        </div>
                        <div className="bg-white border border-stone-200 rounded-lg p-2.5">
                          <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium">Available</p>
                          <p className="text-base font-semibold text-emerald-700 mt-0.5">{money(available)}</p>
                          <p className="text-[10px] text-stone-400">for distribution</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : !showA && <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-sm text-stone-500">No Waqf assets yet.</div>}
          </div>

          {/* Waqf campaigns */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-lg font-semibold text-stone-900 flex items-center gap-1.5" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><Sparkles size={16} className="text-emerald-700" /> Waqf campaigns</h3>
              {!showC && <button onClick={() => setShowC(true)} className="text-sm text-emerald-800 hover:text-emerald-900 font-medium inline-flex items-center gap-1"><Plus size={14} /> New campaign</button>}
            </div>
            {showC && (
              <div className={cardCls + " mb-3"}>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label className={labelCls}>Name</label><input className={inputCls} value={cf.name} onChange={(e) => setCf({ ...cf, name: e.target.value })} placeholder="e.g. Endow a madrasah place" /></div>
                    <div><label className={labelCls}>Target (£)</label><input type="number" min="0" className={inputCls} value={cf.target_amount} onChange={(e) => setCf({ ...cf, target_amount: e.target.value })} /></div>
                    <div><label className={labelCls}>Deadline</label><input type="date" className={inputCls} value={cf.deadline} onChange={(e) => setCf({ ...cf, deadline: e.target.value })} /></div>
                  </div>
                  <div><label className={labelCls}>Description</label><textarea rows={2} className={inputCls + " resize-none"} value={cf.description} onChange={(e) => setCf({ ...cf, description: e.target.value })} /></div>
                  <div className="flex gap-2">
                    <button onClick={saveCamp} disabled={cBusy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{cBusy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {cEditing ? "Update" : "Create campaign"}</button>
                    <button onClick={() => { setCf(blankCamp); setCEditing(null); setShowC(false); }} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2"><X size={14} className="inline" /> Cancel</button>
                  </div>
                </div>
              </div>
            )}
            {campaigns.length ? (
              <div className="space-y-2">
                {campaigns.map((c) => (
                  <div key={c.id} className="bg-white border border-stone-200 rounded-xl p-3 flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-800 flex items-center justify-center shrink-0"><Gem size={15} /></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-900 truncate">{c.name}{c.target_amount ? <span className="text-stone-400 font-normal"> · target {money(c.target_amount)}</span> : ""}</p>
                      {c.description && <p className="text-xs text-stone-500 line-clamp-1">{c.description}</p>}
                    </div>
                    <button onClick={() => { setCEditing(c.id); setCf({ name: c.name, description: c.description || "", target_amount: c.target_amount ?? "", deadline: c.deadline || "" }); setShowC(true); }} className="text-stone-400 hover:text-emerald-700 p-1.5"><Pencil size={13} /></button>
                    <button onClick={async () => { const { error } = await deleteFinanceCampaign(c.id); if (error) setErr(error.message); else refresh(); }} className="text-stone-400 hover:text-rose-700 p-1.5"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            ) : !showC && <p className="text-sm text-stone-400">No Waqf campaigns yet.</p>}
          </div>
        </>
      )}
    </div>
  );
};

export default FinanceWaqf;
