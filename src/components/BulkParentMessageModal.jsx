import { useState, useEffect, useMemo } from "react";
import { Loader2, X, Send, Check, MessageCircle, Users, Eye } from "lucide-react";
import { sendBulkParentMessage, getMosqueEnrollments, getExportRoster, getMadrasaClasses } from "../auth";

// Scoped parent messaging (Session AN rebuild). Two modes:
//  • rich  — pass `mosqueId` (+ optional `classes`): a class checklist (or All),
//    a live recipient count, title + body, Preview recipients, and Send. Used by
//    the Madrasah overview Students tab (owner). Parent names come from the
//    owner-gated 083 export RPC; the message goes to each parent's 1:1 thread
//    via the existing sendBulkParentMessage (no new API).
//  • simple — pass `recipients` (parent user ids) + `audienceLabel`: title +
//    body + Send to that fixed list. Used by the teacher class workspace.

const inputCls = "w-full text-sm px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100";

const BulkParentMessageModal = ({ mosqueId, classes: classesProp, defaultClassId, recipients = [], audienceLabel = "all parents", noun = "parent", onClose }) => {
  const rich = !!mosqueId;
  const plural = `${noun}s`;

  const [loading, setLoading] = useState(rich);
  const [classes, setClasses] = useState(classesProp || []);
  const [enrollments, setEnrollments] = useState([]);
  const [contacts, setContacts] = useState([]); // 083 export rows (parent names)
  const [selected, setSelected] = useState(() => new Set(defaultClassId ? [defaultClassId] : []));
  const [selInit, setSelInit] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // Rich mode: load classes (if not provided) + enrolments + parent contacts.
  useEffect(() => {
    if (!rich) return;
    let alive = true; setLoading(true);
    Promise.all([
      classesProp ? Promise.resolve(classesProp) : getMadrasaClasses(mosqueId),
      getMosqueEnrollments(mosqueId),
      getExportRoster(mosqueId),
    ]).then(([cls, enr, contactRows]) => {
      if (!alive) return;
      setClasses((cls || []).filter((c) => c.status !== "archived"));
      setEnrollments((enr || []).filter((e) => e.status === "active"));
      setContacts(contactRows || []);
    }).catch((e) => console.error("bulk message load failed:", e))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [rich, mosqueId, classesProp]);

  const activeClasses = useMemo(() => (classes || []).filter((c) => c.status !== "archived"), [classes]);

  // Default to all classes selected once they're known (unless a default was given).
  useEffect(() => {
    if (!rich || selInit || activeClasses.length === 0) return;
    if (!defaultClassId) setSelected(new Set(activeClasses.map((c) => c.id)));
    setSelInit(true);
  }, [rich, selInit, activeClasses, defaultClassId]);

  const nameByStudent = useMemo(() => {
    const m = {};
    for (const r of contacts) if (r.parent_name) m[r.student_id] = r.parent_name;
    return m;
  }, [contacts]);

  // Unique parents (with an account) across the selected classes.
  const richRecipients = useMemo(() => {
    if (!rich) return [];
    const byParent = new Map();
    for (const e of enrollments) {
      const cid = e.class?.id || e.class_id;
      if (!selected.has(cid)) continue;
      const uid = e.student?.profile_id;
      if (!uid) continue; // unlinked parent — no account to message yet
      if (!byParent.has(uid)) byParent.set(uid, nameByStudent[e.student?.id || e.student_id] || "Parent");
    }
    return [...byParent.entries()].map(([uid, name]) => ({ uid, name }));
  }, [rich, enrollments, selected, nameByStudent]);

  const recipientIds = rich ? richRecipients.map((r) => r.uid) : Array.from(new Set((recipients || []).filter(Boolean)));
  const count = recipientIds.length;

  const toggleClass = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = rich && activeClasses.length > 0 && activeClasses.every((c) => selected.has(c.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(activeClasses.map((c) => c.id)));

  const send = async () => {
    if (sending) return;
    if (!body.trim()) { setError("Write a message first."); return; }
    if (count === 0) { setError(`No ${plural} selected to message.`); return; }
    const text = (title.trim() ? `${title.trim()}\n\n` : "") + body.trim();
    setSending(true); setError("");
    const r = await sendBulkParentMessage(recipientIds, text);
    setSending(false);
    if (r.error) { setError(r.error.message || "Couldn't send the message."); return; }
    setResult(r);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-stone-900/40" onClick={sending ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-stone-200 px-5 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-stone-900 inline-flex items-center gap-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}><MessageCircle size={18} className="text-emerald-700" /> Message {plural}</h3>
          <button onClick={onClose} disabled={sending} className="text-stone-400 hover:text-stone-700 p-1 disabled:opacity-40"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {result ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-3"><Check size={22} /></div>
              <p className="text-sm font-medium text-stone-900">Message sent</p>
              <p className="text-sm text-stone-600 mt-1">Delivered to {result.sent} {result.sent === 1 ? noun : plural}{result.failed ? ` · ${result.failed} failed` : ""}{result.skipped ? ` · ${result.skipped} skipped` : ""}.</p>
              <button onClick={onClose} className="mt-4 bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-5 py-2 rounded-lg">Done</button>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
          ) : (
            <>
              {/* Class checklist (rich mode) */}
              {rich && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold mb-2">Who receives this</p>
                  {activeClasses.length === 0 ? <p className="text-sm text-stone-500">No classes yet.</p> : (
                    <div className="border border-stone-200 rounded-xl divide-y divide-stone-100 max-h-44 overflow-y-auto">
                      <label className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-stone-50">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-emerald-700" />
                        <span className="text-sm font-medium text-stone-800">All classes</span>
                      </label>
                      {activeClasses.map((c) => (
                        <label key={c.id} className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-stone-50">
                          <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleClass(c.id)} className="accent-emerald-700" />
                          <span className="text-sm text-stone-700">{c.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Live recipient count + preview */}
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                <span className="text-sm text-emerald-900 inline-flex items-center gap-1.5"><Users size={14} /> {rich ? `${count} parent${count === 1 ? "" : "s"} will receive this` : `${audienceLabel} (${count} recipient${count === 1 ? "" : "s"})`}</span>
                {count > 0 && <button onClick={() => setShowPreview((v) => !v)} className="text-[12px] text-emerald-800 hover:text-emerald-900 inline-flex items-center gap-1"><Eye size={13} /> {showPreview ? "Hide" : "Preview"}</button>}
              </div>
              {showPreview && rich && (
                <div className="border border-stone-200 rounded-xl p-3 max-h-32 overflow-y-auto">
                  {richRecipients.length === 0 ? <p className="text-xs text-stone-400">No parents with an account in the selected classes.</p>
                    : <ul className="flex flex-wrap gap-1.5">{richRecipients.map((r) => <li key={r.uid} className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">{r.name}</li>)}</ul>}
                </div>
              )}
              {showPreview && !rich && <p className="text-xs text-stone-500">Each of the {count} {count === 1 ? noun : plural} receives this in their own thread.</p>}

              {/* Message */}
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className={inputCls} />
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder={`Write your message to ${plural}…`} className={`${inputCls} resize-y`} />
              <p className="text-[11px] text-stone-400">Each {noun} receives this privately in their own 1:1 conversation thread.</p>

              {error && <p className="text-sm text-rose-700">{error}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={onClose} className="text-sm text-stone-600 hover:text-stone-900 px-3 py-2">Cancel</button>
                <button onClick={send} disabled={sending || count === 0 || !body.trim()} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white text-sm font-medium px-5 py-2 rounded-lg inline-flex items-center gap-1.5">{sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send to {count}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BulkParentMessageModal;
