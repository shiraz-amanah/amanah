// Transform a Supabase scholar row to the shape the UI expects
// (our DB uses snake_case, our React uses camelCase for some fields)
export const transformScholar = (dbScholar) => {
  if (!dbScholar) return null;
  return {
    id: dbScholar.id,
    // Auth user the scholar listing belongs to — needed to open a direct
    // conversation (getOrCreateDirectConversation). Was previously dropped.
    user_id: dbScholar.user_id,
    slug: dbScholar.slug,
    name: dbScholar.name,
    title: dbScholar.title,
    bio: dbScholar.bio,
    city: dbScholar.city,
    initials: dbScholar.avatar_initials,
    avatarGradient: dbScholar.avatar_gradient,
    avatarUrl: dbScholar.avatar_url || null,
    categories: dbScholar.categories || [],
    languages: dbScholar.languages || [],
    qualifications: dbScholar.qualifications || [],
    experience: dbScholar.experience_years || 0,
    gender: dbScholar.gender,
    dbsVerified: dbScholar.dbs_verified,
    dbsDate: dbScholar.dbs_verified_date,
    ijazahVerified: dbScholar.ijazah_verified,
    online: dbScholar.is_online,
    rating: Number(dbScholar.rating) || 0,
    reviews: dbScholar.review_count || 0,
    reviewCount: dbScholar.review_count || 0,
    students: dbScholar.students_taught || 0,
    packages: (dbScholar.packages || []).filter(Boolean),
    acceptsBookings: dbScholar.accepts_bookings,
    availability: dbScholar.availability || [],
    verified: dbScholar.dbs_verified && dbScholar.ijazah_verified,
    // Static fallbacks for fields not in DB yet
    nextAvailable: "Today",
  };
};
