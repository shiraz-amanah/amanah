import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Pencil, AlertCircle, Check, X, HandHeart, Sparkles, HandCoins } from "lucide-react";
import {
  getFinanceCampaigns, createFinanceCampaign, updateFinanceCampaign, deleteFinanceCampaign,
  getSadaqah, createSadaqah, updateSadaqah, deleteSadaqah,
} from "../auth";

// Finance → Sadaqah. General donations register + Sadaqah Jariyah campaigns
// (progress bars) + Gift Aid (25% uplift). Owner-only.

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-brand-700 focus:ring-2 focus:ring-brand-100 outline-none text-sm";
const cardCls = "bg-white border border-stone-200 rounded-2xl p-5 md:p-6";
export const money = (v) => `£${Number(v || 0).toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

const blankCamp = { name: "", description: "", target_amount: "", deadline: "" };
const blankDon = { campaign_id: "", donor_name: "", donor_address: "", amount: "", donation_date: "", purpose: "", gift_aid_eligible: false };

const FinanceSadaqah = ({ mosqueId }) => {
  const [campaigns, setCampaigns] = useState([]);
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [campForm, setCampForm] = useState(blankCamp);
  const [campEditing, setCampEditing] = useState(null);
  const [showCamp, setShowCamp] = useState(false);
  const [campBusy, setCampBusy] = useState(false);

  const [donForm, setDonForm] = useState(blankDon);
  const [donEditing, setDonEditing] = useState(null);
  const [showDon, setShowDon] = useState(false);
  const [donBusy, setDonBusy] = useState(false);

  const refresh = () => Promise.all([getFinanceCampaigns(mosqueId, "sadaqah_jariyah"), getSadaqah(mosqueId)])
    .then(([c, d]) => { setCampaigns(c); setDonations(d); });

  useEffect(() => {
    let alive = true; setLoading(true);
    Promise.all([getFinanceCampaigns(mosqueId, "sadaqah_jariyah"), getSadaqah(mosqueId)])
      .then(([c, d]) => { if (alive) { setCampaigns(c); setDonations(d); } })
      .catch((e) => { if (alive) setErr(e?.message || "Couldn't load."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  const raisedFor = (campId) => donations.filter((d) => d.campaign_id === campId).reduce((s, d) => s + Number(d.amount), 0);
  const totalRaised = donations.reduce((s, d) => s + Number(d.amount), 0);
  const giftAidClaimable = donations.filter((d) => d.gift_aid_eligible).reduce((s, d) => s + Number(d.amount) * 0.25, 0);

  const saveCamp = async () => {
    setErr(null);
    if (!campForm.name.trim()) { setErr("A campaign needs a name."); return; }
    setCampBusy(true);
    const fields = { name: campForm.name.trim(), description: campForm.description.trim() || null, target_amount: campForm.target_amount === "" ? null : Number(campForm.target_amount), deadline: campForm.deadline || null };
    const { error } = campEditing
      ? await updateFinanceCampaign(campEditing, fields)
      : await createFinanceCampaign({ mosqueId, kind: "sadaqah_jariyah", ...fields, targetAmount: fields.target_amount });
    setCampBusy(false);
    if (error) { setErr(error.message); return; }
    setCampForm(blankCamp); setCampEditing(null); setShowCamp(false); refresh();
  };
  const editCamp = (c) => { setCampEditing(c.id); setCampForm({ name: c.name, description: c.description || "", target_amount: c.target_amount ?? "", deadline: c.deadline || "" }); setShowCamp(true); };
  const removeCamp = async (id) => { const { error } = await deleteFinanceCampaign(id); if (error) setErr(error.message); else refresh(); };

  const saveDon = async () => {
    setErr(null);
    if (!donForm.amount || Number(donForm.amount) <= 0) { setErr("Enter a donation amount."); return; }
    setDonBusy(true);
    const fields = { campaignId: donForm.campaign_id || null, donorName: donForm.donor_name.trim() || null, donorAddress: donForm.donor_address.trim() || null, amount: Number(donForm.amount), donationDate: donForm.donation_date || null, purpose: donForm.purpose.trim() || null, giftAidEligible: donForm.gift_aid_eligible };
    const { error } = donEditing
      ? await updateSadaqah(donEditing, { campaign_id: fields.campaignId, donor_name: fields.donorName, donor_address: fields.donorAddress, amount: fields.amount, donation_date: fields.donationDate, purpose: fields.purpose, gift_aid_eligible: fields.giftAidEligible })
      : await createSadaqah({ mosqueId, ...fields });
    setDonBusy(false);
    if (error) { setErr(error.message); return; }
    setDonForm(blankDon); setDonEditing(null); setShowDon(false); refresh();
  };
  const editDon = (d) => { setDonEditing(d.id); setDonForm({ campaign_id: d.campaign_id || "", donor_name: d.donor_name || "", donor_address: d.donor_address || "", amount: d.amount, donation_date: d.donation_date || "", purpose: d.purpose || "", gift_aid_eligible: d.gift_aid_eligible }); setShowDon(true); };
  const removeDon = async (id) => { const { error } = await deleteSadaqah(id); if (error) setErr(error.message); else setDonations((xs) => xs.filter((x) => x.id !== id)); };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Sadaqah</h2>
        <p className="text-sm text-stone-600">Record donations and run Sadaqah Jariyah campaigns. <span className="text-stone-900 font-medium">{money(totalRaised)}</span> received{giftAidClaimable > 0 ? <> · <span className="text-brand-700 font-medium">{money(giftAidClaimable)}</span> Gift Aid claimable</> : null}.</p>
      </div>
      {err && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {err}</p>}
      {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={22} className="animate-spin" /></div> : (
        <>
          {/* Sadaqah Jariyah campaigns */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-lg font-semibold text-stone-900 flex items-center gap-1.5" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><Sparkles size={16} className="text-brand-700" /> Sadaqah Jariyah campaigns</h3>
              {!showCamp && <button onClick={() => setShowCamp(true)} className="text-sm text-brand-800 hover:text-brand-900 font-medium inline-flex items-center gap-1"><Plus size={14} /> New campaign</button>}
            </div>
            {showCamp && (
              <div className={cardCls + " mb-3"}>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label className={labelCls}>Name</label><input className={inputCls} value={campForm.name} onChange={(e) => setCampForm({ ...campForm, name: e.target.value })} placeholder="e.g. Roof fund" /></div>
                    <div><label className={labelCls}>Target (£)</label><input type="number" min="0" className={inputCls} value={campForm.target_amount} onChange={(e) => setCampForm({ ...campForm, target_amount: e.target.value })} /></div>
                    <div><label className={labelCls}>Deadline</label><input type="date" className={inputCls} value={campForm.deadline} onChange={(e) => setCampForm({ ...campForm, deadline: e.target.value })} /></div>
                  </div>
                  <div><label className={labelCls}>Description</label><textarea rows={2} className={inputCls + " resize-none"} value={campForm.description} onChange={(e) => setCampForm({ ...campForm, description: e.target.value })} /></div>
                  <div className="flex gap-2">
                    <button onClick={saveCamp} disabled={campBusy} className="bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{campBusy ? <Loader2 size={14} className="animate-spin" /> : campEditing ? <Check size={14} /> : <Plus size={14} />} {campEditing ? "Update" : "Create campaign"}</button>
                    <button onClick={() => { setCampForm(blankCamp); setCampEditing(null); setShowCamp(false); }} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2"><X size={14} className="inline" /> Cancel</button>
                  </div>
                </div>
              </div>
            )}
            {campaigns.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {campaigns.map((c) => {
                  const raised = raisedFor(c.id);
                  const pct = c.target_amount ? Math.min(100, Math.round((raised / Number(c.target_amount)) * 100)) : null;
                  return (
                    <div key={c.id} className={cardCls}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-stone-900">{c.name}</p>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => editCamp(c)} className="text-stone-400 hover:text-brand-700 p-1"><Pencil size={13} /></button>
                          <button onClick={() => removeCamp(c.id)} className="text-stone-400 hover:text-rose-700 p-1"><Trash2 size={13} /></button>
                        </div>
                      </div>
                      {c.description && <p className="text-xs text-stone-500 mt-0.5 line-clamp-2">{c.description}</p>}
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-medium text-stone-900">{money(raised)}</span>
                          {c.target_amount ? <span className="text-stone-400">of {money(c.target_amount)}</span> : <span className="text-stone-400">raised</span>}
                        </div>
                        {pct != null && <div className="h-2 rounded-full bg-stone-100 overflow-hidden"><div className="h-full bg-brand-600 rounded-full" style={{ width: `${pct}%` }} /></div>}
                        <div className="flex items-center justify-between text-[11px] text-stone-400 mt-1">{pct != null ? <span>{pct}%</span> : <span />}{c.deadline && <span>by {fmtDate(c.deadline)}</span>}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : !showCamp && <p className="text-sm text-stone-400">No campaigns yet.</p>}
          </div>

          {/* Donations register */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-lg font-semibold text-stone-900 flex items-center gap-1.5" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><HandCoins size={16} className="text-brand-700" /> Donations</h3>
              {!showDon && <button onClick={() => setShowDon(true)} className="text-sm text-brand-800 hover:text-brand-900 font-medium inline-flex items-center gap-1"><Plus size={14} /> Record donation</button>}
            </div>
            {showDon && (
              <div className={cardCls + " mb-3"}>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label className={labelCls}>Donor name</label><input className={inputCls} value={donForm.donor_name} onChange={(e) => setDonForm({ ...donForm, donor_name: e.target.value })} /></div>
                    <div><label className={labelCls}>Amount (£)</label><input type="number" min="0" step="0.01" className={inputCls} value={donForm.amount} onChange={(e) => setDonForm({ ...donForm, amount: e.target.value })} /></div>
                    <div><label className={labelCls}>Date</label><input type="date" className={inputCls} value={donForm.donation_date} onChange={(e) => setDonForm({ ...donForm, donation_date: e.target.value })} /></div>
                    <div><label className={labelCls}>Campaign</label><select className={inputCls} value={donForm.campaign_id} onChange={(e) => setDonForm({ ...donForm, campaign_id: e.target.value })}><option value="">General Sadaqah</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                    <div><label className={labelCls}>Purpose</label><input className={inputCls} value={donForm.purpose} onChange={(e) => setDonForm({ ...donForm, purpose: e.target.value })} /></div>
                    <div><label className={labelCls}>Donor address (for Gift Aid)</label><input className={inputCls} value={donForm.donor_address} onChange={(e) => setDonForm({ ...donForm, donor_address: e.target.value })} /></div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={donForm.gift_aid_eligible} onChange={(e) => setDonForm({ ...donForm, gift_aid_eligible: e.target.checked })} className="rounded border-stone-300 text-brand-700 focus:ring-brand-200" /> Gift Aid eligible (donor is a UK taxpayer &amp; has declared)</label>
                  <div className="flex gap-2">
                    <button onClick={saveDon} disabled={donBusy} className="bg-brand-900 hover:bg-brand-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{donBusy ? <Loader2 size={14} className="animate-spin" /> : donEditing ? <Check size={14} /> : <Plus size={14} />} {donEditing ? "Update" : "Record donation"}</button>
                    <button onClick={() => { setDonForm(blankDon); setDonEditing(null); setShowDon(false); }} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2"><X size={14} className="inline" /> Cancel</button>
                  </div>
                </div>
              </div>
            )}
            {donations.length ? (
              <div className="space-y-2">
                {donations.map((d) => (
                  <div key={d.id} className="bg-white border border-stone-200 rounded-xl p-3 flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full bg-brand-50 text-brand-800 flex items-center justify-center shrink-0"><HandHeart size={15} /></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-900 flex items-center gap-2 flex-wrap">{money(d.amount)} <span className="text-stone-400 font-normal">· {d.donor_name || "Anonymous"}</span>
                        {d.campaign?.name && <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">{d.campaign.name}</span>}
                        {d.gift_aid_eligible && <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">Gift Aid +{money(Number(d.amount) * 0.25)}</span>}
                      </p>
                      <p className="text-xs text-stone-500">{fmtDate(d.donation_date)}{d.purpose ? ` · ${d.purpose}` : ""}</p>
                    </div>
                    <button onClick={() => editDon(d)} className="text-stone-400 hover:text-brand-700 p-1.5"><Pencil size={13} /></button>
                    <button onClick={() => removeDon(d.id)} className="text-stone-400 hover:text-rose-700 p-1.5"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            ) : !showDon && <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-sm text-stone-500">No donations recorded yet.</div>}
          </div>
        </>
      )}
    </div>
  );
};

export default FinanceSadaqah;
