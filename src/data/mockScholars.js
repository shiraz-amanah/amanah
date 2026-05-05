export const MOCK_SCHOLARS = [
  {
    id: 101, name: "Ustadh Yusuf Al-Rahman", initials: "YR", city: "Birmingham", verified: true, topRated: true,
    rating: 4.9, reviewCount: 142, responseTime: "~2 hours", students: 340,
    categories: ["quran-kids", "arabic"], languages: ["Arabic", "English", "Urdu"],
    bio: "Al-Azhar graduate with 12 years teaching experience. Patient, child-friendly, and specialises in tajweed for ages 5–15.",
    avatarGradient: "from-emerald-400 to-emerald-700",
    packages: [
      { name: "Basic", price: 25, duration: "30 min", desc: "One 1-on-1 tajweed session" },
      { name: "Standard", price: 90, duration: "4 × 30 min", desc: "Weekly sessions + progress report", popular: true },
      { name: "Premium", price: 320, duration: "12 weeks", desc: "Full term + WhatsApp support" }
    ],
    reviews: [
      { author: "Fatima M.", rating: 5, text: "Subhan'Allah, my son has come on leaps and bounds. Ustadh is so patient.", date: "2 weeks ago" },
      { author: "Ahmed K.", rating: 5, text: "Best Qur'an teacher we've worked with. Brilliant with kids.", date: "1 month ago" }
    ]
  },
  {
    id: 102, name: "Shaykha Maryam Idris", initials: "MI", city: "Online", verified: true, topRated: true,
    rating: 5.0, reviewCount: 89, responseTime: "~1 hour", students: 210,
    categories: ["islamic-studies", "revert"], languages: ["English", "Arabic"],
    bio: "Female scholar teaching sisters-only aqeedah and fiqh classes. Trained at Al-Salam Institute. Warm, accessible, academically serious.",
    avatarGradient: "from-rose-400 to-rose-700",
    packages: [
      { name: "Trial", price: 15, duration: "30 min", desc: "Intro call to discuss goals" },
      { name: "Monthly", price: 75, duration: "4 × 1 hr", desc: "Weekly halaqah — live or 1-on-1", popular: true },
      { name: "Revert Programme", price: 180, duration: "8 weeks", desc: "Structured curriculum for new Muslims" }
    ],
    reviews: [
      { author: "Zainab H.", rating: 5, text: "Finally a female scholar I can ask anything without shame. Changed my iman.", date: "3 weeks ago" }
    ]
  },
  {
    id: 103, name: "Ustadh Ibrahim Siddiqui", initials: "IS", city: "London", verified: true, topRated: false,
    rating: 4.8, reviewCount: 67, responseTime: "~4 hours", students: 155,
    categories: ["hifz", "quran-kids"], languages: ["Arabic", "English"],
    bio: "Qualified Hafiz with ijazah in Qira'at Hafs. Structured hifz programme with weekly review and parent dashboard.",
    avatarGradient: "from-indigo-400 to-indigo-700",
    packages: [
      { name: "Single", price: 30, duration: "45 min", desc: "One focused hifz session" },
      { name: "Weekly", price: 100, duration: "4 × 45 min", desc: "Structured memorisation", popular: true },
      { name: "Full Plan", price: 950, duration: "6 months", desc: "Tailored complete programme" }
    ],
    reviews: [
      { author: "Umm Saad", rating: 5, text: "My daughter has memorised 3 juz in 6 months. Alhamdulillah.", date: "1 month ago" }
    ]
  },
  {
    id: 104, name: "Imam Abdul Kareem Hassan", initials: "AK", city: "Manchester", verified: true, topRated: false,
    rating: 4.9, reviewCount: 54, responseTime: "~6 hours", students: 98,
    categories: ["nikah", "janazah", "counselling"], languages: ["English", "Somali", "Arabic"],
    bio: "15 years of pastoral experience. Available for nikah, funeral prayers, and marital counselling across the north-west.",
    avatarGradient: "from-amber-400 to-amber-700",
    packages: [
      { name: "Home Dua Visit", price: 60, duration: "45 min", desc: "New home, recovery, etc." },
      { name: "Nikah Ceremony", price: 180, duration: "Half-day", desc: "Full officiation + certificate", popular: true },
      { name: "Counselling", price: 240, duration: "4 sessions", desc: "Couple or individual" }
    ],
    reviews: [
      { author: "The Akhtars", rating: 5, text: "Officiated our nikah beautifully. Respectful, knowledgeable.", date: "2 months ago" }
    ]
  },
  {
    id: 105, name: "Ustadha Fatimah Khan", initials: "FK", city: "Online", verified: true, topRated: true,
    rating: 4.9, reviewCount: 203, responseTime: "~3 hours", students: 420,
    categories: ["arabic", "quran-kids"], languages: ["Arabic", "English"],
    bio: "Specialises in teaching Arabic to absolute beginners — children and adults. Makes grammar fun. Female teacher, sisters welcome.",
    avatarGradient: "from-purple-400 to-purple-700",
    packages: [
      { name: "Trial", price: 12, duration: "25 min", desc: "See if we're a good fit" },
      { name: "Weekly", price: 80, duration: "4 × 45 min", desc: "Tailored lessons", popular: true },
      { name: "10-Week", price: 180, duration: "10 weeks", desc: "Beginner-to-reading programme" }
    ],
    reviews: [
      { author: "Sara B.", rating: 5, text: "I'm 35 and never thought I could learn Arabic. Ustadha proved me wrong!", date: "1 week ago" }
    ]
  },
  {
    id: 106, name: "Shaykh Omar Farooq", initials: "OF", city: "Bradford", verified: true, topRated: false,
    rating: 4.7, reviewCount: 38, responseTime: "~12 hours", students: 72,
    categories: ["islamic-studies", "counselling"], languages: ["Urdu", "English", "Arabic"],
    bio: "Senior scholar, 20 years teaching. Specialises in classical Hanafi fiqh and seerah. Also offers spiritual counselling.",
    avatarGradient: "from-sky-400 to-sky-700",
    packages: [
      { name: "Consultation", price: 40, duration: "30 min", desc: "Ask a fiqh question 1-on-1" },
      { name: "Study Circle", price: 60, duration: "4 × 1 hr", desc: "Small group study" },
      { name: "Custom", price: 280, duration: "3 months", desc: "Bespoke one-to-one plan", popular: true }
    ],
    reviews: [
      { author: "Bilal R.", rating: 5, text: "Deep knowledge delivered simply. Like having a scholar in your living room.", date: "3 weeks ago" }
    ]
  }
];
