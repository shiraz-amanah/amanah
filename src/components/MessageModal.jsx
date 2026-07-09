// src/components/MessageModal.jsx
// ====================================================================
// Session RBAC-B — staff message composer. Opened from StaffDirectory
// (Message all / bulk selection / quick-view Message). Recipients are passed as
// safe staff rows ({id,name,email}); the SERVER (send-transactional staff_email)
// re-resolves every recipient's email from mosque_staff for the caller's mosque,
// so the client never supplies an address (security req #7).
//
// On send: fire staff_email (+ staff_whatsapp, logged no-op until N1), log the
// message to mosque_staff_messages, and write a message_sent audit entry per
// recipient. AI draft folds into admin-brief (mode: staff_message_draft) — no
// new serverless function.
// ====================================================================
import { useState } from "react";
import { X, Sparkles, Send, Loader2, Mail, MessageSquare, Bell } from "lucide-react";
import { logStaffMessage, recordStaffAudit } from "../lib/staffHelpers";
import { sendStaffEmail, sendStaffWhatsapp } from "../lib/email";
import { draftStaffMessage } from "../lib/hrAssistant";

const TEMPLATES = [
  ["Safeguarding reminder", "Safeguarding reminder", "This is a reminder to review and follow our safeguarding policy at all times when working with children. Please ensure your training is up to date and report any concerns immediately to the designated safeguarding lead."],
  ["DBS renewal reminder", "DBS renewal", "Our records show your DBS check is due for renewal soon. Please arrange your renewal so your record stays compliant, and let the office know once it's underway."],
  ["Rota published", "This week's rota is published", "The rota for the coming week has been published. Please check your assigned slots and let us know as soon as possible if you have any clashes."],
  ["Leave approved", "Your leave has been approved", "Your leave request has been approved. Please ensure your classes and responsibilities are covered for the dates in question."],
  ["Leave declined", "Your leave request", "Unfortunately we're unable to approve your leave request for the dates requested. Please speak to the office so we can find an alternative."],
  ["Welcome to team", "Welcome to the team", "We're delighted to welcome you to the team. We look forward to working with you and are here to help you settle in — please don't hesitate to ask if you need anything."],
  ["Contract ready to sign", "Your contract is ready", "Your contract is ready for you to review and sign. Please complete it at your earliest convenience and reach out if you have any questions."],
];

export default function MessageModal({ mosqueId, mosque, recipients = [], authedUser, onClose }) {
  const ids = recipients.map((r) => r.id);
  const withEmail = recipients.filter((r) => r.email).length;
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [channels, setChannels] = useState({ email: true, whatsapp: false, push: false });
  const [templateUsed, setTemplateUsed] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(null);

  const applyTemplate = ([label, subj, text]) => { setSubject(subj); setBody(text); setTemplateUsed(label); };

  const draft = async () => {
    if (!aiPrompt.trim()) return;
    setAiBusy(true); setErr(null);
    const r = await draftStaffMessage(mosqueId, aiPrompt.trim(), templateUsed || "");
    setAiBusy(false);
    if (r.ok && r.draft) { setBody(r.draft); setAiOpen(false); setAiPrompt(""); }
    else setErr("AI draft failed — please write the message manually.");
  };

  const send = async () => {
    if (!body.trim() || !ids.length) return;
    setSending(true); setErr(null);
    const active = Object.entries(channels).filter(([, v]) => v).map(([k]) => k);
    try {
      if (channels.email) await sendStaffEmail(mosqueId, { recipientIds: ids, subject, body, templateUsed });
      if (channels.whatsapp) await sendStaffWhatsapp(mosqueId, { recipientIds: ids, body });
      await logStaffMessage(mosqueId, { sentBy: authedUser?.id, recipientIds: ids, subject, body, channels: active, templateUsed });
      ids.forEach((sid) => recordStaffAudit(sid, "message_sent", { channels: active }).catch(() => {}));
      setDone(true);
      setTimeout(() => onClose?.(), 900);
    } catch {
      setErr("Couldn't send — please try again.");
    } finally {
      setSending(false);
    }
  };

  const Channel = ({ k, icon: Icon, label, count, note }) => (
    <label className="flex items-center gap-2 text-sm text-stone-700">
      <input type="checkbox" checked={channels[k]} onChange={(e) => setChannels((c) => ({ ...c, [k]: e.target.checked }))} className="accent-emerald-600" />
      <Icon size={14} className="text-stone-500" /> {label}
      <span className="text-xs text-stone-400">{note || `(${count} of ${recipients.length})`}</span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h3 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Message {recipients.length} staff</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-3">
          {/* Recipients */}
          <div className="flex flex-wrap gap-1.5">
            {recipients.slice(0, 8).map((r) => <span key={r.id} className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">{r.name}</span>)}
            {recipients.length > 8 && <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-500">+{recipients.length - 8} more</span>}
          </div>

          {/* Templates */}
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.map((t) => (
              <button key={t[0]} onClick={() => applyTemplate(t)} className={`text-xs px-2.5 py-1 rounded-full border ${templateUsed === t[0] ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-stone-200 text-stone-600 hover:bg-stone-50"}`}>{t[0]}</button>
            ))}
          </div>

          {channels.email && (
            <label className="block"><span className="text-xs text-stone-500">Subject (email)</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full border border-stone-300 rounded-lg text-sm px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200" /></label>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-stone-500">Message</span>
              <button onClick={() => setAiOpen((v) => !v)} className="text-xs text-emerald-700 inline-flex items-center gap-1"><Sparkles size={12} /> Draft with AI</button>
            </div>
            {aiOpen && (
              <div className="mb-2 flex items-center gap-2">
                <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="What do you want to say, in one line?"
                  className="flex-1 border border-stone-300 rounded-lg text-sm px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                <button onClick={draft} disabled={aiBusy || !aiPrompt.trim()} className="text-sm bg-stone-900 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">{aiBusy ? <Loader2 size={14} className="animate-spin" /> : "Draft"}</button>
              </div>
            )}
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6}
              className="w-full border border-stone-300 rounded-lg text-sm px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200" placeholder="Write your message…" />
          </div>

          {/* Channels */}
          <div className="space-y-1.5 border-t border-stone-100 pt-3">
            <Channel k="email" icon={Mail} label="Email" count={withEmail} />
            <Channel k="whatsapp" icon={MessageSquare} label="WhatsApp" note="(logged only — live in N1)" />
            <Channel k="push" icon={Bell} label="Push" note="(coming soon)" />
          </div>

          {err && <p className="text-sm text-rose-600">{err}</p>}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-stone-100">
          <button onClick={onClose} className="text-sm text-stone-500 hover:text-stone-800">Cancel</button>
          <button onClick={send} disabled={sending || done || !body.trim() || !ids.length || !(channels.email || channels.whatsapp)}
            className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {done ? "Sent ✓" : `Send to ${recipients.length} staff`}
          </button>
        </div>
      </div>
    </div>
  );
}
