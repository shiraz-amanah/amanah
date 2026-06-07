import { useState, useEffect } from "react";
import {
  Sparkles, Loader2, Users, ShieldCheck, Calendar, MessageCircle, Clock,
  ClipboardCheck, AlertCircle, CalendarDays, FileText, Activity,
  UserPlus, CalendarPlus, Search, ListChecks, AlertTriangle,
} from "lucide-react";
import { getMosqueBriefing } from "../lib/hrAssistant";
import { getMosqueStaff, getMosqueEvents, getMosqueTimeLogs, getMosqueRota, getMosqueDocuments } from "../auth";
import Markdown from "./Markdown";

// Session W — admin Dashboard (default landing). AI morning briefing on top
// (server-side mode:'mosque_ops'), quick stats, today's rota with gaps in red,
// a document-expiry widget, a derived recent-activity feed and quick actions.
// Recent activity has no audit-log table yet, so it is DERIVED from created_at
// across staff / events / documents — not a true event log.

const PRAYER_SLOTS = [["fajr", "Fajr"], ["dhuhr", "Dhuhr"], ["asr", "Asr"], ["maghrib", "Maghrib"], ["isha", "Isha"]];
const mondayOf = (d) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return x.toISOString().slice(0, 10); };
const todayStr = () => new Date().toISOString().slice(0, 10);
const in30Str = () => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); };
const todayKey = () => new Date().toLocaleDateString("en-GB", { weekday: "long" }).toLowerCase();
const isThisWeek = (iso) => { if (!iso) return false; const m = mondayOf(new Date()); const x = new Date(m + "T00:00:00"); x.setDate(x.getDate() + 7); return iso >= m && iso < x.toISOString().slice(0, 10); };

// Traffic light for an expiry date: red=expired, amber=<30d, green=valid.
const expiryTone = (iso) => {
  if (!iso) return "stone";
  if (iso < todayStr()) return "rose";
  if (iso <= in30Str()) return "amber";
  return "emerald";
};
const toneCls = { rose: "bg-rose-50 border-rose-200 text-rose-700", amber: "bg-amber-50 border-amber-200 text-amber-700", emerald: "bg-emerald-50 border-emerald-200 text-emerald-700", stone: "bg-stone-50 border-stone-200 text-stone-500" };

// Clickable when onClick is provided (all dashboard tiles route somewhere).
const StatCard = ({ icon: Icon, label, value, tone = "stone", onClick }) => {
  const inner = (
    <>
      <div className="flex items-center gap-1.5 text-stone-500 mb-1"><Icon size={14} /><span className="text-[11px] uppercase tracking-wider font-semibold">{label}</span></div>
      <p className={`text-2xl font-semibold ${tone === "rose" ? "text-rose-700" : tone === "amber" ? "text-amber-700" : "text-stone-900"}`} style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{value}</p>
    </>
  );
  if (!onClick) return <div className="bg-white border border-stone-200 rounded-2xl p-4">{inner}</div>;
  return <button onClick={onClick} className="bg-white border border-stone-200 rounded-2xl p-4 text-left hover:border-emerald-300 hover:shadow-sm transition-all">{inner}</button>;
};

const MosqueOverview = ({ mosque, conversations, onNavigate }) => {
  const [brief, setBrief] = useState(null);
  const [briefLoading, setBriefLoading] = useState(true);
  const [briefError, setBriefError] = useState(false);

  const [staff, setStaff] = useState([]);
  const [events, setEvents] = useState([]);
  const [timesheets, setTimesheets] = useState([]);
  const [rotaSlots, setRotaSlots] = useState({});
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  // AI briefing — independent of the data widgets so a slow/failed Anthropic
  // call never blocks the dashboard.
  useEffect(() => {
    if (!mosque?.id) return;
    let alive = true; setBriefLoading(true); setBriefError(false);
    getMosqueBriefing(mosque.id)
      .then((r) => { if (!alive) return; if (r.ok) setBrief(r.brief); else setBriefError(true); })
      .catch(() => { if (alive) setBriefError(true); })
      .finally(() => { if (alive) setBriefLoading(false); });
    return () => { alive = false; };
  }, [mosque?.id]);

  useEffect(() => {
    if (!mosque?.id) return;
    let alive = true; setLoading(true);
    Promise.all([
      getMosqueStaff(mosque.id),
      getMosqueEvents(mosque.id),
      getMosqueTimeLogs(mosque.id),
      getMosqueRota(mosque.id, mondayOf(new Date())),
      getMosqueDocuments(mosque.id),
    ])
      .then(([s, e, t, r, d]) => {
        if (!alive) return;
        setStaff((s || []).filter((x) => !x.archived));
        setEvents(e || []);
        setTimesheets(t || []);
        setRotaSlots(r?.slots || {});
        setDocs(d || []);
      })
      .catch((err) => console.error("dashboard load failed:", err))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mosque?.id]);

  const nameById = Object.fromEntries(staff.map((s) => [s.id, s.name]));
  const totalStaff = staff.length;
  const dbsVerified = staff.filter((s) => s.dbs_status === "verified").length;
  const dbsPct = totalStaff ? Math.round((dbsVerified / totalStaff) * 100) : 0;
  const eventsThisWeek = events.filter((e) => isThisWeek(e.date)).length;
  const unread = (conversations || []).reduce((sum, c) => sum + (c.unread || 0), 0);
  const tsPending = timesheets.filter((t) => t.clock_out && t.status === "pending").length;
  const expiringDocs = docs.filter((d) => d.expiry_date && d.expiry_date <= in30Str());
  const todaySlots = rotaSlots[todayKey()] || {};

  // Next 5 expiring docs (soonest first; already ordered by the query).
  const upcomingExpiry = docs.filter((d) => d.expiry_date).slice(0, 5);

  // Staff who completed remote onboarding and await admin review/approval.
  const reviewPending = staff.filter((s) => s.wizard_status === "completed" && s.invite_status === "not_invited");

  // Derived recent-activity feed (no audit log yet).
  const activity = [
    ...reviewPending.map((s) => ({ when: s.created_at, text: `${s.name || "Unnamed staff member"} completed onboarding — review pending`, flag: true })),
    ...staff.map((s) => ({ when: s.created_at, text: `${s.name || "Unnamed staff member"} added to staff` })),
    ...events.map((e) => ({ when: e.created_at, text: `Event "${e.title}" created` })),
    ...docs.map((d) => ({ when: d.created_at, text: `Document "${d.label}" uploaded` })),
  ].filter((a) => a.when).sort((a, b) => (a.when < b.when ? 1 : -1)).slice(0, 10);

  const QUICK = [
    { icon: UserPlus, label: "Add staff", to: ["people", "team"] },
    { icon: CalendarPlus, label: "Create event", to: ["mosque", "events"] },
    { icon: Search, label: "Find substitute", to: ["people", "rotas"] },
    { icon: ListChecks, label: "Manage waiting list", to: ["madrasah"] },
    { icon: AlertTriangle, label: "Log incident", to: ["compliance", "safeguarding"] },
  ];

  return (
    <div className="space-y-6">
      <div className="mb-1">
        <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Dashboard</h2>
        <p className="text-sm text-stone-600">{mosque.name}{mosque.city ? ` · ${mosque.city}` : ""}</p>
      </div>

      {/* AI daily briefing */}
      <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900 mb-2"><Sparkles size={16} /> Daily briefing</div>
        {briefLoading ? <div className="flex items-center gap-2 text-sm text-stone-400"><Loader2 size={14} className="animate-spin" /> Preparing your briefing…</div>
          : briefError ? <p className="text-sm text-stone-500">Your briefing is unavailable right now. The stats below are live.</p>
          : <Markdown text={brief} />}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard icon={Users} label="Total staff" value={loading ? "—" : totalStaff} onClick={() => onNavigate?.("people", "team")} />
        <StatCard icon={ShieldCheck} label="DBS verified" value={loading ? "—" : `${dbsPct}%`} tone={dbsPct < 100 && totalStaff ? "amber" : "stone"} onClick={() => onNavigate?.("people", "hr")} />
        <StatCard icon={Calendar} label="Events this week" value={loading ? "—" : eventsThisWeek} onClick={() => onNavigate?.("mosque", "events")} />
        <StatCard icon={MessageCircle} label="Unread messages" value={unread} onClick={() => onNavigate?.("messages")} />
        <StatCard icon={Clock} label="Timesheets pending" value={loading ? "—" : tsPending} tone={tsPending ? "amber" : "stone"} onClick={() => onNavigate?.("people", "timesheets")} />
        <StatCard icon={ClipboardCheck} label="Docs expiring" value={loading ? "—" : expiringDocs.length} tone={expiringDocs.length ? "amber" : "stone"} onClick={() => onNavigate?.("compliance", "documents")} />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        {QUICK.map((q) => { const Icon = q.icon; return (
          <button key={q.label} onClick={() => onNavigate?.(...q.to)} className="inline-flex items-center gap-1.5 text-sm text-stone-700 bg-white border border-stone-300 hover:border-stone-400 px-3 py-2 rounded-lg">
            <Icon size={14} /> {q.label}
          </button>
        ); })}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Today's rota */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-stone-900 mb-3 flex items-center gap-1.5"><CalendarDays size={15} /> Today's rota</h3>
          <ul className="divide-y divide-stone-100">
            {PRAYER_SLOTS.map(([slot, label]) => {
              const id = todaySlots[slot];
              const name = id ? (nameById[id] || "(removed)") : null;
              return (
                <li key={slot} className="py-2 flex items-center justify-between text-sm">
                  <span className="text-stone-600">{label}</span>
                  {name ? <span className="font-medium text-stone-800">{name}</span>
                    : <span className="text-[11px] px-2 py-0.5 rounded-full border bg-rose-50 border-rose-200 text-rose-700 font-medium">No cover</span>}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Document expiry widget */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-stone-900 mb-3 flex items-center gap-1.5"><FileText size={15} /> Expiring documents</h3>
          {loading ? <div className="flex justify-center py-4 text-stone-400"><Loader2 size={16} className="animate-spin" /></div>
            : upcomingExpiry.length === 0 ? <p className="text-sm text-stone-500">No documents with expiry dates yet. Add them under HR and Compliance.</p>
            : <ul className="divide-y divide-stone-100">{upcomingExpiry.map((d) => { const tone = expiryTone(d.expiry_date); return (
                <li key={d.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                  <span className="text-stone-700 truncate">{d.label}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap ${toneCls[tone]}`}>{d.expiry_date}</span>
                </li>
              ); })}</ul>}
          <button onClick={() => onNavigate?.("compliance", "documents")} className="mt-3 text-xs font-medium text-emerald-800 hover:text-emerald-900">View all documents →</button>
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-stone-900 mb-3 flex items-center gap-1.5"><Activity size={15} /> Recent activity</h3>
        {loading ? <div className="flex justify-center py-4 text-stone-400"><Loader2 size={16} className="animate-spin" /></div>
          : activity.length === 0 ? <p className="text-sm text-stone-500">Nothing yet. Activity appears as you add staff, events and documents.</p>
          : <ul className="space-y-1.5">{activity.map((a, i) => (
              <li key={i} className={`flex items-start gap-2 text-sm ${a.flag ? "text-amber-800" : "text-stone-700"}`}>
                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${a.flag ? "bg-amber-500" : "bg-stone-300"}`} />
                {a.flag
                  ? <button onClick={() => onNavigate?.("people", "team")} className="flex-1 text-left font-medium hover:underline">{a.text}</button>
                  : <span className="flex-1">{a.text}</span>}
                <span className="text-xs text-stone-400 whitespace-nowrap">{(a.when || "").slice(0, 10)}</span>
              </li>
            ))}</ul>}
      </div>

      <p className="text-xs text-stone-400 flex items-center gap-1"><AlertCircle size={12} /> Activity is derived from recent records; a full audit log is coming.</p>
    </div>
  );
};

export default MosqueOverview;
