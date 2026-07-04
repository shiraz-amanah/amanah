import { useState, useEffect, useRef, useCallback } from "react";
import DailyIframe from "@daily-co/daily-js";
import { Loader2, Video, VideoOff, Mic, MicOff, X, AlertCircle, ExternalLink, Check } from "lucide-react";

// Pre-join + embedded live lesson (Improvement 1). Replaces the old
// window.open(room_url) for BOTH the teacher control and the parent Join button.
//
// Flow: on open we request camera+mic via getUserMedia and show a live self-view
// + device status, so the user checks themselves before entering. "Join lesson"
// enters with video+audio, "Join audio only" with the camera off. On join we stop
// the preview stream (releasing the camera) and mount the Daily PREBUILT call
// (DailyIframe.createFrame) into the modal — Daily owns the in-call UI (tiles,
// leave, device switching, mobile front/rear camera). The madrasa room is public,
// so no meeting token is needed. onJoin fires at the moment of joining (the parent
// uses it to auto-mark their child present+remote).

const MadrasaLiveRoom = ({ roomUrl, title, onClose, onJoin }) => {
  const [phase, setPhase] = useState("prejoin"); // prejoin | joining | incall
  const [permState, setPermState] = useState("pending"); // pending|granted|granted-audio|denied|no-device|unsupported|error
  const [camReady, setCamReady] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [joinError, setJoinError] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const containerRef = useRef(null);
  const frameRef = useRef(null);
  const audioOnlyRef = useRef(false);

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
        setCamReady(s.getVideoTracks().length > 0);
        setMicReady(s.getAudioTracks().length > 0);
        setPermState("granted");
      } catch (err) {
        if (cancelled) return;
        if (err?.name === "NotAllowedError" || err?.name === "SecurityError") { setPermState("denied"); return; }
        // No camera — fall back to audio-only so the user can still join.
        try {
          const s = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
          streamRef.current = s;
          setMicReady(true); setCamReady(false); setPermState("granted-audio");
        } catch (e2) {
          if (!cancelled) setPermState(e2?.name === "NotAllowedError" ? "denied" : "no-device");
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Attach the preview stream to the <video> whenever it's available in prejoin.
  useEffect(() => {
    if (phase === "prejoin" && videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
  }, [phase, permState]);

  // Tear everything down on unmount.
  useEffect(() => () => { stopPreview(); destroyFrame(); }, [stopPreview, destroyFrame]);

  const join = (audioOnly) => {
    audioOnlyRef.current = audioOnly;
    stopPreview();          // release the camera before Daily grabs it
    onJoin?.();             // parent auto-mark present+remote fires here
    setJoinError(false);
    setPhase("joining");
  };

  // Mount + join the Daily prebuilt frame once the container is in the DOM.
  useEffect(() => {
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
        frame.on("left-meeting", () => { destroyFrame(); onClose?.(); });
        frame.on("error", () => { setJoinError(true); destroyFrame(); setPhase("prejoin"); });
        frameRef.current = frame;
        await frame.join({ url: roomUrl, startVideoOff: audioOnlyRef.current, startAudioOff: false });
        if (cancelled) { destroyFrame(); return; }
        setPhase("incall");
      } catch { if (!cancelled) { setJoinError(true); destroyFrame(); setPhase("prejoin"); } }
    })();
    return () => { cancelled = true; };
  }, [phase, roomUrl, destroyFrame, onClose]);

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
          <div ref={containerRef} style={{ height: "min(70vh, 560px)" }} className="w-full bg-stone-900">
            {phase === "joining" && (
              <div className="h-full flex items-center justify-center text-stone-300 text-sm gap-2"><Loader2 size={16} className="animate-spin" /> Connecting to the lesson…</div>
            )}
          </div>
        ) : (
          <div className="p-5">
            {/* Camera preview */}
            <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-stone-900 mb-4">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover [transform:scaleX(-1)]" />
              {permState === "pending" && <div className="absolute inset-0 flex items-center justify-center text-stone-300 text-sm gap-2"><Loader2 size={16} className="animate-spin" /> Checking your camera & mic…</div>}
              {(denied || permState === "no-device") && <div className="absolute inset-0 flex items-center justify-center text-stone-400"><VideoOff size={28} /></div>}
              {permState === "granted-audio" && <div className="absolute inset-0 flex items-center justify-center text-stone-300 text-sm gap-2"><VideoOff size={18} /> No camera — audio only</div>}
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
            ) : joinError ? (
              <p className="text-sm text-amber-700 flex items-center gap-1.5 mb-4"><AlertCircle size={14} /> Couldn't connect to the room. <a href={roomUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-800 hover:underline inline-flex items-center gap-1"><ExternalLink size={13} /> Open in a new tab</a></p>
            ) : null}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-2">
              <button onClick={() => join(false)} disabled={!camReady} className="flex-1 bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-200 disabled:text-stone-400 text-white text-sm font-medium px-4 py-2.5 rounded-lg inline-flex items-center justify-center gap-1.5"><Video size={15} /> Join lesson</button>
              <button onClick={() => join(true)} disabled={!micReady} className="flex-1 border border-stone-300 text-stone-700 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-40 text-sm font-medium px-4 py-2.5 rounded-lg inline-flex items-center justify-center gap-1.5"><Mic size={15} /> Join audio only</button>
            </div>
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
