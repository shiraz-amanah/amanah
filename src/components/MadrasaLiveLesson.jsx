import { useState, useEffect } from "react";
import { Loader2, Video, ExternalLink, Square, Radio, AlertCircle } from "lucide-react";
import { startMadrasaLiveLesson, endMadrasaLiveLesson, getActiveMadrasaSession } from "../auth";
import { createMadrasaRoom } from "../lib/video";
import { sendMadrasaLessonStarted } from "../lib/email";
import MadrasaLiveRoom from "./MadrasaLiveRoom";

// Live lesson control (Session AL, item 14) — teacher/admin side. Start creates a
// madrasa_sessions row (RLS) then a Daily room via /api/daily (action=create-room)
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
  const [expanded, setExpanded] = useState(false); // hybrid only: inline room shown (camera requested on tap, not on mount)

  useEffect(() => {
    let alive = true; setLoading(true);
    getActiveMadrasaSession(classObj.id)
      .then((s) => { if (alive) setSession(s); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [classObj.id]);

  const start = async ({ forceNew = false } = {}) => {
    setBusy(true); setError("");
    // Reuse an active session if one exists (e.g. a stale one from a previous run),
    // otherwise start a new one. forceNew (retry path) skips reuse so a brand-new
    // session id — one that definitely exists — reaches room creation.
    const { data, error: e } = await startMadrasaLiveLesson({ classId: classObj.id, mosqueId: classObj.mosque_id, forceNew });
    if (e || !data) { setBusy(false); setError(e?.message || "Couldn't start the lesson."); return; }
    let s = data;
    // Ensure the session has a Daily room; create one if it doesn't yet. A room
    // failure no longer blocks the pre-join — we still open it and surface the error.
    if (!s.room_url) {
      const r = await createMadrasaRoom(s.id);
      if (r.ok) s = { ...s, room_url: r.url, room_name: r.roomName };
      else setError("The video room couldn't be created — check the Daily.co setup.");
    }
    setBusy(false); setSession(s);
    // Remote shows the inline room automatically while a session is active; hybrid
    // stays a compact bar until the teacher taps Join — starting counts as that tap.
    if (compact) setExpanded(true);
    // Fire-and-forget: notify remote students' parents (bell + email). No-ops if none.
    sendMadrasaLessonStarted(s.id).catch(() => {});
  };

  // End a stale (room-less) session and start a fresh one — recovers a session
  // created before DAILY_API_KEY was set, without the teacher having to close,
  // find End, and Start again. Reuses start() so a new room is created.
  const retry = async () => {
    if (session) await endMadrasaLiveLesson(session.id).catch(() => {});
    setSession(null);
    await start({ forceNew: true }); // never reuse a stale/deleted session id
  };

  // Inline embedded room (2a) — no modal on the register screen. Remote shows it
  // whenever a session is active (video-first); hybrid shows it only once the
  // teacher taps Join/Start (`expanded`), so the camera isn't grabbed just for
  // opening the register. Gated on the SESSION, not the room URL, so a stale
  // room-less session still opens the pre-join (which handles the missing room +
  // retry). onRetry is teacher-only; onClose collapses hybrid back to the compact
  // bar — remote has no collapse (End lesson is the control).
  const inlineRoom = session && (!compact || expanded) ? (
    <MadrasaLiveRoom embedded roomUrl={session.room_url} title={`${classObj.name || "Class"} — Live lesson`} onRetry={retry} onClose={compact ? () => setExpanded(false) : undefined} />
  ) : null;

  const end = async () => {
    setBusy(true); setError("");
    const { error: e } = await endMadrasaLiveLesson(session.id);
    setBusy(false);
    if (e) { setError(e.message || "Couldn't end the lesson."); return; }
    setSession(null); setExpanded(false);
  };

  if (loading) {
    if (compact) return <div className="bg-white border border-stone-200 rounded-xl px-4 py-3 flex items-center gap-2 text-stone-400 text-sm"><Loader2 size={15} className="animate-spin" /> Checking live lesson…</div>;
    return <div className="bg-white border border-stone-200 rounded-2xl p-6 flex justify-center text-stone-400"><Loader2 size={18} className="animate-spin" /></div>;
  }

  // ---- Compact variant for the Register tab ----
  if (compact) {
    if (session) {
      return (
        <div className="space-y-3">
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-rose-700"><Radio size={14} className="animate-pulse" /> Live lesson in progress</span>
              <div className="flex items-center gap-2">
                {!expanded && <button onClick={() => setExpanded(true)} className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"><Video size={14} /> Join</button>}
                <button onClick={end} disabled={busy} className="border border-rose-300 text-rose-700 hover:bg-rose-100 disabled:opacity-40 text-sm font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />} End</button>
              </div>
            </div>
            <p className="text-xs text-rose-700/80 mt-1.5">Remote students join from their parent dashboard and are auto-marked present.</p>
            {error && <p className="text-sm text-amber-700 flex items-center gap-1.5 mt-2"><AlertCircle size={14} /> {error}</p>}
          </div>
          {/* Inline room appears above the split register once the teacher taps Join */}
          {inlineRoom}
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
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-rose-700"><Radio size={13} className="animate-pulse" /> Live now</span>
            <p className="text-xs text-stone-500 mt-1">Remote students join from their parent dashboard and are auto-marked present.</p>
          </div>
          <button onClick={end} disabled={busy} className="border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-40 text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5 shrink-0">{busy ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />} End lesson</button>
        </div>
        {/* Room embedded inline below the selector — no modal, no "open" button */}
        {inlineRoom}
        {error && <p className="text-sm text-amber-700 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}
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
