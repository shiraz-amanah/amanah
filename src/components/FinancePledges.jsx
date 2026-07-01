import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import {
  Loader2, Plus, Trash2, Pencil, AlertCircle, Check, X, HandCoins, Radio, Download, Lock, Sparkles, ChevronRight, ArrowLeft, CircleDollarSign,
} from "lucide-react";
import {
  getFinancePledges, createPledge, updatePledge, deletePledge, addPledgePayment,
  getFinanceCampaigns, createFinanceCampaign, deleteFinanceCampaign,
  getPledgeSessions, createPledgeSession, closePledgeSession, getSessionPledges, subscribeToPledges,
} from "../auth";
import { money } from "./FinanceSadaqah";

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";
const cardCls = "bg-white border border-stone-200 rounded-2xl p-5 md:p-6";
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const today = () => new Date().toISOString().slice(0, 10);
const num = (v) => (v === "" || v == null ? null : Number(v));
const paidOf = (p) => (p.payments || []).reduce((s, x) => s + Number(x.amount), 0);
const statusOf = (p) => {
  const paid = paidOf(p); const out = Number(p.amount_pledged) - paid;
  if (out <= 0.001) return "fulfilled";
  if (p.due_date && p.due_date < today()) return "overdue";
  if (paid > 0) return "partial";
  return "outstanding";
};
const STATUS = { fulfilled: ["Fulfilled", "bg-emerald-50 text-emerald-800 border-emerald-200"], partial: ["Partial", "bg-amber-50 text-amber-700 border-amber-200"], outstanding: ["Outstanding", "bg-stone-100 text-stone-600 border-stone-200"], overdue: ["Overdue", "bg-rose-50 text-rose-700 border-rose-200"] };
const isOpen = (s) => !s.closed_at && (!s.closes_at || new Date(s.closes_at) > new Date());

// ---- Pledge Night live dashboard (QR + realtime running total + feed) ----
const PledgeNightLive = ({ session, mosqueId, onBack, onChanged }) => {
  const [sess, setSess] = useState(session);
  const [rows, setRows] = useState([]);
  const [qr, setQr] = useState(null);
  const seen = useRef(new Set());
  const open = isOpen(sess);
  const url = `${window.location.origin}/pledge?mosque=${mosqueId}&session=${session.id}`;

  useEffect(() => { QRCode.toDataURL(url, { width: 320, margin: 1, color: { dark: "#1c1917", light: "#ffffff" } }).then(setQr).catch(() => {}); }, [url]);
  useEffect(() => {
    let alive = true;
    getSessionPledges(session.id).then((r) => { if (alive) { seen.current = new Set(r.map((x) => x.id)); setRows(r); } });
    return () => { alive = false; };
  }, [session.id]);
  useEffect(() => subscribeToPledges(session.id, (raw) => { if (seen.current.has(raw.id)) return; seen.current.add(raw.id); setRows((xs) => [raw, ...xs]); }), [session.id]);

  const total = rows.reduce((s, r) => s + Number(r.amount_pledged), 0);
  const close = async () => { const { data } = await closePledgeSession(session.id); if (data) { setSess(data); onChanged?.(); } };

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm text-stone-600 hover:text-stone-900 inline-flex items-center gap-1.5"><ArrowLeft size={15} /> Back to pledges</button>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{sess.name}</h2>
          <p className="text-sm text-stone-600">Live Pledge Night — pledges arrive in real time.</p>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full font-medium uppercase tracking-wider ${open ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-stone-100 text-stone-500 border border-stone-200"}`}>{open ? <><Radio size={10} /> Live</> : <><Lock size={10} /> Closed</>}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={cardCls + " text-center"}>
          <p className="text-[11px] uppercase tracking-wider text-emerald-700 font-semibold">Running total</p>
          <p className="text-4xl md:text-5xl font-semibold text-stone-900 my-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{money(total)}</p>
          <p className="text-sm text-stone-500">{rows.length} pledge{rows.length === 1 ? "" : "s"}</p>
          {open && <button onClick={close} className="mt-4 border border-stone-300 hover:bg-stone-50 text-stone-700 text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Lock size={14} /> Close session</button>}
        </div>
        <div className={cardCls}>
          {open ? (
            <>
              <p className="text-sm font-medium text-stone-900 mb-1">Scan to pledge</p>
              <p className="text-xs text-stone-500 mb-3">Display this on screen. Pledges appear here instantly.</p>
              {qr ? <img src={qr} alt="Pledge QR" className="w-48 h-48 mx-auto rounded-xl border border-stone-200" /> : <div className="w-48 h-48 mx-auto flex items-center justify-center text-stone-300"><Loader2 size={24} className="animate-spin" /></div>}
              {qr && <div className="text-center mt-2"><a href={qr} download="pledge-qr.png" className="text-xs text-emerald-800 hover:text-emerald-900 inline-flex items-center gap-1"><Download size={12} /> Download QR</a></div>}
            </>
          ) : <p className="text-sm text-stone-500">This session is closed.</p>}
        </div>
      </div>

      <div className={cardCls}>
        <p className="text-sm font-medium text-stone-900 mb-3 flex items-center gap-1.5">{open && <Radio size={13} className="text-emerald-600 animate-pulse" />} Pledge feed ({rows.length})</p>
        {rows.length ? (
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-2.5 text-sm py-1">
                <span className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-800 flex items-center justify-center shrink-0 text-xs font-medium">{(r.donor_name || "?").slice(0, 1).toUpperCase()}</span>
                <span className="flex-1 min-w-0 truncate text-stone-800">{r.donor_name}</span>
                <span className="font-semibold text-stone-900 shrink-0">{money(r.amount_pledged)}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-stone-400 text-center py-4">No pledges yet{open ? " — waiting for the first scan…" : "."}</p>}
      </div>
    </div>
  );
};

const blankPledge = { campaign_id: "", donor_name: "", donor_email: "", donor_address: "", amount_pledged: "", due_date: "", gift_aid_eligible: false };
const blankCamp = { name: "", target_amount: "", deadline: "" };

const FinancePledges = ({ mosqueId }) => {
  const [pledges, setPledges] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [pf, setPf] = useState(blankPledge);
  const [pEditing, setPEditing] = useState(null);
  const [showP, setShowP] = useState(false);
  const [pBusy, setPBusy] = useState(false);
  const [payFor, setPayFor] = useState(null); // pledge id
  const [payAmt, setPayAmt] = useState("");
  const [fStatus, setFStatus] = useState("all");
  const [liveId, setLiveId] = useState(null);
  const [showCamp, setShowCamp] = useState(false);
  const [cf, setCf] = useState(blankCamp);
  const [newSess, setNewSess] = useState("");

  const refresh = () => Promise.all([getFinancePledges(mosqueId), getFinanceCampaigns(mosqueId, "pledge"), getPledgeSessions(mosqueId)])
    .then(([p, c, s]) => { setPledges(p); setCampaigns(c); setSessions(s); });
  useEffect(() => {
    let alive = true; setLoading(true);
    Promise.all([getFinancePledges(mosqueId), getFinanceCampaigns(mosqueId, "pledge"), getPledgeSessions(mosqueId)])
      .then(([p, c, s]) => { if (alive) { setPledges(p); setCampaigns(c); setSessions(s); } })
      .catch((e) => { if (alive) setErr(e?.message || "Couldn't load."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  const savePledge = async () => {
    setErr(null);
    if (!pf.donor_name.trim() || !pf.amount_pledged) { setErr("A pledge needs a donor and amount."); return; }
    setPBusy(true);
    const fields = { campaign_id: pf.campaign_id || null, donor_name: pf.donor_name.trim(), donor_email: pf.donor_email.trim() || null, donor_address: pf.donor_address.trim() || null, amount_pledged: Number(pf.amount_pledged), due_date: pf.due_date || null, gift_aid_eligible: pf.gift_aid_eligible };
    const { error } = pEditing
      ? await updatePledge(pEditing, fields)
      : await createPledge({ mosqueId, campaignId: fields.campaign_id, donorName: fields.donor_name, donorEmail: fields.donor_email, donorAddress: fields.donor_address, amountPledged: fields.amount_pledged, dueDate: fields.due_date, giftAidEligible: fields.gift_aid_eligible });
    setPBusy(false);
    if (error) { setErr(error.message); return; }
    setPf(blankPledge); setPEditing(null); setShowP(false); refresh();
  };
  const editPledge = (p) => { setPEditing(p.id); setPf({ campaign_id: p.campaign_id || "", donor_name: p.donor_name, donor_email: p.donor_email || "", donor_address: p.donor_address || "", amount_pledged: p.amount_pledged, due_date: p.due_date || "", gift_aid_eligible: p.gift_aid_eligible }); setShowP(true); };
  const removePledge = async (id) => { const { error } = await deletePledge(id); if (error) setErr(error.message); else setPledges((xs) => xs.filter((x) => x.id !== id)); };
  const recordPayment = async (p) => {
    const amt = Number(payAmt);
    if (!amt || amt <= 0) return;
    const { error } = await addPledgePayment({ pledgeId: p.id, mosqueId, amount: amt });
    if (error) { setErr(error.message); return; }
    setPayFor(null); setPayAmt(""); refresh();
  };
  const saveCamp = async () => {
    if (!cf.name.trim()) { setErr("A campaign needs a name."); return; }
    const { error } = await createFinanceCampaign({ mosqueId, kind: "pledge", name: cf.name.trim(), targetAmount: num(cf.target_amount), deadline: cf.deadline || null });
    if (error) { setErr(error.message); return; }
    setCf(blankCamp); setShowCamp(false); refresh();
  };
  const openSession = async () => {
    if (!newSess.trim()) return;
    const { data, error } = await createPledgeSession({ mosqueId, name: newSess.trim() });
    if (error) { setErr(error.message); return; }
    setNewSess(""); await refresh(); setLiveId(data.id);
  };

  const totalPledged = pledges.reduce((s, p) => s + Number(p.amount_pledged), 0);
  const totalReceived = pledges.reduce((s, p) => s + paidOf(p), 0);
  const filtered = pledges.filter((p) => fStatus === "all" || statusOf(p) === fStatus);

  const liveSession = liveId ? sessions.find((s) => s.id === liveId) : null;
  if (liveSession) return <PledgeNightLive session={liveSession} mosqueId={mosqueId} onBack={() => setLiveId(null)} onChanged={refresh} />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Pledges</h2>
        <p className="text-sm text-stone-600"><span className="text-stone-900 font-medium">{money(totalReceived)}</span> received of <span className="text-stone-900 font-medium">{money(totalPledged)}</span> pledged · <span className="text-rose-700 font-medium">{money(totalPledged - totalReceived)}</span> outstanding.</p>
      </div>
      {err && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {err}</p>}
      {loading ? <div className="flex justify-center py-10 text-stone-400"><Loader2 size={22} className="animate-spin" /></div> : (
        <>
          {/* Pledge Night */}
          <div className={cardCls}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-sm font-semibold text-stone-900 flex items-center gap-1.5"><Radio size={15} className="text-emerald-700" /> Pledge Night</p>
            </div>
            <div className="flex gap-2 mb-3">
              <input className={inputCls} value={newSess} onChange={(e) => setNewSess(e.target.value)} placeholder="Session name (e.g. Ramadan Pledge Night)" />
              <button onClick={openSession} disabled={!newSess.trim()} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg shrink-0 inline-flex items-center gap-1.5"><Radio size={14} /> Open live</button>
            </div>
            {sessions.length > 0 && (
              <div className="space-y-1.5">
                {sessions.map((s) => (
                  <button key={s.id} onClick={() => setLiveId(s.id)} className="w-full flex items-center gap-2 text-left bg-stone-50 hover:bg-stone-100 border border-stone-100 rounded-lg px-3 py-2 group">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${isOpen(s) ? "bg-emerald-500" : "bg-stone-300"}`} />
                    <span className="flex-1 min-w-0 text-sm text-stone-700 group-hover:text-emerald-800">{s.name} · {isOpen(s) ? "Live" : "Closed"}</span>
                    <ChevronRight size={15} className="text-stone-300" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pledge campaigns */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <h3 className="text-lg font-semibold text-stone-900 flex items-center gap-1.5" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><Sparkles size={16} className="text-emerald-700" /> Pledge campaigns</h3>
              {!showCamp && <button onClick={() => setShowCamp(true)} className="text-sm text-emerald-800 hover:text-emerald-900 font-medium inline-flex items-center gap-1"><Plus size={14} /> New</button>}
            </div>
            {showCamp && (
              <div className={cardCls + " mb-2"}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <div><label className={labelCls}>Name</label><input className={inputCls} value={cf.name} onChange={(e) => setCf({ ...cf, name: e.target.value })} /></div>
                  <div><label className={labelCls}>Target (£)</label><input type="number" className={inputCls} value={cf.target_amount} onChange={(e) => setCf({ ...cf, target_amount: e.target.value })} /></div>
                  <div><label className={labelCls}>Deadline</label><input type="date" className={inputCls} value={cf.deadline} onChange={(e) => setCf({ ...cf, deadline: e.target.value })} /></div>
                </div>
                <div className="flex gap-2"><button onClick={saveCamp} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Plus size={14} /> Create</button><button onClick={() => { setCf(blankCamp); setShowCamp(false); }} className="text-sm text-stone-600 px-3 py-2">Cancel</button></div>
              </div>
            )}
            {campaigns.length ? (
              <div className="flex flex-wrap gap-2">
                {campaigns.map((c) => {
                  const raised = pledges.filter((p) => p.campaign_id === c.id).reduce((s, p) => s + Number(p.amount_pledged), 0);
                  return <span key={c.id} className="inline-flex items-center gap-2 text-sm bg-white border border-stone-200 rounded-full pl-3 pr-1.5 py-1">{c.name} · <span className="font-medium">{money(raised)}</span>{c.target_amount ? <span className="text-stone-400">/{money(c.target_amount)}</span> : null} <button onClick={async () => { await deleteFinanceCampaign(c.id); refresh(); }} className="text-stone-300 hover:text-rose-600"><X size={13} /></button></span>;
                })}
              </div>
            ) : !showCamp && <p className="text-sm text-stone-400">No pledge campaigns yet.</p>}
          </div>

          {/* Register */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-lg font-semibold text-stone-900 flex items-center gap-1.5" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><HandCoins size={16} className="text-emerald-700" /> Pledge register</h3>
              {!showP && <button onClick={() => setShowP(true)} className="text-sm text-emerald-800 hover:text-emerald-900 font-medium inline-flex items-center gap-1"><Plus size={14} /> Add pledge</button>}
            </div>
            {showP && (
              <div className={cardCls + " mb-3"}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><label className={labelCls}>Donor name</label><input className={inputCls} value={pf.donor_name} onChange={(e) => setPf({ ...pf, donor_name: e.target.value })} /></div>
                  <div><label className={labelCls}>Amount pledged (£)</label><input type="number" min="0" step="0.01" className={inputCls} value={pf.amount_pledged} onChange={(e) => setPf({ ...pf, amount_pledged: e.target.value })} /></div>
                  <div><label className={labelCls}>Due date</label><input type="date" className={inputCls} value={pf.due_date} onChange={(e) => setPf({ ...pf, due_date: e.target.value })} /></div>
                  <div><label className={labelCls}>Campaign</label><select className={inputCls} value={pf.campaign_id} onChange={(e) => setPf({ ...pf, campaign_id: e.target.value })}><option value="">None</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                  <div><label className={labelCls}>Email</label><input className={inputCls} value={pf.donor_email} onChange={(e) => setPf({ ...pf, donor_email: e.target.value })} /></div>
                  <div><label className={labelCls}>Address (Gift Aid)</label><input className={inputCls} value={pf.donor_address} onChange={(e) => setPf({ ...pf, donor_address: e.target.value })} /></div>
                </div>
                <label className="flex items-center gap-2 text-sm text-stone-700 mt-3"><input type="checkbox" checked={pf.gift_aid_eligible} onChange={(e) => setPf({ ...pf, gift_aid_eligible: e.target.checked })} className="rounded border-stone-300 text-emerald-700 focus:ring-emerald-200" /> Gift Aid eligible</label>
                <div className="flex gap-2 mt-3"><button onClick={savePledge} disabled={pBusy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{pBusy ? <Loader2 size={14} className="animate-spin" /> : pEditing ? <Check size={14} /> : <Plus size={14} />} {pEditing ? "Update" : "Add pledge"}</button><button onClick={() => { setPf(blankPledge); setPEditing(null); setShowP(false); }} className="text-sm text-stone-600 px-3 py-2">Cancel</button></div>
              </div>
            )}
            <select className={inputCls + " sm:w-44 mb-3"} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="all">All statuses</option><option value="outstanding">Outstanding</option><option value="partial">Partial</option><option value="overdue">Overdue</option><option value="fulfilled">Fulfilled</option>
            </select>
            {filtered.length ? (
              <div className="space-y-2">
                {filtered.map((p) => {
                  const paid = paidOf(p); const out = Number(p.amount_pledged) - paid; const st = statusOf(p); const [lbl, cls] = STATUS[st];
                  return (
                    <div key={p.id} className="bg-white border border-stone-200 rounded-xl p-3">
                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium uppercase tracking-wider shrink-0 ${cls}`}>{lbl}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-stone-900 truncate flex items-center gap-2">{p.donor_name} {p.campaign?.name && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500">{p.campaign.name}</span>}{p.gift_aid_eligible && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Gift Aid</span>}</p>
                          <p className="text-xs text-stone-500">{money(paid)} of {money(p.amount_pledged)}{out > 0.001 ? ` · ${money(out)} outstanding` : ""}{p.due_date ? ` · due ${fmtDate(p.due_date)}` : ""}</p>
                        </div>
                        {out > 0.001 && <button onClick={() => { setPayFor(payFor === p.id ? null : p.id); setPayAmt(""); }} className="text-emerald-800 hover:text-emerald-900 text-sm font-medium inline-flex items-center gap-1 shrink-0"><CircleDollarSign size={14} /> Payment</button>}
                        <button onClick={() => editPledge(p)} className="text-stone-400 hover:text-emerald-700 p-1.5"><Pencil size={13} /></button>
                        <button onClick={() => removePledge(p.id)} className="text-stone-400 hover:text-rose-700 p-1.5"><Trash2 size={13} /></button>
                      </div>
                      {payFor === p.id && (
                        <div className="flex gap-2 mt-2 ml-16">
                          <input type="number" min="0" step="0.01" className={inputCls + " max-w-[160px]"} value={payAmt} onChange={(e) => setPayAmt(e.target.value)} placeholder={`Amount (max ${money(out)})`} />
                          <button onClick={() => recordPayment(p)} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-3 py-2 rounded-lg">Record</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-sm text-stone-500">{pledges.length ? "No pledges match the filter." : "No pledges yet."}</div>}
          </div>
        </>
      )}
    </div>
  );
};

export default FinancePledges;
