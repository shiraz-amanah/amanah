import { useState } from "react";
import { Loader2, X, Send, MessageCircle, Check, AlertCircle } from "lucide-react";
import { sendBulkParentMessage } from "../auth";

// Bulk parent messaging (item 10). Sends one message into every recipient
// parent's direct thread via the existing 1:1 messaging infra. The caller
// resolves the parent user ids (class roster or mosque-wide) and an audience
// label; pending parents with no account are filtered out by the data layer.

const BulkParentMessageModal = ({ recipients = [], audienceLabel = "all parents", onClose }) => {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const count = recipients.length;

  const send = async () => {
    if (!body.trim()) { setError("Write a message first."); return; }
    setBusy(true); setError("");
    const r = await sendBulkParentMessage(recipients, body);
    setBusy(false);
    if (r.error) { setError(r.error.message || "Couldn't send."); return; }
    setResult(r);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="border-b border-stone-200 px-5 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-stone-900 inline-flex items-center gap-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><MessageCircle size={18} className="text-emerald-700" /> Message parents</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 p-1"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-3">
          {result ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-3"><Check size={22} /></div>
              <p className="text-sm text-stone-800 font-medium">Sent to {result.sent} parent{result.sent === 1 ? "" : "s"}.</p>
              {(result.failed > 0 || result.skipped > 0) && (
                <p className="text-xs text-stone-500 mt-1">
                  {result.failed > 0 ? `${result.failed} couldn't be delivered. ` : ""}
                  {result.skipped > 0 ? `${result.skipped} parent${result.skipped === 1 ? "" : "s"} not yet on Amanah were skipped.` : ""}
                </p>
              )}
              <button onClick={onClose} className="mt-4 bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-5 py-2 rounded-lg">Done</button>
            </div>
          ) : (
            <>
              <p className="text-sm text-stone-600">This will message <strong>{audienceLabel}</strong> ({count} recipient{count === 1 ? "" : "s"}). Each parent receives it in their own conversation thread.</p>
              <textarea autoFocus value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={2000} placeholder="Type your message to parents…" className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm resize-y" />
              {error && <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}
              {count === 0 && <p className="text-xs text-amber-700">No parents with an Amanah account to message yet.</p>}
              <div className="flex justify-end gap-2">
                <button onClick={onClose} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2">Cancel</button>
                <button onClick={send} disabled={busy || count === 0} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">{busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send to {count}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BulkParentMessageModal;
