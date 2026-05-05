export const MOCK_MOSQUES = [
  {
    id: 1,
    name: "Birmingham Central Mosque",
    slug: "birmingham-central",
    photo: "https://images.unsplash.com/photo-1604873446650-3a47e9c3f8e6?w=800&q=80",
    verified: true,
    address: "180 Belgrave Middleway",
    city: "Birmingham",
    postcode: "B12 0XS",
    lat: 52.4651,
    lng: -1.8895,
    phone: "0121 440 5588",
    email: "info@birminghamcentralmosque.org.uk",
    description: "One of the largest mosques in the UK, serving the community since 1969 with daily prayers, Islamic education, and welfare services.",
    facilities: ["disability_access", "parking", "womens_area", "wudu_facilities", "first_aid"],
    scholarIds: [],
    campaignId: null,
    jumuahTime: "13:30",
    iqamaTimes: { fajr: "05:30", dhuhr: "13:30", asr: "16:30", maghrib: "20:15", isha: "21:45" },
    mockReviews: [
      { author: "Yusuf K.", rating: 5, text: "Spacious, welcoming, and well-maintained. Excellent Jumu'ah khutbahs.", date: "2 weeks ago" },
      { author: "Aisha R.", rating: 5, text: "The womens prayer area is clean and accessible. Great facilities.", date: "1 month ago" }
    ]
  },
  {
    id: 2,
    name: "East London Mosque",
    slug: "east-london-mosque",
    photo: "https://images.unsplash.com/photo-1542379510-6c4dabe18f87?w=800&q=80",
    verified: true,
    address: "82-92 Whitechapel Road",
    city: "London",
    postcode: "E1 1JQ",
    lat: 51.5168,
    lng: -0.0648,
    phone: "020 7650 3000",
    email: "info@eastlondonmosque.org.uk",
    description: "A landmark mosque in the heart of East London, providing prayer, education, and community services for over 35 years.",
    facilities: ["disability_access", "parking", "womens_area", "wudu_facilities", "first_aid", "defibrillator"],
    scholarIds: [],
    campaignId: 1,
    jumuahTime: "13:15",
    iqamaTimes: { fajr: "05:15", dhuhr: "13:15", asr: "16:45", maghrib: "20:00", isha: "21:30" },
    mockReviews: [
      { author: "Bilal M.", rating: 5, text: "Beautiful mosque, well-organised programmes for youth.", date: "1 week ago" }
    ]
  },
  {
    id: 3,
    name: "Manchester Central Mosque",
    slug: "manchester-central",
    photo: "https://images.unsplash.com/photo-1584286595398-a59e7dfb7991?w=800&q=80",
    verified: true,
    address: "20 Upper Park Road",
    city: "Manchester",
    postcode: "M14 5RU",
    lat: 53.4528,
    lng: -2.2271,
    phone: "0161 224 4119",
    email: "info@manchestercentralmosque.org",
    description: "Serving Manchester's Muslim community with daily prayers, Quran classes, and outreach programmes.",
    facilities: ["disability_access", "womens_area", "wudu_facilities"],
    scholarIds: [],
    campaignId: 1,
    jumuahTime: "13:00",
    iqamaTimes: { fajr: "05:45", dhuhr: "13:00", asr: "17:00", maghrib: "20:30", isha: "22:00" },
    mockReviews: [
      { author: "Hassan A.", rating: 5, text: "Great community vibe, friendly volunteers, and clean facilities.", date: "3 weeks ago" }
    ]
  },
  {
    id: 4,
    name: "Leeds Grand Mosque",
    slug: "leeds-grand",
    photo: "https://images.unsplash.com/photo-1591824438708-ce405f36ba3d?w=800&q=80",
    verified: true,
    address: "9 Woodsley Road",
    city: "Leeds",
    postcode: "LS3 1DT",
    lat: 53.8089,
    lng: -1.5645,
    phone: "0113 245 6789",
    email: "contact@leedsgrandmosque.com",
    description: "A welcoming community mosque in central Leeds offering daily prayers, Islamic education, and revert support.",
    facilities: ["disability_access", "parking", "womens_area", "first_aid"],
    scholarIds: [],
    campaignId: 1,
    jumuahTime: "13:15",
    iqamaTimes: { fajr: "05:30", dhuhr: "13:15", asr: "16:45", maghrib: "20:15", isha: "21:45" },
    mockReviews: [
      { author: "Sarah J.", rating: 5, text: "Wonderful welcoming community. Reverts class is excellent.", date: "1 month ago" }
    ]
  },
  {
    id: 5,
    name: "Bradford Grand Mosque",
    slug: "bradford-grand",
    photo: "https://images.unsplash.com/photo-1564769625905-50e93615e769?w=800&q=80",
    verified: true,
    address: "Horton Park Avenue",
    city: "Bradford",
    postcode: "BD7 3EG",
    lat: 53.7833,
    lng: -1.7667,
    phone: "01274 727 922",
    email: "info@bradfordgrandmosque.org.uk",
    description: "A historic mosque serving Bradford's Muslim community with prayers, education, and family programmes.",
    facilities: ["parking", "womens_area", "wudu_facilities"],
    scholarIds: [],
    campaignId: 1,
    jumuahTime: "13:30",
    iqamaTimes: { fajr: "05:30", dhuhr: "13:30", asr: "16:30", maghrib: "20:15", isha: "21:45" },
    mockReviews: [
      { author: "Tariq M.", rating: 4, text: "Steeped in history. Beautiful Friday khutbahs.", date: "2 weeks ago" }
    ]
  },
  {
    id: 6,
    name: "Glasgow Central Mosque",
    slug: "glasgow-central",
    photo: "https://images.unsplash.com/photo-1542652694-40abf526446e?w=800&q=80",
    verified: true,
    address: "1 Mosque Avenue",
    city: "Glasgow",
    postcode: "G5 9TA",
    lat: 55.8519,
    lng: -4.2528,
    phone: "0141 429 3132",
    email: "info@glasgowcentralmosque.com",
    description: "Scotland's largest mosque, serving the community with daily prayers, education, and community engagement.",
    facilities: ["disability_access", "parking", "womens_area", "wudu_facilities", "first_aid", "defibrillator"],
    scholarIds: [],
    campaignId: 1,
    jumuahTime: "13:30",
    iqamaTimes: { fajr: "06:00", dhuhr: "13:30", asr: "17:15", maghrib: "20:30", isha: "22:00" },
    mockReviews: [
      { author: "Amina S.", rating: 5, text: "Scotland's gem. The defibrillator and full accessibility make it stand out.", date: "1 week ago" }
    ]
  },
  {
    id: 7,
    name: "Cardiff Madina Mosque",
    slug: "cardiff-madina",
    photo: "https://images.unsplash.com/photo-1548625361-1adcab316530?w=800&q=80",
    verified: true,
    address: "121 Woodville Road",
    city: "Cardiff",
    postcode: "CF24 4DY",
    lat: 51.4928,
    lng: -3.1781,
    phone: "029 2049 3656",
    email: "info@madinamosque.co.uk",
    description: "Welsh capital's vibrant mosque community with active youth and family programmes.",
    facilities: ["womens_area", "wudu_facilities", "first_aid"],
    scholarIds: [],
    campaignId: 1,
    jumuahTime: "13:15",
    iqamaTimes: { fajr: "05:45", dhuhr: "13:15", asr: "16:45", maghrib: "20:15", isha: "21:45" },
    mockReviews: [
      { author: "Yasmin R.", rating: 5, text: "Vibrant youth programmes — kids love it.", date: "5 days ago" }
    ]
  },
  {
    id: 8,
    name: "Leicester Central Mosque",
    slug: "leicester-central",
    photo: "https://images.unsplash.com/photo-1584286595398-a59e7dfb7991?w=800&q=80",
    verified: true,
    address: "20 Conduit Street",
    city: "Leicester",
    postcode: "LE2 0JN",
    lat: 52.6309,
    lng: -1.1223,
    phone: "0116 254 4459",
    email: "info@leicestercentralmosque.org",
    description: "Serving Leicester's Muslim community since 1980 with prayers, education, and welfare.",
    facilities: ["disability_access", "parking", "womens_area", "wudu_facilities"],
    scholarIds: [],
    campaignId: 1,
    jumuahTime: "13:30",
    iqamaTimes: { fajr: "05:30", dhuhr: "13:30", asr: "16:45", maghrib: "20:15", isha: "21:45" },
    mockReviews: [
      { author: "Ibrahim K.", rating: 5, text: "Long-standing pillar of the community. Excellent welfare programmes.", date: "3 weeks ago" }
    ]
  }
];

// Nearby mosques shown in PrayerHub — these are the verified mosques from the register
export const NEARBY_MOSQUES = [
  { id: 1, name: "Masjid Al-Noor", city: "Birmingham", postcode: "B12 9AA", distance: 0.8, denomination: "Sunni — Hanafi", verified: true, gradient: "from-emerald-400 to-emerald-700", initials: "MN", jumuahTime: "13:30", languages: ["English", "Urdu", "Arabic"] },
  { id: 2, name: "Masjid As-Salam", city: "Leicester", postcode: "LE2 7AA", distance: 1.2, denomination: "Sunni — Hanafi", verified: true, gradient: "from-rose-400 to-rose-700", initials: "AS", jumuahTime: "13:15", languages: ["English", "Gujarati"] },
  { id: 3, name: "Blackburn Islamic Centre", city: "Blackburn", postcode: "BB1 8AA", distance: 2.4, denomination: "Sunni — Hanafi", verified: true, gradient: "from-amber-400 to-amber-700", initials: "BI", jumuahTime: "13:00", languages: ["English", "Urdu"] },
  { id: 4, name: "Noor Academy", city: "London", postcode: "E1 1AA", distance: 3.7, denomination: "Non-denominational", verified: true, gradient: "from-indigo-400 to-indigo-700", initials: "NA", jumuahTime: "13:30", languages: ["English", "Arabic"] },
  { id: 5, name: "Darul Hikmah", city: "Cardiff", postcode: "CF10 1AA", distance: 5.2, denomination: "Sunni — Shafi'i", verified: true, gradient: "from-teal-400 to-teal-700", initials: "DH", jumuahTime: "13:15", languages: ["English", "Arabic", "Bengali"] }
];
