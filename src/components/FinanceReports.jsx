import { useState, useEffect, useMemo } from "react";
import { Loader2, BarChart3, Download, ShieldCheck, HandCoins, Gem, HandHeart, TrendingUp } from "lucide-react";
import { getSadaqah, getFinancePledges, getWaqfAssets, getFinanceCampaigns } from "../auth";
import { money } from "./FinanceSadaqah";
import FinanceAI from "./FinanceAI";

// Finance → Reports. Client-side aggregation across Sadaqah, Waqf and Pledges,
// with period filters + the Gift Aid (HMRC-format) claimable export. Owner-only.

const cardCls = "bg-white border border-stone-200 rounded-2xl p-5";
const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const downloadCsv = (rows, filename) => {
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const PERIODS = [["all", "All time"], ["month", "This month"], ["quarter", "This quarter"], ["year", "This year"]];
const inPeriod = (dateStr, period) => {
  if (period === "all" || !dateStr) return true;
  const d = new Date(dateStr); const now = new Date();
  if (period === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (period === "year") return d.getFullYear() === now.getFullYear();
  if (period === "quarter") return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3);
  return true;
};

const Stat = ({ label, value, sub, icon: Icon, accent }) => (
  <div className={cardCls}>
    <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium flex items-center gap-1">{Icon && <Icon size={11} />} {label}</p>
    <p className={`text-2xl font-semibold mt-1 ${accent || "text-stone-900"}`} style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{value}</p>
    {sub && <p className="text-xs text-stone-400 mt-0.5">{sub}</p>}
  </div>
);

const FinanceReports = ({ mosqueId, mosqueName }) => {
  const [sadaqah, setSadaqah] = useState([]);
  const [pledges, setPledges] = useState([]);
  const [waqf, setWaqf] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("all");

  useEffect(() => {
    let alive = true; setLoading(true);
    Promise.all([getSadaqah(mosqueId), getFinancePledges(mosqueId), getWaqfAssets(mosqueId), getFinanceCampaigns(mosqueId)])
      .then(([s, p, w, c]) => { if (alive) { setSadaqah(s); setPledges(p); setWaqf(w); setCampaigns(c); } })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosqueId]);

  const r = useMemo(() => {
    const sad = sadaqah.filter((d) => inPeriod(d.donation_date, period));
    const sadGeneral = sad.filter((d) => !d.campaign_id).reduce((s, d) => s + Number(d.amount), 0);
    const sadJariyah = sad.filter((d) => d.campaign_id).reduce((s, d) => s + Number(d.amount), 0);
    // Pledge payments in period
    const pledgePayments = pledges.flatMap((p) => (p.payments || []).map((pay) => ({ ...pay, pledge: p })));
    const received = pledges.reduce((s, p) => s + (p.payments || []).reduce((a, x) => a + Number(x.amount), 0), 0);
    const pledged = pledges.reduce((s, p) => s + Number(p.amount_pledged), 0);
    const outstanding = pledged - received;
    const fulfilment = pledged > 0 ? Math.round((received / pledged) * 100) : 0;
    // Waqf
    const principal = waqf.reduce((s, a) => s + Number(a.principal_amount), 0);
    const yieldGen = waqf.reduce((s, a) => s + Number(a.yield_generated), 0);
    const yieldDist = waqf.reduce((s, a) => s + Number(a.yield_distributed), 0);
    // Gift Aid rows: eligible sadaqah + payments on eligible pledges (in period)
    const gaRows = [];
    sad.filter((d) => d.gift_aid_eligible).forEach((d) => gaRows.push({ donor: d.donor_name || "Anonymous", address: d.donor_address || "", date: d.donation_date, amount: Number(d.amount) }));
    pledgePayments.filter((pay) => pay.pledge.gift_aid_eligible && inPeriod(pay.paid_date, period)).forEach((pay) => gaRows.push({ donor: pay.pledge.donor_name, address: pay.pledge.donor_address || "", date: pay.paid_date, amount: Number(pay.amount) }));
    const gaTotal = gaRows.reduce((s, x) => s + x.amount, 0);
    const gaClaim = gaTotal * 0.25;
    const totalIncome = sadGeneral + sadJariyah + received;
    return { sadGeneral, sadJariyah, received, pledged, outstanding, fulfilment, principal, yieldGen, yieldDist, gaRows, gaTotal, gaClaim, totalIncome };
  }, [sadaqah, pledges, waqf, period]);

  const exportGiftAid = () => {
    const header = ["Donor name", "Address", "Donation date", "Amount (£)", "Gift Aid claimed (£)"];
    const rows = [header, ...r.gaRows.map((x) => [x.donor, x.address, x.date || "", x.amount.toFixed(2), (x.amount * 0.25).toFixed(2)])];
    rows.push(["TOTAL", "", "", r.gaTotal.toFixed(2), r.gaClaim.toFixed(2)]);
    downloadCsv(rows, `gift-aid-${(mosqueName || "mosque").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${period}.csv`);
  };

  if (loading) return <div className="flex justify-center py-16 text-stone-400"><Loader2 size={22} className="animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Finance Reports</h2>
          <p className="text-sm text-stone-600">Income by category, Waqf, pledges and the Gift Aid (HMRC) claim.</p>
        </div>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} className="px-3 py-2 rounded-lg border border-stone-300 text-sm outline-none focus:border-brand-700">
          {PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <FinanceAI mosqueId={mosqueId} />

      {/* Income by category */}
      <div>
        <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><TrendingUp size={13} /> Income by category</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Sadaqah (general)" value={money(r.sadGeneral)} icon={HandHeart} />
          <Stat label="Sadaqah Jariyah" value={money(r.sadJariyah)} icon={HandHeart} sub="campaign-tied" />
          <Stat label="Pledges received" value={money(r.received)} icon={HandCoins} />
          <Stat label="Total income" value={money(r.totalIncome)} accent="text-brand-700" icon={BarChart3} />
        </div>
      </div>

      {/* Waqf + Pledge tracker */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Gem size={13} /> Waqf summary</h3>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Principal protected" value={money(r.principal)} icon={ShieldCheck} sub="never spent" />
            <Stat label="Yield available" value={money(r.yieldGen - r.yieldDist)} accent="text-brand-700" sub={`${money(r.yieldGen)} gen · ${money(r.yieldDist)} dist`} />
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><HandCoins size={13} /> Pledge tracker</h3>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Outstanding" value={money(r.outstanding)} accent="text-rose-700" sub={`${money(r.received)} of ${money(r.pledged)}`} />
            <Stat label="Fulfilment rate" value={`${r.fulfilment}%`} sub={`${pledges.length} pledge${pledges.length === 1 ? "" : "s"}`} />
          </div>
        </div>
      </div>

      {/* Gift Aid (HMRC) */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider flex items-center gap-1.5"><ShieldCheck size={13} /> Gift Aid — HMRC claim</h3>
          {r.gaRows.length > 0 && <button onClick={exportGiftAid} className="text-sm bg-brand-900 hover:bg-brand-800 text-white font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><Download size={13} /> Export CSV</button>}
        </div>
        <div className={cardCls}>
          <div className="flex items-center gap-6 mb-3">
            <div><p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium">Eligible donations</p><p className="text-xl font-semibold text-stone-900">{money(r.gaTotal)}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-brand-700 font-medium">Claimable (25%)</p><p className="text-xl font-semibold text-brand-700">{money(r.gaClaim)}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium">Records</p><p className="text-xl font-semibold text-stone-900">{r.gaRows.length}</p></div>
          </div>
          {r.gaRows.length ? (
            <div className="overflow-x-auto">
              <table className="hidden md:table w-full text-sm">
                <thead><tr className="text-left text-[10px] uppercase tracking-wider text-stone-400 border-b border-stone-100">
                  <th className="py-1.5 pr-3 font-medium">Donor</th><th className="py-1.5 pr-3 font-medium">Address</th><th className="py-1.5 pr-3 font-medium">Date</th><th className="py-1.5 pr-3 font-medium text-right">Amount</th><th className="py-1.5 font-medium text-right">Gift Aid</th>
                </tr></thead>
                <tbody>
                  {r.gaRows.map((x, i) => (
                    <tr key={i} className="border-b border-stone-50">
                      <td className="py-1.5 pr-3 text-stone-800">{x.donor}</td>
                      <td className="py-1.5 pr-3 text-stone-500 max-w-[180px] truncate">{x.address || <span className="text-amber-600">missing</span>}</td>
                      <td className="py-1.5 pr-3 text-stone-500">{x.date ? new Date(x.date).toLocaleDateString("en-GB") : "—"}</td>
                      <td className="py-1.5 pr-3 text-right text-stone-800">{money(x.amount)}</td>
                      <td className="py-1.5 text-right text-brand-700">{money(x.amount * 0.25)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Mobile card list — same Gift Aid rows, no horizontal scroll */}
              <div className="md:hidden divide-y divide-stone-50">
                {r.gaRows.map((x, i) => (
                  <div key={i} className="py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-stone-800 truncate">{x.donor}</p>
                      <div className="text-right shrink-0">
                        <p className="text-sm text-stone-800">{money(x.amount)}</p>
                        <p className="text-[11px] text-brand-700">+{money(x.amount * 0.25)} GA</p>
                      </div>
                    </div>
                    <p className="text-[11px] text-stone-500 mt-0.5 truncate">{x.date ? new Date(x.date).toLocaleDateString("en-GB") : "—"} · {x.address || <span className="text-amber-600">address missing</span>}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-sm text-stone-400">No Gift Aid–eligible donations in this period.</p>}
        </div>
      </div>
    </div>
  );
};

export default FinanceReports;
