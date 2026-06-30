import { Repeat } from "lucide-react";

// Small Weekly/Monthly pill for a recurring-event tile — shared by the admin
// Events manager and the public homepage / mosque-profile / overview tiles so the
// recurrence badge looks identical everywhere. Renders nothing for one-offs.
const LABEL = { weekly: "Weekly", monthly: "Monthly" };

const RecurrenceBadge = ({ recurrence, className = "" }) => {
  if (recurrence !== "weekly" && recurrence !== "monthly") return null;
  return (
    <span className={`shrink-0 text-[10px] uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${className}`}>
      <Repeat size={9} /> {LABEL[recurrence]}
    </span>
  );
};

export default RecurrenceBadge;
