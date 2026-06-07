// Madrasah outstanding-fees intelligence (item 7) — pure logic, ready for Stripe.
//
// Fee COLLECTION is out of scope until the Stripe session, so there's no data
// source yet. This helper is the shape the Analytics card + the AI briefing will
// consume the moment invoices exist: pass a flat array of per-family fee rows and
// it returns term totals plus gentle, prioritised follow-up suggestions. The tone
// is deliberately a financial-wellbeing one — support families, never chase debt.
//
// Expected invoice row (when Stripe lands):
//   { familyId, familyName, expected, collected, monthsOverdue, studentNames: [] }

export function summarizeFees(invoices = []) {
  let expected = 0, collected = 0;
  const families = [];
  for (const inv of invoices) {
    const exp = Number(inv.expected) || 0;
    const col = Number(inv.collected) || 0;
    expected += exp; collected += col;
    const balance = Math.max(0, exp - col);
    if (balance > 0) {
      families.push({
        familyId: inv.familyId,
        familyName: inv.familyName || "Family",
        balance,
        monthsOverdue: Number(inv.monthsOverdue) || 0,
        studentNames: inv.studentNames || [],
      });
    }
  }
  families.sort((a, b) => b.monthsOverdue - a.monthsOverdue || b.balance - a.balance);
  const outstanding = Math.max(0, expected - collected);

  // Gentle, prioritised suggestions — wellbeing framing, escalating with overdue age.
  const suggestions = [];
  for (const f of families) {
    if (f.monthsOverdue >= 3) {
      suggestions.push({
        familyId: f.familyId, tone: "sensitive",
        text: `Offer a payment plan to the ${f.familyName} family — ${f.monthsOverdue} months outstanding. Check in privately before it affects their child's place.`,
      });
    } else if (f.monthsOverdue >= 2) {
      suggestions.push({
        familyId: f.familyId, tone: "reminder",
        text: `A friendly reminder to the ${f.familyName} family — ${f.monthsOverdue} months outstanding.`,
      });
    }
  }
  // Students whose place is at risk purely from non-payment — flag to intervene early.
  const atRiskOfRemoval = families.filter((f) => f.monthsOverdue >= 3);

  return { expected, collected, outstanding, families, suggestions, atRiskOfRemoval };
}
