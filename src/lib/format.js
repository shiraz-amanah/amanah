// Currency formatter — pounds with thousands separators
export const fmt = (n) => "£" + n.toLocaleString();

// Two-letter initials from a name: "Fatima Zahra" → "FZ", "eesaa ahmed" → "EA",
// "Fatima" → "F". Returns "??" only when there's genuinely no name. Used as the
// avatar fallback so a missing avatar_initials column doesn't render "??".
export const initialsFromName = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "??";
  const first = parts[0][0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] || "" : "";
  return (first + last).toUpperCase() || "??";
};
