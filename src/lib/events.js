// Collapse recurring-event occurrences (rows sharing a recurrence_group_id) to a
// single next occurrence; one-off events pass through untouched. Rows MUST already
// be sorted by date ascending (and typically filtered to upcoming), so the first
// row seen per group key is its next occurrence. Returns up to `limit` items.
//
// Used by the public reads (getUpcomingEvents / getMosqueUpcomingEvents) and the
// owner overview so a weekly series shows as one tile, not 26.
export function collapseRecurringEvents(rows, limit = Infinity) {
  const seen = new Set();
  const out = [];
  for (const r of rows || []) {
    const key = r.recurrence_group_id || `one:${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}
