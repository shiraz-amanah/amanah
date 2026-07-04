import { useState, useEffect } from "react";
import { Loader2, Video, ExternalLink, Square, Radio, AlertCircle } from "lucide-react";
import { startMadrasaLiveLesson, endMadrasaLiveLesson, getActiveMadrasaSession } from "../auth";
import { createMadrasaRoom } from "../lib/video";
import MadrasaLiveRoom from "./MadrasaLiveRoom";

// Live lesson control (Session AL, item 14) — teacher/admin side. Start creates a
// madrasa_sessions row (RLS) then a Daily room via the extended create-daily-room
// API; parents see a Join button on their dashboard while it's live. End closes it.
//
// `compact` renders a slim inline variant for the Register tab (the primary entry
// point as of Session AV): a secondary "Start" bar when idle, a prominent
// "Live lesson in progress" banner when active. The full card (no `compact`) still
// lives under More. Both share this one component so the start/end/Daily logic
// has a single home — don't fork it.

const MadrasaLiveLesson = ({ classObj, compact = false }) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showRoom, setShowRoom] = useState(false); // pre-join + embedded call modal

  useEffect(() => {
    let alive = true; setLoading(true);
    getActiveMadrasaSession(classObj.id)
      .then((s) => { if (alive) setSession(s); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [classObj.id]);

  const start = async () => {
    setBusy(true); setError("");
    const { data, error: e } = await startMadrasaLiveLesson({ classId: classObj.id, mosqueId: classObj.mosque_id });
    if (e || !data) { setBusy(false); setError(e?.message || "Couldn't start the lesson."); return; }
    let s = data;
    if (!s.room_url) {
      const r = await createMadrasaRoom(s.id);
      if (!r.ok) { setBusy(false); setSession(s); setError("Lesson started, but the video room couldn't be created — check the Daily.co setup."); return; }
      s = { ...s, room_url: r.url, room_name: r.roomName };
    }
    setBusy(false); setSession(s);
    setShowRoom(true); // open the pre-join screen instead of a new tab
  };

  // Shared modal (pre-join camera/mic check → embedded Daily call).
  const roomModal = showRoom && session?.room_url ? (
    <MadrasaLiveRoom roomUrl={session.room_url} title={`${classObj.name || "Class"} — Live lesson`} onClose={() => setShowRoom(false)} />
  ) : null;

  const end = async () => {
    setBusy(true); setError("");
    const { error: e } = await endMadrasaLiveLesson(session.id);
    setBusy(false);
    if (e) { setError(e.message || "Couldn't end the lesson."); return; }
    setSession(null);
  };

  if (loading) {
    if (compact) return <div className="bg-white border border-stone-200 rounded-xl px-4 py-3 flex items-center gap-2 text-stone-400 text-sm"><Loader2 size={15} className="animate-spin" /> Checking live lesson…</div>;
    return <div className="bg-white border border-stone-200 rounded-2xl p-6 flex justify-center text-stone-400"><Loader2 size={18} className="animate-spin" /></div>;
  }

  // ---- Compact variant for the Register tab ----
  if (compact) {
    if (session) {
      return (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
          {roomModal}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-rose-700"><Radio size={14} className="animate-pulse" /> Live lesson in progress</span>
            <div className="flex items-center gap-2">
              {session.room_url && <button onClick={() => setShowRoom(true)} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><Video size={14} /> Join</button>}
              <button onClick={end} disabled={busy} className="border border-rose-300 text-rose-700 hover:bg-rose-100 disabled:opacity-40 text-sm font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />} End</button>
            </div>
          </div>
          <p className="text-xs text-rose-700/80 mt-1.5">Remote students join from their parent dashboard and are auto-marked present.</p>
          {error && <p className="text-sm text-amber-700 flex items-center gap-1.5 mt-2"><AlertCircle size={14} /> {error}</p>}
        </div>
      );
    }
    return (
      <div className="bg-white border border-stone-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0 inline-flex items-center gap-2 text-sm text-stone-600">
          <Video size={16} className="text-stone-400 shrink-0" />
          <span>Teaching remote students today? Start a live video lesson — joiners are auto-marked present.</span>
        </div>
        <div className="shrink-0">
          <button onClick={start} disabled={busy} className="border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 text-sm font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Video size={14} />} Start live lesson</button>
          {error && <p className="text-xs text-rose-700 flex items-center gap-1.5 mt-1.5"><AlertCircle size={13} /> {error}</p>}
        </div>
      </div>
    );
  }

  if (session) {
    return (
      <div className="bg-white border border-emerald-200 rounded-2xl p-5">
        {roomModal}
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-rose-700"><Radio size={13} className="animate-pulse" /> Live now</span>
        </div>
        <p className="text-sm text-stone-600 mb-3">Remote students can join from their parent dashboard and are auto-marked present.</p>
        <div className="flex flex-wrap gap-2">
          {session.room_url && <button onClick={() => setShowRoom(true)} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Video size={14} /> Join</button>}
          <button onClick={end} disabled={busy} className="border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-40 text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />} End lesson</button>
        </div>
        {error && <p className="text-sm text-amber-700 flex items-center gap-1.5 mt-3"><AlertCircle size={14} /> {error}</p>}
      </div>
    );
  }

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-6 text-center">
      <Video className="mx-auto text-stone-300 mb-2" size={28} />
      <p className="text-sm text-stone-600 max-w-md mx-auto mb-3">Start a live video lesson for this class. Remote students get a Join button on their parent dashboard and are auto-marked present when they join.</p>
      <button onClick={start} disabled={busy} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Video size={14} />} Start live lesson</button>
      {error && <p className="text-sm text-rose-700 flex items-center justify-center gap-1.5 mt-3"><AlertCircle size={14} /> {error}</p>}
    </div>
  );
};

export default MadrasaLiveLesson;
