import { useState, useEffect, useRef, useCallback } from "react";
import DailyIframe from "@daily-co/daily-js";
import { Video, Clock, ExternalLink, AlertCircle } from "lucide-react";
import { getMeetingToken } from "../lib/video";

// Embedded Daily.co video call for a booking, shared by the family and scholar
// dashboards (Session T). Renders one of four states off the wall clock:
//
//   meetingUrl null            → renders nothing (in-person booking)
//   now < start - 5 min        → countdown ("Your session starts in …")
//   start - 5 min ≤ now ≤ end   → "Join session" button → embedded iframe
//   now > end (start+duration) → "Session ended"
//
// The Daily room is PRIVATE, so joining needs a per-participant meeting token
// fetched server-side (getMeetingToken → /api/daily?action=get-token). The frame is
// created lazily on the Join click — never on render — so multiple booking rows
// can mount this component without tripping Daily's "duplicate instance" guard,
// and the camera doesn't switch on until the user opts in. If the token fetch
// or the iframe fails, we fall back to a plain link to the room URL.
//
// Props (explicit, normalized — the two dashboards map their own booking shapes):
//   bookingId       string — bookings.id (for the token fetch)
//   meetingUrl      string — bookings.meeting_url (Daily room URL)
//   scheduledAt     string — ISO bookings.scheduled_at
//   durationMinutes number — bookings.duration_minutes (falls back to 60)

const JOIN_LEAD_MS = 5 * 60 * 1000;
// TODO(duration): bookings.duration_minutes exists and is passed through; this
// is only the fallback when a legacy row has it null.
const DEFAULT_DURATION_MINUTES = 60;
// Embedded call height — fixed so it doesn't reflow the booking row.
const FRAME_HEIGHT = 480;

function formatCountdown(ms) {
  const totalMin = Math.ceil(ms / 60000);
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m ? `${h} hr ${m} min` : `${h} hr`;
  }
  if (totalMin > 1) return `${totalMin} minutes`;
  return "less than a minute";
}

const VideoCallEmbed = ({ bookingId, meetingUrl, scheduledAt, durationMinutes }) => {
  // phase: idle (countdown/button/ended) → joining (frame mounting) → joined
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState(null); // 'token' | 'iframe' | null
  const [now, setNow] = useState(() => Date.now());
  const containerRef = useRef(null);
  const frameRef = useRef(null);

  const destroyFrame = useCallback(() => {
    if (frameRef.current) {
      try { frameRef.current.destroy(); } catch { /* already gone */ }
      frameRef.current = null;
    }
  }, []);

  // Tick once a second while idle so the countdown updates and the join window
  // opens live. Stops once we're in/entering the call (the iframe owns the DOM
  // then and doesn't need our re-renders).
  useEffect(() => {
    if (phase !== "idle") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Destroy the frame on unmount.
  useEffect(() => destroyFrame, [destroyFrame]);

  // Create + join the Daily frame once the container is in the DOM (phase flips
  // to 'joining' on the Join click, which renders the container).
  useEffect(() => {
    if (phase !== "joining" || !containerRef.current || frameRef.current) return;
    let cancelled = false;

    (async () => {
      const res = await getMeetingToken(bookingId);
      if (cancelled) return;
      if (!res.ok || !res.token) { setError("token"); setPhase("idle"); return; }

      try {
        // Defensive: tear down any stray global instance before creating ours.
        const existing = DailyIframe.getCallInstance?.();
        if (existing) { try { existing.destroy(); } catch { /* noop */ } }

        const frame = DailyIframe.createFrame(containerRef.current, {
          showLeaveButton: true,
          iframeStyle: { width: "100%", height: "100%", border: "0" },
        });
        frame.on("left-meeting", () => { destroyFrame(); setPhase("idle"); });
        frame.on("error", () => { setError("iframe"); destroyFrame(); setPhase("idle"); });
        frameRef.current = frame;
        await frame.join({ url: meetingUrl, token: res.token });
        if (cancelled) { destroyFrame(); return; }
        setPhase("joined");
      } catch {
        if (!cancelled) { setError("iframe"); destroyFrame(); setPhase("idle"); }
      }
    })();

    return () => { cancelled = true; };
  }, [phase, bookingId, meetingUrl, destroyFrame]);

  // In-person / no room — render nothing.
  if (!meetingUrl) return null;

  const startMs = new Date(scheduledAt).getTime();
  if (!Number.isFinite(startMs)) return null;
  const durMin = Number(durationMinutes) > 0 ? Number(durationMinutes) : DEFAULT_DURATION_MINUTES;
  const endMs = startMs + durMin * 60 * 1000;
  const openMs = startMs - JOIN_LEAD_MS;

  const fallbackLink = (
    <a
      href={meetingUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-800 hover:underline"
    >
      <ExternalLink size={14} /> Open video call in a new tab
    </a>
  );

  // Active call (or mounting it).
  if (phase === "joining" || phase === "joined") {
    return (
      <div className="space-y-2">
        <div
          ref={containerRef}
          style={{ height: FRAME_HEIGHT }}
          className="w-full rounded-xl overflow-hidden bg-stone-900"
        >
          {phase === "joining" && (
            <div className="h-full flex items-center justify-center text-stone-300 text-sm">
              Connecting to your session…
            </div>
          )}
        </div>
        {error === "iframe" && (
          <p className="text-xs text-rose-700 flex items-center gap-1.5">
            <AlertCircle size={12} /> Trouble loading the call. {fallbackLink}
          </p>
        )}
      </div>
    );
  }

  // now > session end
  if (now > endMs) {
    return (
      <div className="inline-flex items-center gap-2 text-sm text-stone-500 bg-stone-100 border border-stone-200 px-3 py-2 rounded-lg">
        <Clock size={14} /> Session ended
      </div>
    );
  }

  // before the 5-min join window
  if (now < openMs) {
    return (
      <div className="inline-flex items-center gap-2 text-sm text-stone-600 bg-stone-50 border border-stone-200 px-3 py-2 rounded-lg">
        <Clock size={14} className="text-emerald-700" />
        Your session starts in {formatCountdown(startMs - now)}
      </div>
    );
  }

  // within the join window
  return (
    <div className="space-y-2">
      <button
        onClick={() => { setError(null); setPhase("joining"); }}
        className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"
      >
        <Video size={14} /> Join session
      </button>
      {error === "token" && (
        <p className="text-xs text-rose-700 flex items-center gap-1.5">
          <AlertCircle size={12} /> Couldn't start the call. {fallbackLink}
        </p>
      )}
    </div>
  );
};

export default VideoCallEmbed;
