import { Award, Star } from "lucide-react";
import { isPositiveReward } from "../auth";

// Rewards sub-section: the celebratory stars card + the list of stars/notes from
// the teacher. Straight extraction of the original card's rewards block.
const RW_EMOJI = { star: "⭐", merit: "🏅", achievement: "🏆", warning: "📝", concern: "📝" };

const MadrasaRewardsSection = ({ rewards = [], starCount = 0, firstName = "Your child" }) => {
  if (rewards.length === 0) {
    return <p className="text-sm text-stone-500 bg-white border border-stone-200 rounded-xl px-4 py-6 text-center">No stars or notes from the teacher yet.</p>;
  }
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-2 flex items-center gap-1.5"><Award size={12} /> Rewards</p>
      {starCount > 0 && (
        <div className="rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/60 border border-amber-200 px-4 py-3 mb-2 flex items-center gap-3">
          <Star size={22} className="fill-amber-400 text-amber-400 shrink-0" />
          <p className="text-sm text-amber-900">MashAllah — <span className="font-semibold">{firstName}</span> has earned {starCount} star{starCount === 1 ? "" : "s"} this term!</p>
        </div>
      )}
      <ul className="space-y-1">{rewards.slice(0, 6).map((r) => (
        <li key={r.id} className={`text-xs flex items-start gap-2 ${isPositiveReward(r.type) ? "" : "text-stone-600"}`}>
          <span>{RW_EMOJI[r.type]}</span>
          <span className="min-w-0"><span className="font-medium text-stone-800">{isPositiveReward(r.type) ? (r.type[0].toUpperCase() + r.type.slice(1)) : "Note from teacher"}</span>{r.note ? <span className="text-stone-500"> — {r.note}</span> : null}</span>
        </li>
      ))}</ul>
    </div>
  );
};

export default MadrasaRewardsSection;
