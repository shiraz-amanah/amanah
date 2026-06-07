import { useState, useEffect } from "react";
import { Loader2, Video, ExternalLink, Square, Radio, AlertCircle } from "lucide-react";
import { startMadrasaLiveLesson, endMadrasaLiveLesson, getActiveMadrasaSession } from "../auth";
import { createMadrasaRoom } from "../lib/video";

// Live lesson control (Session AL, item 14) — teacher/admin side. Start creates a
// madrasa_sessions row (RLS) then a Daily room via the extended create-daily-room
// API; parents see a Join button on their dashboard while it's live. End closes it.

const MadrasaLiveLesson = ({ classObj }) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    window.open(s.room_url, "_blank", "noopener,noreferrer");
  };

  const end = async () => {
    setBusy(true); setError("");
    const { error: e } = await endMadrasaLiveLesson(session.id);
    setBusy(false);
    if (e) { setError(e.message || "Couldn't end the lesson."); return; }
    setSession(null);
  };

  if (loading) return <div className="bg-white border border-stone-200 rounded-2xl p-6 flex justify-center text-stone-400"><Loader2 size={18} className="animate-spin" /></div>;

  if (session) {
    return (
      <div className="bg-white border border-emerald-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-rose-700"><Radio size={13} className="animate-pulse" /> Live now</span>
        </div>
        <p className="text-sm text-stone-600 mb-3">Remote students can join from their parent dashboard and are auto-marked present.</p>
        <div className="flex flex-wrap gap-2">
          {session.room_url && <a href={session.room_url} target="_blank" rel="noopener noreferrer" className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Video size={14} /> Open room</a>}
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
