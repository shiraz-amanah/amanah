import { useState, useEffect } from "react";
import { Loader2, Megaphone, Trash2 } from "lucide-react";
import { getClassAnnouncements, createAnnouncement, deleteAnnouncement } from "../auth";

// Write-enabled announcements board for one class. Used by the admin Madrasa tab
// and the teacher "My Classes" portal — both post under the 073 RLS (owner of
// mosque OR class teacher). Parents read these on their family dashboard.
const MadrasaAnnouncements = ({ classObj }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    getClassAnnouncements(classObj.id)
      .then((r) => setItems(r || []))
      .catch((e) => console.error("announcements load failed:", e))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [classObj.id]);

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim() || posting) return;
    setPosting(true); setError("");
    const { data, error: err } = await createAnnouncement({
      classId: classObj.id, mosqueId: classObj.mosque_id, title, body,
    });
    setPosting(false);
    if (err) { setError(err.message || "Could not post. Please try again."); return; }
    setItems((prev) => [data, ...prev]);
    setTitle(""); setBody("");
  };

  const remove = async (id) => {
    const prev = items;
    setItems((p) => p.filter((a) => a.id !== id)); // optimistic
    const { error: err } = await deleteAnnouncement(id);
    if (err) { setItems(prev); setError(err.message || "Could not delete."); }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          maxLength={120}
          className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/30"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a notice for parents in this class…"
          rows={3}
          className="w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/30 resize-y"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!body.trim() || posting}
            className="inline-flex items-center gap-1.5 text-sm font-medium bg-emerald-900 text-white px-4 py-2 rounded-lg disabled:opacity-40 hover:bg-emerald-800"
          >
            {posting ? <Loader2 size={15} className="animate-spin" /> : <Megaphone size={15} />}
            Post announcement
          </button>
        </div>
      </form>

      {loading ? (
        <div className="flex justify-center py-10 text-stone-400"><Loader2 size={20} className="animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
          <Megaphone className="mx-auto text-stone-300 mb-3" size={36} />
          <p className="text-stone-600 text-sm">No announcements yet. Post one above — every parent in this class will see it.</p>
        </div>
      ) : (
        <ul className="space-y-3">{items.map((a) => (
          <li key={a.id} className="bg-white border border-stone-200 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {a.title && <p className="font-semibold text-stone-900 text-sm">{a.title}</p>}
                <p className="text-sm text-stone-700 whitespace-pre-wrap break-words">{a.body}</p>
              </div>
              <button onClick={() => remove(a.id)} title="Delete" className="shrink-0 text-stone-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
            </div>
            <p className="text-[11px] text-stone-400 mt-2">
              {a.author?.name ? `${a.author.name} · ` : ""}{new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </li>
        ))}</ul>
      )}
    </div>
  );
};

export default MadrasaAnnouncements;
