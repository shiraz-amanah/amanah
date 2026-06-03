import { useState } from "react";
import { FileText, Loader2, ExternalLink } from "lucide-react";
import { getSignedDocUrl } from "../lib/storage";

// Admin link to a private onboarding document (ijazah / qualification / DBS
// certificate). The docs live in private buckets, so we mint a short-lived
// signed URL on click and open it in a new tab — never a public URL.
const AdminDocLink = ({ bucket, path, label }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  if (!path) return null;

  const open = async () => {
    setLoading(true);
    setError("");
    const { url, error: e } = await getSignedDocUrl(bucket, path);
    setLoading(false);
    if (e || !url) { setError(e || "Couldn't open the document."); return; }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={open} disabled={loading} className="inline-flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-800 font-medium disabled:opacity-60">
        {loading ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} {label} <ExternalLink size={12} />
      </button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </span>
  );
};

export default AdminDocLink;
