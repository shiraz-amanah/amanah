// Currency formatter — pounds with thousands separators
export const fmt = (n) => "£" + n.toLocaleString();

// Money formatter with 2 decimals + currency code (for fees/records, which store
// numeric(10,2) and a currency column). Defaults to GBP. e.g. money(40) → "£40.00".
export const money = (v, ccy = "GBP") =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: ccy || "GBP" }).format(Number(v) || 0);

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
