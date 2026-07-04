import { useState, useEffect, useRef } from "react";
import { Bell, Loader2, CheckCheck, GraduationCap, FileText, CalendarDays, Star, UserCheck, MessageCircle, Building2, ShieldCheck, Flag, FileCheck, Image, Hourglass } from "lucide-react";
import { getNotifications, markNotificationRead, markAllNotificationsRead, subscribeToNotifications } from "../auth";

// Header bell + notifications feed. Self-contained: loads the recipient's feed,
// shows an unread badge, opens a dropdown panel, marks read, and deep-links via
// the notification's `data` payload through the onNavigate(notification) prop
// (each mount site maps types → its own routing). Live via subscribeToNotifications.

const TYPE_ICON = {
  homework: GraduationCap, report: FileText, attendance: CalendarDays,
  reward: Star, cover_request: UserCheck, message: MessageCircle, system: Bell, photo: Image,
  waitlist: Hourglass,
  // admin types (095)
  scholar_application: GraduationCap, mosque_application: Building2,
  mosque_claim: ShieldCheck, flag: Flag, dbs_order: FileCheck,
};
const TYPE_TONE = {
  homework: "text-emerald-600", report: "text-emerald-600", attendance: "text-amber-600",
  reward: "text-amber-500", cover_request: "text-emerald-600", message: "text-stone-500", system: "text-stone-500", photo: "text-sky-600",
  waitlist: "text-emerald-600",
  scholar_application: "text-emerald-600", mosque_application: "text-emerald-600",
  mosque_claim: "text-amber-600", flag: "text-rose-600", dbs_order: "text-sky-600",
};

const timeAgo = (iso) => {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const NotificationBell = ({ userId, onNavigate }) => {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const unread = items.filter((n) => !n.read_at).length;

  const load = () => { setLoading(true); getNotifications().then((d) => setItems(d || [])).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  // Live inserts → prepend (de-duped).
  useEffect(() => {
    if (!userId) return;
    const ch = subscribeToNotifications(userId, (n) => setItems((prev) => prev.some((x) => x.id === n.id) ? prev : [n, ...prev]));
    return () => { try { ch && ch.unsubscribe(); } catch {} };
  }, [userId]);

  // Close on outside click / Escape.
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, []);

  const openItem = (n) => {
    if (!n.read_at) {
      setItems((prev) => prev.map((x) => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x));
      markNotificationRead(n.id);
    }
    setOpen(false);
    onNavigate?.(n);
  };
  const markAll = () => {
    setItems((prev) => prev.map((x) => x.read_at ? x : { ...x, read_at: new Date().toISOString() }));
    markAllNotificationsRead();
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => { setOpen((o) => !o); if (!open) load(); }} className={`relative p-2 rounded-lg ${open ? "text-emerald-800 bg-emerald-50" : "text-stone-600 hover:text-stone-900"}`} aria-label="Notifications">
        <Bell size={17} />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-semibold flex items-center justify-center">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-80 max-w-[92vw] bg-white border border-stone-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-100">
            <span className="text-sm font-semibold text-stone-900">Notifications</span>
            {unread > 0 && <button onClick={markAll} className="text-[11px] font-medium text-emerald-800 hover:text-emerald-900 inline-flex items-center gap-1"><CheckCheck size={13} /> Mark all read</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? <div className="flex justify-center py-8 text-stone-400"><Loader2 size={18} className="animate-spin" /></div>
              : items.length === 0 ? <p className="text-sm text-stone-500 text-center py-8 px-4">You're all caught up.</p>
              : items.map((n) => {
                  const Icon = TYPE_ICON[n.type] || Bell;
                  return (
                    <button key={n.id} onClick={() => openItem(n)} className={`w-full text-left flex gap-3 px-4 py-3 border-b border-stone-50 last:border-0 hover:bg-stone-50 ${!n.read_at ? "bg-emerald-50/40" : ""}`}>
                      <div className="w-8 h-8 rounded-lg bg-stone-50 border border-stone-100 flex items-center justify-center shrink-0"><Icon size={15} className={TYPE_TONE[n.type] || "text-stone-500"} /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-900 truncate">{n.title}</p>
                        {n.body && <p className="text-xs text-stone-500 line-clamp-2">{n.body}</p>}
                        <p className="text-[11px] text-stone-400 mt-0.5">{timeAgo(n.created_at)}</p>
                      </div>
                      {!n.read_at && <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />}
                    </button>
                  );
                })}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
