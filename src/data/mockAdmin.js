export const ADMIN_MOSQUE_APPS = [
  { id: "mosque-app-1", name: "Masjid Ar-Rahma", city: "Sheffield", postcode: "S2 4AA", charityNumber: "1193847", submittedDate: "2026-04-18", contactName: "Ismail Khan", contactRole: "Chairperson", contactPhone: "+44 7700 900301", safeguardingLead: "Aisha Begum", docs: { proofOfAddress: true, trusteeConfirmation: true }, charityCommissionStatus: "match", notes: "" },
  { id: "mosque-app-2", name: "Darul Hikmah", city: "Cardiff", postcode: "CF10 1AA", charityNumber: "1167254", submittedDate: "2026-04-19", contactName: "Ahmed Saleh", contactRole: "Trustee", contactPhone: "+44 7700 900302", safeguardingLead: "Hafsa Ali", docs: { proofOfAddress: true, trusteeConfirmation: false }, charityCommissionStatus: "match", notes: "Trustee confirmation not yet uploaded" },
  { id: "mosque-app-3", name: "Noor Islamic Centre", city: "Newcastle", postcode: "NE1 2AA", charityNumber: "1198888", submittedDate: "2026-04-20", contactName: "Bilal Rashid", contactRole: "Secretary", contactPhone: "+44 7700 900303", safeguardingLead: "Maryam Shah", docs: { proofOfAddress: true, trusteeConfirmation: true }, charityCommissionStatus: "nomatch", notes: "Charity Commission number not found — may be a new registration or typo" }
];

export const ADMIN_CAMPAIGN_APPS = [
  { id: "camp-app-1", title: "Urgent roof repair after storm damage", creator: "Masjid Al-Falah", city: "Portsmouth", goal: 18000, category: "Emergency Repair", submittedDate: "2026-04-20", creatorVerified: true, riskScore: "low" },
  { id: "camp-app-2", title: "Arabic summer camp for teenagers", creator: "Ustadh Khalid Mahmud", city: "Online", goal: 4500, category: "Course Creation", submittedDate: "2026-04-19", creatorVerified: true, riskScore: "low" },
  { id: "camp-app-3", title: "Help our brother in hardship", creator: "Masjid Al-Hidayah", city: "Glasgow", goal: 50000, category: "Community Outreach", submittedDate: "2026-04-19", creatorVerified: true, riskScore: "medium" }
];

export const ADMIN_FLAGS = [
  { id: "flag-1", type: "scholar", target: "Ustadh Bilal Cheikh", city: "Leicester", reportedBy: "Parent · verified booking", reason: "DBS expired — should not be accepting new bookings", severity: "high", date: "2026-04-20" },
  { id: "flag-2", type: "campaign", target: "Help our brother in hardship", creator: "Masjid Al-Hidayah", reportedBy: "Community member", reason: "Goal seems disproportionate with no breakdown", severity: "medium", date: "2026-04-19" },
  { id: "flag-3", type: "review", target: "Review on Ustadh Omar Farooq", reportedBy: "Scholar", reason: "Review appears to be from someone who never booked", severity: "low", date: "2026-04-18" }
];

export const ADMIN_DBS_ORDERS = [
  { id: "order-1", candidate: "Harun Malik", mosque: "Masjid Al-Noor", type: "Enhanced", stage: "Certificate issued", progress: 100, orderedDate: "2026-03-28" },
  { id: "order-2", candidate: "Suleiman Ahmed", mosque: "Masjid Al-Noor", type: "Enhanced", stage: "Police check in progress", progress: 65, orderedDate: "2026-04-11" },
  { id: "order-3", candidate: "Nasir Begum", mosque: "Masjid Al-Noor", type: "Enhanced", stage: "Candidate ID verification", progress: 30, orderedDate: "2026-04-18" },
  { id: "order-4", candidate: "Yasmin Iqbal", mosque: "Darul Hikmah", type: "Standard", stage: "Awaiting candidate action", progress: 10, orderedDate: "2026-04-20" }
];
