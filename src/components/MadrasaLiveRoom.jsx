import { useState, useEffect, useRef, useCallback } from "react";
import DailyIframe from "@daily-co/daily-js";
import { Loader2, Video, VideoOff, Mic, MicOff, X, AlertCircle, ExternalLink, Check, RotateCw } from "lucide-react";

// Pre-join + embedded live lesson (Improvement 1). Replaces the old
// window.open(room_url) for BOTH the teacher control and the parent Join button.
//
// Flow: on open we request camera+mic via getUserMedia and show a live self-view
// + device status + camera/mic toggle controls, so the user sets themselves up
// before entering. Join honours the toggles (startVideoOff/startAudioOff). On join we stop
// the preview stream (releasing the camera) and mount the Daily PREBUILT call
// (DailyIframe.createFrame) into the modal — Daily owns the in-call UI (tiles,
// leave, device switching, mobile front/rear camera). The madrasa room is public,
// so no meeting token is needed. onJoin fires at the moment of joining (the parent
// uses it to auto-mark their child present+remote).

const MadrasaLiveRoom = ({ roomUrl, title, onClose, onJoin, onRetry }) => {
  const [phase, setPhase] = useState("prejoin"); // prejoin | joining | incall
  const [permState, setPermState] = useState("pending"); // pending|granted|granted-audio|denied|no-device|unsupported|error
  const [camReady, setCamReady] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [camOn, setCamOn] = useState(false); // pre-join camera toggle (intent)
  const [micOn, setMicOn] = useState(false); // pre-join mic toggle (intent)
  const [joinError, setJoinError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [joined, setJoined] = useState(false); // Daily 'joined-meeting' fired → hide the overlay

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const containerRef = useRef(null);
  const frameRef = useRef(null);
  const videoOffRef = useRef(false); // passed to Daily as startVideoOff
  const audioOffRef = useRef(false); // passed to Daily as startAudioOff
  // Keep the latest onClose without putting it in the join effect's deps — it's an
  // inline arrow from the parent, so depending on it re-runs the effect on every
  // parent render and cancels the in-flight join (stuck on "Connecting").
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const stopPreview = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  }, []);
  const destroyFrame = useCallback(() => {
    if (frameRef.current) { try { frameRef.current.destroy(); } catch { /* already gone */ } frameRef.current = null; }
  }, []);

  // Request devices on open → live preview + status.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setPermState("unsupported"); return; }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        const hasVid = s.getVideoTracks().length > 0, hasAud = s.getAudioTracks().length > 0;
        setCamReady(hasVid); setMicReady(hasAud);
        setCamOn(hasVid); setMicOn(hasAud); // both on by default
        setPermState("granted");
      } catch (err) {
        if (cancelled) return;
        if (err?.name === "NotAllowedError" || err?.name === "SecurityError") { setPermState("denied"); return; }
        // No camera — fall back to audio-only so the user can still join.
        try {
          const s = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
          streamRef.current = s;
          setMicReady(true); setCamReady(false); setMicOn(true); setCamOn(false); setPermState("granted-audio");
        } catch (e2) {
          if (!cancelled) setPermState(e2?.name === "NotAllowedError" ? "denied" : "no-device");
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Attach the preview stream to the <video> whenever it's available in prejoin.
  // Setting srcObject alone can leave a black frame — an explicit play() is needed
  // on real browsers (autoplay doesn't retrigger when the source is set post-mount).
  useEffect(() => {
    const v = videoRef.current;
    if (phase === "prejoin" && v && streamRef.current) {
      if (v.srcObject !== streamRef.current) v.srcObject = streamRef.current;
      v.play?.().catch(() => {});
    }
  }, [phase, permState]);

  // Tear everything down on unmount.
  useEffect(() => () => { stopPreview(); destroyFrame(); }, [stopPreview, destroyFrame]);

  // Pre-join toggles — enable/disable the live preview track and remember the
  // intent, which is passed to Daily as startVideoOff / startAudioOff on join.
  const toggleCam = () => {
    const t = streamRef.current?.getVideoTracks?.()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setCamOn(t.enabled);
  };
  const toggleMic = () => {
    const t = streamRef.current?.getAudioTracks?.()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setMicOn(t.enabled);
  };

  const join = () => {
    videoOffRef.current = !camOn; // join with the camera/mic state chosen in pre-join
    audioOffRef.current = !micOn;
    stopPreview();          // release the camera before Daily grabs it
    onJoin?.();             // parent auto-mark present+remote fires here
    setJoinError(false);
    setJoined(false);
    setPhase("joining");
  };

  // End the stale session + start a fresh one (teacher only). onRetry updates the
  // parent's session with a new room_url → this modal re-renders room-ready.
  const doRetry = async () => {
    if (retrying || !onRetry) return;
    setRetrying(true);
    try { await onRetry(); } finally { setRetrying(false); }
  };

  // Mount + join the Daily prebuilt frame once the container is in the DOM.
  useEffect(() => {
    console.log("[join] effect started, phase:", phase, "roomUrl:", roomUrl);
    if (phase !== "joining" || !containerRef.current || frameRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const existing = DailyIframe.getCallInstance?.();
        if (existing) { try { existing.destroy(); } catch { /* noop */ } }
        const frame = DailyIframe.createFrame(containerRef.current, {
          showLeaveButton: true,
          iframeStyle: { width: "100%", height: "100%", border: "0" },
        });
        // 'joined-meeting' is the canonical "we're in" signal — drive the UI off it
        // (fires on this live instance via postMessage, independent of the await).
        frame.on("joined-meeting", () => { console.log("[join] joined-meeting event"); setJoined(true); setPhase("incall"); });
        frame.on("left-meeting", () => { destroyFrame(); onCloseRef.current?.(); });
        frame.on("error", (ev) => { console.error("[MadrasaLiveRoom] Daily error:", ev?.errorMsg || ev?.error || ev); setJoinError(true); setJoined(false); destroyFrame(); setPhase("prejoin"); });
        frameRef.current = frame;
        console.log("[MadrasaLiveRoom] joining Daily room:", roomUrl);
        await frame.join({ url: roomUrl, startVideoOff: videoOffRef.current, startAudioOff: audioOffRef.current });
        console.log("[join] frame.join() resolved, cancelled?", cancelled);
        if (cancelled) { destroyFrame(); return; }
        console.log("[join] setting incall + joined");
        setJoined(true);
        setPhase("incall");
      } catch (err) { console.error("[MadrasaLiveRoom] join failed:", err?.message || err); if (!cancelled) { setJoinError(true); destroyFrame(); setPhase("prejoin"); } }
    })();
    return () => { console.log("[join] effect cleanup — cancelled set true"); cancelled = true; };
  }, [phase, roomUrl, destroyFrame]);

  // Definitive phase/joined tracker — confirms state actually propagates to render.
  useEffect(() => { console.log("[MadrasaLiveRoom] render state → phase:", phase, "joined:", joined); }, [phase, joined]);

  const StatusPill = ({ ok, blocked, icon: Icon, blockedIcon: BIcon, label }) => (
    <div className="flex items-center gap-2 text-sm">
      {ok ? <Icon size={16} className="text-emerald-600" /> : <BIcon size={16} className="text-stone-400" />}
      <span className="text-stone-700">{label}:</span>
      <span className={ok ? "font-medium text-emerald-700" : blocked ? "font-medium text-rose-600" : "text-stone-500"}>
        {ok ? "✅ Ready" : blocked ? "🚫 Blocked" : "Not found"}
      </span>
    </div>
  );

  const denied = permState === "denied";
  const noRoom = !roomUrl; // session exists but the Daily room isn't ready yet
  const inCall = phase === "joining" || phase === "incall";

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${inCall ? "max-w-4xl" : "max-w-lg"} overflow-hidden`}>
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-stone-200">
          <p className="text-sm font-semibold text-stone-900 inline-flex items-center gap-2 min-w-0">
            <Video size={16} className="text-emerald-700 shrink-0" /> <span className="truncate">{title || "Live lesson"}</span>
          </p>
          <button onClick={() => { stopPreview(); destroyFrame(); onClose?.(); }} className="text-stone-400 hover:text-stone-700 shrink-0" aria-label="Close"><X size={18} /></button>
        </div>

        {inCall ? (
          <div ref={containerRef} style={{ height: "min(70vh, 560px)" }} className="relative w-full bg-stone-900">
            {/* Overlay (absolute) so the Daily iframe underneath is always full-size;
                hidden the moment Daily reports 'joined-meeting' — not tied to phase. */}
            {!joined && (
              <div className="absolute inset-0 z-10 flex items-center justify-center text-stone-300 text-sm gap-2 bg-stone-900"><Loader2 size={16} className="animate-spin" /> Connecting to the lesson…</div>
            )}
          </div>
        ) : (
          <div className="p-5">
            {/* Camera preview + toggle controls */}
            <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-stone-900 mb-4">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover [transform:scaleX(-1)]" />
              {permState === "pending" && <div className="absolute inset-0 flex items-center justify-center text-stone-300 text-sm gap-2"><Loader2 size={16} className="animate-spin" /> Checking your camera & mic…</div>}
              {(denied || permState === "no-device") && <div className="absolute inset-0 flex items-center justify-center text-stone-400"><VideoOff size={28} /></div>}
              {permState === "granted-audio" && <div className="absolute inset-0 flex items-center justify-center text-stone-300 text-sm gap-2"><VideoOff size={18} /> No camera — audio only</div>}
              {(permState === "granted" || permState === "granted-audio") && camReady && !camOn && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 text-stone-300 text-sm bg-stone-900"><VideoOff size={20} /> Camera off</div>
              )}
              {/* Toggle bar */}
              {(permState === "granted" || permState === "granted-audio") && (camReady || micReady) && (
                <div className="absolute bottom-2 inset-x-0 flex items-center justify-center gap-2">
                  {camReady && (
                    <button onClick={toggleCam} aria-pressed={camOn} aria-label={camOn ? "Turn camera off" : "Turn camera on"} title={camOn ? "Turn camera off" : "Turn camera on"} className={`h-9 w-9 rounded-full flex items-center justify-center shadow ${camOn ? "bg-white/90 text-stone-800 hover:bg-white" : "bg-stone-600 text-stone-300"}`}>{camOn ? <Video size={17} /> : <VideoOff size={17} />}</button>
                  )}
                  {micReady && (
                    <button onClick={toggleMic} aria-pressed={micOn} aria-label={micOn ? "Mute microphone" : "Unmute microphone"} title={micOn ? "Mute microphone" : "Unmute microphone"} className={`h-9 w-9 rounded-full flex items-center justify-center shadow ${micOn ? "bg-white/90 text-stone-800 hover:bg-white" : "bg-stone-600 text-stone-300"}`}>{micOn ? <Mic size={17} /> : <MicOff size={17} />}</button>
                  )}
                </div>
              )}
            </div>

            {/* Device status */}
            <div className="space-y-1.5 mb-4">
              <StatusPill ok={micReady} blocked={denied} icon={Mic} blockedIcon={MicOff} label="Microphone" />
              <StatusPill ok={camReady} blocked={denied} icon={Video} blockedIcon={VideoOff} label="Camera" />
            </div>

            {denied ? (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm text-rose-800 mb-4">
                <p className="font-medium inline-flex items-center gap-1.5"><AlertCircle size={14} /> Camera & microphone are blocked</p>
                <p className="text-[13px] mt-1 text-rose-700">Allow access from your browser's site settings (tap the camera/lock icon in the address bar), then reopen this window. You can still join with audio if you allow the microphone.</p>
              </div>
            ) : noRoom ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                <p className="text-sm text-amber-800 inline-flex items-center gap-1.5"><AlertCircle size={14} /> The video room isn't ready yet{onRetry ? " — this session started without one." : "."}</p>
                {onRetry && (
                  <button onClick={doRetry} disabled={retrying} className="mt-2 bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-1.5">
                    {retrying ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />} End session and retry
                  </button>
                )}
              </div>
            ) : joinError ? (
              <p className="text-sm text-amber-700 flex items-center gap-1.5 mb-4"><AlertCircle size={14} /> Couldn't connect to the room. <a href={roomUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-800 hover:underline inline-flex items-center gap-1"><ExternalLink size={13} /> Open in a new tab</a></p>
            ) : null}

            {/* Action — a single Join that honours the camera/mic toggles above */}
            <button onClick={join} disabled={noRoom || denied || (!camReady && !micReady)} className="w-full bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-200 disabled:text-stone-400 text-white text-sm font-medium px-4 py-2.5 rounded-lg inline-flex items-center justify-center gap-1.5">
              <Video size={15} /> Join lesson{camReady || micReady ? ` (${camOn ? "camera on" : "camera off"}, ${micOn ? "mic on" : "mic off"})` : ""}
            </button>
            {!denied && permState !== "pending" && !camReady && !micReady && (
              <p className="text-xs text-stone-400 mt-2 text-center">No camera or microphone found. Connect a device and reopen.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MadrasaLiveRoom;
