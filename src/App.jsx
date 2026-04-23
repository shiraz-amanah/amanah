import { useState, useEffect, useRef } from "react";
import { signUp, signIn, signOut, getUser, getProfile, updateProfile, getStudents, addStudent, updateStudent, deleteStudent, updateNotifications } from "./auth";
import { Search, ShieldCheck, Clock, MapPin, ChevronRight, LogOut, CheckCircle2, ArrowLeft, Building2, Users, ArrowRight, FileCheck, CreditCard, Star, Globe, Heart, BookMarked, Baby, GraduationCap, Sparkles, MessageCircle, BookOpen, Home, Play, Quote, TrendingUp, Zap, Award, ChevronDown, Flame, XCircle, AlertCircle, Send, Plus, X, Info, UserPlus, Mail, Phone, Upload, HandCoins, Calendar, Share2, HeartHandshake, Target, Banknote, Gift, LayoutDashboard, FileText, Flag, BarChart3, Activity, Eye, MoreHorizontal, AlertTriangle, CheckSquare, Inbox, Bell, Settings, Filter, Paperclip, Smile, Check, CheckCheck, Pin, Briefcase, Banknote as BanknoteIcon, DollarSign, User, Download, Receipt, Compass, Moon, Sun, Sunrise, Sunset, Navigation } from "lucide-react";

const CATEGORIES = [
  { id: "quran-kids", name: "Qur'an for Kids", icon: Baby, desc: "1-on-1 tajweed for children", tint: "from-amber-100 to-amber-50", iconBg: "bg-amber-500", count: 24 },
  { id: "arabic", name: "Arabic Lessons", icon: Globe, desc: "Modern & Classical Arabic", tint: "from-sky-100 to-sky-50", iconBg: "bg-sky-500", count: 31 },
  { id: "islamic-studies", name: "Islamic Studies", icon: BookOpen, desc: "Aqeedah, fiqh, seerah", tint: "from-emerald-100 to-emerald-50", iconBg: "bg-emerald-600", count: 18 },
  { id: "hifz", name: "Hifz Programmes", icon: BookMarked, desc: "Structured memorisation", tint: "from-purple-100 to-purple-50", iconBg: "bg-purple-600", count: 12 },
  { id: "revert", name: "Revert Support", icon: Heart, desc: "Guidance for new Muslims", tint: "from-rose-100 to-rose-50", iconBg: "bg-rose-500", count: 9 },
  { id: "nikah", name: "Nikah Services", icon: Sparkles, desc: "Marriage officiation", tint: "from-fuchsia-100 to-fuchsia-50", iconBg: "bg-fuchsia-500", count: 15 },
  { id: "janazah", name: "Janazah & Duas", icon: Home, desc: "Funeral & home visits", tint: "from-stone-100 to-stone-50", iconBg: "bg-stone-600", count: 22 },
  { id: "counselling", name: "Islamic Counselling", icon: MessageCircle, desc: "Faith-based support", tint: "from-indigo-100 to-indigo-50", iconBg: "bg-indigo-600", count: 7 }
];

const MOCK_SCHOLARS = [
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

// Avatar from initials + gradient
const Avatar = ({ scholar, size = "md" }) => {
  const dims = { sm: "w-10 h-10 text-sm", md: "w-14 h-14 text-lg", lg: "w-24 h-24 text-3xl" }[size];
  return (
    <div className={`${dims} rounded-full bg-gradient-to-br ${scholar.avatarGradient} flex items-center justify-center text-white font-semibold flex-shrink-0 shadow-sm`} style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
      {scholar.initials}
    </div>
  );
};

// Counter that animates up
const Counter = ({ end, duration = 1500, suffix = "" }) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = end / (duration / 16);
    const id = setInterval(() => {
      start += step;
      if (start >= end) { setCount(end); clearInterval(id); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(id);
  }, [end, duration]);
  return <span>{count.toLocaleString()}{suffix}</span>;
};

// ==================== CAMPAIGNS DATA ====================
const MOCK_CAMPAIGNS = [
  {
    id: 1, type: "mosque", creator: "Masjid Al-Noor", city: "Birmingham", verified: true,
    title: "New roof for Masjid Al-Noor",
    summary: "After 32 years of serving our community, our roof is failing. Help us protect the house of Allah.",
    story: "Masjid Al-Noor has been the heart of our Birmingham community since 1993. Over the last two winters, water damage has become severe — buckets line the musallah during rain. Our surveyor's report confirms a full re-roof is urgently needed before next winter.\n\nWe've raised £8,000 from our congregation. With your help, we can complete this work insha'Allah before Ramadan 1447.\n\nEvery £1 donated buys roofing materials. Every £100 funds a full square metre. The mosque's 850 regular worshippers thank you for your sadaqah jariyah — every prayer performed under this new roof will earn you reward until the Day of Judgment, insha'Allah.",
    goal: 45000, raised: 28340, donors: 412, daysLeft: 23,
    gradient: "from-emerald-600 to-emerald-900",
    category: "Mosque Renovation",
    trending: true,
    recentDonors: [
      { name: "Abdullah M.", amount: 100, time: "3 min ago", message: "May Allah reward everyone involved" },
      { name: "Anonymous", amount: 50, time: "12 min ago" },
      { name: "The Akhtar Family", amount: 250, time: "34 min ago", message: "Sadaqah jariyah for my father, rahmatullahi alayh" },
      { name: "Anonymous", amount: 25, time: "1 hr ago" },
      { name: "Fatima K.", amount: 500, time: "2 hrs ago", message: "Ameen ya Rabb" }
    ]
  },
  {
    id: 2, type: "scholar", creator: "Ustadh Ibrahim Siddiqui", city: "London", verified: true,
    title: "Help me complete my studies at Madinah University",
    summary: "I've been accepted to study Qur'anic sciences. My family cannot afford the travel and living costs.",
    story: "Assalamu alaikum. By Allah's mercy, after five years of Arabic study in the UK, I've received admission to the Islamic University of Madinah to pursue a four-year degree in Qur'anic Sciences.\n\nThe tuition itself is covered by the university, but I need £6,000 to cover flights, accommodation for the first term, books, and basic living costs while I settle. My family has contributed what they can but we are not able to cover the full amount.\n\nInsha'Allah upon my return I plan to serve the UK community as a qualified teacher. Every donor will receive a personal dua from me, and I commit to teaching one free weekly halaqah on Amanah for one year after graduation as sadaqah jariyah.",
    goal: 6000, raised: 4820, donors: 89, daysLeft: 14,
    gradient: "from-indigo-600 to-indigo-900",
    category: "Scholar Studies",
    trending: false,
    recentDonors: [
      { name: "Anonymous", amount: 30, time: "20 min ago", message: "Barakallahu feek" },
      { name: "Yusuf H.", amount: 100, time: "2 hrs ago" },
      { name: "Anonymous", amount: 50, time: "5 hrs ago", message: "Make dua for my mother" }
    ]
  },
  {
    id: 3, type: "mosque", creator: "Blackburn Islamic Centre", city: "Blackburn", verified: true,
    title: "Ramadan 1447 Iftar Programme",
    summary: "Serving 300 iftars every night for 30 nights. Feed a fasting Muslim, earn their reward.",
    story: "Every Ramadan, Blackburn Islamic Centre opens its doors to the community — students, elderly worshippers, new Muslims, and anyone in need of warm company after a long fast.\n\nLast year we served over 9,000 iftars. This year we're scaling up to 300 meals per night for all 30 nights.\n\nThe Prophet ﷺ said: 'Whoever feeds a fasting person will have a reward like that of the fasting person, without any reduction in his reward.' [Tirmidhi]\n\n£4 feeds one person. £120 sponsors a full night. £500 sponsors a weekend.",
    goal: 15000, raised: 12100, donors: 287, daysLeft: 9,
    gradient: "from-amber-600 to-amber-900",
    category: "Ramadan Appeal",
    trending: true,
    recentDonors: [
      { name: "Anonymous", amount: 120, time: "15 min ago", message: "One night in my late father's name" },
      { name: "The Khan Family", amount: 500, time: "1 hr ago" },
      { name: "Anonymous", amount: 40, time: "3 hrs ago" }
    ]
  },
  {
    id: 4, type: "mosque", creator: "Masjid As-Salam", city: "Leicester", verified: true,
    title: "New women's prayer hall",
    summary: "Building a dedicated, properly-sized prayer hall for sisters — the current space is overcrowded.",
    story: "Our sisters currently pray in a mezzanine that holds 40 people. On Fridays and Eids, over 200 sisters attend. They stand on stairs, in corridors, outside in all weather.\n\nWe've bought the adjacent property. We need £85,000 to complete the fit-out — wudu facilities, carpets, heating, separate entrance. Architectural plans are approved. Construction begins as soon as we hit our goal.",
    goal: 85000, raised: 31200, donors: 534, daysLeft: 47,
    gradient: "from-rose-600 to-rose-900",
    category: "Expansion",
    trending: false,
    recentDonors: [
      { name: "Anonymous", amount: 200, time: "40 min ago", message: "From a sister who prays in the corridor" },
      { name: "Ahmed Family", amount: 1000, time: "4 hrs ago" }
    ]
  }
];

// Currency formatter
const fmt = (n) => "£" + n.toLocaleString();

// Progress bar
const ProgressBar = ({ raised, goal, gradient = "from-emerald-600 to-emerald-800" }) => {
  const pct = Math.min((raised / goal) * 100, 100);
  return (
    <div className="relative">
      <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
        <div className={`h-full bg-gradient-to-r ${gradient} rounded-full transition-all duration-1000`} style={{ width: `${pct}%` }}></div>
      </div>
    </div>
  );
};

// Campaign card
const CampaignCard = ({ campaign, onClick }) => {
  const pct = Math.min((campaign.raised / campaign.goal) * 100, 100);
  return (
    <div onClick={onClick} className="group bg-white border border-stone-200 rounded-2xl overflow-hidden hover:border-emerald-300 hover:shadow-xl cursor-pointer transition-all hover:-translate-y-1">
      <div className={`relative h-40 bg-gradient-to-br ${campaign.gradient} overflow-hidden`}>
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cpath d='M20 0l20 20-20 20L0 20z' fill='none' stroke='%23fff' stroke-width='0.5'/%3E%3C/svg%3E")` }}></div>
        {campaign.trending && (
          <div className="absolute top-3 left-3 inline-flex items-center gap-1 bg-amber-400 text-amber-950 text-[10px] px-2 py-1 rounded-full font-semibold uppercase tracking-wider">
            <Flame size={10} /> Trending
          </div>
        )}
        <div className="absolute top-3 right-3 inline-flex items-center gap-1 bg-white/20 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded-full font-medium uppercase tracking-wider border border-white/30">
          {campaign.category}
        </div>
        <div className="absolute bottom-3 left-4 right-4 text-white">
          <p className="text-xs opacity-90 flex items-center gap-1"><MapPin size={11} /> {campaign.city}</p>
        </div>
      </div>
      <div className="p-5">
        <div className="flex items-center gap-1.5 mb-2">
          <p className="text-xs text-stone-500">{campaign.creator}</p>
          {campaign.verified && <ShieldCheck size={12} className="text-emerald-700" />}
        </div>
        <h4 className="text-base font-semibold text-stone-900 mb-2 leading-snug line-clamp-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{campaign.title}</h4>
        <p className="text-sm text-stone-600 line-clamp-2 mb-4 leading-relaxed">{campaign.summary}</p>

        <ProgressBar raised={campaign.raised} goal={campaign.goal} gradient={campaign.gradient} />
        <div className="flex items-center justify-between mt-2 mb-3 text-xs">
          <span className="font-semibold text-stone-900">{fmt(campaign.raised)}</span>
          <span className="text-stone-500">raised of {fmt(campaign.goal)}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-stone-500 pt-3 border-t border-stone-100">
          <span className="flex items-center gap-1"><Users size={12} /> {campaign.donors} donors</span>
          <span className="flex items-center gap-1"><Clock size={12} /> {campaign.daysLeft} days left</span>
          <span className="font-semibold text-emerald-700">{Math.round(pct)}%</span>
        </div>
      </div>
    </div>
  );
};

// ==================== PUBLIC HOME ====================
const PublicHome = ({ onCategory, onScholar, onSignIn, onCampaign, onAllCampaigns, onLeaveReview }) => {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const filtered = activeTab === "all" ? MOCK_SCHOLARS : MOCK_SCHOLARS.filter(s => s.categories.includes(activeTab));

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Sticky header */}
      <header className={`sticky top-0 z-40 transition-all duration-300 ${scrolled ? "bg-white/90 backdrop-blur-md border-b border-stone-200 shadow-sm" : "bg-transparent"}`}>
        <div className="max-w-7xl mx-auto px-5 md:px-6 py-3.5 md:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5 md:gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center shadow-md">
              <ShieldCheck className="text-emerald-50" size={18} />
            </div>
            <div>
              <h1 className="text-base md:text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <button onClick={() => onSignIn("prayer")} className="inline-flex items-center gap-1.5 text-sm text-stone-700 hover:text-stone-900 transition-colors font-medium">
              <Moon size={14} /> <span className="hidden sm:inline">Prayer</span>
            </button>
            <button onClick={() => onSignIn("mosque")} className="hidden md:inline-block text-sm text-stone-600 hover:text-stone-900 transition-colors">For Mosques</button>
            <button onClick={() => onSignIn("imam")} className="hidden md:inline-block text-sm text-stone-600 hover:text-stone-900 transition-colors">Become a Scholar</button>
            <button onClick={() => onSignIn("user")} className="bg-stone-900 hover:bg-stone-800 text-white text-sm font-medium px-3.5 md:px-4 py-2 rounded-lg transition-colors">Sign in</button>
          </div>
        </div>
      </header>

      {/* Hero with animated cinematic background */}
      <section className="relative overflow-hidden">
        {/* Base deep night gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-stone-950 via-emerald-950 to-stone-900"></div>

        {/* Animated drifting gradient orbs (the "video" effect) */}
        <div className="absolute inset-0">
          <div className="hero-orb orb-1"></div>
          <div className="hero-orb orb-2"></div>
          <div className="hero-orb orb-3"></div>
          <div className="hero-orb orb-4"></div>
        </div>

        {/* Rotating Islamic geometric star pattern */}
        <div className="absolute inset-0 overflow-hidden opacity-20">
          <svg className="hero-pattern-rotate absolute" style={{ top: "-30%", left: "-10%", width: "120%", height: "160%" }} viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="islamicStar" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse">
                {/* 8-pointed star (Rub el Hizb style) */}
                <g transform="translate(60 60)" stroke="rgba(251, 191, 36, 0.4)" strokeWidth="1" fill="none">
                  <polygon points="0,-40 11,-11 40,0 11,11 0,40 -11,11 -40,0 -11,-11" />
                  <rect x="-28" y="-28" width="56" height="56" transform="rotate(45)" />
                  <rect x="-28" y="-28" width="56" height="56" />
                  <circle r="6" fill="rgba(251, 191, 36, 0.3)" />
                </g>
              </pattern>
            </defs>
            <rect width="800" height="800" fill="url(#islamicStar)" />
          </svg>
        </div>

        {/* Floating gold particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(18)].map((_, i) => (
            <div key={i} className="hero-particle" style={{
              left: `${(i * 7.3) % 100}%`,
              animationDelay: `${i * 1.2}s`,
              animationDuration: `${12 + (i % 5) * 3}s`,
              width: `${2 + (i % 3)}px`,
              height: `${2 + (i % 3)}px`
            }}></div>
          ))}
        </div>

        {/* Mosque silhouette at bottom — architectural anchor */}
        <div className="absolute bottom-0 left-0 right-0 h-32 opacity-30 pointer-events-none">
          <svg className="w-full h-full" viewBox="0 0 1440 200" preserveAspectRatio="xMidYEnd slice" xmlns="http://www.w3.org/2000/svg">
            <g fill="rgba(0, 0, 0, 0.6)">
              {/* Distant mosque skyline silhouette */}
              <path d="M0,200 L0,140 L80,140 L80,100 Q100,80 120,100 L120,140 L180,140 L180,120 L200,120 L200,80 Q220,60 240,80 L240,120 L260,120 L260,140 L340,140 L340,110 Q360,70 380,110 L380,140 L440,140 L440,130 L460,100 Q500,40 540,100 L560,130 L560,140 L640,140 L640,115 Q660,85 680,115 L680,140 L760,140 L760,105 Q800,55 840,105 L840,140 L920,140 L920,120 L940,120 L940,85 Q960,55 980,85 L980,120 L1000,120 L1000,140 L1080,140 L1080,130 L1100,105 Q1140,55 1180,105 L1200,130 L1200,140 L1280,140 L1280,110 Q1300,80 1320,110 L1320,140 L1440,140 L1440,200 Z" />
              {/* Minaret accents */}
              <circle cx="120" cy="95" r="3" />
              <circle cx="240" cy="75" r="3" />
              <circle cx="380" cy="65" r="3" />
              <circle cx="540" cy="40" r="4" />
              <circle cx="680" cy="110" r="3" />
              <circle cx="840" cy="55" r="4" />
              <circle cx="980" cy="80" r="3" />
              <circle cx="1180" cy="55" r="4" />
              <circle cx="1320" cy="75" r="3" />
            </g>
          </svg>
        </div>

        {/* Vignette for cinematic focus */}
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950/60 via-transparent to-transparent pointer-events-none"></div>
        <div className="absolute inset-0 bg-radial-vignette pointer-events-none"></div>

        <div className="relative max-w-7xl mx-auto px-5 md:px-6 pt-10 pb-16 md:pt-20 md:pb-28 text-white">
          <div className="max-w-3xl" style={{ animation: "fadeInUp 0.6s ease-out" }}>
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 px-3 py-1.5 rounded-full text-[11px] md:text-xs uppercase tracking-wider mb-5 md:mb-6">
              <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-pulse"></span>
              <ShieldCheck size={13} /> <span className="hidden sm:inline">Every scholar DBS-checked & verified</span><span className="sm:hidden">DBS-checked & verified</span>
            </div>
            <h2 className="text-[2.4rem] leading-[1.05] md:text-6xl lg:text-7xl font-semibold tracking-tight mb-5 md:mb-6" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
              Find a scholar<br />
              <span className="italic text-emerald-200">you can trust.</span>
            </h2>
            <p className="text-base md:text-xl text-emerald-100/90 mb-6 md:mb-8 max-w-2xl leading-relaxed">
              Qur'an tutors for your kids. Arabic teachers for you. Imams for your nikah. All vetted, all one click away.
            </p>

            {/* Search bar */}
            <div className="bg-white rounded-2xl p-1.5 md:p-2 flex items-center gap-1 md:gap-2 max-w-2xl shadow-2xl ring-1 ring-white/20">
              <Search size={18} className="text-stone-400 ml-2 md:ml-3 flex-shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Try 'Qur'an teacher' or 'nikah imam'"
                className="flex-1 min-w-0 px-2 py-2.5 md:py-3 text-sm text-stone-900 outline-none placeholder:text-stone-400"
              />
              <button className="bg-emerald-900 hover:bg-emerald-800 text-white px-4 md:px-5 py-2.5 md:py-3 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] active:scale-95 flex-shrink-0">Search</button>
            </div>

            {/* Live stats */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-6 md:mt-8 text-xs md:text-sm text-emerald-100/80">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-300 rounded-full animate-pulse"></span>
                <Counter end={127} /> online
              </span>
              <span className="flex items-center gap-2"><Users size={14} /> <Counter end={2340} />+ students</span>
              <span className="flex items-center gap-2"><Star size={14} fill="currentColor" /> 4.9 rating</span>
            </div>
          </div>
        </div>

        {/* Wave divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 80" className="w-full h-12 md:h-16 text-stone-50" preserveAspectRatio="none">
            <path fill="currentColor" d="M0,32L60,37.3C120,43,240,53,360,48C480,43,600,21,720,21.3C840,21,960,43,1080,48C1200,53,1320,43,1380,37.3L1440,32L1440,80L0,80Z"></path>
          </svg>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-5 md:px-6 py-10 md:py-16">
        <div className="flex items-end justify-between mb-6 md:mb-8">
          <div>
            <h3 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>What do you need?</h3>
            <p className="text-stone-600 mt-1 text-sm md:text-base">Browse by service</p>
          </div>
          <button className="hidden md:flex items-center gap-1 text-sm text-emerald-800 font-medium hover:gap-2 transition-all">
            View all <ArrowRight size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CATEGORIES.map((cat, i) => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                onClick={() => onCategory(cat.id)}
                className="group relative bg-white border border-stone-200 rounded-2xl p-5 text-left hover:border-emerald-300 hover:shadow-lg hover:-translate-y-1 transition-all overflow-hidden"
                style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.05}s both` }}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${cat.tint} opacity-0 group-hover:opacity-100 transition-opacity`}></div>
                <div className="relative">
                  <div className={`w-11 h-11 rounded-xl ${cat.iconBg} flex items-center justify-center mb-3 shadow-sm group-hover:scale-110 transition-transform`}>
                    <Icon className="text-white" size={20} />
                  </div>
                  <h4 className="text-sm font-semibold text-stone-900 mb-0.5" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{cat.name}</h4>
                  <p className="text-xs text-stone-600 mb-2">{cat.desc}</p>
                  <p className="text-xs text-stone-400">{cat.count} scholars</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Recent booking review prompt */}
      <section className="max-w-7xl mx-auto px-6">
        <div className="bg-gradient-to-br from-amber-50 via-white to-emerald-50 border border-amber-200 rounded-2xl p-5 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              <Avatar scholar={MOCK_SCHOLARS[0]} size="md" />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center border-2 border-white">
                <Star size={10} className="text-white" fill="white" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>How was your session with Ustadh Yusuf?</p>
              <p className="text-xs text-stone-600 mt-0.5">Completed yesterday · Standard package</p>
            </div>
          </div>
          <button onClick={() => onLeaveReview(MOCK_SCHOLARS[0])} className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all hover:scale-[1.02] inline-flex items-center gap-2 flex-shrink-0">
            <Star size={14} /> Leave a review
          </button>
        </div>
      </section>

      {/* Scholar filter tabs */}
      <section className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Flame size={20} className="text-amber-500" />
              <h3 className="text-3xl font-semibold text-stone-900 tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Top-rated scholars</h3>
            </div>
            <p className="text-stone-600">Hand-picked based on reviews and verification</p>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 -mx-6 px-6 scrollbar-hide">
          <button onClick={() => setActiveTab("all")} className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${activeTab === "all" ? "bg-stone-900 text-white" : "bg-white border border-stone-200 text-stone-700 hover:border-stone-400"}`}>
            All scholars
          </button>
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setActiveTab(cat.id)} className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${activeTab === cat.id ? "bg-stone-900 text-white" : "bg-white border border-stone-200 text-stone-700 hover:border-stone-400"}`}>
              {cat.name}
            </button>
          ))}
        </div>

        {/* Scholars grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((s, i) => (
            <div key={s.id} style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.05}s both` }}>
              <ScholarCard scholar={s} onClick={() => onScholar(s)} />
            </div>
          ))}
        </div>
      </section>

      {/* Campaigns / Sadaqah Jariyah */}
      <section className="relative overflow-hidden mt-16 bg-gradient-to-br from-stone-900 via-emerald-950 to-stone-900 text-white">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cpath d='M30 0l30 30-30 30L0 30z' fill='none' stroke='%23fff' stroke-width='1'/%3E%3C/svg%3E")` }}></div>
        <div className="relative max-w-7xl mx-auto px-6 py-16">
          <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 px-3 py-1 rounded-full text-xs uppercase tracking-wider mb-4">
                <HandCoins size={12} /> Sadaqah jariyah · 0% platform fee
              </div>
              <h3 className="text-3xl md:text-5xl font-semibold tracking-tight mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Support a cause.</h3>
              <p className="text-emerald-100/90 max-w-xl">Live campaigns from verified mosques and scholars. Every fundraiser Charity Commission-checked. Every pound reaches the cause.</p>
            </div>
            <button onClick={() => onAllCampaigns()} className="inline-flex items-center gap-1 text-sm font-medium hover:gap-2 transition-all text-emerald-200 hover:text-white">
              View all campaigns <ArrowRight size={14} />
            </button>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {MOCK_CAMPAIGNS.map((c, i) => (
              <div key={c.id} style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.05}s both` }}>
                <CampaignCard campaign={c} onClick={() => onCampaign(c)} />
              </div>
            ))}
          </div>

          {/* Live donation ticker */}
          <div className="mt-10 inline-flex items-center gap-3 bg-white/10 backdrop-blur-sm border border-white/20 px-4 py-3 rounded-full text-sm">
            <span className="w-2 h-2 bg-emerald-300 rounded-full animate-pulse"></span>
            <span className="text-emerald-100/90">Live:</span>
            <span>Anonymous donor just gave <strong>£50</strong> to Masjid Al-Noor's roof fund</span>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white border-y border-stone-200 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="inline-block text-xs uppercase tracking-widest text-emerald-800 font-medium mb-3">How it works</span>
            <h3 className="text-3xl md:text-4xl font-semibold text-stone-900 tracking-tight mb-3" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Three steps to peace of mind</h3>
          </div>
          <div className="grid md:grid-cols-3 gap-6 relative">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-8 left-[16%] right-[16%] h-px bg-gradient-to-r from-emerald-200 via-emerald-400 to-emerald-200"></div>
            {[
              { n: "01", title: "Browse vetted scholars", desc: "Filter by service, language, or specialty. Everyone is DBS-checked.", icon: Search },
              { n: "02", title: "Book with confidence", desc: "Choose a package, pick a time. Payment held safely until complete.", icon: CheckCircle2 },
              { n: "03", title: "Leave a review", desc: "Share your experience. Every review helps the next family.", icon: Star }
            ].map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.n} className="relative bg-white text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 mb-4 relative z-10">
                    <Icon className="text-emerald-800" size={24} />
                  </div>
                  <p className="text-xs font-mono text-emerald-700 mb-1">{step.n}</p>
                  <h4 className="text-lg font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{step.title}</h4>
                  <p className="text-sm text-stone-600">{step.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Trust section */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-block text-xs uppercase tracking-widest text-emerald-800 font-medium mb-3">Why Amanah</span>
            <h3 className="text-3xl md:text-5xl font-semibold text-stone-900 tracking-tight mb-5 leading-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>The only <span className="italic text-emerald-800">safeguarded</span> Muslim scholar platform in the UK.</h3>
            <p className="text-stone-700 mb-6 text-lg leading-relaxed">There are plenty of places to find a teacher. There aren't many where you know they're safe around your children.</p>
            <div className="space-y-4">
              {[
                { icon: ShieldCheck, t: "Every scholar DBS-checked", d: "Enhanced DBS and Right to Work verified before listing." },
                { icon: GraduationCap, t: "Qualifications verified", d: "Ijazahs and institutional training checked in person." },
                { icon: Award, t: "Real reviews only", d: "Every review from a verified booking. No fakes." }
              ].map(item => {
                const Icon = item.icon;
                return (
                  <div key={item.t} className="flex gap-4">
                    <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
                      <Icon className="text-emerald-800" size={18} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-stone-900 mb-0.5" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{item.t}</h4>
                      <p className="text-sm text-stone-600">{item.d}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-br from-emerald-200 to-amber-200 rounded-3xl blur-2xl opacity-40"></div>
            <div className="relative bg-white border border-stone-200 rounded-3xl p-8 shadow-xl">
              <div className="flex items-start gap-4 mb-5">
                <Avatar scholar={MOCK_SCHOLARS[1]} size="md" />
                <div>
                  <p className="font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Shaykha Maryam Idris</p>
                  <div className="flex items-center gap-1 text-xs text-stone-500 mt-0.5">
                    <ShieldCheck size={11} className="text-emerald-700" /> DBS Verified
                    <span className="mx-1">·</span>
                    <Star size={11} className="text-amber-500" fill="currentColor" /> 5.0
                  </div>
                </div>
                <span className="ml-auto text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full font-medium">Online now</span>
              </div>
              <Quote className="text-emerald-200 mb-2" size={28} />
              <p className="text-stone-800 italic leading-relaxed mb-4">"Finally a female scholar I can ask anything without shame. Changed my iman."</p>
              <p className="text-sm text-stone-500">— Zainab H., verified booking</p>
              <div className="mt-5 pt-5 border-t border-stone-100 grid grid-cols-3 gap-3 text-center">
                <div><p className="text-2xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>210</p><p className="text-xs text-stone-500">students</p></div>
                <div><p className="text-2xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>89</p><p className="text-xs text-stone-500">reviews</p></div>
                <div><p className="text-2xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>5.0</p><p className="text-xs text-stone-500">rating</p></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-6 pb-16">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-stone-900 to-emerald-950 p-10 md:p-16 text-white">
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cpath d='M20 0l20 20-20 20L0 20z' fill='none' stroke='%23fff' stroke-width='0.5'/%3E%3C/svg%3E")`
          }}></div>
          <div className="relative max-w-2xl">
            <h3 className="text-3xl md:text-5xl font-semibold tracking-tight mb-4" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Are you a scholar or imam?</h3>
            <p className="text-stone-300 text-lg mb-6">Join Amanah. Offer your services. Get bookings. Grow your impact — with safeguarding already sorted.</p>
            <button onClick={() => onSignIn("imam")} className="inline-flex items-center gap-2 bg-white text-stone-900 px-6 py-3.5 rounded-xl text-sm font-semibold hover:bg-stone-100 transition-all hover:scale-[1.02] active:scale-95">
              Become a scholar <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-stone-950 text-stone-400">
        <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-800 flex items-center justify-center">
              <ShieldCheck className="text-emerald-50" size={16} />
            </div>
            <span className="text-sm">© Amanah · The trusted Muslim scholar platform</span>
          </div>
          <div className="flex gap-5 text-sm">
            <button onClick={() => onSignIn("mosque")} className="hover:text-white">For Mosques</button>
            <button onClick={() => onSignIn("imam")} className="hover:text-white">Become a Scholar</button>
            <a className="hover:text-white cursor-pointer">Safeguarding</a>
            <a className="hover:text-white cursor-pointer">About</a>
            <button onClick={() => onSignIn("admin")} className="hover:text-white opacity-60">Admin</button>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

        /* Hero "video" animations */
        .hero-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.5;
        }
        .orb-1 {
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(16, 185, 129, 0.8), transparent 70%);
          top: -10%; right: -5%;
          animation: drift1 20s ease-in-out infinite;
        }
        .orb-2 {
          width: 400px; height: 400px;
          background: radial-gradient(circle, rgba(45, 212, 191, 0.6), transparent 70%);
          bottom: -5%; left: -10%;
          animation: drift2 25s ease-in-out infinite;
        }
        .orb-3 {
          width: 350px; height: 350px;
          background: radial-gradient(circle, rgba(251, 191, 36, 0.3), transparent 70%);
          top: 30%; left: 30%;
          animation: drift3 30s ease-in-out infinite;
        }
        .orb-4 {
          width: 300px; height: 300px;
          background: radial-gradient(circle, rgba(52, 211, 153, 0.5), transparent 70%);
          top: 50%; right: 20%;
          animation: drift4 22s ease-in-out infinite;
        }
        @keyframes drift1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-80px, 60px) scale(1.1); }
          66% { transform: translate(40px, -40px) scale(0.95); }
        }
        @keyframes drift2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(120px, -80px) scale(1.15); }
        }
        @keyframes drift3 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.3; }
          50% { transform: translate(-60px, 80px) scale(1.2); opacity: 0.5; }
        }
        @keyframes drift4 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(60px, 40px) scale(1.1); }
          66% { transform: translate(-80px, -60px) scale(0.9); }
        }

        /* Rotating geometric pattern */
        .hero-pattern-rotate {
          animation: slowRotate 120s linear infinite;
          transform-origin: center;
        }
        @keyframes slowRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Floating gold particles */
        .hero-particle {
          position: absolute;
          bottom: -10px;
          background: radial-gradient(circle, rgba(251, 191, 36, 0.9), rgba(251, 191, 36, 0));
          border-radius: 50%;
          animation: floatUp linear infinite;
          opacity: 0;
        }
        @keyframes floatUp {
          0% { transform: translateY(0) translateX(0); opacity: 0; }
          10% { opacity: 0.8; }
          90% { opacity: 0.8; }
          100% { transform: translateY(-110vh) translateX(40px); opacity: 0; }
        }

        /* Cinematic vignette */
        .bg-radial-vignette {
          background: radial-gradient(ellipse at center, transparent 40%, rgba(0, 0, 0, 0.4) 100%);
        }

        /* Mobile-specific optimisations */
        @media (max-width: 640px) {
          /* Smaller hero orbs on mobile */
          .orb-1 { width: 300px; height: 300px; }
          .orb-2 { width: 280px; height: 280px; }
          .orb-3 { width: 220px; height: 220px; }
          .orb-4 { width: 200px; height: 200px; }

          /* Shrink rotating pattern on mobile */
          .pattern-layer svg { width: 60vh !important; height: 60vh !important; }
        }

        /* Ensure inputs don't cause zoom on iOS */
        @media (max-width: 640px) {
          input, textarea, select { font-size: 16px !important; }
        }

        /* Safe area for iPhone notch/home indicator */
        @supports (padding: max(0px)) {
          body { padding-bottom: env(safe-area-inset-bottom); }
        }
      `}</style>
    </div>
  );
};

// Scholar card with hover interactions
const ScholarCard = ({ scholar, onClick }) => {
  const minPrice = Math.min(...scholar.packages.map(p => p.price));
  return (
    <div
      onClick={onClick}
      className="group relative bg-white border border-stone-200 rounded-2xl p-5 hover:border-emerald-400 hover:shadow-xl cursor-pointer transition-all hover:-translate-y-1 overflow-hidden"
    >
      {scholar.topRated && (
        <div className="absolute top-4 right-4 inline-flex items-center gap-1 bg-amber-100 text-amber-900 text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider">
          <Flame size={10} /> Top rated
        </div>
      )}
      <div className="flex items-start gap-3 mb-3">
        <Avatar scholar={scholar} size="md" />
        <div className="flex-1 min-w-0 pr-16">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <h4 className="text-base font-semibold text-stone-900 truncate" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{scholar.name}</h4>
            {scholar.verified && <ShieldCheck size={14} className="text-emerald-700 flex-shrink-0" />}
          </div>
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <span className="flex items-center gap-1"><MapPin size={11} /> {scholar.city}</span>
            <span>·</span>
            <span className="flex items-center gap-1 text-amber-600 font-medium"><Star size={11} fill="currentColor" /> {scholar.rating}</span>
            <span className="text-stone-400">({scholar.reviewCount})</span>
          </div>
        </div>
      </div>
      <p className="text-sm text-stone-700 line-clamp-2 mb-3 leading-relaxed">{scholar.bio}</p>
      <div className="flex flex-wrap gap-1 mb-4">
        {scholar.categories.slice(0, 2).map(cid => {
          const cat = CATEGORIES.find(c => c.id === cid);
          return cat && <span key={cid} className="text-[10px] px-2 py-1 bg-stone-100 text-stone-700 rounded-md uppercase tracking-wider">{cat.name}</span>;
        })}
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-stone-100">
        <div>
          <span className="text-xs text-stone-500 block">Starting from</span>
          <span className="text-xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>£{minPrice}</span>
        </div>
        <span className="inline-flex items-center gap-1 text-sm text-emerald-800 font-medium opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1">
          View <ArrowRight size={14} />
        </span>
      </div>
    </div>
  );
};

// ==================== CATEGORY PAGE ====================
const CategoryListing = ({ categoryId, onBack, onScholar, onSignIn }) => {
  const category = CATEGORIES.find(c => c.id === categoryId);
  const scholars = MOCK_SCHOLARS.filter(s => s.categories.includes(categoryId));
  const Icon = category?.icon || BookOpen;

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-5 md:px-6 py-3.5 md:py-4 flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-2.5 md:gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center"><ShieldCheck className="text-emerald-50" size={18} /></div>
            <h1 className="text-base md:text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
          </button>
          <button onClick={() => onSignIn("mosque")} className="bg-stone-900 hover:bg-stone-800 text-white text-sm font-medium px-3.5 md:px-4 py-2 rounded-lg">Sign in</button>
        </div>
      </header>
      <section className={`bg-gradient-to-br ${category?.tint} border-b border-stone-200`}>
        <div className="max-w-7xl mx-auto px-5 md:px-6 py-8 md:py-12">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-5 md:mb-6">
            <ArrowLeft size={14} /> All categories
          </button>
          <div className="flex items-start gap-4 md:gap-5">
            <div className={`w-12 h-12 md:w-16 md:h-16 rounded-2xl ${category?.iconBg} flex items-center justify-center shadow-lg flex-shrink-0`}>
              <Icon className="text-white" size={24} />
            </div>
            <div>
              <h2 className="text-2xl md:text-4xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{category?.name}</h2>
              <p className="text-sm md:text-base text-stone-700">{category?.desc} · {scholars.length} verified scholars</p>
            </div>
          </div>
        </div>
      </section>
      <main className="max-w-7xl mx-auto px-5 md:px-6 py-6 md:py-8">
        {scholars.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {scholars.map((s, i) => (
              <div key={s.id} style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.05}s both` }}>
                <ScholarCard scholar={s} onClick={() => onScholar(s)} />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-stone-500">No scholars yet in this category.</div>
        )}
      </main>
      <style>{`@keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
};

// ==================== SCHOLAR DETAIL ====================
const PublicScholarDetail = ({ scholar, onBack, onBook, onMessage }) => {
  const [selectedPkg, setSelectedPkg] = useState(scholar.packages.find(p => p.popular) || scholar.packages[1]);

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center"><ShieldCheck className="text-emerald-50" size={18} /></div>
            <h1 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
          </button>
        </div>
      </header>

      {/* Scholar hero banner */}
      <section className={`relative overflow-hidden bg-gradient-to-br ${scholar.avatarGradient}`}>
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cpath d='M30 0l30 30-30 30L0 30z' fill='none' stroke='%23fff' stroke-width='1'/%3E%3C/svg%3E")` }}></div>
        <div className="relative max-w-6xl mx-auto px-5 md:px-6 py-8 md:py-10 text-white">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/80 hover:text-white mb-5 md:mb-6">
            <ArrowLeft size={14} /> Back
          </button>
          <div className="flex items-start gap-4 md:gap-5 flex-wrap">
            <Avatar scholar={scholar} size="lg" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <h2 className="text-2xl md:text-4xl font-semibold tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{scholar.name}</h2>
                {scholar.verified && (
                  <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-white/20 backdrop-blur-sm border border-white/30 rounded-full font-medium">
                    <ShieldCheck size={12} /> Verified
                  </span>
                )}
                {scholar.topRated && (
                  <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-amber-400 text-amber-950 rounded-full font-medium">
                    <Flame size={12} /> Top rated
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 md:gap-x-4 gap-y-1 text-xs md:text-sm text-white/90">
                <span className="flex items-center gap-1"><MapPin size={13} /> {scholar.city}</span>
                <span className="flex items-center gap-1"><Star size={13} fill="currentColor" /> {scholar.rating} · {scholar.reviewCount} reviews</span>
                <span className="hidden md:flex items-center gap-1"><Clock size={13} /> Responds {scholar.responseTime}</span>
                <span className="flex items-center gap-1"><Users size={13} /> {scholar.students} students</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-6xl mx-auto px-5 md:px-6 py-6 md:py-8 pb-24 md:pb-8">
        <div className="grid md:grid-cols-3 gap-5 md:gap-6">
          {/* Left */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-white border border-stone-200 rounded-2xl p-6">
              <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">About</h3>
              <p className="text-stone-800 leading-relaxed mb-4">{scholar.bio}</p>
              <div className="flex flex-wrap gap-1.5">
                {scholar.categories.map(cid => {
                  const cat = CATEGORIES.find(c => c.id === cid);
                  return cat && <span key={cid} className="px-2.5 py-1 bg-stone-100 text-stone-700 text-xs rounded-md">{cat.name}</span>;
                })}
                {scholar.languages.map(l => <span key={l} className="px-2.5 py-1 bg-sky-50 text-sky-700 text-xs rounded-md">{l}</span>)}
              </div>
            </div>

            {/* Verification */}
            <div className="bg-white border border-stone-200 rounded-2xl p-6">
              <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-4">Verification</h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Enhanced DBS", icon: ShieldCheck, date: "Nov 2025" },
                  { label: "Right to Work", icon: FileCheck, date: "Sep 2025" },
                  { label: "Qualifications", icon: GraduationCap, date: "Verified" }
                ].map(v => {
                  const Icon = v.icon;
                  return (
                    <div key={v.label} className="border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white rounded-xl p-4 relative overflow-hidden">
                      <div className="absolute top-2 right-2">
                        <CheckCircle2 className="text-emerald-600" size={14} />
                      </div>
                      <Icon className="text-emerald-700 mb-2" size={20} />
                      <p className="text-sm font-medium text-emerald-900">{v.label}</p>
                      <p className="text-xs text-emerald-700 mt-0.5">{v.date}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Reviews */}
            <div className="bg-white border border-stone-200 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider">Reviews from verified bookings</h3>
                <span className="text-sm text-amber-600 flex items-center gap-1 font-medium">
                  <Star size={13} fill="currentColor" /> {scholar.rating} · {scholar.reviewCount}
                </span>
              </div>

              {/* Ratings breakdown */}
              {SCHOLAR_REVIEWS_DB[scholar.id] && (
                <div className="pb-5 mb-5 border-b border-stone-100">
                  <RatingsBreakdown reviews={SCHOLAR_REVIEWS_DB[scholar.id]} />
                </div>
              )}

              {/* Review list */}
              <div className="space-y-5">
                {(SCHOLAR_REVIEWS_DB[scholar.id] || []).map(r => (
                  <ReviewCard key={r.id} review={r} compact />
                ))}
              </div>

              {SCHOLAR_REVIEWS_DB[scholar.id] && SCHOLAR_REVIEWS_DB[scholar.id].length >= 4 && (
                <button className="w-full mt-4 text-sm text-emerald-800 font-medium hover:underline">See all {scholar.reviewCount} reviews</button>
              )}
            </div>
          </div>

          {/* Right: packages */}
          <div>
            <div className="bg-white border border-stone-200 rounded-2xl p-5 sticky top-24 shadow-sm">
              <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-4">Choose a package</h3>
              <div className="space-y-2 mb-5">
                {scholar.packages.map(pkg => (
                  <button
                    key={pkg.name}
                    onClick={() => setSelectedPkg(pkg)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all relative ${selectedPkg.name === pkg.name ? "border-emerald-600 bg-emerald-50 shadow-sm" : "border-stone-200 hover:border-stone-300"}`}
                  >
                    {pkg.popular && (
                      <span className="absolute -top-2 right-3 bg-amber-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">Most popular</span>
                    )}
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{pkg.name}</span>
                      <span className="text-lg font-semibold text-stone-900">£{pkg.price}</span>
                    </div>
                    <p className="text-xs text-stone-500 mb-1">{pkg.duration}</p>
                    <p className="text-xs text-stone-600">{pkg.desc}</p>
                  </button>
                ))}
              </div>
              <button onClick={() => onBook(scholar, selectedPkg)} className="w-full bg-emerald-900 hover:bg-emerald-800 text-white py-3.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.01] active:scale-95 shadow-lg shadow-emerald-900/20 inline-flex items-center justify-center gap-2">
                Book for £{selectedPkg.price} <ArrowRight size={15} />
              </button>
              <button onClick={onMessage} className="w-full mt-2 border border-stone-300 hover:border-emerald-400 hover:bg-emerald-50 text-stone-700 py-2.5 rounded-xl text-sm font-medium transition-colors inline-flex items-center justify-center gap-2">
                <MessageCircle size={14} /> Message {scholar.name.split(" ")[0]} first
              </button>
              <div className="mt-4 pt-4 border-t border-stone-100 space-y-2 text-xs text-stone-600">
                <p className="flex items-center gap-2"><ShieldCheck size={12} className="text-emerald-700" /> Payment held until session complete</p>
                <p className="flex items-center gap-2"><Clock size={12} className="text-emerald-700" /> Full refund if cancelled 24h before</p>
                <p className="flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-700" /> Satisfaction guarantee</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Mobile sticky bottom action bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 z-30 px-5 py-3" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-stone-500">{selectedPkg.name} package</p>
            <p className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>£{selectedPkg.price}</p>
          </div>
          <button onClick={onMessage} className="border border-stone-300 text-stone-700 p-3 rounded-xl flex-shrink-0">
            <MessageCircle size={18} />
          </button>
          <button onClick={() => onBook(scholar, selectedPkg)} className="bg-emerald-900 text-white px-5 py-3 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 flex-shrink-0">
            Book <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
const BookingConfirm = ({ scholar, pkg, onBack, onDone }) => {
  const [step, setStep] = useState(1);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  const platformFee = Math.round(pkg.price * 0.1);
  const total = pkg.price + platformFee;
  const canStep1 = name && email;
  const canStep2 = date && time;

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-5 md:px-6 py-3.5 md:py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center"><ShieldCheck className="text-emerald-50" size={18} /></div>
          <h1 className="text-base md:text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 md:px-6 py-6 md:py-8">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-5 md:mb-6">
          <ArrowLeft size={14} /> Back
        </button>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            {[1, 2, 3].map(n => (
              <div key={n} className="flex items-center gap-3 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${step >= n ? "bg-emerald-900 text-white" : "bg-stone-200 text-stone-500"}`}>
                  {step > n ? <CheckCircle2 size={14} /> : n}
                </div>
                {n < 3 && <div className={`flex-1 h-0.5 transition-all ${step > n ? "bg-emerald-900" : "bg-stone-200"}`}></div>}
              </div>
            ))}
          </div>
          <p className="text-xs text-stone-500 text-center">{["Your details", "Pick a time", "Review & pay"][step - 1]}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          <div className="md:col-span-2 bg-white border border-stone-200 rounded-2xl p-6">
            {step === 1 && (
              <div>
                <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Let's start with you</h2>
                <p className="text-sm text-stone-500 mb-5">We'll use this to contact you about your booking.</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Your name</label>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Aisha Khan" className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Email</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                  </div>
                </div>
              </div>
            )}
            {step === 2 && (
              <div>
                <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>When works for you?</h2>
                <p className="text-sm text-stone-500 mb-5">Only showing times {scholar.name.split(" ")[0]} is actually available.</p>

                <DateTimePicker
                  availability={DEFAULT_AVAILABILITY}
                  bookings={DEFAULT_BOOKINGS}
                  selectedDate={date}
                  selectedTime={time}
                  onDateChange={setDate}
                  onTimeChange={setTime}
                />

                <div className="mt-5">
                  <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Notes (optional)</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="e.g. My son is 7, starting Qur'an for the first time. He's a bit shy." className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm resize-none" />
                </div>
              </div>
            )}
            {step === 3 && (
              <div>
                <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Almost there</h2>
                <p className="text-sm text-stone-500 mb-5">Review everything before we send this to {scholar.name}.</p>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between py-2 border-b border-stone-100">
                    <span className="text-stone-500">Booked by</span>
                    <span className="text-stone-900 font-medium">{name}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-stone-100">
                    <span className="text-stone-500">Email</span>
                    <span className="text-stone-900">{email}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-stone-100">
                    <span className="text-stone-500">Date & time</span>
                    <span className="text-stone-900 font-medium">{date} at {time}</span>
                  </div>
                  {notes && <div className="py-2 border-b border-stone-100"><span className="text-stone-500 block mb-1">Notes</span><span className="text-stone-700 text-xs">{notes}</span></div>}
                </div>
              </div>
            )}

            <div className="flex justify-between mt-8 pt-6 border-t border-stone-100">
              <button onClick={() => step > 1 ? setStep(step - 1) : onBack()} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900">Back</button>
              {step < 3 ? (
                <button onClick={() => setStep(step + 1)} disabled={step === 1 ? !canStep1 : !canStep2} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white px-6 py-2.5 rounded-xl text-sm font-medium inline-flex items-center gap-2 transition-all hover:scale-[1.02] disabled:hover:scale-100">
                  Continue <ArrowRight size={14} />
                </button>
              ) : (
                <button onClick={() => onDone({ scholar, pkg, date, time, name, email, notes, total })} className="bg-emerald-900 hover:bg-emerald-800 text-white px-6 py-2.5 rounded-xl text-sm font-medium inline-flex items-center gap-2 shadow-lg shadow-emerald-900/30">
                  <CreditCard size={14} /> Pay £{total}
                </button>
              )}
            </div>
          </div>

          {/* Sticky summary */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5 h-fit">
            <div className="flex items-center gap-3 pb-4 border-b border-stone-100 mb-4">
              <Avatar scholar={scholar} size="sm" />
              <div>
                <p className="text-sm font-semibold text-stone-900">{scholar.name}</p>
                <p className="text-xs text-amber-600 flex items-center gap-0.5"><Star size={10} fill="currentColor" /> {scholar.rating}</p>
              </div>
            </div>
            <div className="mb-4">
              <p className="text-xs font-medium text-stone-700 uppercase tracking-wider mb-2">Package</p>
              <p className="text-sm font-medium text-stone-900">{pkg.name}</p>
              <p className="text-xs text-stone-500">{pkg.duration}</p>
            </div>
            <div className="space-y-2 text-sm pt-4 border-t border-stone-100">
              <div className="flex justify-between text-stone-600"><span>Package</span><span className="text-stone-900">£{pkg.price}</span></div>
              <div className="flex justify-between text-stone-500 text-xs"><span>Platform fee</span><span>£{platformFee}</span></div>
              <div className="flex justify-between pt-2 border-t border-stone-100"><span className="font-medium text-stone-900">Total</span><span className="font-semibold text-stone-900 text-lg">£{total}</span></div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

const BookingSuccess = ({ booking, onHome }) => (
  <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-stone-50 to-amber-50 flex items-center justify-center p-6" style={{ fontFamily: "'Inter', sans-serif" }}>
    <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-stone-200 p-8 text-center" style={{ animation: "bounceIn 0.6s ease-out" }}>
      <div className="relative inline-block mb-5">
        <div className="absolute inset-0 bg-emerald-300 rounded-full blur-xl opacity-40"></div>
        <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-700 shadow-lg">
          <CheckCircle2 className="text-white" size={30} strokeWidth={2.5} />
        </div>
      </div>
      <h2 className="text-2xl font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Alhamdulillah!</h2>
      <p className="text-stone-600 mb-5 text-sm leading-relaxed">Your booking is confirmed. We've sent the details to <span className="font-medium text-stone-900">{booking.email}</span>. {booking.scholar.name} will be in touch shortly.</p>
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 text-left mb-5">
        <p className="text-xs uppercase tracking-wider text-stone-500 mb-1">Booking reference</p>
        <p className="text-sm font-mono text-stone-900">AMN-{Date.now().toString().slice(-8)}</p>
      </div>
      <button onClick={onHome} className="w-full bg-emerald-900 hover:bg-emerald-800 text-white py-3 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]">
        Back to Amanah
      </button>
    </div>
    <style>{`@keyframes bounceIn { 0% { opacity: 0; transform: scale(0.9); } 50% { transform: scale(1.02); } 100% { opacity: 1; transform: scale(1); } }`}</style>
  </div>
);

// ==================== LOGIN & DASHBOARDS (condensed) ====================
const RolePicker = ({ onPick, onPublic }) => (
  <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
    <div className="w-full max-w-2xl">
      <button onClick={onPublic} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-6" style={{ fontFamily: "'Inter', sans-serif" }}><ArrowLeft size={14} /> Back to Amanah</button>
      <div className="text-center mb-10"><div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-900 mb-5 shadow-lg"><ShieldCheck className="text-emerald-50" size={26} /></div><h1 className="text-4xl font-semibold text-stone-900 tracking-tight">Amanah</h1><p className="text-sm text-stone-500 mt-2 tracking-wide uppercase" style={{ fontFamily: "'Inter', sans-serif", letterSpacing: "0.15em" }}>Sign in</p></div>
      <div className="grid md:grid-cols-2 gap-4" style={{ fontFamily: "'Inter', sans-serif" }}>
        <button onClick={() => onPick("mosque")} className="bg-white border border-stone-200 rounded-2xl p-8 text-left hover:border-emerald-700 hover:shadow-lg hover:-translate-y-0.5 transition-all"><Building2 className="text-emerald-900 mb-4" size={28} /><h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>I'm a Mosque</h2><p className="text-sm text-stone-600 mb-4">Hire imams, book substitute cover, run DBS checks.</p><span className="inline-flex items-center gap-1 text-sm text-emerald-800 font-medium">Continue <ArrowRight size={14} /></span></button>
        <button onClick={() => onPick("imam")} className="bg-white border border-stone-200 rounded-2xl p-8 text-left hover:border-emerald-700 hover:shadow-lg hover:-translate-y-0.5 transition-all"><Users className="text-emerald-900 mb-4" size={28} /><h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>I'm a Scholar or Imam</h2><p className="text-sm text-stone-600 mb-4">Register, offer services, accept bookings.</p><span className="inline-flex items-center gap-1 text-sm text-emerald-800 font-medium">Continue <ArrowRight size={14} /></span></button>
      </div>
    </div>
  </div>
);

const LoginScreen = ({ role, onLogin, onBack, onGoRegister, onSwitchRole }) => (
  <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
    <div className="w-full max-w-md">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-6" style={{ fontFamily: "'Inter', sans-serif" }}><ArrowLeft size={14} /> Back</button>
      <div className="text-center mb-8"><div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-900 mb-4 shadow-lg"><ShieldCheck className="text-emerald-50" size={22} /></div><h1 className="text-3xl font-semibold text-stone-900 tracking-tight">Amanah</h1>{role === "admin" && <p className="text-xs text-stone-500 uppercase tracking-widest mt-2" style={{ fontFamily: "'Inter', sans-serif" }}>Admin Portal</p>}</div>
      <div className="bg-white rounded-2xl border border-stone-200 p-8 shadow-sm">
        <h2 className="text-xl font-semibold text-stone-900 mb-1">{role === "mosque" ? "Mosque Sign In" : role === "admin" ? "Admin Sign In" : "Scholar Sign In"}</h2>
        <p className="text-sm text-stone-500 mb-6" style={{ fontFamily: "'Inter', sans-serif" }}>
          {role === "mosque" ? "Sign in to manage your imams, run DBS checks, and post jobs." :
           role === "admin" ? "Enter any details — this is a demo." :
           "Sign in to manage your availability, bookings and profile."}
        </p>
        <div className="space-y-4" style={{ fontFamily: "'Inter', sans-serif" }}>
          <input type="email" placeholder="Email" className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
          <input type="password" placeholder="Password" className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
          <button onClick={onLogin} className="w-full bg-emerald-900 hover:bg-emerald-800 text-white py-3 rounded-xl text-sm font-medium transition-all hover:scale-[1.01]">Sign In</button>
        </div>
        {role !== "admin" && (
          <div className="mt-6 pt-6 border-t border-stone-100 text-center" style={{ fontFamily: "'Inter', sans-serif" }}>
            <p className="text-sm text-stone-600 mb-2">
              {role === "mosque" ? "Not registered yet?" : "New to Amanah?"}
            </p>
            <button onClick={onGoRegister} className="inline-flex items-center gap-1 text-sm text-emerald-800 font-medium hover:gap-2 transition-all">
              {role === "mosque" ? "Register your masjid" : "Create a scholar profile"} <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
      {role !== "admin" && (
        <div className="mt-5 text-center text-xs text-stone-500" style={{ fontFamily: "'Inter', sans-serif" }}>
          {role === "mosque" ? (
            <>Are you a scholar or imam? <button onClick={() => onSwitchRole("imam")} className="text-emerald-800 font-medium hover:underline">Sign in here</button></>
          ) : (
            <>Are you a mosque? <button onClick={() => onSwitchRole("mosque")} className="text-emerald-800 font-medium hover:underline">Sign in here</button></>
          )}
        </div>
      )}
    </div>
  </div>
);

// ==================== FORM HELPERS FOR REGISTRATION ====================
const RegField = ({ label, value, onChange, placeholder, type = "text", hint }) => (
  <div>
    <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">{label}</label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
    {hint && <p className="text-xs text-stone-500 mt-1">{hint}</p>}
  </div>
);

const RegTagInput = ({ label, placeholder, tags, onAdd, onRemove, input, setInput, hint }) => (
  <div>
    <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">{label}</label>
    <div className="flex gap-2">
      <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), onAdd(input))} placeholder={placeholder} className="flex-1 px-4 py-2.5 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
      <button type="button" onClick={() => onAdd(input)} className="px-3 bg-stone-100 hover:bg-stone-200 rounded-xl"><Plus size={16} /></button>
    </div>
    {hint && <p className="text-xs text-stone-500 mt-1">{hint}</p>}
    {tags.length > 0 && (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {tags.map(t => (
          <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 bg-stone-100 text-stone-700 text-xs rounded-md">
            {t}
            <button onClick={() => onRemove(t)} className="hover:text-rose-600"><X size={11} /></button>
          </span>
        ))}
      </div>
    )}
  </div>
);

const RegUploadRow = ({ label, sublabel, uploaded, onToggle }) => (
  <button onClick={onToggle} className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-colors ${uploaded ? "bg-emerald-50 border-emerald-200" : "bg-stone-50 border-stone-200 hover:border-stone-300"}`}>
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${uploaded ? "bg-emerald-100" : "bg-white border border-stone-200"}`}>
      {uploaded ? <CheckCircle2 className="text-emerald-700" size={18} /> : <Upload className="text-stone-500" size={18} />}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-stone-900">{label}</p>
      <p className="text-xs text-stone-500">{sublabel}</p>
    </div>
    <span className="text-xs text-stone-500 flex-shrink-0">{uploaded ? "Uploaded ✓" : "Tap to upload"}</span>
  </button>
);

// ==================== MOSQUE REGISTRATION ====================
const MosqueRegister = ({ onComplete, onBack }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    mosqueName: "", charityNumber: "", addressLine: "", city: "", postcode: "", website: "",
    denomination: "", primaryLanguages: [], establishedYear: "", congregationSize: "",
    contactName: "", contactRole: "", contactEmail: "", contactPhone: "",
    safeguardingLeadName: "", safeguardingLeadEmail: "", safeguardingPolicy: false,
    proofOfAddressUploaded: false, trusteeConfirmationUploaded: false
  });
  const [langInput, setLangInput] = useState("");

  const addLanguage = (v) => {
    if (v.trim() && !form.primaryLanguages.includes(v.trim())) {
      setForm({ ...form, primaryLanguages: [...form.primaryLanguages, v.trim()] });
      setLangInput("");
    }
  };
  const removeLanguage = (v) => setForm({ ...form, primaryLanguages: form.primaryLanguages.filter(l => l !== v) });

  const canProceed = {
    1: form.mosqueName && form.charityNumber && form.addressLine && form.city && form.postcode,
    2: form.denomination && form.primaryLanguages.length > 0 && form.establishedYear && form.congregationSize,
    3: form.contactName && form.contactRole && form.contactEmail && form.contactPhone,
    4: form.safeguardingLeadName && form.safeguardingLeadEmail && form.safeguardingPolicy,
    5: form.proofOfAddressUploaded && form.trusteeConfirmationUploaded
  }[step];

  const stepTitles = ["Mosque details", "About your community", "Primary contact", "Safeguarding", "Verification"];

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-5 md:px-6 py-3.5 md:py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center"><ShieldCheck className="text-emerald-50" size={18} /></div>
          <h1 className="text-base md:text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 md:px-6 py-6 md:py-8">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-5 md:mb-6"><ArrowLeft size={14} /> Back</button>

        <div className="mb-2">
          <h1 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Register your mosque</h1>
          <p className="text-stone-600 mt-1 text-sm md:text-base">Join the UK's only safeguarded mosque register. 100% free.</p>
        </div>

        <div className="mt-8 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-stone-500">Step {step} of 5 · {stepTitles[step - 1]}</span>
            <span className="text-xs text-stone-500">{Math.round((step / 5) * 100)}%</span>
          </div>
          <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-900 transition-all duration-500" style={{ width: `${(step / 5) * 100}%` }} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 p-6 md:p-8">
          {step === 1 && (
            <div>
              <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Mosque details</h2>
              <p className="text-sm text-stone-500 mb-6">Help us verify you're a legitimate Islamic institution.</p>
              <div className="space-y-4">
                <RegField label="Mosque name" value={form.mosqueName} onChange={v => setForm({...form, mosqueName: v})} placeholder="e.g. Masjid Al-Noor" />
                <RegField label="Charity Commission number" value={form.charityNumber} onChange={v => setForm({...form, charityNumber: v})} placeholder="e.g. 1123456" hint="We verify this against the UK Charity Commission register. Don't have one yet? We can still register you — add '0000000' and note it in verification." />
                <RegField label="Address" value={form.addressLine} onChange={v => setForm({...form, addressLine: v})} placeholder="e.g. 42 Park Road" />
                <div className="grid grid-cols-2 gap-3">
                  <RegField label="City" value={form.city} onChange={v => setForm({...form, city: v})} placeholder="e.g. Birmingham" />
                  <RegField label="Postcode" value={form.postcode} onChange={v => setForm({...form, postcode: v})} placeholder="e.g. B12 9AA" />
                </div>
                <RegField label="Website (optional)" value={form.website} onChange={v => setForm({...form, website: v})} placeholder="https://..." />
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>About your community</h2>
              <p className="text-sm text-stone-500 mb-6">This helps us match you with imams who suit your congregation.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Denomination / tradition</label>
                  <select value={form.denomination} onChange={e => setForm({...form, denomination: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm bg-white">
                    <option value="">Select...</option>
                    <option>Sunni – Hanafi</option>
                    <option>Sunni – Shafi'i</option>
                    <option>Sunni – Maliki</option>
                    <option>Sunni – Hanbali</option>
                    <option>Shia</option>
                    <option>Sufi tariqah</option>
                    <option>Non-denominational</option>
                    <option>Other</option>
                  </select>
                </div>
                <RegTagInput label="Primary languages of khutbah" placeholder="e.g. English, Urdu, Arabic" tags={form.primaryLanguages} onAdd={addLanguage} onRemove={removeLanguage} input={langInput} setInput={setLangInput} hint="Press Enter after each language" />
                <div className="grid grid-cols-2 gap-3">
                  <RegField label="Year established" type="number" value={form.establishedYear} onChange={v => setForm({...form, establishedYear: v})} placeholder="e.g. 1998" />
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Jumu'ah congregation</label>
                    <select value={form.congregationSize} onChange={e => setForm({...form, congregationSize: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm bg-white">
                      <option value="">Select...</option>
                      <option>Under 100</option>
                      <option>100–300</option>
                      <option>300–600</option>
                      <option>600–1000</option>
                      <option>1000+</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Primary contact</h2>
              <p className="text-sm text-stone-500 mb-6">Must be a named trustee, chairperson, or management committee member.</p>
              <div className="space-y-4">
                <RegField label="Full name" value={form.contactName} onChange={v => setForm({...form, contactName: v})} placeholder="e.g. Muhammad Khan" />
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Role at the mosque</label>
                  <select value={form.contactRole} onChange={e => setForm({...form, contactRole: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm bg-white">
                    <option value="">Select...</option>
                    <option>Chairperson</option>
                    <option>Trustee</option>
                    <option>Secretary</option>
                    <option>Treasurer</option>
                    <option>Management Committee Member</option>
                    <option>Senior Imam</option>
                  </select>
                </div>
                <RegField label="Email" type="email" value={form.contactEmail} onChange={v => setForm({...form, contactEmail: v})} placeholder="you@masjid.org" hint="We'll send a verification email to this address." />
                <RegField label="Phone" value={form.contactPhone} onChange={v => setForm({...form, contactPhone: v})} placeholder="+44 7700 900000" />
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Safeguarding</h2>
              <p className="text-sm text-stone-500 mb-6">Every mosque on Amanah must have a designated safeguarding lead.</p>
              <div className="space-y-4">
                <RegField label="Safeguarding lead — name" value={form.safeguardingLeadName} onChange={v => setForm({...form, safeguardingLeadName: v})} placeholder="e.g. Aisha Rahman" />
                <RegField label="Safeguarding lead — email" type="email" value={form.safeguardingLeadEmail} onChange={v => setForm({...form, safeguardingLeadEmail: v})} placeholder="safeguarding@masjid.org" />
                <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${form.safeguardingPolicy ? "bg-emerald-50 border-emerald-200" : "bg-stone-50 border-stone-200 hover:border-stone-300"}`}>
                  <input type="checkbox" checked={form.safeguardingPolicy} onChange={e => setForm({...form, safeguardingPolicy: e.target.checked})} className="mt-0.5 accent-emerald-800" />
                  <div>
                    <p className="text-sm font-medium text-stone-900">We have a written safeguarding policy</p>
                    <p className="text-xs text-stone-600 mt-0.5">Our policy covers children, vulnerable adults, and staff conduct, and is reviewed annually.</p>
                  </div>
                </label>
              </div>
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                <AlertCircle className="text-amber-800 flex-shrink-0 mt-0.5" size={16} />
                <p className="text-xs text-amber-900 leading-relaxed">Don't have a written safeguarding policy yet? We'll share a template during verification. You won't be listed until one is in place — this is non-negotiable for child safety.</p>
              </div>
            </div>
          )}

          {step === 5 && (
            <div>
              <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Verification documents</h2>
              <p className="text-sm text-stone-500 mb-6">We verify within 3 working days.</p>
              <div className="space-y-3">
                <RegUploadRow label="Proof of address" sublabel="Utility bill, council letter, or bank statement from the last 3 months" uploaded={form.proofOfAddressUploaded} onToggle={() => setForm({...form, proofOfAddressUploaded: !form.proofOfAddressUploaded})} />
                <RegUploadRow label="Trustee confirmation letter" sublabel="Signed by two trustees confirming you're authorised to act on the mosque's behalf" uploaded={form.trusteeConfirmationUploaded} onToggle={() => setForm({...form, trusteeConfirmationUploaded: !form.trusteeConfirmationUploaded})} />
              </div>
              <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3">
                <ShieldCheck className="text-emerald-800 flex-shrink-0 mt-0.5" size={18} />
                <p className="text-xs text-emerald-900 leading-relaxed">We cross-check your Charity Commission number, verify documents, and call a listed trustee before approving. This keeps imams safe from fake listings.</p>
              </div>
            </div>
          )}

          <div className="flex justify-between mt-8 pt-6 border-t border-stone-100">
            <button onClick={() => step > 1 ? setStep(step - 1) : onBack()} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900">{step > 1 ? "Back" : "Cancel"}</button>
            <button onClick={() => step < 5 ? setStep(step + 1) : onComplete(form)} disabled={!canProceed} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] disabled:hover:scale-100 inline-flex items-center gap-2">
              {step < 5 ? <>Continue <ArrowRight size={14} /></> : <><Send size={14} /> Submit for verification</>}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

// ==================== SCHOLAR REGISTRATION ====================
const ImamRegister = ({ onComplete, onBack }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", city: "",
    madhhab: "", experience: "", bio: "",
    specialties: [], languages: [],
    availability: "substitute", rate: "",
    dbsUploaded: false, rtwUploaded: false, ijazahUploaded: false
  });
  const [specialtyInput, setSpecialtyInput] = useState("");
  const [languageInput, setLanguageInput] = useState("");

  const addTag = (field, value, setter) => {
    if (value.trim() && !form[field].includes(value.trim())) {
      setForm({ ...form, [field]: [...form[field], value.trim()] });
      setter("");
    }
  };
  const removeTag = (field, value) => setForm({ ...form, [field]: form[field].filter(v => v !== value) });

  const canProceed = {
    1: form.name && form.email && form.phone && form.city,
    2: form.madhhab && form.experience && form.bio && form.specialties.length > 0 && form.languages.length > 0,
    3: form.availability && form.rate,
    4: form.dbsUploaded && form.rtwUploaded
  }[step];

  const stepTitles = ["Personal details", "Qualifications", "Availability", "Verification"];

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-5 md:px-6 py-3.5 md:py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center"><ShieldCheck className="text-emerald-50" size={18} /></div>
          <h1 className="text-base md:text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 md:px-6 py-6 md:py-8">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-5 md:mb-6"><ArrowLeft size={14} /> Back</button>

        <div className="mb-2">
          <h1 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Create your scholar profile</h1>
          <p className="text-stone-600 mt-1 text-sm md:text-base">Get found by mosques and students. Free to list.</p>
        </div>

        <div className="mt-8 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-stone-500">Step {step} of 4 · {stepTitles[step - 1]}</span>
            <span className="text-xs text-stone-500">{Math.round((step / 4) * 100)}%</span>
          </div>
          <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-900 transition-all duration-500" style={{ width: `${(step / 4) * 100}%` }} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 p-6 md:p-8">
          {step === 1 && (
            <div>
              <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Personal details</h2>
              <p className="text-sm text-stone-500 mb-6">Tell us who you are and where to reach you.</p>
              <div className="space-y-4">
                <RegField label="Full name" value={form.name} onChange={v => setForm({...form, name: v})} placeholder="e.g. Yusuf Al-Rahman" />
                <RegField label="Email" type="email" value={form.email} onChange={v => setForm({...form, email: v})} placeholder="you@example.com" />
                <RegField label="Phone" value={form.phone} onChange={v => setForm({...form, phone: v})} placeholder="+44 7700 900123" />
                <RegField label="City (or 'Online' if remote only)" value={form.city} onChange={v => setForm({...form, city: v})} placeholder="e.g. Birmingham" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Qualifications & experience</h2>
              <p className="text-sm text-stone-500 mb-6">Your Islamic training and specialties.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Madhhab</label>
                  <select value={form.madhhab} onChange={e => setForm({...form, madhhab: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm bg-white">
                    <option value="">Select...</option>
                    <option>Hanafi</option><option>Shafi'i</option><option>Maliki</option><option>Hanbali</option><option>Other</option>
                  </select>
                </div>
                <RegField label="Years of experience" type="number" value={form.experience} onChange={v => setForm({...form, experience: v})} placeholder="e.g. 8" />
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Short bio</label>
                  <textarea value={form.bio} onChange={e => setForm({...form, bio: e.target.value})} rows={4} placeholder="A brief description of your training, approach, and who you love teaching..." className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm resize-none leading-relaxed" />
                  <p className="text-xs text-stone-500 mt-1">{form.bio.length} characters · aim for 100–200</p>
                </div>
                <RegTagInput label="Specialties" placeholder="e.g. Jumu'ah Khutbah, Hifz, Tajweed" tags={form.specialties} onAdd={v => addTag("specialties", v, setSpecialtyInput)} onRemove={v => removeTag("specialties", v)} input={specialtyInput} setInput={setSpecialtyInput} hint="Press Enter to add each specialty" />
                <RegTagInput label="Languages" placeholder="e.g. Arabic, English, Urdu" tags={form.languages} onAdd={v => addTag("languages", v, setLanguageInput)} onRemove={v => removeTag("languages", v)} input={languageInput} setInput={setLanguageInput} hint="Languages you can teach or preach in" />
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Availability & rate</h2>
              <p className="text-sm text-stone-500 mb-6">What kind of work are you open to?</p>
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-2 uppercase tracking-wider">I'm available for</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[{v:"substitute",l:"Substitute cover"},{v:"permanent",l:"Permanent role"},{v:"both",l:"Both"}].map(opt => (
                      <button key={opt.v} onClick={() => setForm({...form, availability: opt.v})} className={`py-3 rounded-xl border text-sm font-medium transition-colors ${form.availability === opt.v ? "bg-emerald-900 text-white border-emerald-900" : "bg-white text-stone-700 border-stone-300 hover:border-stone-400"}`}>
                        {opt.l}
                      </button>
                    ))}
                  </div>
                </div>
                <RegField label="Rate or preference" value={form.rate} onChange={v => setForm({...form, rate: v})} placeholder="e.g. £180/day · or 'Seeking full-time'" hint="You can always update this later." />
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Verification documents</h2>
              <p className="text-sm text-stone-500 mb-6">We verify within 48 hours so mosques can trust you.</p>
              <div className="space-y-3">
                <RegUploadRow label="Enhanced DBS Certificate" sublabel="Required · Must be Enhanced level (not Basic or Standard)" uploaded={form.dbsUploaded} onToggle={() => setForm({...form, dbsUploaded: !form.dbsUploaded})} />
                <RegUploadRow label="Right to Work Document" sublabel="Required · Passport, visa, or share code from gov.uk" uploaded={form.rtwUploaded} onToggle={() => setForm({...form, rtwUploaded: !form.rtwUploaded})} />
                <RegUploadRow label="Ijazah or Qualification Certificate" sublabel="Optional · Strengthens your profile and reviews" uploaded={form.ijazahUploaded} onToggle={() => setForm({...form, ijazahUploaded: !form.ijazahUploaded})} />
              </div>
              <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3">
                <ShieldCheck className="text-emerald-800 flex-shrink-0 mt-0.5" size={18} />
                <p className="text-xs text-emerald-900 leading-relaxed">Your documents are encrypted and only seen by Amanah's verification team. We never share copies with mosques — they only see your verification status.</p>
              </div>
            </div>
          )}

          <div className="flex justify-between mt-8 pt-6 border-t border-stone-100">
            <button onClick={() => step > 1 ? setStep(step - 1) : onBack()} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900">{step > 1 ? "Back" : "Cancel"}</button>
            <button onClick={() => step < 4 ? setStep(step + 1) : onComplete(form)} disabled={!canProceed} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] disabled:hover:scale-100 inline-flex items-center gap-2">
              {step < 4 ? <>Continue <ArrowRight size={14} /></> : <><Send size={14} /> Submit for verification</>}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

// ==================== REGISTRATION SUCCESS (PENDING VERIFICATION) ====================
const RegistrationPending = ({ type, form, onHome }) => (
  <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-stone-50 to-amber-50 flex items-center justify-center p-6" style={{ fontFamily: "'Inter', sans-serif" }}>
    <div className="max-w-lg w-full bg-white rounded-3xl shadow-xl border border-stone-200 p-8" style={{ animation: "bounceIn 0.6s ease-out" }}>
      <div className="text-center mb-6">
        <div className="relative inline-block mb-5">
          <div className="absolute inset-0 bg-amber-300 rounded-full blur-xl opacity-40"></div>
          <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg">
            <Clock className="text-white" size={30} strokeWidth={2} />
          </div>
        </div>
        <h2 className="text-2xl font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Submitted for verification</h2>
        <p className="text-stone-700 leading-relaxed">
          {type === "mosque"
            ? `Your registration for ${form.mosqueName} is in our queue. We'll verify within 3 working days.`
            : `Welcome to Amanah, ${form.name?.split(" ")[0]}. We'll review your documents within 48 hours.`}
        </p>
      </div>

      <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 mb-5">
        <p className="text-xs text-stone-500 uppercase tracking-wider font-medium mb-3">What happens next</p>
        <ol className="space-y-2 text-sm text-stone-700">
          {type === "mosque" ? (
            <>
              <li className="flex gap-3"><span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold flex items-center justify-center flex-shrink-0">1</span><span>We cross-check your Charity Commission number against the public register</span></li>
              <li className="flex gap-3"><span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold flex items-center justify-center flex-shrink-0">2</span><span>We verify your documents and safeguarding policy</span></li>
              <li className="flex gap-3"><span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold flex items-center justify-center flex-shrink-0">3</span><span>We call one of your listed trustees to confirm</span></li>
              <li className="flex gap-3"><span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold flex items-center justify-center flex-shrink-0">4</span><span>You get access to the full platform — hire imams, post jobs, run DBS checks</span></li>
            </>
          ) : (
            <>
              <li className="flex gap-3"><span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold flex items-center justify-center flex-shrink-0">1</span><span>We verify your DBS certificate with the issuing body</span></li>
              <li className="flex gap-3"><span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold flex items-center justify-center flex-shrink-0">2</span><span>We check your Right to Work documents</span></li>
              <li className="flex gap-3"><span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold flex items-center justify-center flex-shrink-0">3</span><span>If you provided an ijazah, we verify with the institution</span></li>
              <li className="flex gap-3"><span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold flex items-center justify-center flex-shrink-0">4</span><span>Your profile goes live and mosques can contact you</span></li>
            </>
          )}
        </ol>
      </div>

      <div className="bg-stone-50 rounded-xl p-3 text-sm mb-5 flex items-center justify-between">
        <span className="text-stone-500 text-xs uppercase tracking-wider font-medium">Application ID</span>
        <span className="text-stone-900 font-mono text-xs">AMN-{type === "mosque" ? "M" : "S"}-{Date.now().toString().slice(-6)}</span>
      </div>

      <p className="text-xs text-stone-600 text-center mb-5">We'll email you at <span className="font-medium text-stone-900">{type === "mosque" ? form.contactEmail : form.email}</span> as soon as verification is complete.</p>

      <button onClick={onHome} className="w-full bg-emerald-900 hover:bg-emerald-800 text-white py-3 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]">
        Back to Amanah
      </button>
    </div>
    <style>{`@keyframes bounceIn { 0% { opacity: 0; transform: scale(0.9); } 50% { transform: scale(1.02); } 100% { opacity: 1; transform: scale(1); } }`}</style>
  </div>
);

// ==================== FULL MOSQUE DASHBOARD ====================
const IMAM_REGISTRY = [
  { id: 1, name: "Yusuf Al-Rahman", initials: "YR", city: "Birmingham", availability: "substitute", dbs: { status: "verified", date: "2025-11-14", type: "Enhanced" }, rtw: { status: "verified", date: "2025-09-02" }, specialties: ["Jumu'ah Khutbah", "Tajweed", "Youth Programs"], languages: ["Arabic", "English", "Urdu"], experience: 12, madhhab: "Hanafi", rate: "£180/day", email: "yusuf.r@example.com", phone: "+44 7700 900123", bio: "Al-Azhar graduate with 12 years serving UK mosques. Available for Friday cover and Ramadan Taraweeh.", avatarGradient: "from-emerald-400 to-emerald-700" },
  { id: 2, name: "Ibrahim Siddiqui", initials: "IS", city: "London", availability: "permanent", dbs: { status: "verified", date: "2026-01-08", type: "Enhanced" }, rtw: { status: "verified", date: "2025-12-11" }, specialties: ["Hifz Teaching", "Arabic Instruction"], languages: ["Arabic", "English"], experience: 8, madhhab: "Shafi'i", rate: "Seeking full-time", email: "i.siddiqui@example.com", phone: "+44 7700 900234", bio: "Qualified Hafiz with ijazah in Qira'at Hafs. Seeking permanent role.", avatarGradient: "from-indigo-400 to-indigo-700" },
  { id: 3, name: "Abdul Kareem Hassan", initials: "AK", city: "Manchester", availability: "substitute", dbs: { status: "pending", date: "2026-03-30", type: "Enhanced" }, rtw: { status: "verified", date: "2025-10-20" }, specialties: ["Jumu'ah Khutbah", "Counselling"], languages: ["English", "Somali", "Arabic"], experience: 15, madhhab: "Maliki", rate: "£200/day", email: "a.hassan@example.com", phone: "+44 7700 900345", bio: "15 years of UK imamate experience. Strong pastoral care focus.", avatarGradient: "from-amber-400 to-amber-700" },
  { id: 4, name: "Omar Farooq", initials: "OF", city: "Bradford", availability: "both", dbs: { status: "verified", date: "2025-08-22", type: "Enhanced" }, rtw: { status: "verified", date: "2025-08-22" }, specialties: ["Qur'an Teaching", "Jumu'ah Khutbah"], languages: ["Urdu", "English", "Arabic"], experience: 20, madhhab: "Hanafi", rate: "£150/day or FT", email: "o.farooq@example.com", phone: "+44 7700 900456", bio: "Senior imam with two decades serving northern England.", avatarGradient: "from-sky-400 to-sky-700" },
  { id: 5, name: "Bilal Cheikh", initials: "BC", city: "Leicester", availability: "permanent", dbs: { status: "expired", date: "2023-05-10", type: "Enhanced" }, rtw: { status: "verified", date: "2025-11-01" }, specialties: ["Youth Programs", "Arabic Instruction"], languages: ["Arabic", "French", "English"], experience: 6, madhhab: "Maliki", rate: "Seeking full-time", email: "b.cheikh@example.com", phone: "+44 7700 900567", bio: "Young imam from Morocco, passionate about youth engagement.", avatarGradient: "from-rose-400 to-rose-700" },
  { id: 6, name: "Zakariya Patel", initials: "ZP", city: "Blackburn", availability: "substitute", dbs: { status: "verified", date: "2026-02-15", type: "Enhanced" }, rtw: { status: "verified", date: "2026-02-15" }, specialties: ["Tajweed", "Hifz Teaching"], languages: ["English", "Gujarati", "Urdu", "Arabic"], experience: 10, madhhab: "Hanafi", rate: "£170/day", email: "z.patel@example.com", phone: "+44 7700 900678", bio: "Darul Uloom graduate offering weekend cover.", avatarGradient: "from-purple-400 to-purple-700" }
];

const INITIAL_CHECKS = [
  { id: 101, candidateName: "Harun Malik", candidateEmail: "harun.m@example.com", dbs: { type: "Enhanced", status: "verified", date: "2026-04-02" }, rtw: { status: "verified", date: "2026-04-02" }, requestedDate: "2026-03-28" },
  { id: 102, candidateName: "Suleiman Ahmed", candidateEmail: "s.ahmed@example.com", dbs: { type: "Enhanced", status: "pending", date: "—" }, rtw: { status: "verified", date: "2026-04-14" }, requestedDate: "2026-04-11" },
  { id: 103, candidateName: "Nasir Begum", candidateEmail: "n.begum@example.com", dbs: { type: "Enhanced", status: "pending", date: "—" }, rtw: { status: "pending", date: "—" }, requestedDate: "2026-04-18" }
];

const DBSStatusPill = ({ status }) => {
  const config = {
    verified: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", icon: CheckCircle2, label: "Verified" },
    pending: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: Clock, label: "Pending" },
    expired: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", icon: XCircle, label: "Expired" },
    incomplete: { bg: "bg-stone-100", text: "text-stone-600", border: "border-stone-200", icon: AlertCircle, label: "Not submitted" },
    awaitingcandidate: { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200", icon: Send, label: "Awaiting candidate" }
  }[status];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}>
      <Icon size={12} strokeWidth={2.5} />{config.label}
    </span>
  );
};

const MosqueDashboard = ({ onLogout, onPublic, checks, onOrderCheck, onViewImam, onStartCampaign, onOpenMessages, onPostJob }) => {
  const [tab, setTab] = useState("directory");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = IMAM_REGISTRY.filter(i => {
    const matchesSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.city.toLowerCase().includes(search.toLowerCase()) || i.specialties.some(s => s.toLowerCase().includes(search.toLowerCase()));
    const matchesFilter = filter === "all" || (filter === "substitute" && (i.availability === "substitute" || i.availability === "both")) || (filter === "permanent" && (i.availability === "permanent" || i.availability === "both"));
    return matchesSearch && matchesFilter;
  });
  const verifiedCount = IMAM_REGISTRY.filter(i => i.dbs.status === "verified" && i.rtw.status === "verified").length;

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <button onClick={onPublic} className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center shadow-md"><ShieldCheck className="text-emerald-50" size={18} /></div>
            <div className="text-left">
              <h1 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
              <p className="text-xs text-stone-500">Masjid Al-Noor · Birmingham</p>
            </div>
          </button>
          <button onClick={onLogout} className="flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900"><LogOut size={15} /> Sign out</button>
        </div>
        <div className="max-w-6xl mx-auto px-6 flex gap-1 border-t border-stone-100">
          <button onClick={() => setTab("directory")} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === "directory" ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}>
            <span className="flex items-center gap-1.5"><Users size={14} /> Directory</span>
          </button>
          <button onClick={onOpenMessages} className="px-4 py-3 text-sm font-medium border-b-2 border-transparent text-stone-500 hover:text-stone-800 transition-colors">
            <span className="flex items-center gap-1.5"><MessageCircle size={14} /> Messages <span className="bg-emerald-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-1">1</span></span>
          </button>
          <button onClick={() => setTab("checks")} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === "checks" ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}>
            <span className="flex items-center gap-1.5"><FileCheck size={14} /> My Checks {checks.length > 0 && <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.5 rounded-full ml-1">{checks.length}</span>}</span>
          </button>
        </div>
      </header>

      {tab === "directory" && (
        <main className="max-w-6xl mx-auto px-6 py-8">
          <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Imam Directory</h2>
              <p className="text-stone-600">{verifiedCount} fully verified imams available · {IMAM_REGISTRY.length} total</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={onPostJob} className="inline-flex items-center gap-2 bg-emerald-900 hover:bg-emerald-800 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] shadow-lg shadow-emerald-900/20">
                <Briefcase size={15} /> Post a job
              </button>
              <button onClick={onStartCampaign} className="inline-flex items-center gap-2 bg-white border border-amber-500 text-amber-700 hover:bg-amber-50 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]">
                <HandCoins size={15} /> Start a campaign
              </button>
              <button onClick={onOrderCheck} className="inline-flex items-center gap-2 bg-white border border-emerald-900 text-emerald-900 hover:bg-emerald-50 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]">
                <UserPlus size={15} /> Check someone not on Amanah
              </button>
            </div>
          </div>
          <div className="flex flex-col md:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input type="text" placeholder="Search by name, city, or specialty..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-300 bg-white focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
            </div>
            <div className="flex gap-2 bg-white border border-stone-300 rounded-xl p-1">
              {[{ v: "all", l: "All" }, { v: "substitute", l: "Substitutes" }, { v: "permanent", l: "Permanent" }].map(f => (
                <button key={f.v} onClick={() => setFilter(f.v)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f.v ? "bg-emerald-900 text-white" : "text-stone-600 hover:text-stone-900"}`}>{f.l}</button>
              ))}
            </div>
          </div>
          <div className="grid gap-3">
            {filtered.map(imam => (
              <div key={imam.id} onClick={() => onViewImam(imam)} className="bg-white border border-stone-200 rounded-2xl p-5 hover:border-emerald-400 hover:shadow-lg cursor-pointer transition-all hover:-translate-y-0.5 group">
                <div className="flex items-start gap-4">
                  <Avatar scholar={imam} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{imam.name}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 uppercase tracking-wider">{imam.availability === "both" ? "Perm / Sub" : imam.availability}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-600 mb-2">
                      <span className="flex items-center gap-1"><MapPin size={13} /> {imam.city}</span>
                      <span>{imam.experience} yrs</span>
                      <span>{imam.madhhab}</span>
                      <span className="text-stone-900 font-medium">{imam.rate}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {imam.specialties.slice(0, 3).map(s => <span key={s} className="px-2 py-0.5 bg-stone-50 border border-stone-200 text-stone-600 text-xs rounded-md">{s}</span>)}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-stone-500">DBS:</span><DBSStatusPill status={imam.dbs.status} />
                      <span className="text-xs text-stone-500 ml-2">RTW:</span><DBSStatusPill status={imam.rtw.status} />
                    </div>
                  </div>
                  <ChevronRight className="text-stone-300 group-hover:text-emerald-700 mt-1 transition-colors" size={20} />
                </div>
              </div>
            ))}
          </div>
        </main>
      )}

      {tab === "checks" && (
        <main className="max-w-6xl mx-auto px-6 py-8">
          <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>My Checks</h2>
              <p className="text-stone-600">DBS and Right to Work checks you've ordered</p>
            </div>
            <button onClick={onOrderCheck} className="inline-flex items-center gap-2 bg-emerald-900 hover:bg-emerald-800 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] shadow-lg shadow-emerald-900/20">
              <Plus size={15} /> New check
            </button>
          </div>
          <div className="grid gap-3">
            {checks.map(c => (
              <div key={c.id} className="bg-white border border-stone-200 rounded-2xl p-5 hover:shadow-md transition-all">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{c.candidateName}</h3>
                    <p className="text-sm text-stone-600">{c.candidateEmail}</p>
                  </div>
                  <span className="text-xs text-stone-500">Ordered {c.requestedDate}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="border border-stone-200 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs uppercase tracking-wider text-stone-500 font-medium">{c.dbs.type} DBS</span>
                      <DBSStatusPill status={c.dbs.status} />
                    </div>
                    <p className="text-xs text-stone-600">{c.dbs.status === "verified" ? `Certificate dated ${c.dbs.date}` : "Awaiting police response"}</p>
                  </div>
                  <div className="border border-stone-200 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs uppercase tracking-wider text-stone-500 font-medium">Right to Work</span>
                      <DBSStatusPill status={c.rtw.status} />
                    </div>
                    <p className="text-xs text-stone-600">{c.rtw.status === "verified" ? `Verified ${c.rtw.date}` : "Awaiting share code"}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>
      )}
    </div>
  );
};

// ==================== IMAM DETAIL (mosque view) ====================
const MosqueImamDetail = ({ imam, onBack }) => (
  <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
    <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center"><ShieldCheck className="text-emerald-50" size={18} /></div>
        <h1 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
      </div>
    </header>
    <section className={`relative overflow-hidden bg-gradient-to-br ${imam.avatarGradient}`}>
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cpath d='M30 0l30 30-30 30L0 30z' fill='none' stroke='%23fff' stroke-width='1'/%3E%3C/svg%3E")` }}></div>
      <div className="relative max-w-4xl mx-auto px-6 py-10 text-white">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/80 hover:text-white mb-6"><ArrowLeft size={14} /> Back to directory</button>
        <div className="flex items-start gap-5 flex-wrap">
          <Avatar scholar={imam} size="lg" />
          <div>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{imam.name}</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/90">
              <span className="flex items-center gap-1"><MapPin size={13} /> {imam.city}</span>
              <span className="flex items-center gap-1"><BookOpen size={13} /> {imam.madhhab}</span>
              <span>{imam.experience} years experience</span>
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-white/20 backdrop-blur-sm border border-white/30 rounded-full font-medium uppercase tracking-wider">{imam.availability === "both" ? "Perm / Sub" : imam.availability}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
    <main className="max-w-4xl mx-auto px-6 py-8">
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wider text-stone-500 font-medium">DBS Check</span>
            <DBSStatusPill status={imam.dbs.status} />
          </div>
          <p className="text-sm text-stone-700">{imam.dbs.type} · expires {imam.dbs.date}</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wider text-stone-500 font-medium">Right to Work</span>
            <DBSStatusPill status={imam.rtw.status} />
          </div>
          <p className="text-sm text-stone-700">Verified {imam.rtw.date}</p>
        </div>
      </div>
      <div className="bg-white border border-stone-200 rounded-2xl p-6 mb-6">
        <h3 className="text-xs uppercase tracking-wider text-stone-500 font-medium mb-2">About</h3>
        <p className="text-stone-800 leading-relaxed mb-4">{imam.bio}</p>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h4 className="text-xs uppercase tracking-wider text-stone-500 font-medium mb-2">Specialties</h4>
            <div className="flex flex-wrap gap-1.5">
              {imam.specialties.map(s => <span key={s} className="px-2.5 py-1 bg-stone-100 text-stone-700 text-xs rounded-md">{s}</span>)}
            </div>
          </div>
          <div>
            <h4 className="text-xs uppercase tracking-wider text-stone-500 font-medium mb-2">Languages</h4>
            <div className="flex flex-wrap gap-1.5">
              {imam.languages.map(l => <span key={l} className="px-2.5 py-1 bg-sky-50 text-sky-700 text-xs rounded-md">{l}</span>)}
            </div>
          </div>
        </div>
      </div>
      <div className="bg-white border border-stone-200 rounded-2xl p-6">
        <h3 className="text-xs uppercase tracking-wider text-stone-500 font-medium mb-3">Contact</h3>
        <div className="flex flex-col gap-2 text-sm text-stone-700 mb-4">
          <span className="flex items-center gap-2"><Mail size={14} className="text-stone-400" /> {imam.email}</span>
          <span className="flex items-center gap-2"><Phone size={14} className="text-stone-400" /> {imam.phone}</span>
          <span className="text-stone-900 font-medium mt-1">{imam.rate}</span>
        </div>
        <button className="bg-emerald-900 hover:bg-emerald-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] shadow-lg shadow-emerald-900/20">Request to Hire</button>
      </div>
    </main>
  </div>
);

// ==================== ORDER CHECK FLOW ====================
const OrderCheck = ({ onBack, onComplete }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    candidateName: "", candidateEmail: "", candidatePhone: "",
    roleType: "imam", startDate: "",
    dbsLevel: "enhanced", includeRtw: true, consentGiven: false
  });
  const costs = { enhanced: 38, standard: 18, basic: 18, rtw: 12, service: 8 };
  const total = (form.dbsLevel === "enhanced" ? costs.enhanced : form.dbsLevel === "standard" ? costs.standard : costs.basic) + (form.includeRtw ? costs.rtw : 0) + costs.service;
  const canProceed = {
    1: form.candidateName && form.candidateEmail && form.candidatePhone && form.startDate,
    2: form.dbsLevel,
    3: form.consentGiven
  }[step];

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center"><ShieldCheck className="text-emerald-50" size={18} /></div>
          <h1 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-6"><ArrowLeft size={14} /> Back to dashboard</button>
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            {[1, 2, 3].map(n => (
              <div key={n} className="flex items-center gap-3 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${step >= n ? "bg-emerald-900 text-white" : "bg-stone-200 text-stone-500"}`}>{step > n ? <CheckCircle2 size={14} /> : n}</div>
                {n < 3 && <div className={`flex-1 h-0.5 transition-all ${step > n ? "bg-emerald-900" : "bg-stone-200"}`}></div>}
              </div>
            ))}
          </div>
          <p className="text-xs text-stone-500 text-center">{["Candidate details", "Checks to run", "Review & pay"][step - 1]}</p>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-6">
          {step === 1 && (
            <div>
              <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Who are we checking?</h2>
              <p className="text-sm text-stone-500 mb-5">We'll email them to complete their part.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Candidate name</label>
                  <input value={form.candidateName} onChange={e => setForm({...form, candidateName: e.target.value})} placeholder="e.g. Harun Malik" className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Candidate email</label>
                  <input type="email" value={form.candidateEmail} onChange={e => setForm({...form, candidateEmail: e.target.value})} placeholder="candidate@example.com" className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Candidate phone</label>
                  <input value={form.candidatePhone} onChange={e => setForm({...form, candidatePhone: e.target.value})} placeholder="+44 7700 900000" className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-2 uppercase tracking-wider">Role type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[{v:"imam",l:"Imam"},{v:"teacher",l:"Teacher"},{v:"volunteer",l:"Volunteer"}].map(opt => (
                      <button key={opt.v} onClick={() => setForm({...form, roleType: opt.v})} className={`py-2.5 rounded-xl border text-sm font-medium transition-colors ${form.roleType === opt.v ? "bg-emerald-900 text-white border-emerald-900" : "bg-white text-stone-700 border-stone-300 hover:border-stone-400"}`}>{opt.l}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Expected start date</label>
                  <input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                </div>
              </div>
            </div>
          )}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Which checks?</h2>
              <p className="text-sm text-stone-500 mb-5">For work with children or vulnerable adults, Enhanced is required.</p>
              <label className="block text-xs font-medium text-stone-700 mb-2 uppercase tracking-wider">DBS level</label>
              <div className="space-y-2 mb-6">
                {[
                  { v: "enhanced", l: "Enhanced DBS", d: "Full criminal record + police intelligence.", p: costs.enhanced, rec: true },
                  { v: "standard", l: "Standard DBS", d: "Spent and unspent convictions, cautions.", p: costs.standard },
                  { v: "basic", l: "Basic DBS", d: "Unspent convictions only.", p: costs.basic }
                ].map(opt => (
                  <button key={opt.v} onClick={() => setForm({...form, dbsLevel: opt.v})} className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-colors ${form.dbsLevel === opt.v ? "bg-emerald-50 border-emerald-600" : "bg-white border-stone-200 hover:border-stone-300"}`}>
                    <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${form.dbsLevel === opt.v ? "border-emerald-700 bg-emerald-700" : "border-stone-300"}`}>
                      {form.dbsLevel === opt.v && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-stone-900">{opt.l}</p>
                        {opt.rec && <span className="text-[10px] px-1.5 py-0.5 bg-emerald-900 text-white rounded uppercase tracking-wider">Recommended</span>}
                      </div>
                      <p className="text-xs text-stone-600 mt-0.5">{opt.d}</p>
                    </div>
                    <span className="text-sm font-medium text-stone-900">£{opt.p}</span>
                  </button>
                ))}
              </div>
              <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${form.includeRtw ? "bg-emerald-50 border-emerald-200" : "bg-white border-stone-200"}`}>
                <input type="checkbox" checked={form.includeRtw} onChange={e => setForm({...form, includeRtw: e.target.checked})} className="mt-0.5 accent-emerald-800" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-stone-900">Right to Work check</p>
                  <p className="text-xs text-stone-600 mt-0.5">Digital verification against Home Office share code. Legally required before hiring.</p>
                </div>
                <span className="text-sm font-medium text-stone-900">£{costs.rtw}</span>
              </label>
            </div>
          )}
          {step === 3 && (
            <div>
              <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Review & pay</h2>
              <p className="text-sm text-stone-500 mb-5">Check before we contact the candidate.</p>
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 mb-4">
                <p className="text-sm font-medium text-stone-900">{form.candidateName}</p>
                <p className="text-sm text-stone-600">{form.candidateEmail}</p>
                <p className="text-xs text-stone-500 mt-2 capitalize">{form.roleType} · Starts {form.startDate}</p>
              </div>
              <div className="border border-stone-200 rounded-xl overflow-hidden mb-4">
                <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-200"><h3 className="text-xs uppercase tracking-wider text-stone-500 font-medium">Order summary</h3></div>
                <div className="px-4 py-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-stone-700 capitalize">{form.dbsLevel} DBS</span><span className="text-stone-900">£{form.dbsLevel === "enhanced" ? costs.enhanced : form.dbsLevel === "standard" ? costs.standard : costs.basic}</span></div>
                  {form.includeRtw && <div className="flex justify-between"><span className="text-stone-700">Right to Work</span><span className="text-stone-900">£{costs.rtw}</span></div>}
                  <div className="flex justify-between text-stone-500"><span>Service fee</span><span>£{costs.service}</span></div>
                </div>
                <div className="px-4 py-2.5 bg-stone-50 border-t border-stone-200 flex justify-between items-center">
                  <span className="text-sm font-medium text-stone-900">Total</span>
                  <span className="text-lg font-semibold text-stone-900">£{total}</span>
                </div>
              </div>
              <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${form.consentGiven ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                <input type="checkbox" checked={form.consentGiven} onChange={e => setForm({...form, consentGiven: e.target.checked})} className="mt-0.5 accent-emerald-800" />
                <div>
                  <p className="text-sm font-medium text-stone-900">Candidate has given consent</p>
                  <p className="text-xs text-stone-700 mt-0.5">We'll also get their explicit digital consent before submitting.</p>
                </div>
              </label>
            </div>
          )}
          <div className="flex justify-between mt-8 pt-6 border-t border-stone-100">
            <button onClick={() => step > 1 ? setStep(step - 1) : onBack()} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900">{step > 1 ? "Back" : "Cancel"}</button>
            <button onClick={() => step < 3 ? setStep(step + 1) : onComplete(form)} disabled={!canProceed} className="inline-flex items-center gap-2 bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] disabled:hover:scale-100 shadow-lg shadow-emerald-900/20">
              {step < 3 ? <>Continue <ArrowRight size={14} /></> : <><CreditCard size={14} /> Pay £{total}</>}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

// ==================== IMAM DASHBOARD ====================
const ImamDashboardView = ({ onLogout, onPublic, onStartCampaign, onOpenMessages, onOpenJobs, onOpenSchedule }) => {
  const [tab, setTab] = useState("overview");
  const myProfile = {
    id: 101, name: "Yusuf Al-Rahman", initials: "YR", city: "Birmingham",
    avatarGradient: "from-emerald-400 to-emerald-700",
    experience: 12, madhhab: "Hanafi", rate: "£180/day",
    bio: "Al-Azhar graduate with 12 years serving UK mosques.",
    specialties: ["Jumu'ah Khutbah", "Tajweed", "Youth Programs"],
    languages: ["Arabic", "English", "Urdu"],
    availability: "substitute"
  };
  const myReviews = SCHOLAR_REVIEWS_DB[myProfile.id] || [];
  const stats = getRatingBreakdown(myReviews);

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <button onClick={onPublic} className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center shadow-md"><ShieldCheck className="text-emerald-50" size={18} /></div>
            <div className="text-left">
              <h1 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
              <p className="text-xs text-stone-500">{myProfile.name}</p>
            </div>
          </button>
          <button onClick={onLogout} className="flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900"><LogOut size={15} /> Sign out</button>
        </div>
        <div className="max-w-5xl mx-auto px-5 md:px-6 flex gap-1 border-t border-stone-100 overflow-x-auto scrollbar-hide">
          <button onClick={() => setTab("overview")} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === "overview" ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}>
            <span className="flex items-center gap-1.5"><LayoutDashboard size={14} /> Overview</span>
          </button>
          <button onClick={onOpenSchedule} className="px-4 py-3 text-sm font-medium border-b-2 border-transparent text-stone-500 hover:text-stone-800 transition-colors whitespace-nowrap">
            <span className="flex items-center gap-1.5"><Calendar size={14} /> Schedule <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-full ml-1">{DEFAULT_BOOKINGS.length}</span></span>
          </button>
          <button onClick={onOpenJobs} className="px-4 py-3 text-sm font-medium border-b-2 border-transparent text-stone-500 hover:text-stone-800 transition-colors whitespace-nowrap">
            <span className="flex items-center gap-1.5"><Briefcase size={14} /> Jobs <span className="bg-emerald-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-1">{MOCK_JOBS.length}</span></span>
          </button>
          <button onClick={() => setTab("messages")} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === "messages" ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}>
            <span className="flex items-center gap-1.5"><MessageCircle size={14} /> Messages <span className="bg-emerald-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-1">2</span></span>
          </button>
          <button onClick={() => setTab("reviews")} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === "reviews" ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}>
            <span className="flex items-center gap-1.5"><Star size={14} /> Reviews {myReviews.length > 0 && <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-full ml-1">{myReviews.length}</span>}</span>
          </button>
        </div>
      </header>

      {tab === "overview" && (
        <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Avatar scholar={myProfile} size="lg" />
          <div>
            <h2 className="text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Assalamu alaikum, {myProfile.name.split(" ")[0]}</h2>
            <p className="text-stone-600">Here's how your profile looks to mosques.</p>
          </div>
        </div>

        <div className="rounded-2xl p-5 mb-6 bg-emerald-50 border border-emerald-200">
          <div className="flex gap-3">
            <CheckCircle2 className="text-emerald-700 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="text-sm font-medium text-emerald-900">Your profile is live and verified</p>
              <p className="text-xs mt-0.5 text-emerald-800">Mosques can see and contact you. DBS valid until November 2025.</p>
            </div>
          </div>
        </div>

        <h3 className="text-sm font-medium text-stone-900 uppercase tracking-wider mb-3">Verification status</h3>
        <div className="grid md:grid-cols-3 gap-3 mb-8">
          {[
            { title: "Enhanced DBS", status: "verified", detail: "Expires 14 Nov 2025" },
            { title: "Right to Work", status: "verified", detail: "Verified 02 Sep 2025" },
            { title: "Ijazah", status: "verified", detail: "Al-Azhar University" }
          ].map(card => (
            <div key={card.title} className="bg-white border border-stone-200 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wider text-stone-500 font-medium">{card.title}</span>
                <DBSStatusPill status={card.status} />
              </div>
              <p className="text-sm text-stone-700">{card.detail}</p>
            </div>
          ))}
        </div>

        <h3 className="text-sm font-medium text-stone-900 uppercase tracking-wider mb-3">How mosques see you</h3>
        <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-6">
          <div className="flex items-start gap-4">
            <Avatar scholar={myProfile} size="md" />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <h4 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{myProfile.name}</h4>
                <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 uppercase tracking-wider">{myProfile.availability}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-600 mb-3">
                <span className="flex items-center gap-1"><MapPin size={13} /> {myProfile.city}</span>
                <span>{myProfile.experience} yrs · {myProfile.madhhab}</span>
                <span className="text-stone-900 font-medium">{myProfile.rate}</span>
              </div>
              <p className="text-sm text-stone-700 mb-3">{myProfile.bio}</p>
              <div className="flex flex-wrap gap-1.5">
                {myProfile.specialties.map(s => <span key={s} className="px-2 py-0.5 bg-stone-50 border border-stone-200 text-stone-600 text-xs rounded-md">{s}</span>)}
              </div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-3 mb-6">
          <div className="bg-white border border-stone-200 rounded-2xl p-4"><p className="text-3xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>3</p><p className="text-xs text-stone-500 mt-1">Active hire requests</p></div>
          <div className="bg-white border border-stone-200 rounded-2xl p-4"><p className="text-3xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>12</p><p className="text-xs text-stone-500 mt-1">Profile views this week</p></div>
          <div className="bg-white border border-stone-200 rounded-2xl p-4"><p className="text-3xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>£1,440</p><p className="text-xs text-stone-500 mt-1">Earned this month</p></div>
        </div>

        {/* Start campaign callout */}
        <div className="bg-gradient-to-br from-amber-50 to-white border border-amber-200 rounded-2xl p-5 mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <HandCoins className="text-amber-700" size={20} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Launch a fundraising campaign</h4>
              <p className="text-xs text-stone-600 mt-0.5">Studying abroad? Publishing a book? Running a course? Raise funds from Amanah's community.</p>
            </div>
          </div>
          <button onClick={onStartCampaign} className="inline-flex items-center gap-2 bg-amber-700 hover:bg-amber-800 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] flex-shrink-0">
            Start a campaign <ArrowRight size={14} />
          </button>
        </div>

        <button className="text-sm text-emerald-800 font-medium hover:underline">Edit my profile →</button>
      </main>
      )}

      {tab === "messages" && (
        <main className="max-w-5xl mx-auto px-6 py-8">
          <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Messages</h2>
              <p className="text-stone-600">Conversations with parents, mosques, and students</p>
            </div>
            <button onClick={onOpenMessages} className="inline-flex items-center gap-2 bg-emerald-900 hover:bg-emerald-800 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]">
              <Inbox size={15} /> Open full inbox
            </button>
          </div>

          <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
            {MOCK_CONVERSATIONS.slice(0, 3).map((conv, i) => (
              <button
                key={conv.id}
                onClick={onOpenMessages}
                className={`w-full flex items-start gap-4 p-4 text-left transition-colors hover:bg-stone-50 ${i < 2 ? "border-b border-stone-100" : ""} ${conv.unread > 0 ? "bg-emerald-50/30" : ""}`}
              >
                <div className="relative flex-shrink-0">
                  <Avatar scholar={conv.counterparty} size="md" />
                  {conv.online && <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white"></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-semibold text-stone-900 truncate" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{conv.counterparty.name}</p>
                      {conv.counterparty.verified && <ShieldCheck size={12} className="text-emerald-700 flex-shrink-0" />}
                      {conv.flagged && <AlertTriangle size={12} className="text-amber-600 flex-shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-stone-500">{conv.lastTime}</span>
                      {conv.unread > 0 && <span className="bg-emerald-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{conv.unread}</span>}
                    </div>
                  </div>
                  <p className="text-xs text-stone-500 mb-1">{conv.context.label}</p>
                  <p className={`text-sm truncate ${conv.unread > 0 ? "text-stone-900 font-medium" : "text-stone-600"}`}>{conv.lastMessage}</p>
                </div>
              </button>
            ))}
          </div>
        </main>
      )}

      {tab === "reviews" && (
        <main className="max-w-5xl mx-auto px-6 py-8">
          <div className="mb-6">
            <h2 className="text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Your reviews</h2>
            <p className="text-stone-600">Every review comes from a verified booking.</p>
          </div>

          {stats && (
            <div className="bg-white border border-stone-200 rounded-2xl p-6 mb-6">
              <RatingsBreakdown reviews={myReviews} />
              <div className="mt-6 pt-6 border-t border-stone-100 grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{myReviews.filter(r => r.reply).length}</p>
                  <p className="text-xs text-stone-500 mt-1">Replied to</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{myReviews.filter(r => !r.reply).length}</p>
                  <p className="text-xs text-stone-500 mt-1">Awaiting reply</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>98%</p>
                  <p className="text-xs text-stone-500 mt-1">Recommendation rate</p>
                </div>
              </div>
            </div>
          )}

          {myReviews.filter(r => !r.reply).length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
              <AlertCircle className="text-amber-700 flex-shrink-0 mt-0.5" size={18} />
              <div>
                <p className="text-sm font-medium text-amber-900">{myReviews.filter(r => !r.reply).length} review{myReviews.filter(r => !r.reply).length > 1 ? "s" : ""} awaiting your reply</p>
                <p className="text-xs text-amber-800 mt-0.5">Replying shows appreciation and often earns more bookings. A simple "Jazakallahu khayran" goes a long way.</p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {myReviews.map(r => (
              <div key={r.id} className="bg-white border border-stone-200 rounded-2xl p-5">
                <ReviewCard review={r} compact />
                {!r.reply && (
                  <div className="mt-4 pl-12 border-t border-stone-100 pt-4">
                    <div className="flex gap-2">
                      <input type="text" placeholder="Reply publicly — e.g. 'Jazakallahu khayran, may Allah reward...'" className="flex-1 px-4 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                      <button className="bg-emerald-900 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1.5">
                        <Send size={12} /> Reply
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </main>
      )}
    </div>
  );
};

// ==================== ALL CAMPAIGNS PAGE ====================
const AllCampaigns = ({ onBack, onCampaign, onSignIn }) => {
  const [filter, setFilter] = useState("all");
  const categories = ["all", ...new Set(MOCK_CAMPAIGNS.map(c => c.category))];
  const filtered = filter === "all" ? MOCK_CAMPAIGNS : MOCK_CAMPAIGNS.filter(c => c.category === filter);

  const totalRaised = MOCK_CAMPAIGNS.reduce((s, c) => s + c.raised, 0);
  const totalDonors = MOCK_CAMPAIGNS.reduce((s, c) => s + c.donors, 0);

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center"><ShieldCheck className="text-emerald-50" size={18} /></div>
            <h1 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
          </button>
          <button onClick={() => onSignIn("mosque")} className="bg-stone-900 hover:bg-stone-800 text-white text-sm font-medium px-4 py-2 rounded-lg">Sign in</button>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-to-br from-stone-900 via-emerald-950 to-stone-900 text-white">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cpath d='M30 0l30 30-30 30L0 30z' fill='none' stroke='%23fff' stroke-width='1'/%3E%3C/svg%3E")` }}></div>
        <div className="relative max-w-7xl mx-auto px-6 py-14">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/70 hover:text-white mb-6"><ArrowLeft size={14} /> Back to Amanah</button>
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 px-3 py-1 rounded-full text-xs uppercase tracking-wider mb-4">
            <HandCoins size={12} /> Sadaqah jariyah · 0% platform fee
          </div>
          <h2 className="text-4xl md:text-6xl font-semibold tracking-tight mb-4" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah Fund</h2>
          <p className="text-lg text-emerald-100/90 max-w-2xl mb-8">Every campaign from a verified mosque or scholar. Every penny reaches the cause. Set up in minutes.</p>
          <div className="grid grid-cols-3 gap-6 max-w-2xl">
            <div><p className="text-2xl md:text-3xl font-semibold" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{fmt(totalRaised)}</p><p className="text-xs text-emerald-200/70 mt-1">raised so far</p></div>
            <div><p className="text-2xl md:text-3xl font-semibold" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{totalDonors.toLocaleString()}</p><p className="text-xs text-emerald-200/70 mt-1">donors</p></div>
            <div><p className="text-2xl md:text-3xl font-semibold" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{MOCK_CAMPAIGNS.length}</p><p className="text-xs text-emerald-200/70 mt-1">live campaigns</p></div>
          </div>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 -mx-6 px-6 scrollbar-hide">
          {categories.map(c => (
            <button key={c} onClick={() => setFilter(c)} className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${filter === c ? "bg-stone-900 text-white" : "bg-white border border-stone-200 text-stone-700 hover:border-stone-400"}`}>
              {c === "all" ? "All campaigns" : c}
            </button>
          ))}
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((c, i) => (
            <div key={c.id} style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.05}s both` }}>
              <CampaignCard campaign={c} onClick={() => onCampaign(c)} />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

// ==================== CAMPAIGN DETAIL ====================
const CampaignDetail = ({ campaign, onBack, onDonate }) => {
  const pct = Math.min((campaign.raised / campaign.goal) * 100, 100);

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-5 md:px-6 py-3.5 md:py-4 flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-2.5 md:gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center"><ShieldCheck className="text-emerald-50" size={18} /></div>
            <h1 className="text-base md:text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
          </button>
        </div>
      </header>

      <section className={`relative overflow-hidden bg-gradient-to-br ${campaign.gradient}`}>
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cpath d='M30 0l30 30-30 30L0 30z' fill='none' stroke='%23fff' stroke-width='1'/%3E%3C/svg%3E")` }}></div>
        <div className="relative max-w-6xl mx-auto px-5 md:px-6 py-8 md:py-12 text-white">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/80 hover:text-white mb-5 md:mb-6"><ArrowLeft size={14} /> Back to campaigns</button>
          <div className="flex items-start gap-3 flex-wrap mb-4">
            {campaign.trending && (
              <span className="inline-flex items-center gap-1 bg-amber-400 text-amber-950 text-[10px] px-2 py-1 rounded-full font-semibold uppercase tracking-wider">
                <Flame size={10} /> Trending
              </span>
            )}
            <span className="inline-flex items-center gap-1 bg-white/20 backdrop-blur-sm border border-white/30 text-white text-[10px] px-2 py-1 rounded-full font-medium uppercase tracking-wider">{campaign.category}</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight mb-4 max-w-3xl" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{campaign.title}</h2>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-white/90">
              {campaign.type === "mosque" ? <Building2 size={15} /> : <Users size={15} />}
              <span className="font-medium">{campaign.creator}</span>
              {campaign.verified && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-white/20 backdrop-blur-sm border border-white/30 rounded-full">
                  <ShieldCheck size={11} /> Verified
                </span>
              )}
            </div>
            <span className="text-white/70">·</span>
            <span className="text-sm text-white/90 flex items-center gap-1"><MapPin size={13} /> {campaign.city}</span>
          </div>
        </div>
      </section>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid md:grid-cols-3 gap-6">
          {/* Left: story */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-white border border-stone-200 rounded-2xl p-6">
              <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">The story</h3>
              <p className="text-stone-800 leading-relaxed whitespace-pre-line">{campaign.story}</p>
            </div>

            {/* Verification badge */}
            <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="text-emerald-800" size={22} />
                </div>
                <div>
                  <h4 className="font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>This campaign is verified</h4>
                  <p className="text-sm text-stone-700 leading-relaxed">
                    {campaign.type === "mosque"
                      ? `${campaign.creator} is a Charity Commission registered mosque, verified by Amanah. Funds are transferred directly to the registered charity account — Amanah never holds your donation.`
                      : `${campaign.creator} is a verified scholar on Amanah with DBS check and qualifications verified. This campaign has been reviewed by our team.`}
                  </p>
                </div>
              </div>
            </div>

            {/* Recent donors */}
            <div className="bg-white border border-stone-200 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider">Recent donors</h3>
                <span className="flex items-center gap-1 text-xs text-emerald-700">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                  Live
                </span>
              </div>
              <div className="space-y-3">
                {campaign.recentDonors.map((d, i) => (
                  <div key={i} className="flex items-start gap-3 pb-3 border-b border-stone-100 last:border-0 last:pb-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-100 to-stone-100 flex items-center justify-center text-xs font-medium text-stone-700 flex-shrink-0">
                      {d.name === "Anonymous" ? "✦" : d.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-stone-900">{d.name}</span>
                          <span className="text-xs text-stone-500">donated {fmt(d.amount)}</span>
                        </div>
                        <span className="text-xs text-stone-400">{d.time}</span>
                      </div>
                      {d.message && <p className="text-xs text-stone-600 italic mt-1">"{d.message}"</p>}
                    </div>
                  </div>
                ))}
              </div>
              <button className="w-full mt-4 text-sm text-emerald-800 font-medium hover:underline">See all {campaign.donors} donors</button>
            </div>
          </div>

          {/* Right: donate box */}
          <div>
            <div className="bg-white border border-stone-200 rounded-2xl p-6 sticky top-24 shadow-sm">
              <p className="text-3xl font-semibold text-stone-900 mb-0.5" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{fmt(campaign.raised)}</p>
              <p className="text-sm text-stone-600 mb-4">raised of {fmt(campaign.goal)} goal</p>
              <ProgressBar raised={campaign.raised} goal={campaign.goal} gradient={campaign.gradient} />
              <div className="flex justify-between mt-2 text-xs text-stone-500 mb-5">
                <span>{Math.round(pct)}% funded</span>
                <span>{campaign.daysLeft} days left</span>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-5 pb-5 border-b border-stone-100">
                <div className="text-center"><p className="text-xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{campaign.donors}</p><p className="text-xs text-stone-500">donors</p></div>
                <div className="text-center"><p className="text-xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{campaign.daysLeft}</p><p className="text-xs text-stone-500">days left</p></div>
                <div className="text-center"><p className="text-xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{fmt(Math.round(campaign.raised / campaign.donors))}</p><p className="text-xs text-stone-500">avg gift</p></div>
              </div>

              <button onClick={() => onDonate(campaign)} className="w-full bg-emerald-900 hover:bg-emerald-800 text-white py-4 rounded-xl text-sm font-semibold transition-all hover:scale-[1.01] active:scale-95 shadow-lg shadow-emerald-900/20 inline-flex items-center justify-center gap-2">
                <HandCoins size={16} /> Donate now
              </button>
              <button className="w-full mt-2 border border-stone-300 hover:border-stone-400 text-stone-700 py-2.5 rounded-xl text-sm font-medium inline-flex items-center justify-center gap-2">
                <Share2 size={14} /> Share campaign
              </button>

              <div className="mt-5 pt-5 border-t border-stone-100 space-y-2 text-xs text-stone-600">
                <p className="flex items-center gap-2"><ShieldCheck size={12} className="text-emerald-700" /> 0% platform fee</p>
                <p className="flex items-center gap-2"><HeartHandshake size={12} className="text-emerald-700" /> 100% to the cause</p>
                <p className="flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-700" /> Charity Commission verified</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

// ==================== DONATE FLOW ====================
const DonateFlow = ({ campaign, onBack, onDone }) => {
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState(50);
  const [custom, setCustom] = useState("");
  const [tipPct, setTipPct] = useState(10);
  const [anonymous, setAnonymous] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [giftAid, setGiftAid] = useState(true);

  const effectiveAmount = custom ? parseFloat(custom) || 0 : amount;
  const tip = Math.round(effectiveAmount * (tipPct / 100));
  const total = effectiveAmount + tip;
  const giftAidAmount = giftAid ? Math.round(effectiveAmount * 0.25) : 0;

  const presets = [10, 25, 50, 100, 250, 500];

  const canProceed = {
    1: effectiveAmount > 0,
    2: anonymous || (name && email),
    3: true
  }[step];

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center"><ShieldCheck className="text-emerald-50" size={18} /></div>
          <h1 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-6"><ArrowLeft size={14} /> Back to campaign</button>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            {[1, 2, 3].map(n => (
              <div key={n} className="flex items-center gap-3 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${step >= n ? "bg-emerald-900 text-white" : "bg-stone-200 text-stone-500"}`}>{step > n ? <CheckCircle2 size={14} /> : n}</div>
                {n < 3 && <div className={`flex-1 h-0.5 transition-all ${step > n ? "bg-emerald-900" : "bg-stone-200"}`}></div>}
              </div>
            ))}
          </div>
          <p className="text-xs text-stone-500 text-center">{["Your donation", "Your details", "Confirm & pay"][step - 1]}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          <div className="md:col-span-2 bg-white border border-stone-200 rounded-2xl p-6">
            {step === 1 && (
              <div>
                <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>How much would you like to give?</h2>
                <p className="text-sm text-stone-500 mb-6">100% goes to {campaign.creator}. Amanah takes nothing.</p>

                <div className="grid grid-cols-3 gap-2 mb-4">
                  {presets.map(p => (
                    <button key={p} onClick={() => { setAmount(p); setCustom(""); }} className={`py-3 rounded-xl border-2 text-sm font-semibold transition-all ${amount === p && !custom ? "bg-emerald-900 text-white border-emerald-900" : "bg-white text-stone-700 border-stone-300 hover:border-stone-400"}`}>
                      £{p}
                    </button>
                  ))}
                </div>

                <div className="relative mb-6">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500">£</span>
                  <input type="number" value={custom} onChange={e => setCustom(e.target.value)} placeholder="Or enter custom amount" className="w-full pl-8 pr-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                </div>

                <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-xl p-4 mb-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={giftAid} onChange={e => setGiftAid(e.target.checked)} className="mt-0.5 accent-emerald-800" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-stone-900">Add Gift Aid</p>
                      <p className="text-xs text-stone-600 mt-0.5">As a UK taxpayer, the charity can claim an extra 25p for every £1 you give, at no cost to you.</p>
                      {giftAid && effectiveAmount > 0 && (
                        <p className="text-xs text-emerald-800 font-medium mt-1.5">+ £{giftAidAmount} extra for {campaign.creator}</p>
                      )}
                    </div>
                  </label>
                </div>

                <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-wider text-stone-500 font-medium mb-2">Tip Amanah (optional)</p>
                  <p className="text-xs text-stone-600 mb-3">Amanah charges zero fees. We rely on optional tips from donors to keep the platform running. You choose.</p>
                  <div className="flex gap-2">
                    {[0, 5, 10, 15].map(p => (
                      <button key={p} onClick={() => setTipPct(p)} className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${tipPct === p ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-700 border-stone-300 hover:border-stone-400"}`}>
                        {p === 0 ? "None" : `${p}%`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>How should we list your donation?</h2>
                <p className="text-sm text-stone-500 mb-5">The Prophet ﷺ encouraged sadaqah to be hidden — you choose.</p>

                <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all mb-3 ${anonymous ? "bg-emerald-50 border-emerald-600" : "bg-white border-stone-200"}`}>
                  <input type="radio" checked={anonymous} onChange={() => setAnonymous(true)} className="mt-0.5 accent-emerald-800" />
                  <div>
                    <p className="text-sm font-medium text-stone-900">Give anonymously</p>
                    <p className="text-xs text-stone-600 mt-0.5">Listed as "Anonymous" on the campaign page.</p>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all mb-4 ${!anonymous ? "bg-emerald-50 border-emerald-600" : "bg-white border-stone-200"}`}>
                  <input type="radio" checked={!anonymous} onChange={() => setAnonymous(false)} className="mt-0.5 accent-emerald-800" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-stone-900">Show my name</p>
                    <p className="text-xs text-stone-600 mt-0.5">Others may be inspired to give too.</p>
                  </div>
                </label>

                {!anonymous && (
                  <div className="space-y-3 mt-4 pl-4 border-l-2 border-emerald-200">
                    <div>
                      <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Name to display</label>
                      <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Aisha K. or The Khan Family" className="w-full px-4 py-2.5 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Email (for receipt)</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="w-full px-4 py-2.5 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                </div>

                <div className="mt-4">
                  <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Message (optional)</label>
                  <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2} placeholder="e.g. Sadaqah jariyah for my late father. Ameen." className="w-full px-4 py-2.5 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm resize-none" />
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Confirm & pay</h2>
                <p className="text-sm text-stone-500 mb-5">May Allah reward your generosity.</p>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between py-2 border-b border-stone-100">
                    <span className="text-stone-500">Campaign</span>
                    <span className="text-stone-900 font-medium text-right">{campaign.title}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-stone-100">
                    <span className="text-stone-500">Donation</span>
                    <span className="text-stone-900 font-medium">{fmt(effectiveAmount)}</span>
                  </div>
                  {giftAid && giftAidAmount > 0 && (
                    <div className="flex justify-between py-2 border-b border-stone-100 text-emerald-800">
                      <span>Gift Aid boost</span>
                      <span className="font-medium">+{fmt(giftAidAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 border-b border-stone-100">
                    <span className="text-stone-500">Tip Amanah ({tipPct}%)</span>
                    <span className="text-stone-900">{fmt(tip)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-stone-100">
                    <span className="text-stone-500">Listed as</span>
                    <span className="text-stone-900">{anonymous ? "Anonymous" : name}</span>
                  </div>
                  {message && (
                    <div className="py-2 border-b border-stone-100">
                      <span className="text-stone-500 block mb-1">Your message</span>
                      <span className="text-stone-700 text-xs italic">"{message}"</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-between mt-8 pt-6 border-t border-stone-100">
              <button onClick={() => step > 1 ? setStep(step - 1) : onBack()} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900">Back</button>
              {step < 3 ? (
                <button onClick={() => setStep(step + 1)} disabled={!canProceed} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white px-6 py-2.5 rounded-xl text-sm font-medium inline-flex items-center gap-2 transition-all hover:scale-[1.02] disabled:hover:scale-100">
                  Continue <ArrowRight size={14} />
                </button>
              ) : (
                <button onClick={() => onDone({ campaign, amount: effectiveAmount, tip, total, name: anonymous ? "Anonymous" : name, email, message, giftAid, giftAidAmount })} className="bg-emerald-900 hover:bg-emerald-800 text-white px-6 py-2.5 rounded-xl text-sm font-medium inline-flex items-center gap-2 shadow-lg shadow-emerald-900/30">
                  <CreditCard size={14} /> Pay {fmt(total)}
                </button>
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5 h-fit">
            <div className={`h-24 -m-5 mb-3 rounded-t-2xl bg-gradient-to-br ${campaign.gradient} relative overflow-hidden`}>
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cpath d='M20 0l20 20-20 20L0 20z' fill='none' stroke='%23fff' stroke-width='0.5'/%3E%3C/svg%3E")` }}></div>
            </div>
            <p className="text-xs text-stone-500 uppercase tracking-wider font-medium mb-1">Donating to</p>
            <h3 className="text-base font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{campaign.title}</h3>
            <p className="text-xs text-stone-600 mb-4">{campaign.creator}</p>

            <div className="space-y-2 text-sm pt-4 border-t border-stone-100">
              <div className="flex justify-between text-stone-600"><span>Your gift</span><span className="text-stone-900 font-medium">{fmt(effectiveAmount)}</span></div>
              {giftAid && giftAidAmount > 0 && <div className="flex justify-between text-emerald-700"><span>+ Gift Aid</span><span>{fmt(giftAidAmount)}</span></div>}
              <div className="flex justify-between text-stone-500 text-xs"><span>Tip Amanah</span><span>{fmt(tip)}</span></div>
              <div className="flex justify-between pt-2 border-t border-stone-100">
                <span className="font-medium text-stone-900">Total today</span>
                <span className="font-semibold text-stone-900 text-lg">{fmt(total)}</span>
              </div>
              {giftAid && giftAidAmount > 0 && (
                <p className="text-xs text-emerald-800 pt-1">Charity receives {fmt(effectiveAmount + giftAidAmount)}</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

// ==================== DONATION SUCCESS ====================
const DonationSuccess = ({ donation, onHome }) => (
  <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-stone-50 to-amber-50 flex items-center justify-center p-6" style={{ fontFamily: "'Inter', sans-serif" }}>
    <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-stone-200 p-8 text-center" style={{ animation: "bounceIn 0.6s ease-out" }}>
      <div className="relative inline-block mb-5">
        <div className="absolute inset-0 bg-emerald-300 rounded-full blur-xl opacity-40"></div>
        <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-700 shadow-lg">
          <HeartHandshake className="text-white" size={30} strokeWidth={2} />
        </div>
      </div>
      <h2 className="text-2xl font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Jazakallahu khayran</h2>
      <p className="text-stone-700 leading-relaxed mb-2">You've donated <span className="font-semibold text-stone-900">{fmt(donation.amount)}</span> to <span className="font-semibold">{donation.campaign.creator}</span>.</p>
      <p className="text-sm text-stone-600 mb-5">A receipt has been sent to {donation.email}.</p>

      <div className="bg-gradient-to-br from-emerald-50 to-amber-50 border border-emerald-200 rounded-xl p-4 text-left mb-5">
        <p className="text-xs text-emerald-900 leading-relaxed italic">
          "The example of those who spend their wealth in the way of Allah is like that of a grain of corn: it grows seven ears, and each ear has a hundred grains..."
        </p>
        <p className="text-xs text-emerald-700 mt-2 text-right">— Qur'an 2:261</p>
      </div>

      <button onClick={onHome} className="w-full bg-emerald-900 hover:bg-emerald-800 text-white py-3 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] mb-2">
        Back to Amanah
      </button>
      <button className="w-full border border-stone-300 hover:border-stone-400 text-stone-700 py-2.5 rounded-xl text-sm font-medium inline-flex items-center justify-center gap-2">
        <Share2 size={14} /> Share this campaign
      </button>
    </div>
    <style>{`@keyframes bounceIn { 0% { opacity: 0; transform: scale(0.9); } 50% { transform: scale(1.02); } 100% { opacity: 1; transform: scale(1); } }`}</style>
  </div>
);

// ==================== CREATE CAMPAIGN FLOW ====================
const CreateCampaign = ({ creatorType, creatorName, creatorCity, onBack, onComplete }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    type: creatorType || "mosque",
    category: "",
    title: "",
    summary: "",
    story: "",
    goal: "",
    duration: "30",
    gradient: "from-emerald-600 to-emerald-900",
    breakdown: [
      { label: "", amount: "" }
    ],
    agreedTerms: false,
    agreedFunds: false
  });

  const mosqueCategories = ["Mosque Renovation", "Ramadan Appeal", "Expansion", "Weekly Programmes", "Emergency Repair", "Community Outreach"];
  const scholarCategories = ["Scholar Studies", "Book Publishing", "Course Creation", "Hijrah Support", "Conference/Event"];
  const categories = form.type === "mosque" ? mosqueCategories : scholarCategories;

  const gradients = [
    { id: "emerald", value: "from-emerald-600 to-emerald-900", label: "Emerald" },
    { id: "amber", value: "from-amber-600 to-amber-900", label: "Amber" },
    { id: "rose", value: "from-rose-600 to-rose-900", label: "Rose" },
    { id: "indigo", value: "from-indigo-600 to-indigo-900", label: "Indigo" },
    { id: "purple", value: "from-purple-600 to-purple-900", label: "Purple" },
    { id: "sky", value: "from-sky-600 to-sky-900", label: "Sky" },
    { id: "stone", value: "from-stone-700 to-stone-900", label: "Charcoal" },
    { id: "teal", value: "from-teal-600 to-teal-900", label: "Teal" }
  ];

  const addBreakdownItem = () => setForm({ ...form, breakdown: [...form.breakdown, { label: "", amount: "" }] });
  const removeBreakdownItem = (i) => setForm({ ...form, breakdown: form.breakdown.filter((_, idx) => idx !== i) });
  const updateBreakdownItem = (i, field, value) => {
    const updated = [...form.breakdown];
    updated[i] = { ...updated[i], [field]: value };
    setForm({ ...form, breakdown: updated });
  };

  const breakdownTotal = form.breakdown.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  const goalNum = parseFloat(form.goal) || 0;
  const breakdownMatches = goalNum === 0 || Math.abs(breakdownTotal - goalNum) < 1;

  const canProceed = {
    1: form.category && form.title.length >= 10 && form.summary.length >= 20,
    2: form.story.length >= 100 && goalNum >= 100 && form.duration,
    3: form.gradient,
    4: form.agreedTerms && form.agreedFunds
  }[step];

  const stepTitles = ["Campaign basics", "Your story & goal", "Look & visuals", "Review & launch"];

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center"><ShieldCheck className="text-emerald-50" size={18} /></div>
          <h1 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-6"><ArrowLeft size={14} /> Back to dashboard</button>

        <div className="mb-2">
          <h1 className="text-3xl font-semibold text-stone-900 tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Start a campaign</h1>
          <p className="text-stone-600 mt-1">Raise funds through Amanah — 0% platform fee, 100% to your cause.</p>
        </div>

        {/* Progress */}
        <div className="mt-8 mb-8">
          <div className="flex items-center gap-3 mb-3">
            {[1, 2, 3, 4].map(n => (
              <div key={n} className="flex items-center gap-3 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${step >= n ? "bg-emerald-900 text-white" : "bg-stone-200 text-stone-500"}`}>
                  {step > n ? <CheckCircle2 size={14} /> : n}
                </div>
                {n < 4 && <div className={`flex-1 h-0.5 transition-all ${step > n ? "bg-emerald-900" : "bg-stone-200"}`}></div>}
              </div>
            ))}
          </div>
          <p className="text-xs text-stone-500 text-center">{stepTitles[step - 1]}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {/* Main column */}
          <div className="md:col-span-2 bg-white border border-stone-200 rounded-2xl p-6">
            {step === 1 && (
              <div>
                <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>What's this campaign about?</h2>
                <p className="text-sm text-stone-500 mb-6">Start with the basics. You can change any of this later.</p>

                <div className="space-y-5">
                  {/* Type (locked to creator type but shown for clarity) */}
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-2 uppercase tracking-wider">Campaign type</label>
                    <div className="flex items-center gap-3 p-4 rounded-xl border-2 border-emerald-600 bg-emerald-50">
                      {form.type === "mosque" ? <Building2 className="text-emerald-800" size={22} /> : <Users className="text-emerald-800" size={22} />}
                      <div>
                        <p className="text-sm font-medium text-stone-900">{form.type === "mosque" ? "Mosque campaign" : "Scholar campaign"}</p>
                        <p className="text-xs text-stone-600">Running as {creatorName}</p>
                      </div>
                      <CheckCircle2 className="text-emerald-700 ml-auto" size={20} />
                    </div>
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-2 uppercase tracking-wider">Category</label>
                    <div className="grid grid-cols-2 gap-2">
                      {categories.map(c => (
                        <button key={c} onClick={() => setForm({...form, category: c})} className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-colors text-left ${form.category === c ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-700 border-stone-300 hover:border-stone-400"}`}>
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Title */}
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Campaign title</label>
                    <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder={form.type === "mosque" ? "e.g. New roof for Masjid Al-Noor" : "e.g. Help me complete my studies at Madinah University"} className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                    <p className="text-xs text-stone-500 mt-1">Keep it clear and specific — what are you raising for? ({form.title.length}/80 characters recommended)</p>
                  </div>

                  {/* Summary */}
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Short summary</label>
                    <textarea value={form.summary} onChange={e => setForm({...form, summary: e.target.value})} rows={2} placeholder="One or two sentences that appear on campaign cards" className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm resize-none" />
                    <p className="text-xs text-stone-500 mt-1">{form.summary.length} characters · aim for 80-150</p>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Tell your story</h2>
                <p className="text-sm text-stone-500 mb-6">The more specific and honest, the more people give.</p>

                <div className="space-y-5">
                  {/* Story */}
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Full story</label>
                    <textarea value={form.story} onChange={e => setForm({...form, story: e.target.value})} rows={10} placeholder="Explain why this campaign matters. What's the need? What will the money do? What impact will it have? Include specific details — numbers, timelines, names where appropriate. Use line breaks for paragraphs." className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm resize-none leading-relaxed" />
                    <p className="text-xs text-stone-500 mt-1">{form.story.length} characters · minimum 100 · campaigns with 300+ characters raise 3× more</p>
                  </div>

                  {/* Goal */}
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Fundraising goal</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 font-medium">£</span>
                      <input type="number" value={form.goal} onChange={e => setForm({...form, goal: e.target.value})} placeholder="e.g. 45000" className="w-full pl-8 pr-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                    </div>
                    <p className="text-xs text-stone-500 mt-1">Be realistic — it's better to hit 100% of £10,000 than 40% of £25,000.</p>
                  </div>

                  {/* Duration */}
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-2 uppercase tracking-wider">Campaign duration</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { v: "14", l: "2 weeks" },
                        { v: "30", l: "30 days" },
                        { v: "60", l: "60 days" },
                        { v: "90", l: "90 days" }
                      ].map(opt => (
                        <button key={opt.v} onClick={() => setForm({...form, duration: opt.v})} className={`py-2.5 rounded-xl border text-sm font-medium transition-colors ${form.duration === opt.v ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-700 border-stone-300 hover:border-stone-400"}`}>
                          {opt.l}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Fund breakdown */}
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-2 uppercase tracking-wider">How will the funds be used?</label>
                    <p className="text-xs text-stone-600 mb-3">Break down your goal. Transparency drives trust.</p>
                    <div className="space-y-2">
                      {form.breakdown.map((item, i) => (
                        <div key={i} className="flex gap-2">
                          <input value={item.label} onChange={e => updateBreakdownItem(i, "label", e.target.value)} placeholder={form.type === "mosque" ? "e.g. Roofing materials" : "e.g. Flight to Madinah"} className="flex-1 px-4 py-2.5 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                          <div className="relative w-32">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 text-sm">£</span>
                            <input type="number" value={item.amount} onChange={e => updateBreakdownItem(i, "amount", e.target.value)} placeholder="0" className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                          </div>
                          {form.breakdown.length > 1 && (
                            <button onClick={() => removeBreakdownItem(i)} className="px-3 bg-stone-100 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors"><X size={14} /></button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button onClick={addBreakdownItem} className="mt-3 text-sm text-emerald-800 font-medium hover:underline inline-flex items-center gap-1"><Plus size={14} /> Add another item</button>

                    {goalNum > 0 && breakdownTotal > 0 && (
                      <div className={`mt-3 p-3 rounded-lg text-xs ${breakdownMatches ? "bg-emerald-50 border border-emerald-200 text-emerald-900" : "bg-amber-50 border border-amber-200 text-amber-900"}`}>
                        {breakdownMatches ? (
                          <span className="flex items-center gap-1.5"><CheckCircle2 size={13} /> Breakdown matches goal: £{breakdownTotal.toLocaleString()}</span>
                        ) : (
                          <span className="flex items-center gap-1.5"><AlertCircle size={13} /> Breakdown totals £{breakdownTotal.toLocaleString()} but goal is £{goalNum.toLocaleString()} — £{Math.abs(goalNum - breakdownTotal).toLocaleString()} {breakdownTotal > goalNum ? "over" : "remaining"}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Pick a colour</h2>
                <p className="text-sm text-stone-500 mb-6">Each campaign has its own gradient banner. Pick one that reflects your mood — warm for Ramadan, calm for community projects, bold for urgent repairs.</p>

                <div className="grid grid-cols-2 gap-3 mb-6">
                  {gradients.map(g => (
                    <button
                      key={g.id}
                      onClick={() => setForm({...form, gradient: g.value})}
                      className={`relative h-24 rounded-2xl bg-gradient-to-br ${g.value} overflow-hidden border-2 transition-all ${form.gradient === g.value ? "border-stone-900 scale-[1.02] shadow-lg" : "border-transparent hover:scale-[1.02]"}`}
                    >
                      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cpath d='M20 0l20 20-20 20L0 20z' fill='none' stroke='%23fff' stroke-width='0.5'/%3E%3C/svg%3E")` }}></div>
                      <div className="relative h-full flex items-end p-3 text-white">
                        <span className="text-xs font-medium uppercase tracking-wider">{g.label}</span>
                      </div>
                      {form.gradient === g.value && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white flex items-center justify-center">
                          <CheckCircle2 className="text-emerald-700" size={16} strokeWidth={2.5} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {/* Live preview */}
                <div className="border border-stone-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-2 bg-stone-50 border-b border-stone-200">
                    <p className="text-xs uppercase tracking-wider text-stone-500 font-medium">Live preview · as it'll appear on Amanah</p>
                  </div>
                  <div className="p-4 bg-stone-50">
                    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden max-w-sm">
                      <div className={`relative h-40 bg-gradient-to-br ${form.gradient} overflow-hidden`}>
                        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cpath d='M20 0l20 20-20 20L0 20z' fill='none' stroke='%23fff' stroke-width='0.5'/%3E%3C/svg%3E")` }}></div>
                        {form.category && (
                          <div className="absolute top-3 right-3 inline-flex items-center gap-1 bg-white/20 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded-full font-medium uppercase tracking-wider border border-white/30">{form.category}</div>
                        )}
                        <div className="absolute bottom-3 left-4 right-4 text-white">
                          <p className="text-xs opacity-90 flex items-center gap-1"><MapPin size={11} /> {creatorCity}</p>
                        </div>
                      </div>
                      <div className="p-5">
                        <div className="flex items-center gap-1.5 mb-2">
                          <p className="text-xs text-stone-500">{creatorName}</p>
                          <ShieldCheck size={12} className="text-emerald-700" />
                        </div>
                        <h4 className="text-base font-semibold text-stone-900 mb-2 leading-snug" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{form.title || "Your campaign title will appear here"}</h4>
                        <p className="text-sm text-stone-600 line-clamp-2 mb-4 leading-relaxed">{form.summary || "Your summary will appear here — keep it to one or two sentences."}</p>
                        <ProgressBar raised={0} goal={goalNum || 1} gradient={form.gradient} />
                        <div className="flex items-center justify-between mt-2 text-xs">
                          <span className="font-semibold text-stone-900">£0</span>
                          <span className="text-stone-500">raised of {goalNum > 0 ? `£${goalNum.toLocaleString()}` : "—"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Almost there</h2>
                <p className="text-sm text-stone-500 mb-6">One last check. Make sure everything's right — your campaign goes live immediately after launching.</p>

                {/* Summary */}
                <div className="space-y-3 mb-6 text-sm">
                  <div className="py-2 border-b border-stone-100 flex justify-between">
                    <span className="text-stone-500">Running as</span>
                    <span className="text-stone-900 font-medium">{creatorName}</span>
                  </div>
                  <div className="py-2 border-b border-stone-100 flex justify-between">
                    <span className="text-stone-500">Category</span>
                    <span className="text-stone-900">{form.category}</span>
                  </div>
                  <div className="py-2 border-b border-stone-100">
                    <span className="text-stone-500 block mb-1">Title</span>
                    <span className="text-stone-900 font-medium">{form.title}</span>
                  </div>
                  <div className="py-2 border-b border-stone-100 flex justify-between">
                    <span className="text-stone-500">Goal</span>
                    <span className="text-stone-900 font-semibold">{fmt(goalNum)}</span>
                  </div>
                  <div className="py-2 border-b border-stone-100 flex justify-between">
                    <span className="text-stone-500">Duration</span>
                    <span className="text-stone-900">{form.duration} days</span>
                  </div>
                </div>

                {/* Terms */}
                <div className="space-y-3">
                  <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${form.agreedFunds ? "bg-emerald-50 border-emerald-200" : "bg-stone-50 border-stone-200 hover:border-stone-300"}`}>
                    <input type="checkbox" checked={form.agreedFunds} onChange={e => setForm({...form, agreedFunds: e.target.checked})} className="mt-0.5 accent-emerald-800" />
                    <div>
                      <p className="text-sm font-medium text-stone-900">Funds will only be used as described</p>
                      <p className="text-xs text-stone-600 mt-0.5">I commit that 100% of donations will go toward the purposes described in this campaign. Any material change requires donor notification.</p>
                    </div>
                  </label>
                  <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${form.agreedTerms ? "bg-emerald-50 border-emerald-200" : "bg-stone-50 border-stone-200 hover:border-stone-300"}`}>
                    <input type="checkbox" checked={form.agreedTerms} onChange={e => setForm({...form, agreedTerms: e.target.checked})} className="mt-0.5 accent-emerald-800" />
                    <div>
                      <p className="text-sm font-medium text-stone-900">I accept Amanah's campaign terms</p>
                      <p className="text-xs text-stone-600 mt-0.5">Including providing receipts to donors, honouring Gift Aid declarations, and allowing Amanah to review campaign content for community standards.</p>
                    </div>
                  </label>
                </div>

                <div className="mt-6 bg-sky-50 border border-sky-200 rounded-xl p-4 flex gap-3">
                  <Info className="text-sky-800 flex-shrink-0 mt-0.5" size={18} />
                  <p className="text-xs text-sky-900">Funds are transferred directly to your verified charity account (mosques) or verified personal account (scholars). Amanah never holds donor funds beyond the time needed to process the payment.</p>
                </div>
              </div>
            )}

            <div className="flex justify-between mt-8 pt-6 border-t border-stone-100">
              <button onClick={() => step > 1 ? setStep(step - 1) : onBack()} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900">Back</button>
              {step < 4 ? (
                <button onClick={() => setStep(step + 1)} disabled={!canProceed} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white px-6 py-2.5 rounded-xl text-sm font-medium inline-flex items-center gap-2 transition-all hover:scale-[1.02] disabled:hover:scale-100">
                  Continue <ArrowRight size={14} />
                </button>
              ) : (
                <button onClick={() => onComplete(form)} disabled={!canProceed} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white px-6 py-2.5 rounded-xl text-sm font-medium inline-flex items-center gap-2 shadow-lg shadow-emerald-900/30 transition-all hover:scale-[1.02] disabled:hover:scale-100">
                  <Zap size={14} /> Launch campaign
                </button>
              )}
            </div>
          </div>

          {/* Right column: tips */}
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-amber-50 to-white border border-amber-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Flame className="text-amber-600" size={18} />
                <h3 className="text-sm font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Tips that work</h3>
              </div>
              <ul className="text-xs text-stone-700 space-y-2 leading-relaxed">
                {step === 1 && (
                  <>
                    <li className="flex gap-2"><span className="text-amber-600">•</span> Specific titles beat vague ones. "Fix our leaking roof" &gt; "Help our mosque."</li>
                    <li className="flex gap-2"><span className="text-amber-600">•</span> Summaries with a specific amount or number raise more. "Serving 300 iftars" &gt; "Ramadan appeal."</li>
                  </>
                )}
                {step === 2 && (
                  <>
                    <li className="flex gap-2"><span className="text-amber-600">•</span> Include a photo in the story if you can — campaigns with imagery raise 2× more.</li>
                    <li className="flex gap-2"><span className="text-amber-600">•</span> Mention specific hadith or verses — they resonate deeply with donors.</li>
                    <li className="flex gap-2"><span className="text-amber-600">•</span> Show what each £1, £50, £500 does. Concrete impact.</li>
                  </>
                )}
                {step === 3 && (
                  <>
                    <li className="flex gap-2"><span className="text-amber-600">•</span> Emerald: community/long-term projects</li>
                    <li className="flex gap-2"><span className="text-amber-600">•</span> Amber: Ramadan, food, warmth</li>
                    <li className="flex gap-2"><span className="text-amber-600">•</span> Rose: sisters' projects</li>
                    <li className="flex gap-2"><span className="text-amber-600">•</span> Charcoal: renovation, serious repair</li>
                  </>
                )}
                {step === 4 && (
                  <>
                    <li className="flex gap-2"><span className="text-amber-600">•</span> Share your campaign link in your WhatsApp groups immediately after launch.</li>
                    <li className="flex gap-2"><span className="text-amber-600">•</span> Post updates weekly — it keeps donors engaged.</li>
                    <li className="flex gap-2"><span className="text-amber-600">•</span> Thank each donor individually within 48 hours.</li>
                  </>
                )}
              </ul>
            </div>

            <div className="bg-white border border-stone-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="text-emerald-700" size={18} />
                <h3 className="text-sm font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>You're verified</h3>
              </div>
              <p className="text-xs text-stone-700 leading-relaxed">
                Because you're a verified {form.type === "mosque" ? "mosque" : "scholar"} on Amanah, your campaign goes live immediately — no extra approval needed. Donors see the verified badge, giving them confidence to donate.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

// ==================== CAMPAIGN LAUNCH SUCCESS ====================
const CampaignLaunched = ({ campaign, onView, onHome }) => (
  <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-stone-50 to-amber-50 flex items-center justify-center p-6" style={{ fontFamily: "'Inter', sans-serif" }}>
    <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-stone-200 p-8 text-center" style={{ animation: "bounceIn 0.6s ease-out" }}>
      <div className="relative inline-block mb-5">
        <div className="absolute inset-0 bg-amber-300 rounded-full blur-xl opacity-50"></div>
        <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-700 shadow-lg">
          <Zap className="text-white" size={30} strokeWidth={2} />
        </div>
      </div>
      <h2 className="text-2xl font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>You're live, bi'idhnillah!</h2>
      <p className="text-stone-700 leading-relaxed mb-5">Your campaign <span className="font-semibold text-stone-900">"{campaign.title}"</span> is now visible to thousands of Amanah users.</p>

      <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 text-left mb-5 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-stone-500">Goal</span><span className="text-stone-900 font-semibold">{fmt(parseFloat(campaign.goal) || 0)}</span></div>
        <div className="flex justify-between"><span className="text-stone-500">Duration</span><span className="text-stone-900">{campaign.duration} days</span></div>
        <div className="flex justify-between"><span className="text-stone-500">Campaign ID</span><span className="text-stone-900 font-mono text-xs">AMN-C-{Date.now().toString().slice(-6)}</span></div>
      </div>

      <p className="text-xs text-stone-600 mb-5 leading-relaxed">Share your campaign link in WhatsApp groups, Friday announcements, and social media. The first 48 hours matter most.</p>

      <button onClick={onView} className="w-full bg-emerald-900 hover:bg-emerald-800 text-white py-3 rounded-xl text-sm font-medium mb-2 transition-all hover:scale-[1.02]">
        View my campaign
      </button>
      <button onClick={onHome} className="w-full border border-stone-300 hover:border-stone-400 text-stone-700 py-2.5 rounded-xl text-sm font-medium">
        Back to dashboard
      </button>
    </div>
    <style>{`@keyframes bounceIn { 0% { opacity: 0; transform: scale(0.9); } 50% { transform: scale(1.02); } 100% { opacity: 1; transform: scale(1); } }`}</style>
  </div>
);

// ==================== REVIEW SYSTEM ====================

// Rich reviews dataset - used across public scholar detail and scholar dashboard
const SCHOLAR_REVIEWS_DB = {
  101: [
    { id: "r1", author: "Fatima M.", rating: 5, text: "Subhan'Allah, my son has come on leaps and bounds. Ustadh is so patient and clearly loves teaching the Qur'an. My son went from barely recognising letters to reading half a page in 8 weeks.", date: "2 weeks ago", package: "Standard", tags: ["Patient", "Great with kids", "Knowledgeable"], reply: "Jazakallahu khayran sister Fatima. May Allah bless Yusuf's journey with the Qur'an and keep his heart attached to it. Please pass on my salam." },
    { id: "r2", author: "Ahmed K.", rating: 5, text: "Best Qur'an teacher we've worked with. Brilliant with kids. Punctual, structured, and gives a proper weekly report.", date: "1 month ago", package: "Premium", tags: ["Punctual", "Structured"] },
    { id: "r3", author: "Umm Zayd", rating: 5, text: "We had tried 3 teachers before. Ustadh is in another league. My daughter actually looks forward to her lessons.", date: "1 month ago", package: "Standard", tags: ["Engaging", "Great with kids"] },
    { id: "r4", author: "Anonymous", rating: 4, text: "Very good teacher. Sometimes the weekly slot needs rescheduling but always made up.", date: "2 months ago", package: "Standard", tags: ["Knowledgeable"] }
  ],
  102: [
    { id: "r5", author: "Zainab H.", rating: 5, text: "Finally a female scholar I can ask anything without shame. Changed my iman.", date: "3 weeks ago", package: "Revert Programme", tags: ["Patient", "Non-judgmental"], reply: "Wa iyyakum dear sister. This is exactly why I teach. May Allah keep us all firm." },
    { id: "r6", author: "Khadija A.", rating: 5, text: "Ustadha's halaqah is the highlight of my week. She explains complex fiqh in a way that actually makes sense for us sisters.", date: "1 month ago", package: "Monthly", tags: ["Clear explanations", "Knowledgeable"] }
  ],
  103: [
    { id: "r7", author: "Umm Saad", rating: 5, text: "My daughter has memorised 3 juz in 6 months. Alhamdulillah. Ustadh's structured approach really works.", date: "1 month ago", package: "Weekly", tags: ["Structured", "Great with kids"], reply: "Alhamdulillah. Maasha'Allah to Saad's hard work." }
  ],
  104: [
    { id: "r8", author: "The Akhtars", rating: 5, text: "Officiated our nikah beautifully. Respectful, knowledgeable, made everyone feel at ease. Several guests asked for his details afterwards.", date: "2 months ago", package: "Nikah Ceremony", tags: ["Professional", "Calming presence"] }
  ],
  105: [
    { id: "r9", author: "Sara B.", rating: 5, text: "I'm 35 and never thought I could learn Arabic. Ustadha proved me wrong! Patient, uses modern methods, very encouraging.", date: "1 week ago", package: "Weekly", tags: ["Patient", "Modern methods", "Encouraging"], reply: "Alhamdulillah sister! Keep going — you're a natural." },
    { id: "r10", author: "Mariam I.", rating: 5, text: "My 9-year-old loves the lessons. Lots of games, stories — she doesn't even realise she's learning.", date: "3 weeks ago", package: "Weekly", tags: ["Great with kids", "Engaging"] }
  ],
  106: [
    { id: "r11", author: "Bilal R.", rating: 5, text: "Deep knowledge delivered simply. Like having a scholar in your living room.", date: "3 weeks ago", package: "Consultation", tags: ["Knowledgeable", "Clear explanations"] },
    { id: "r12", author: "Hussain M.", rating: 4, text: "Excellent scholar, very learned. Response time a bit slow but always worth the wait.", date: "2 months ago", package: "Study Circle", tags: ["Knowledgeable"] }
  ]
};

// Calculate ratings breakdown
const getRatingBreakdown = (reviews) => {
  if (!reviews || reviews.length === 0) return null;
  const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach(r => { breakdown[r.rating] = (breakdown[r.rating] || 0) + 1; });
  const total = reviews.length;
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / total;
  return { breakdown, total, avg: Math.round(avg * 10) / 10 };
};

// Star rating display (read-only or interactive)
const StarRating = ({ rating, size = 14, interactive = false, onChange, max = 5 }) => (
  <div className="flex items-center gap-0.5">
    {Array.from({ length: max }, (_, i) => i + 1).map(n => (
      interactive ? (
        <button
          key={n}
          onClick={() => onChange && onChange(n)}
          type="button"
          className="hover:scale-110 transition-transform"
        >
          <Star size={size} className={n <= rating ? "text-amber-500" : "text-stone-300"} fill={n <= rating ? "currentColor" : "none"} />
        </button>
      ) : (
        <Star key={n} size={size} className={n <= rating ? "text-amber-500" : "text-stone-300"} fill={n <= rating ? "currentColor" : "none"} />
      )
    ))}
  </div>
);

// Ratings breakdown bars
const RatingsBreakdown = ({ reviews }) => {
  const data = getRatingBreakdown(reviews);
  if (!data) return null;

  return (
    <div className="flex gap-6 items-start">
      <div className="text-center flex-shrink-0">
        <p className="text-5xl font-semibold text-stone-900 leading-none" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{data.avg.toFixed(1)}</p>
        <StarRating rating={Math.round(data.avg)} size={16} />
        <p className="text-xs text-stone-500 mt-2">{data.total} reviews</p>
      </div>
      <div className="flex-1 space-y-1.5 min-w-0">
        {[5, 4, 3, 2, 1].map(stars => {
          const count = data.breakdown[stars] || 0;
          const pct = (count / data.total) * 100;
          return (
            <div key={stars} className="flex items-center gap-3 text-xs">
              <span className="text-stone-600 w-6 flex items-center gap-0.5">{stars}<Star size={10} className="text-amber-500" fill="currentColor" /></span>
              <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }}></div>
              </div>
              <span className="text-stone-500 w-8 text-right">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Individual review card
const ReviewCard = ({ review, compact = false }) => (
  <div className={`${compact ? "pb-4 border-b border-stone-100 last:border-0 last:pb-0" : "bg-white border border-stone-200 rounded-2xl p-5"}`}>
    <div className="flex items-start gap-3 mb-2">
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-100 to-stone-100 flex items-center justify-center text-xs font-medium text-stone-700 flex-shrink-0">
        {review.author === "Anonymous" ? "✦" : review.author[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="text-sm font-medium text-stone-900">{review.author}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <StarRating rating={review.rating} size={12} />
              <span className="text-xs text-stone-400">·</span>
              <span className="text-xs text-stone-500">{review.date}</span>
              <span className="text-xs text-stone-400">·</span>
              <span className="text-[10px] uppercase tracking-wider text-stone-500">{review.package}</span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded font-medium uppercase tracking-wider">
            <CheckCircle2 size={9} /> Verified booking
          </span>
        </div>
      </div>
    </div>
    <p className="text-sm text-stone-800 leading-relaxed ml-12 mb-2">{review.text}</p>
    {review.tags && review.tags.length > 0 && (
      <div className="flex flex-wrap gap-1 ml-12 mb-2">
        {review.tags.map(t => <span key={t} className="text-[10px] px-2 py-0.5 bg-stone-100 text-stone-700 rounded uppercase tracking-wider">{t}</span>)}
      </div>
    )}
    {review.reply && (
      <div className="ml-12 mt-3 bg-stone-50 border-l-2 border-emerald-600 pl-3 py-2 rounded-r-lg">
        <p className="text-xs text-emerald-800 font-medium mb-0.5">Scholar replied</p>
        <p className="text-sm text-stone-700 italic leading-relaxed">{review.reply}</p>
      </div>
    )}
  </div>
);

// ==================== LEAVE REVIEW FLOW ====================
const LeaveReview = ({ scholar, booking, onBack, onSubmit }) => {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [step, setStep] = useState(1);

  const availableTags = {
    5: ["Patient", "Knowledgeable", "Great with kids", "Punctual", "Engaging", "Clear explanations", "Encouraging"],
    4: ["Patient", "Knowledgeable", "Good value", "Clear", "Helpful"],
    3: ["Average", "Basic", "Could improve communication"],
    2: ["Issues with timing", "Unclear explanations", "Below expectations"],
    1: ["Unprofessional", "Did not show up", "Not as described"]
  };
  const tagsForRating = rating > 0 ? availableTags[rating] : [];

  const toggleTag = (tag) => setSelectedTags(selectedTags.includes(tag) ? selectedTags.filter(t => t !== tag) : [...selectedTags, tag]);

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center"><ShieldCheck className="text-emerald-50" size={18} /></div>
          <h1 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-6"><ArrowLeft size={14} /> Back</button>

        {/* Context card */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-6">
          <p className="text-xs text-stone-500 uppercase tracking-wider font-medium mb-3">Reviewing your session with</p>
          <div className="flex items-center gap-3">
            <Avatar scholar={scholar} size="md" />
            <div>
              <p className="text-base font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{scholar.name}</p>
              <p className="text-xs text-stone-500">{booking.package} · completed {booking.completedDate}</p>
            </div>
          </div>
        </div>

        {step === 1 && (
          <div className="bg-white border border-stone-200 rounded-2xl p-6">
            <h2 className="text-2xl font-semibold text-stone-900 mb-1 text-center" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>How was your session?</h2>
            <p className="text-sm text-stone-500 text-center mb-8">Your review helps other families find the right scholar.</p>

            <div className="flex justify-center mb-8">
              <StarRating rating={rating} size={40} interactive onChange={setRating} />
            </div>
            {rating > 0 && (
              <p className="text-center text-sm text-stone-600 mb-6" style={{ animation: "fadeInUp 0.3s ease-out" }}>
                {rating === 5 && "Excellent — you had a great experience"}
                {rating === 4 && "Very good — mostly positive"}
                {rating === 3 && "Okay — some issues but overall fine"}
                {rating === 2 && "Disappointing — clear problems"}
                {rating === 1 && "Poor — something went seriously wrong"}
              </p>
            )}

            {rating > 0 && (
              <div className="pt-6 border-t border-stone-100" style={{ animation: "fadeInUp 0.3s ease-out 0.1s both" }}>
                <p className="text-xs uppercase tracking-wider text-stone-700 font-medium mb-3">What stood out? (pick any that apply)</p>
                <div className="flex flex-wrap gap-2 mb-5">
                  {tagsForRating.map(tag => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${selectedTags.includes(tag) ? "bg-stone-900 text-white" : "bg-white border border-stone-300 text-stone-700 hover:border-stone-400"}`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between pt-6 border-t border-stone-100 mt-4">
              <button onClick={onBack} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900">Cancel</button>
              <button onClick={() => setStep(2)} disabled={rating === 0} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white px-6 py-2.5 rounded-xl text-sm font-medium inline-flex items-center gap-2 transition-all hover:scale-[1.02] disabled:hover:scale-100">
                Continue <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white border border-stone-200 rounded-2xl p-6">
            <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Share your experience</h2>
            <p className="text-sm text-stone-500 mb-5">A few honest sentences help other families more than anything.</p>

            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={6}
              placeholder={rating >= 4 ? "What did you love about your session? How did the scholar help you or your child?" : "What happened? Being specific helps us and future families."}
              className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm resize-none leading-relaxed mb-2"
            />
            <p className="text-xs text-stone-500 mb-5">{text.length} characters · Most helpful reviews are 50-200 characters.</p>

            <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 mb-6 flex gap-3">
              <Info className="text-sky-800 flex-shrink-0 mt-0.5" size={16} />
              <div className="text-xs text-sky-900">
                <p className="font-medium mb-1">Your review will be visible to everyone on Amanah</p>
                <p className="leading-relaxed">Reviews are moderated — we don't remove negative reviews, but we do remove false, abusive, or off-topic ones. The scholar can reply.</p>
              </div>
            </div>

            <div className="flex justify-between">
              <button onClick={() => setStep(1)} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900">Back</button>
              <button onClick={() => onSubmit({ rating, text, tags: selectedTags, scholar, booking })} disabled={text.length < 10} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white px-6 py-2.5 rounded-xl text-sm font-medium inline-flex items-center gap-2 shadow-lg shadow-emerald-900/20 transition-all hover:scale-[1.02] disabled:hover:scale-100">
                <Send size={14} /> Submit review
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

// ==================== REVIEW SUBMITTED SUCCESS ====================
const ReviewSubmitted = ({ review, onHome }) => (
  <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-stone-50 to-amber-50 flex items-center justify-center p-6" style={{ fontFamily: "'Inter', sans-serif" }}>
    <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-stone-200 p-8 text-center" style={{ animation: "bounceIn 0.6s ease-out" }}>
      <div className="relative inline-block mb-5">
        <div className="absolute inset-0 bg-amber-300 rounded-full blur-xl opacity-50"></div>
        <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg">
          <Star className="text-white" size={28} fill="white" strokeWidth={2} />
        </div>
      </div>
      <h2 className="text-2xl font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Jazakallahu khayran</h2>
      <p className="text-stone-700 leading-relaxed mb-5">Your review helps other families find the right scholar. {review.scholar.name} will see it shortly.</p>
      <div className="bg-stone-50 rounded-xl p-4 mb-5 text-left">
        <div className="flex items-center gap-2 mb-2">
          <StarRating rating={review.rating} size={14} />
          <span className="text-xs text-stone-500">Your rating</span>
        </div>
        <p className="text-sm text-stone-700 italic line-clamp-3">"{review.text}"</p>
      </div>
      <button onClick={onHome} className="w-full bg-emerald-900 hover:bg-emerald-800 text-white py-3 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]">
        Back to Amanah
      </button>
    </div>
    <style>{`@keyframes bounceIn { 0% { opacity: 0; transform: scale(0.9); } 50% { transform: scale(1.02); } 100% { opacity: 1; transform: scale(1); } } @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
  </div>
);

// ==================== MESSAGING SYSTEM ====================

// Mock conversations — each has a counterparty, messages, context
const MOCK_CONVERSATIONS = [
  {
    id: "conv-1",
    counterparty: { name: "Aisha Khan", initials: "AK", avatarGradient: "from-rose-400 to-rose-700", role: "Parent", verified: true },
    context: { type: "booking", label: "Standard Qur'an package · Yusuf (son, age 9)" },
    lastMessage: "Jazakallahu khayran, we'll see you Thursday insha'Allah",
    lastTime: "2m ago",
    unread: 0,
    pinned: true,
    online: true,
    messages: [
      { id: 1, from: "them", text: "Assalamu alaikum Ustadh, I saw your profile — my 9-year-old needs help with his tajweed. Is he too young?", time: "Yesterday, 14:20" },
      { id: 2, from: "me", text: "Wa alaikum assalam sister. Not at all — 9 is a great age to start properly. Is he reading already or completely new?", time: "Yesterday, 14:35" },
      { id: 3, from: "them", text: "He can read slowly but his makharij needs a lot of work. Can we do Thursdays after school, around 5pm?", time: "Yesterday, 14:40" },
      { id: 4, from: "me", text: "Thursdays 5pm works perfectly. I'd recommend the Standard package (4× 30min sessions) to start. Shall I send it over for booking?", time: "Yesterday, 14:45", suggestion: { type: "package", name: "Standard", price: 90, duration: "4 × 30 min" } },
      { id: 5, from: "them", text: "Yes please, that sounds great", time: "Yesterday, 15:02" },
      { id: 6, from: "me", text: "Perfect. I've sent the booking link — once confirmed I'll add him to my Thursday roster.", time: "Yesterday, 15:05" },
      { id: 7, from: "them", text: "Just booked. Jazakallahu khayran, we'll see you Thursday insha'Allah", time: "2m ago" }
    ]
  },
  {
    id: "conv-2",
    counterparty: { name: "Masjid An-Noor", initials: "MN", avatarGradient: "from-emerald-400 to-emerald-700", role: "Mosque · Bradford", verified: true },
    context: { type: "hire", label: "Possible Ramadan taraweeh position" },
    lastMessage: "We'd like to invite you to come visit the masjid before committing",
    lastTime: "3h ago",
    unread: 2,
    pinned: false,
    online: false,
    messages: [
      { id: 1, from: "them", text: "Assalamu alaikum Ustadh Yusuf. We're looking for an imam to lead our taraweeh this Ramadan. Your profile is highly recommended.", time: "3 days ago", senderName: "Br. Imran (Secretary)" },
      { id: 2, from: "me", text: "Wa alaikum assalam. Thank you for reaching out. I'd be honoured — which days/how many rakat are you looking for?", time: "3 days ago" },
      { id: 3, from: "them", text: "20 rakat each night, full 30 nights. We'd cover your travel from Birmingham and provide iftar/suhoor.", time: "2 days ago", senderName: "Br. Imran (Secretary)" },
      { id: 4, from: "me", text: "That sounds workable. Can I ask what your congregation size is typically? I want to make sure my pace suits.", time: "2 days ago" },
      { id: 5, from: "them", text: "Around 400 each night, mixed ages. Our regulars are used to a steady pace with clear recitation.", time: "3h ago", senderName: "Br. Imran (Secretary)" },
      { id: 6, from: "them", text: "We'd like to invite you to come visit the masjid before committing", time: "3h ago", senderName: "Br. Imran (Secretary)" }
    ]
  },
  {
    id: "conv-3",
    counterparty: { name: "Fatima Begum", initials: "FB", avatarGradient: "from-amber-400 to-amber-700", role: "Parent", verified: false },
    context: { type: "inquiry", label: "Tajweed for daughter" },
    lastMessage: "Actually let me share my number quickly — 07700900...",
    lastTime: "1 day ago",
    unread: 0,
    pinned: false,
    online: false,
    flagged: true,
    messages: [
      { id: 1, from: "them", text: "Salam, interested in lessons for my 11-year-old daughter", time: "2 days ago" },
      { id: 2, from: "me", text: "Wa alaikum assalam. Happy to help — what's her current level with Qur'an?", time: "2 days ago" },
      { id: 3, from: "them", text: "She reads but not great. Can you do weekends?", time: "1 day ago" },
      { id: 4, from: "them", text: "Actually let me share my number quickly — ██████████ so we can arrange directly", time: "1 day ago", blurred: true }
    ]
  }
];

// Inbox list view
const MessagesInbox = ({ conversations, onConversation, onBack, currentUser = "Ustadh Yusuf" }) => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = conversations.filter(c => {
    if (filter === "unread" && c.unread === 0) return false;
    if (filter === "flagged" && !c.flagged) return false;
    if (search && !c.counterparty.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0);

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center"><ShieldCheck className="text-emerald-50" size={18} /></div>
            <h1 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-6"><ArrowLeft size={14} /> Back to dashboard</button>

        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h2 className="text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Messages</h2>
            <p className="text-stone-600">
              {totalUnread > 0 ? <><span className="text-stone-900 font-medium">{totalUnread} unread</span> · </> : null}
              {conversations.length} total
            </p>
          </div>
        </div>

        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input type="text" placeholder="Search messages..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-300 bg-white focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
          </div>
          <div className="flex gap-2 bg-white border border-stone-300 rounded-xl p-1">
            {[{ v: "all", l: "All" }, { v: "unread", l: "Unread" }, { v: "flagged", l: "Flagged" }].map(f => (
              <button key={f.v} onClick={() => setFilter(f.v)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f.v ? "bg-emerald-900 text-white" : "text-stone-600 hover:text-stone-900"}`}>{f.l}</button>
            ))}
          </div>
        </div>

        {/* Conversation list */}
        <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
          {filtered.map((conv, i) => (
            <button
              key={conv.id}
              onClick={() => onConversation(conv)}
              className={`w-full flex items-start gap-4 p-4 text-left transition-colors hover:bg-stone-50 ${i < filtered.length - 1 ? "border-b border-stone-100" : ""} ${conv.unread > 0 ? "bg-emerald-50/30" : ""}`}
            >
              <div className="relative flex-shrink-0">
                <Avatar scholar={conv.counterparty} size="md" />
                {conv.online && <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white"></div>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-sm font-semibold text-stone-900 truncate" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{conv.counterparty.name}</p>
                    {conv.counterparty.verified && <ShieldCheck size={12} className="text-emerald-700 flex-shrink-0" />}
                    {conv.pinned && <Pin size={11} className="text-stone-400 flex-shrink-0" />}
                    {conv.flagged && <AlertTriangle size={12} className="text-amber-600 flex-shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-stone-500">{conv.lastTime}</span>
                    {conv.unread > 0 && <span className="bg-emerald-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{conv.unread}</span>}
                  </div>
                </div>
                <p className="text-xs text-stone-500 mb-1">{conv.counterparty.role} · {conv.context.label}</p>
                <p className={`text-sm truncate ${conv.unread > 0 ? "text-stone-900 font-medium" : "text-stone-600"}`}>{conv.lastMessage}</p>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-16 text-stone-500">
              <MessageCircle size={28} className="mx-auto mb-2 text-stone-300" />
              No messages match your filter
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

// Conversation view (individual chat)
const ConversationView = ({ conversation, onBack, currentUserLabel = "You" }) => {
  const [messages, setMessages] = useState(conversation.messages);
  const [input, setInput] = useState("");
  const [showWarning, setShowWarning] = useState(false);

  // Detect phone numbers or emails in the input
  const containsContact = (text) => {
    const phoneRegex = /(?:\+?\d[\s\-]?){7,}/;
    const emailRegex = /[\w.-]+@[\w.-]+\.[a-z]{2,}/i;
    return phoneRegex.test(text) || emailRegex.test(text);
  };

  const handleSend = () => {
    if (!input.trim()) return;
    if (containsContact(input)) {
      setShowWarning(true);
      return;
    }
    setMessages([...messages, {
      id: Date.now(),
      from: "me",
      text: input,
      time: "Just now"
    }]);
    setInput("");
    setShowWarning(false);
  };

  const handleSendAnyway = () => {
    // In reality this would blur the contact info
    const blurredText = input.replace(/(?:\+?\d[\s\-]?){7,}/g, "██████████").replace(/[\w.-]+@[\w.-]+\.[a-z]{2,}/gi, "██████████");
    setMessages([...messages, {
      id: Date.now(),
      from: "me",
      text: blurredText,
      time: "Just now",
      blurred: true
    }]);
    setInput("");
    setShowWarning(false);
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Conversation header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center gap-3">
          <button onClick={onBack} className="text-stone-600 hover:text-stone-900 -ml-2 p-2"><ArrowLeft size={18} /></button>
          <div className="relative">
            <Avatar scholar={conversation.counterparty} size="md" />
            {conversation.online && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white"></div>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-base font-semibold text-stone-900 truncate" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{conversation.counterparty.name}</p>
              {conversation.counterparty.verified && <ShieldCheck size={13} className="text-emerald-700" />}
            </div>
            <p className="text-xs text-stone-500">{conversation.online ? "Active now" : conversation.counterparty.role}</p>
          </div>
          <button className="text-stone-500 hover:text-stone-900 p-2"><MoreHorizontal size={18} /></button>
        </div>

        {/* Context strip */}
        <div className="max-w-3xl mx-auto px-6 py-2.5 bg-stone-50 border-t border-stone-100 flex items-center gap-2 text-xs">
          {conversation.context.type === "booking" && <><CheckCircle2 size={12} className="text-emerald-600" /><span className="text-stone-700">Booking confirmed:</span></>}
          {conversation.context.type === "hire" && <><Building2 size={12} className="text-emerald-700" /><span className="text-stone-700">Discussing:</span></>}
          {conversation.context.type === "inquiry" && <><MessageCircle size={12} className="text-stone-500" /><span className="text-stone-700">Inquiry:</span></>}
          <span className="text-stone-900 font-medium truncate">{conversation.context.label}</span>
        </div>
      </header>

      {/* Safeguarding banner for inquiries */}
      {conversation.context.type === "inquiry" && (
        <div className="max-w-3xl mx-auto w-full px-6 pt-4">
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 flex gap-2 items-start">
            <ShieldCheck className="text-sky-700 flex-shrink-0 mt-0.5" size={14} />
            <p className="text-xs text-sky-900 leading-relaxed">
              <span className="font-medium">Keep conversations on Amanah for your safety.</span> Phone numbers and emails are automatically hidden — this protects you and your children. Share contact details only after booking is confirmed.
            </p>
          </div>
        </div>
      )}

      {/* Messages feed */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-6 space-y-3 pb-40">
        {messages.map((m, i) => {
          const isMe = m.from === "me";
          const prevMessage = messages[i - 1];
          const showTime = !prevMessage || prevMessage.time !== m.time;

          return (
            <div key={m.id}>
              {showTime && <p className="text-xs text-stone-400 text-center py-2">{m.time}</p>}

              {m.suggestion && (
                <div className={`flex ${isMe ? "justify-end" : "justify-start"} mb-2`}>
                  <div className={`max-w-[85%] rounded-2xl border-2 border-dashed ${isMe ? "border-emerald-700 bg-emerald-50" : "border-stone-300 bg-white"} p-4`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Gift size={14} className="text-emerald-700" />
                      <span className="text-xs uppercase tracking-wider text-emerald-800 font-semibold">{isMe ? "You sent a package" : "Package offered"}</span>
                    </div>
                    <p className="text-sm font-semibold text-stone-900 mb-0.5" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{m.suggestion.name} Package · £{m.suggestion.price}</p>
                    <p className="text-xs text-stone-600 mb-3">{m.suggestion.duration}</p>
                    {!isMe && (
                      <button className="w-full bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium py-2 rounded-lg">Book this package</button>
                    )}
                  </div>
                </div>
              )}

              <div className={`flex ${isMe ? "justify-end" : "justify-start"} gap-2`}>
                {!isMe && i > 0 && messages[i - 1].from === m.from ? (
                  <div className="w-8 flex-shrink-0"></div>
                ) : !isMe ? (
                  <Avatar scholar={conversation.counterparty} size="sm" />
                ) : null}
                <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                  {m.senderName && !isMe && (
                    <p className="text-[10px] text-stone-500 mb-0.5 ml-1">{m.senderName}</p>
                  )}
                  <div className={`px-4 py-2.5 rounded-2xl ${isMe ? "bg-emerald-900 text-white rounded-br-md" : "bg-white border border-stone-200 text-stone-900 rounded-bl-md"} ${m.blurred ? "opacity-80" : ""}`}>
                    {m.blurred ? (
                      <div>
                        <p className="text-sm leading-relaxed">{m.text}</p>
                        <div className="mt-2 pt-2 border-t border-white/20 flex gap-1.5 items-center">
                          <AlertTriangle size={11} className={isMe ? "text-amber-200" : "text-amber-600"} />
                          <p className={`text-xs ${isMe ? "text-amber-100" : "text-amber-700"}`}>Contact details hidden by Amanah</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm leading-relaxed whitespace-pre-line">{m.text}</p>
                    )}
                  </div>
                  {isMe && i === messages.length - 1 && (
                    <span className="text-[10px] text-stone-400 mt-0.5 mr-1 flex items-center gap-0.5">
                      <CheckCheck size={10} /> Delivered
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </main>

      {/* Warning banner */}
      {showWarning && (
        <div className="fixed bottom-20 left-0 right-0 z-30 px-6">
          <div className="max-w-3xl mx-auto bg-amber-50 border border-amber-300 rounded-xl p-4 shadow-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-amber-700 flex-shrink-0 mt-0.5" size={18} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900 mb-1">Heads up — we detected contact info</p>
                <p className="text-xs text-amber-800 mb-3 leading-relaxed">For your safety and the scholar's, we encourage you to keep conversations on Amanah. If you send anyway, phone numbers and emails will be automatically hidden.</p>
                <div className="flex gap-2">
                  <button onClick={() => setShowWarning(false)} className="bg-amber-700 hover:bg-amber-800 text-white text-xs font-medium px-3 py-1.5 rounded-lg">Rewrite message</button>
                  <button onClick={handleSendAnyway} className="bg-white border border-amber-300 text-amber-800 hover:border-amber-400 text-xs font-medium px-3 py-1.5 rounded-lg">Send anyway (will be hidden)</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 z-10" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-2">
            <button className="text-stone-500 hover:text-stone-900 p-2 flex-shrink-0"><Paperclip size={18} /></button>
            <button className="text-stone-500 hover:text-stone-900 p-2 flex-shrink-0" title="Send package offer"><Gift size={18} /></button>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSend()}
              placeholder="Type a message..."
              className="flex-1 min-w-0 px-4 py-2.5 rounded-full border border-stone-300 bg-stone-50 focus:bg-white focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm"
            />
            <button onClick={handleSend} disabled={!input.trim()} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white p-2.5 rounded-full transition-all hover:scale-[1.05] active:scale-95 flex-shrink-0">
              <Send size={16} />
            </button>
          </div>
          <p className="text-[10px] text-stone-400 text-center mt-2 hidden md:block">End-to-end encrypted · Contact info automatically hidden</p>
        </div>
      </div>
    </div>
  );
};

// ==================== JOB BOARD ====================
const MOCK_JOBS = [
  {
    id: "job-1",
    title: "Friday Jumu'ah Imam",
    mosque: "Masjid Al-Noor",
    mosqueInitials: "MN",
    mosqueGradient: "from-emerald-400 to-emerald-700",
    city: "Birmingham",
    type: "part-time",
    commitment: "Every Friday, 12:30–14:00",
    pay: "£120 per khutbah",
    startDate: "Friday 1 May 2026",
    duration: "Ongoing",
    postedDate: "2 days ago",
    applicationsCount: 8,
    urgent: false,
    featured: true,
    denomination: "Sunni – Hanafi",
    languages: ["English", "Arabic"],
    description: "We're looking for a regular Jumu'ah imam to deliver our Friday khutbah. Our congregation is around 400, mixed ages. We prefer a structured, classically-trained scholar who can deliver khutbah in English with Arabic recitation.",
    requirements: ["Minimum 3 years' experience delivering Jumu'ah", "Enhanced DBS (verified on Amanah)", "Confident public speaking in English", "Classical training preferred (Al-Azhar, Darul Uloom, etc.)"],
    responsibilities: ["Deliver 15-20 min khutbah each Friday", "Lead Jumu'ah prayer", "Optional: stay for Q&A afterwards"]
  },
  {
    id: "job-2",
    title: "Ramadan Taraweeh Imam",
    mosque: "Masjid As-Salam",
    mosqueInitials: "AS",
    mosqueGradient: "from-rose-400 to-rose-700",
    city: "Leicester",
    type: "contract",
    commitment: "30 nights, 20 rakat each",
    pay: "£3,500 for full month",
    startDate: "Ramadan 1447 (approx. Feb 2027)",
    duration: "30 nights",
    postedDate: "5 days ago",
    applicationsCount: 24,
    urgent: true,
    featured: false,
    denomination: "Sunni – Hanafi",
    languages: ["Arabic"],
    description: "Seeking a Hafiz to lead our taraweeh prayers every night of Ramadan. Our community expects clear, steady recitation. Accommodation, iftar, and suhoor provided on-site.",
    requirements: ["Must be a Hafiz with ijazah", "Confident in leading 20 rakat taraweeh nightly", "Previous Ramadan imamate experience essential", "Enhanced DBS"],
    responsibilities: ["Lead 20 rakat taraweeh every night", "Optional khatam schedule with community", "Stay on-site for the month"]
  },
  {
    id: "job-3",
    title: "Full-time Imam & Khateeb",
    mosque: "Blackburn Islamic Centre",
    mosqueInitials: "BI",
    mosqueGradient: "from-amber-400 to-amber-700",
    city: "Blackburn",
    type: "full-time",
    commitment: "5 days/week, salary + housing",
    pay: "£32,000–38,000/year + accommodation",
    startDate: "Negotiable",
    duration: "Permanent",
    postedDate: "1 week ago",
    applicationsCount: 15,
    urgent: false,
    featured: true,
    denomination: "Sunni – Hanafi",
    languages: ["Urdu", "English", "Arabic"],
    description: "Our long-serving senior imam is retiring insha'Allah. We seek a warm, community-focused scholar to lead our masjid and serve our diverse congregation. On-site 3-bedroom house provided.",
    requirements: ["Classically trained (Darul Uloom or equivalent)", "Minimum 5 years' experience as full-time imam", "Fluent in Urdu and English", "Comfortable with pastoral work, youth programs, counselling"],
    responsibilities: ["Lead all 5 daily prayers and Jumu'ah", "Deliver khutbah", "Teach daily halaqah after Maghrib", "Youth programs and counselling", "Nikah and janazah services", "Represent masjid in interfaith work"]
  },
  {
    id: "job-4",
    title: "Weekend Qur'an Teacher",
    mosque: "Noor Academy",
    mosqueInitials: "NA",
    mosqueGradient: "from-indigo-400 to-indigo-700",
    city: "London",
    type: "part-time",
    commitment: "Saturdays 10:00–14:00",
    pay: "£65 per session",
    startDate: "3 May 2026",
    duration: "Academic year",
    postedDate: "3 days ago",
    applicationsCount: 12,
    urgent: false,
    featured: false,
    denomination: "Non-denominational",
    languages: ["English", "Arabic"],
    description: "Small, well-organised weekend madrassa needs a tajweed teacher for ages 8–13. Structured curriculum provided. Classes of 6–8 students.",
    requirements: ["Experience teaching children", "Ijazah in tajweed preferred", "Enhanced DBS", "Patient, engaging teaching style"],
    responsibilities: ["Teach 4 × 50-min classes on Saturdays", "Progress reports for parents", "Attend termly teacher meeting"]
  }
];

const MOCK_MY_APPLICATIONS = [
  { id: "app-1", jobId: "job-1", status: "viewed", appliedDate: "3 days ago", message: "Assalamu alaikum, I would be honoured to serve your community as Jumu'ah imam..." },
  { id: "app-2", jobId: "job-3", status: "shortlisted", appliedDate: "6 days ago", message: "Wa alaikum assalam. I've been teaching and leading..." }
];

// Job type pill
const JobTypePill = ({ type }) => {
  const config = {
    "full-time": { bg: "bg-emerald-50", text: "text-emerald-800", label: "Full-time" },
    "part-time": { bg: "bg-sky-50", text: "text-sky-800", label: "Part-time" },
    "contract": { bg: "bg-purple-50", text: "text-purple-800", label: "Contract" },
    "one-off": { bg: "bg-stone-100", text: "text-stone-700", label: "One-off" }
  }[type];
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider ${config.bg} ${config.text}`}>{config.label}</span>;
};

// Application status pill
const AppStatusPill = ({ status }) => {
  const config = {
    submitted: { bg: "bg-stone-100", text: "text-stone-700", label: "Submitted", icon: Clock },
    viewed: { bg: "bg-sky-50", text: "text-sky-700", label: "Viewed", icon: Eye },
    shortlisted: { bg: "bg-amber-50", text: "text-amber-800", label: "Shortlisted", icon: Star },
    offered: { bg: "bg-emerald-50", text: "text-emerald-800", label: "Offered", icon: CheckCircle2 },
    declined: { bg: "bg-rose-50", text: "text-rose-700", label: "Declined", icon: XCircle }
  }[status];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <Icon size={11} /> {config.label}
    </span>
  );
};

// Job card
const JobCard = ({ job, onClick, applied }) => (
  <div onClick={onClick} className="group bg-white border border-stone-200 rounded-2xl p-5 hover:border-emerald-400 hover:shadow-lg cursor-pointer transition-all hover:-translate-y-0.5">
    <div className="flex items-start gap-3 mb-3">
      <Avatar scholar={{ initials: job.mosqueInitials, avatarGradient: job.mosqueGradient }} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <h4 className="text-base font-semibold text-stone-900 leading-snug" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{job.title}</h4>
          {job.featured && <Flame size={12} className="text-amber-500" />}
          {job.urgent && <span className="text-[10px] px-1.5 py-0.5 bg-rose-100 text-rose-800 rounded font-medium uppercase tracking-wider">Urgent</span>}
          {applied && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-medium uppercase tracking-wider"><CheckCircle2 size={9} /> Applied</span>}
        </div>
        <p className="text-sm text-stone-600 mb-1">{job.mosque} · <MapPin size={11} className="inline" /> {job.city}</p>
      </div>
    </div>

    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <JobTypePill type={job.type} />
      <span className="text-xs text-stone-500">·</span>
      <span className="text-xs text-stone-700 font-medium">{job.pay}</span>
    </div>

    <p className="text-sm text-stone-700 line-clamp-2 mb-4 leading-relaxed">{job.description}</p>

    <div className="flex items-center justify-between pt-3 border-t border-stone-100 text-xs text-stone-500">
      <span className="flex items-center gap-1"><Clock size={11} /> {job.commitment}</span>
      <div className="flex items-center gap-3">
        <span>{job.applicationsCount} applied</span>
        <span>·</span>
        <span>{job.postedDate}</span>
      </div>
    </div>
  </div>
);

// ==================== JOBS BOARD (for imams) ====================
const JobsBoard = ({ onBack, onJob, myApplications }) => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [tab, setTab] = useState("browse");

  const filtered = MOCK_JOBS.filter(j => {
    const matchesSearch = !search || j.title.toLowerCase().includes(search.toLowerCase()) || j.mosque.toLowerCase().includes(search.toLowerCase()) || j.city.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" || j.type === filter;
    return matchesSearch && matchesFilter;
  });

  const appliedJobIds = myApplications.map(a => a.jobId);

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center"><ShieldCheck className="text-emerald-50" size={18} /></div>
            <h1 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
          </button>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-900 to-stone-900 text-white">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cpath d='M30 0l30 30-30 30L0 30z' fill='none' stroke='%23fff' stroke-width='1'/%3E%3C/svg%3E")` }}></div>
        <div className="relative max-w-6xl mx-auto px-6 py-10">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/70 hover:text-white mb-4"><ArrowLeft size={14} /> Back to dashboard</button>
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 px-3 py-1 rounded-full text-xs uppercase tracking-wider mb-3">
            <Briefcase size={12} /> Jobs for scholars & imams
          </div>
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Find your next role</h2>
          <p className="text-emerald-100/90 max-w-xl">Every mosque on Amanah has been Charity Commission verified. Apply with one tap — your DBS and reviews come through automatically.</p>
        </div>
      </section>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-stone-200 mb-6">
          <button onClick={() => setTab("browse")} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === "browse" ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}>
            <span className="flex items-center gap-1.5"><Search size={14} /> Browse jobs <span className="bg-stone-100 text-stone-700 text-[10px] px-1.5 py-0.5 rounded-full ml-1">{MOCK_JOBS.length}</span></span>
          </button>
          <button onClick={() => setTab("applications")} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === "applications" ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}>
            <span className="flex items-center gap-1.5"><FileText size={14} /> My applications <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.5 rounded-full ml-1">{myApplications.length}</span></span>
          </button>
        </div>

        {tab === "browse" && (
          <>
            <div className="flex flex-col md:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                <input type="text" placeholder="Search by title, mosque, or city..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-300 bg-white focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
              </div>
              <div className="flex gap-2 bg-white border border-stone-300 rounded-xl p-1 overflow-x-auto">
                {[{ v: "all", l: "All" }, { v: "full-time", l: "Full-time" }, { v: "part-time", l: "Part-time" }, { v: "contract", l: "Contract" }, { v: "one-off", l: "One-off" }].map(f => (
                  <button key={f.v} onClick={() => setFilter(f.v)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${filter === f.v ? "bg-emerald-900 text-white" : "text-stone-600 hover:text-stone-900"}`}>{f.l}</button>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {filtered.map((job, i) => (
                <div key={job.id} style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.05}s both` }}>
                  <JobCard job={job} onClick={() => onJob(job)} applied={appliedJobIds.includes(job.id)} />
                </div>
              ))}
            </div>
            {filtered.length === 0 && (
              <div className="text-center py-16 text-stone-500">
                <Briefcase size={28} className="mx-auto mb-2 text-stone-300" />
                No jobs match your filters
              </div>
            )}
          </>
        )}

        {tab === "applications" && (
          <div className="space-y-3">
            {myApplications.map(app => {
              const job = MOCK_JOBS.find(j => j.id === app.jobId);
              if (!job) return null;
              return (
                <div key={app.id} className="bg-white border border-stone-200 rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                    <div className="flex items-start gap-3">
                      <Avatar scholar={{ initials: job.mosqueInitials, avatarGradient: job.mosqueGradient }} size="md" />
                      <div>
                        <h4 className="text-base font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{job.title}</h4>
                        <p className="text-sm text-stone-600">{job.mosque} · {job.city}</p>
                      </div>
                    </div>
                    <AppStatusPill status={app.status} />
                  </div>
                  <div className="bg-stone-50 rounded-lg p-3 mb-3">
                    <p className="text-xs text-stone-500 uppercase tracking-wider mb-1">Your message</p>
                    <p className="text-sm text-stone-700 italic line-clamp-2">"{app.message}"</p>
                  </div>
                  <div className="flex items-center justify-between text-xs text-stone-500">
                    <span>Applied {app.appliedDate}</span>
                    <button onClick={() => onJob(job)} className="text-emerald-800 font-medium hover:underline">View job →</button>
                  </div>
                </div>
              );
            })}
            {myApplications.length === 0 && (
              <div className="text-center py-16 text-stone-500">
                <FileText size={28} className="mx-auto mb-2 text-stone-300" />
                You haven't applied to anything yet
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

// ==================== JOB DETAIL (for imams) ====================
const JobDetail = ({ job, onBack, onApply, applied }) => (
  <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
    <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center"><ShieldCheck className="text-emerald-50" size={18} /></div>
        <h1 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
      </div>
    </header>

    <section className={`relative overflow-hidden bg-gradient-to-br ${job.mosqueGradient}`}>
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cpath d='M30 0l30 30-30 30L0 30z' fill='none' stroke='%23fff' stroke-width='1'/%3E%3C/svg%3E")` }}></div>
      <div className="relative max-w-5xl mx-auto px-6 py-10 text-white">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/80 hover:text-white mb-6"><ArrowLeft size={14} /> Back to jobs</button>
        <div className="flex items-start gap-3 flex-wrap mb-3">
          <JobTypePill type={job.type} />
          {job.urgent && <span className="inline-flex items-center gap-1 bg-rose-400 text-rose-950 text-[10px] px-2 py-1 rounded-full font-semibold uppercase tracking-wider"><Flame size={10} /> Urgent</span>}
          {job.featured && <span className="inline-flex items-center gap-1 bg-amber-400 text-amber-950 text-[10px] px-2 py-1 rounded-full font-semibold uppercase tracking-wider"><Flame size={10} /> Featured</span>}
        </div>
        <h2 className="text-3xl md:text-5xl font-semibold tracking-tight mb-3" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{job.title}</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-white/90">
            <Building2 size={15} />
            <span className="font-medium">{job.mosque}</span>
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-white/20 backdrop-blur-sm border border-white/30 rounded-full">
              <ShieldCheck size={11} /> Verified
            </span>
          </div>
          <span className="text-white/70">·</span>
          <span className="text-sm text-white/90 flex items-center gap-1"><MapPin size={13} /> {job.city}</span>
        </div>
      </div>
    </section>

    <main className="max-w-5xl mx-auto px-6 py-8">
      <div className="grid md:grid-cols-3 gap-6">
        {/* Left: main content */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white border border-stone-200 rounded-2xl p-6">
            <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">About this role</h3>
            <p className="text-stone-800 leading-relaxed">{job.description}</p>
          </div>

          <div className="bg-white border border-stone-200 rounded-2xl p-6">
            <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">Responsibilities</h3>
            <ul className="space-y-2">
              {job.responsibilities.map(r => (
                <li key={r} className="flex gap-2 text-sm text-stone-800">
                  <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white border border-stone-200 rounded-2xl p-6">
            <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">Requirements</h3>
            <ul className="space-y-2">
              {job.requirements.map(r => (
                <li key={r} className="flex gap-2 text-sm text-stone-800">
                  <span className="text-emerald-700 font-bold flex-shrink-0 mt-0.5">•</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="text-emerald-800" size={20} />
              </div>
              <div>
                <h4 className="font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>This mosque is verified</h4>
                <p className="text-sm text-stone-700 leading-relaxed">{job.mosque} has been Charity Commission verified by Amanah. Trustees confirmed, safeguarding policy in place, and documents validated.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: apply box */}
        <div>
          <div className="bg-white border border-stone-200 rounded-2xl p-5 sticky top-24 shadow-sm">
            <div className="mb-5 pb-5 border-b border-stone-100">
              <p className="text-3xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{job.pay}</p>
              <p className="text-xs text-stone-500">{job.commitment}</p>
            </div>

            <div className="space-y-3 mb-5 text-sm">
              <div className="flex justify-between">
                <span className="text-stone-500">Start date</span>
                <span className="text-stone-900 font-medium text-right">{job.startDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Duration</span>
                <span className="text-stone-900">{job.duration}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Denomination</span>
                <span className="text-stone-900 text-right text-xs">{job.denomination}</span>
              </div>
            </div>

            {applied ? (
              <button disabled className="w-full bg-emerald-100 text-emerald-800 py-3.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2">
                <CheckCircle2 size={15} /> Already applied
              </button>
            ) : (
              <button onClick={() => onApply(job)} className="w-full bg-emerald-900 hover:bg-emerald-800 text-white py-3.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.01] active:scale-95 shadow-lg shadow-emerald-900/20 inline-flex items-center justify-center gap-2">
                Apply with one tap <ArrowRight size={15} />
              </button>
            )}

            <div className="mt-5 pt-5 border-t border-stone-100 space-y-2 text-xs text-stone-600">
              <p className="flex items-center gap-2"><ShieldCheck size={12} className="text-emerald-700" /> Your profile & reviews sent automatically</p>
              <p className="flex items-center gap-2"><FileCheck size={12} className="text-emerald-700" /> DBS status verified by Amanah</p>
              <p className="flex items-center gap-2"><Eye size={12} className="text-emerald-700" /> You'll be notified when viewed</p>
            </div>

            <p className="text-xs text-stone-500 text-center mt-4">{job.applicationsCount} people have applied so far</p>
          </div>
        </div>
      </div>
    </main>
  </div>
);

// ==================== APPLY TO JOB ====================
const ApplyToJob = ({ job, onBack, onSubmit }) => {
  const [message, setMessage] = useState("");
  const [availableDate, setAvailableDate] = useState("");
  const [includeProfile, setIncludeProfile] = useState(true);
  const [includeReviews, setIncludeReviews] = useState(true);

  const canSubmit = message.length >= 30 && availableDate;

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center"><ShieldCheck className="text-emerald-50" size={18} /></div>
          <h1 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-6"><ArrowLeft size={14} /> Back to job</button>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Apply to {job.title}</h1>
          <p className="text-stone-600 text-sm">{job.mosque} · {job.city}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          <div className="md:col-span-2 bg-white border border-stone-200 rounded-2xl p-6">
            <div className="mb-6">
              <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Your message to the mosque</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={8}
                placeholder="Assalamu alaikum. I'm very interested in this position because..."
                className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm resize-none leading-relaxed"
              />
              <p className="text-xs text-stone-500 mt-1">{message.length} characters · minimum 30 · mention your relevant experience</p>
            </div>

            <div className="mb-6">
              <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Earliest available date</label>
              <input type="date" value={availableDate} onChange={e => setAvailableDate(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-stone-700 uppercase tracking-wider mb-2">Include with your application</p>
              <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${includeProfile ? "bg-emerald-50 border-emerald-200" : "bg-white border-stone-200"}`}>
                <input type="checkbox" checked={includeProfile} onChange={e => setIncludeProfile(e.target.checked)} className="mt-0.5 accent-emerald-800" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-stone-900">My Amanah profile</p>
                  <p className="text-xs text-stone-600 mt-0.5">DBS, Right to Work, qualifications, specialties, languages</p>
                </div>
                <ShieldCheck className="text-emerald-700 flex-shrink-0" size={16} />
              </label>
              <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${includeReviews ? "bg-emerald-50 border-emerald-200" : "bg-white border-stone-200"}`}>
                <input type="checkbox" checked={includeReviews} onChange={e => setIncludeReviews(e.target.checked)} className="mt-0.5 accent-emerald-800" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-stone-900">My reviews (4.9 ★ · 142 reviews)</p>
                  <p className="text-xs text-stone-600 mt-0.5">From verified bookings across Amanah</p>
                </div>
                <Star className="text-amber-500 flex-shrink-0" size={16} fill="currentColor" />
              </label>
            </div>

            <button onClick={() => onSubmit({ job, message, availableDate, includeProfile, includeReviews })} disabled={!canSubmit} className="w-full mt-6 bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white py-3 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 transition-all hover:scale-[1.01] disabled:hover:scale-100">
              <Send size={15} /> Submit application
            </button>
          </div>

          {/* Right: context */}
          <div>
            <div className="bg-white border border-stone-200 rounded-2xl p-5 sticky top-24">
              <p className="text-xs text-stone-500 uppercase tracking-wider font-medium mb-3">Applying as</p>
              <div className="flex items-center gap-3 mb-4">
                <Avatar scholar={{ initials: "YR", avatarGradient: "from-emerald-400 to-emerald-700" }} size="md" />
                <div>
                  <p className="text-sm font-semibold text-stone-900">Ustadh Yusuf Al-Rahman</p>
                  <p className="text-xs text-stone-500 flex items-center gap-1"><ShieldCheck size={10} className="text-emerald-700" /> Verified</p>
                </div>
              </div>

              <div className="space-y-2 text-xs text-stone-600 pt-4 border-t border-stone-100">
                <p className="flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-700" /> DBS Verified (Nov 2025)</p>
                <p className="flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-700" /> Right to Work verified</p>
                <p className="flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-700" /> Al-Azhar graduate</p>
                <p className="flex items-center gap-2"><Star size={12} className="text-amber-500" fill="currentColor" /> 4.9 rating (142 reviews)</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

// ==================== APPLICATION SUBMITTED ====================
const ApplicationSubmitted = ({ application, onJobs, onHome }) => (
  <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-stone-50 to-amber-50 flex items-center justify-center p-6" style={{ fontFamily: "'Inter', sans-serif" }}>
    <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-stone-200 p-8 text-center" style={{ animation: "bounceIn 0.6s ease-out" }}>
      <div className="relative inline-block mb-5">
        <div className="absolute inset-0 bg-emerald-300 rounded-full blur-xl opacity-40"></div>
        <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-700 shadow-lg">
          <Send className="text-white" size={28} strokeWidth={2} />
        </div>
      </div>
      <h2 className="text-2xl font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Application sent</h2>
      <p className="text-stone-700 leading-relaxed mb-5">Your application for <span className="font-semibold">{application.job.title}</span> has been sent to <span className="font-semibold">{application.job.mosque}</span>.</p>
      <div className="bg-stone-50 rounded-xl p-4 text-left mb-5 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-stone-500">Status</span><AppStatusPill status="submitted" /></div>
        <div className="flex justify-between"><span className="text-stone-500">Application ID</span><span className="text-stone-900 font-mono text-xs">APP-{Date.now().toString().slice(-6)}</span></div>
      </div>
      <p className="text-xs text-stone-600 mb-5">You'll get a notification when the mosque views your application and when they respond.</p>
      <button onClick={onJobs} className="w-full bg-emerald-900 hover:bg-emerald-800 text-white py-3 rounded-xl text-sm font-medium mb-2 transition-all hover:scale-[1.02]">
        Browse more jobs
      </button>
      <button onClick={onHome} className="w-full border border-stone-300 hover:border-stone-400 text-stone-700 py-2.5 rounded-xl text-sm font-medium">
        Back to dashboard
      </button>
    </div>
    <style>{`@keyframes bounceIn { 0% { opacity: 0; transform: scale(0.9); } 50% { transform: scale(1.02); } 100% { opacity: 1; transform: scale(1); } }`}</style>
  </div>
);

// ==================== MOSQUE: POST A JOB ====================
const PostJob = ({ onBack, onComplete, mosqueName, mosqueCity }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    title: "", type: "part-time", commitment: "", pay: "",
    startDate: "", duration: "",
    description: "", responsibilities: [""], requirements: [""],
    denomination: "", languages: [""]
  });

  const updateArrayItem = (field, i, value) => {
    const arr = [...form[field]];
    arr[i] = value;
    setForm({ ...form, [field]: arr });
  };
  const addArrayItem = (field) => setForm({ ...form, [field]: [...form[field], ""] });
  const removeArrayItem = (field, i) => setForm({ ...form, [field]: form[field].filter((_, idx) => idx !== i) });

  const canProceed = {
    1: form.title.length >= 10 && form.type && form.commitment && form.pay,
    2: form.startDate && form.duration && form.description.length >= 50,
    3: form.responsibilities.filter(r => r.trim()).length >= 1 && form.requirements.filter(r => r.trim()).length >= 1
  }[step];

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center"><ShieldCheck className="text-emerald-50" size={18} /></div>
          <h1 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-6"><ArrowLeft size={14} /> Back</button>

        <div className="mb-2">
          <h1 className="text-3xl font-semibold text-stone-900 tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Post a job</h1>
          <p className="text-stone-600 mt-1">Reach verified, DBS-checked imams and scholars across the UK.</p>
        </div>

        <div className="mt-8 mb-8">
          <div className="flex items-center gap-3 mb-3">
            {[1, 2, 3].map(n => (
              <div key={n} className="flex items-center gap-3 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${step >= n ? "bg-emerald-900 text-white" : "bg-stone-200 text-stone-500"}`}>{step > n ? <CheckCircle2 size={14} /> : n}</div>
                {n < 3 && <div className={`flex-1 h-0.5 transition-all ${step > n ? "bg-emerald-900" : "bg-stone-200"}`}></div>}
              </div>
            ))}
          </div>
          <p className="text-xs text-stone-500 text-center">{["Basics", "Dates & description", "Requirements"][step - 1]}</p>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-6">
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Job title</label>
                <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="e.g. Friday Jumu'ah Imam" className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                <p className="text-xs text-stone-500 mt-1">Be specific — "Taraweeh Imam for Ramadan 1447" beats "Imam needed"</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-2 uppercase tracking-wider">Type of role</label>
                <div className="grid grid-cols-4 gap-2">
                  {[{v:"full-time",l:"Full-time"},{v:"part-time",l:"Part-time"},{v:"contract",l:"Contract"},{v:"one-off",l:"One-off"}].map(opt => (
                    <button key={opt.v} onClick={() => setForm({...form, type: opt.v})} className={`py-2.5 rounded-xl border text-sm font-medium transition-colors ${form.type === opt.v ? "bg-emerald-900 text-white border-emerald-900" : "bg-white text-stone-700 border-stone-300 hover:border-stone-400"}`}>
                      {opt.l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Time commitment</label>
                <input value={form.commitment} onChange={e => setForm({...form, commitment: e.target.value})} placeholder="e.g. Every Friday 12:30–14:00" className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Compensation</label>
                <input value={form.pay} onChange={e => setForm({...form, pay: e.target.value})} placeholder="e.g. £120 per khutbah · or £32,000/year" className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                <p className="text-xs text-stone-500 mt-1">Jobs with clear pay get 5× more applications</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Start date</label>
                  <input value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} placeholder="e.g. 1 May 2026" className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Duration</label>
                  <input value={form.duration} onChange={e => setForm({...form, duration: e.target.value})} placeholder="e.g. 30 nights · Permanent" className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">About this role</label>
                <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={6} placeholder="Describe the role, your community, and what kind of scholar would thrive here..." className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm resize-none leading-relaxed" />
                <p className="text-xs text-stone-500 mt-1">{form.description.length} characters · minimum 50</p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-2 uppercase tracking-wider">Key responsibilities</label>
                <div className="space-y-2">
                  {form.responsibilities.map((r, i) => (
                    <div key={i} className="flex gap-2">
                      <input value={r} onChange={e => updateArrayItem("responsibilities", i, e.target.value)} placeholder={i === 0 ? "e.g. Deliver 15-20 min khutbah each Friday" : "Add another..."} className="flex-1 px-4 py-2.5 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                      {form.responsibilities.length > 1 && <button onClick={() => removeArrayItem("responsibilities", i)} className="px-3 bg-stone-100 hover:bg-rose-50 hover:text-rose-600 rounded-lg"><X size={14} /></button>}
                    </div>
                  ))}
                </div>
                <button onClick={() => addArrayItem("responsibilities")} className="mt-2 text-sm text-emerald-800 font-medium hover:underline inline-flex items-center gap-1"><Plus size={14} /> Add another</button>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-2 uppercase tracking-wider">Requirements</label>
                <div className="space-y-2">
                  {form.requirements.map((r, i) => (
                    <div key={i} className="flex gap-2">
                      <input value={r} onChange={e => updateArrayItem("requirements", i, e.target.value)} placeholder={i === 0 ? "e.g. Enhanced DBS, minimum 3 years' experience" : "Add another..."} className="flex-1 px-4 py-2.5 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                      {form.requirements.length > 1 && <button onClick={() => removeArrayItem("requirements", i)} className="px-3 bg-stone-100 hover:bg-rose-50 hover:text-rose-600 rounded-lg"><X size={14} /></button>}
                    </div>
                  ))}
                </div>
                <button onClick={() => addArrayItem("requirements")} className="mt-2 text-sm text-emerald-800 font-medium hover:underline inline-flex items-center gap-1"><Plus size={14} /> Add another</button>
              </div>

              <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 flex gap-3">
                <Info className="text-sky-800 flex-shrink-0 mt-0.5" size={16} />
                <p className="text-xs text-sky-900 leading-relaxed">All applicants on Amanah are already DBS-checked, so you don't need to list "DBS required" — it's implicit.</p>
              </div>
            </div>
          )}

          <div className="flex justify-between mt-8 pt-6 border-t border-stone-100">
            <button onClick={() => step > 1 ? setStep(step - 1) : onBack()} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900">{step > 1 ? "Back" : "Cancel"}</button>
            {step < 3 ? (
              <button onClick={() => setStep(step + 1)} disabled={!canProceed} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white px-6 py-2.5 rounded-xl text-sm font-medium inline-flex items-center gap-2 transition-all hover:scale-[1.02] disabled:hover:scale-100">
                Continue <ArrowRight size={14} />
              </button>
            ) : (
              <button onClick={() => onComplete(form)} disabled={!canProceed} className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white px-6 py-2.5 rounded-xl text-sm font-medium inline-flex items-center gap-2 shadow-lg shadow-emerald-900/30 transition-all hover:scale-[1.02] disabled:hover:scale-100">
                <Zap size={14} /> Post job
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

// ==================== SCHEDULING ====================

// Scholar's weekly availability pattern (by day of week, 0=Sun, 1=Mon...)
const DEFAULT_AVAILABILITY = {
  0: [],
  1: [{ start: "17:00", end: "21:00" }],
  2: [{ start: "17:00", end: "21:00" }],
  3: [],
  4: [{ start: "18:00", end: "21:00" }],
  5: [],
  6: [{ start: "10:00", end: "14:00" }]
};

// Booked slots — date string (YYYY-MM-DD) + time (HH:MM)
const DEFAULT_BOOKINGS = [
  { date: "2026-04-23", time: "18:00", duration: 30, studentName: "Ahmad K.", package: "Standard", type: "Qur'an · Tajweed" },
  { date: "2026-04-23", time: "18:30", duration: 30, studentName: "Sara B.", package: "Standard", type: "Qur'an · Reading" },
  { date: "2026-04-25", time: "10:00", duration: 30, studentName: "Yusuf H.", package: "Premium", type: "Hifz" },
  { date: "2026-04-25", time: "10:30", duration: 30, studentName: "Mariam I.", package: "Standard", type: "Qur'an · Reading" },
  { date: "2026-04-28", time: "17:00", duration: 30, studentName: "Khalid R.", package: "Basic", type: "Arabic" },
  { date: "2026-04-30", time: "18:00", duration: 45, studentName: "Hassan M.", package: "Premium", type: "Hifz" }
];

const DAYS_OF_WEEK = [
  { id: 0, short: "Sun", long: "Sunday" },
  { id: 1, short: "Mon", long: "Monday" },
  { id: 2, short: "Tue", long: "Tuesday" },
  { id: 3, short: "Wed", long: "Wednesday" },
  { id: 4, short: "Thu", long: "Thursday" },
  { id: 5, short: "Fri", long: "Friday" },
  { id: 6, short: "Sat", long: "Saturday" }
];

// Helper: format a date as YYYY-MM-DD
const toDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// Helper: is date today?
const isToday = (date) => toDateKey(date) === toDateKey(new Date());

// Helper: generate 30-minute time slots for a range
const generateSlots = (start, end, intervalMin = 30) => {
  const [sH, sM] = start.split(":").map(Number);
  const [eH, eM] = end.split(":").map(Number);
  const startMin = sH * 60 + sM;
  const endMin = eH * 60 + eM;
  const slots = [];
  for (let m = startMin; m < endMin; m += intervalMin) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }
  return slots;
};

// Helper: get available slots for a specific date
const getSlotsForDate = (date, availability, bookings) => {
  const dayOfWeek = date.getDay();
  const pattern = availability[dayOfWeek] || [];
  if (pattern.length === 0) return [];

  const dateKey = toDateKey(date);
  const bookedTimes = bookings.filter(b => b.date === dateKey).map(b => b.time);

  const allSlots = [];
  pattern.forEach(window => {
    const slots = generateSlots(window.start, window.end, 30);
    slots.forEach(time => {
      allSlots.push({
        time,
        booked: bookedTimes.includes(time)
      });
    });
  });
  return allSlots;
};

// Helper: total weekly hours from pattern
const calculateWeeklyHours = (availability) => {
  let total = 0;
  Object.values(availability).forEach(windows => {
    windows.forEach(w => {
      const [sH, sM] = w.start.split(":").map(Number);
      const [eH, eM] = w.end.split(":").map(Number);
      total += (eH * 60 + eM - sH * 60 - sM) / 60;
    });
  });
  return total;
};

// ==================== AVAILABILITY EDITOR (SCHOLAR) ====================
const AvailabilityEditor = ({ availability, onChange, onBack }) => {
  const [localAvail, setLocalAvail] = useState(availability);
  const [editingDay, setEditingDay] = useState(null);
  const [tempStart, setTempStart] = useState("09:00");
  const [tempEnd, setTempEnd] = useState("17:00");

  const addWindow = (dayId) => {
    const updated = { ...localAvail };
    updated[dayId] = [...(updated[dayId] || []), { start: tempStart, end: tempEnd }];
    setLocalAvail(updated);
    setEditingDay(null);
  };

  const removeWindow = (dayId, idx) => {
    const updated = { ...localAvail };
    updated[dayId] = updated[dayId].filter((_, i) => i !== idx);
    setLocalAvail(updated);
  };

  const copyFromDay = (sourceDayId, targetDayIds) => {
    const updated = { ...localAvail };
    targetDayIds.forEach(id => {
      updated[id] = [...(localAvail[sourceDayId] || [])];
    });
    setLocalAvail(updated);
  };

  const weeklyHours = calculateWeeklyHours(localAvail);

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-5 md:px-6 py-3.5 md:py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center"><ShieldCheck className="text-emerald-50" size={18} /></div>
          <h1 className="text-base md:text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 md:px-6 py-6 md:py-8">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-5 md:mb-6"><ArrowLeft size={14} /> Back</button>

        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>My availability</h1>
            <p className="text-stone-600 text-sm md:text-base">Set your weekly teaching hours. Students can only book during these times.</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
            <p className="text-xs text-emerald-700 uppercase tracking-wider font-medium">Weekly hours</p>
            <p className="text-xl font-semibold text-emerald-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{weeklyHours}h</p>
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
          {DAYS_OF_WEEK.map((day, i) => {
            const windows = localAvail[day.id] || [];
            const isEditing = editingDay === day.id;

            return (
              <div key={day.id} className={`p-4 md:p-5 ${i < 6 ? "border-b border-stone-100" : ""}`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-semibold text-xs uppercase ${windows.length > 0 ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-400"}`}>
                      {day.short}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-stone-900">{day.long}</p>
                      <p className="text-xs text-stone-500">
                        {windows.length === 0 ? "Unavailable" : `${windows.length} time block${windows.length > 1 ? "s" : ""}`}
                      </p>
                    </div>
                  </div>
                  {!isEditing && (
                    <button onClick={() => setEditingDay(day.id)} className="text-xs text-emerald-800 font-medium hover:underline inline-flex items-center gap-1">
                      <Plus size={12} /> Add hours
                    </button>
                  )}
                </div>

                {windows.length > 0 && (
                  <div className="flex flex-wrap gap-2 ml-13">
                    {windows.map((w, idx) => (
                      <div key={idx} className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                        <Clock size={12} className="text-emerald-700" />
                        <span className="text-sm text-emerald-900 font-medium">{w.start} – {w.end}</span>
                        <button onClick={() => removeWindow(day.id, idx)} className="text-emerald-600 hover:text-rose-600 ml-1"><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}

                {isEditing && (
                  <div className="mt-3 pt-3 border-t border-stone-100 bg-stone-50 -mx-4 md:-mx-5 px-4 md:px-5 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-stone-600">From</span>
                      <input type="time" value={tempStart} onChange={e => setTempStart(e.target.value)} className="px-3 py-1.5 rounded-lg border border-stone-300 text-sm bg-white" />
                      <span className="text-xs text-stone-600">to</span>
                      <input type="time" value={tempEnd} onChange={e => setTempEnd(e.target.value)} className="px-3 py-1.5 rounded-lg border border-stone-300 text-sm bg-white" />
                      <button onClick={() => addWindow(day.id)} className="bg-emerald-900 hover:bg-emerald-800 text-white px-4 py-1.5 rounded-lg text-sm font-medium">Add</button>
                      <button onClick={() => setEditingDay(null)} className="text-sm text-stone-500 hover:text-stone-900 px-2">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onBack} className="px-4 py-2.5 text-sm text-stone-600 hover:text-stone-900">Cancel</button>
          <button onClick={() => onChange(localAvail)} className="bg-emerald-900 hover:bg-emerald-800 text-white px-6 py-2.5 rounded-xl text-sm font-medium shadow-lg shadow-emerald-900/20 inline-flex items-center gap-2">
            <CheckCircle2 size={14} /> Save availability
          </button>
        </div>

        <div className="mt-6 bg-sky-50 border border-sky-200 rounded-xl p-4 flex gap-3">
          <Info className="text-sky-800 flex-shrink-0 mt-0.5" size={16} />
          <p className="text-xs text-sky-900 leading-relaxed">Tip: set recurring availability for the whole week, and block specific dates (holidays, Ramadan) from the "My schedule" view.</p>
        </div>
      </main>
    </div>
  );
};

// ==================== SCHEDULE VIEW (SCHOLAR'S UPCOMING BOOKINGS) ====================
const ScheduleView = ({ availability, bookings, onBack, onEditAvailability }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Generate days for the current month
  const getMonthDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];

    // Padding days at start
    const startPadding = firstDay.getDay();
    for (let i = 0; i < startPadding; i++) {
      days.push(null);
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }

    return days;
  };

  const monthDays = getMonthDays();
  const monthLabel = currentMonth.toLocaleString("en-GB", { month: "long", year: "numeric" });

  const selectedDateBookings = bookings.filter(b => b.date === toDateKey(selectedDate));
  const selectedDateSlots = getSlotsForDate(selectedDate, availability, bookings);

  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-5 md:px-6 py-3.5 md:py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center"><ShieldCheck className="text-emerald-50" size={18} /></div>
          <h1 className="text-base md:text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 md:px-6 py-6 md:py-8">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-5 md:mb-6"><ArrowLeft size={14} /> Back</button>

        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>My schedule</h1>
            <p className="text-stone-600 text-sm md:text-base">Your upcoming sessions & availability</p>
          </div>
          <button onClick={onEditAvailability} className="bg-white border border-stone-300 hover:border-emerald-500 text-stone-700 px-4 py-2.5 rounded-xl text-sm font-medium inline-flex items-center gap-2">
            <Settings size={14} /> Edit availability
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {/* Calendar */}
          <div className="md:col-span-2 bg-white border border-stone-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="p-2 hover:bg-stone-100 rounded-lg"><ArrowLeft size={16} /></button>
              <h3 className="text-base md:text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{monthLabel}</h3>
              <button onClick={nextMonth} className="p-2 hover:bg-stone-100 rounded-lg"><ArrowRight size={16} /></button>
            </div>

            {/* Day of week headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {DAYS_OF_WEEK.map(d => (
                <div key={d.id} className="text-center text-[10px] uppercase tracking-wider text-stone-500 font-medium py-1">
                  {d.short}
                </div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 gap-1">
              {monthDays.map((date, i) => {
                if (!date) return <div key={i}></div>;
                const dateKey = toDateKey(date);
                const dayBookings = bookings.filter(b => b.date === dateKey);
                const hasSlots = (availability[date.getDay()] || []).length > 0;
                const isSelected = toDateKey(selectedDate) === dateKey;
                const isCurrentDay = isToday(date);

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(date)}
                    className={`aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-all relative ${
                      isSelected ? "bg-emerald-900 text-white" :
                      isCurrentDay ? "bg-emerald-50 text-emerald-900 font-semibold" :
                      hasSlots ? "hover:bg-stone-100 text-stone-900" :
                      "text-stone-400 hover:bg-stone-50"
                    }`}
                  >
                    <span>{date.getDate()}</span>
                    {dayBookings.length > 0 && (
                      <div className={`absolute bottom-1 flex gap-0.5`}>
                        {dayBookings.slice(0, 3).map((_, bi) => (
                          <span key={bi} className={`w-1 h-1 rounded-full ${isSelected ? "bg-white" : "bg-amber-500"}`}></span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-stone-100 flex flex-wrap gap-4 text-xs text-stone-600">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Has bookings</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Today</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-stone-300"></span> No availability</span>
            </div>
          </div>

          {/* Selected day details */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <p className="text-xs uppercase tracking-wider text-stone-500 font-medium mb-1">Selected day</p>
            <h3 className="text-base font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
              {selectedDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
            </h3>

            {selectedDateSlots.length === 0 ? (
              <div className="mt-5 text-center py-8">
                <Clock className="mx-auto mb-2 text-stone-300" size={24} />
                <p className="text-sm text-stone-500">You're not available on this day</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-stone-500 mb-3">
                  {selectedDateBookings.length} booking{selectedDateBookings.length !== 1 ? "s" : ""} · {selectedDateSlots.filter(s => !s.booked).length} free slots
                </p>

                {selectedDateBookings.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-stone-700 uppercase tracking-wider mb-2">Bookings</p>
                    <div className="space-y-2">
                      {selectedDateBookings.map((b, i) => (
                        <div key={i} className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-sm font-semibold text-stone-900">{b.time}</span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-white text-stone-700 rounded font-medium uppercase tracking-wider">{b.package}</span>
                          </div>
                          <p className="text-xs text-stone-700">{b.studentName}</p>
                          <p className="text-[11px] text-stone-500">{b.type} · {b.duration} min</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs font-medium text-stone-700 uppercase tracking-wider mb-2">All slots</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {selectedDateSlots.map(slot => (
                      <div key={slot.time} className={`text-center py-2 rounded-lg text-xs font-medium ${
                        slot.booked ? "bg-stone-200 text-stone-500 line-through" : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      }`}>
                        {slot.time}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

// ==================== DATE/TIME PICKER (FOR BOOKING FLOW) ====================
const DateTimePicker = ({ availability, bookings, selectedDate, selectedTime, onDateChange, onTimeChange }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const getMonthDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];

    const startPadding = firstDay.getDay();
    for (let i = 0; i < startPadding; i++) days.push(null);

    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  };

  const monthDays = getMonthDays();
  const monthLabel = currentMonth.toLocaleString("en-GB", { month: "long", year: "numeric" });

  const selectedDateObj = selectedDate ? new Date(selectedDate) : null;
  const slots = selectedDateObj ? getSlotsForDate(selectedDateObj, availability, bookings) : [];
  const availableSlots = slots.filter(s => !s.booked);

  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div>
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="p-2 hover:bg-white rounded-lg"><ArrowLeft size={14} /></button>
          <h4 className="text-sm font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{monthLabel}</h4>
          <button onClick={nextMonth} className="p-2 hover:bg-white rounded-lg"><ArrowRight size={14} /></button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAYS_OF_WEEK.map(d => (
            <div key={d.id} className="text-center text-[9px] uppercase tracking-wider text-stone-500 font-medium py-1">{d.short}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {monthDays.map((date, i) => {
            if (!date) return <div key={i}></div>;
            const dateKey = toDateKey(date);
            const isInPast = date < today;
            const daySlots = getSlotsForDate(date, availability, bookings);
            const hasAvailable = daySlots.some(s => !s.booked);
            const isSelected = selectedDate === dateKey;

            return (
              <button
                key={i}
                onClick={() => !isInPast && hasAvailable && onDateChange(dateKey)}
                disabled={isInPast || !hasAvailable}
                className={`aspect-square flex items-center justify-center rounded-lg text-xs md:text-sm transition-all ${
                  isSelected ? "bg-emerald-900 text-white font-semibold" :
                  isInPast || !hasAvailable ? "text-stone-300 cursor-not-allowed" :
                  "hover:bg-emerald-100 text-stone-900 cursor-pointer"
                }`}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <div>
          <p className="text-xs text-stone-500 uppercase tracking-wider font-medium mb-2">
            Available times for {selectedDateObj.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
          </p>
          {availableSlots.length > 0 ? (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
              {availableSlots.map(slot => (
                <button
                  key={slot.time}
                  onClick={() => onTimeChange(slot.time)}
                  className={`py-2.5 px-3 rounded-lg text-sm font-medium transition-colors ${
                    selectedTime === slot.time ? "bg-emerald-900 text-white border-2 border-emerald-900" : "bg-white border border-stone-300 text-stone-700 hover:border-emerald-500"
                  }`}
                >
                  {slot.time}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-500 text-center py-6">No slots available on this day</p>
          )}
        </div>
      )}
    </div>
  );
};

// ==================== USER ACCOUNT SYSTEM ====================

// Mock user data
const MOCK_USER = {
  name: "Aisha Khan",
  email: "aisha.khan@example.com",
  initials: "AK",
  avatarGradient: "from-rose-400 to-rose-700",
  city: "Birmingham",
  joinedDate: "March 2026",
  phone: "+44 7700 900145",
  notifications: { email: true, sms: false, whatsapp: true },
  students: [
    { id: 1, name: "Yusuf", age: 9, relation: "Son", notes: "Starting Qur'an properly, works on tajweed" },
    { id: 2, name: "Mariam", age: 7, relation: "Daughter", notes: "Learning Arabic alphabet" }
  ]
};

const MOCK_USER_BOOKINGS = [
  { id: "b-1", scholarName: "Ustadh Yusuf Al-Rahman", scholarId: 101, scholarGradient: "from-emerald-400 to-emerald-700", scholarInitials: "YR", package: "Standard", price: 90, date: "2026-04-24", time: "18:00", student: "Yusuf", status: "upcoming", type: "Qur'an · Tajweed", joinLink: "#" },
  { id: "b-2", scholarName: "Ustadha Aminah Bakr", scholarId: 105, scholarGradient: "from-pink-400 to-rose-700", scholarInitials: "AB", package: "Weekly", price: 120, date: "2026-04-26", time: "14:00", student: "Mariam", status: "upcoming", type: "Arabic", joinLink: "#" },
  { id: "b-3", scholarName: "Ustadh Yusuf Al-Rahman", scholarId: 101, scholarGradient: "from-emerald-400 to-emerald-700", scholarInitials: "YR", package: "Standard", price: 90, date: "2026-04-17", time: "18:00", student: "Yusuf", status: "completed", type: "Qur'an · Tajweed", reviewLeft: true },
  { id: "b-4", scholarName: "Ustadh Yusuf Al-Rahman", scholarId: 101, scholarGradient: "from-emerald-400 to-emerald-700", scholarInitials: "YR", package: "Standard", price: 90, date: "2026-04-10", time: "18:00", student: "Yusuf", status: "completed", type: "Qur'an · Tajweed", reviewLeft: true },
  { id: "b-5", scholarName: "Ustadha Aminah Bakr", scholarId: 105, scholarGradient: "from-pink-400 to-rose-700", scholarInitials: "AB", package: "Weekly", price: 120, date: "2026-04-19", time: "14:00", student: "Mariam", status: "completed", type: "Arabic", reviewLeft: false }
];

const MOCK_USER_DONATIONS = [
  { id: "d-1", campaign: "New roof for Masjid Al-Noor", creator: "Masjid Al-Noor", amount: 50, tip: 5, giftAid: 12.50, total: 67.50, date: "2026-04-15", anonymous: false, receiptId: "AMN-D-458912" },
  { id: "d-2", campaign: "Ramadan 1447 Iftar Programme", creator: "Blackburn Islamic Centre", amount: 120, tip: 0, giftAid: 30, total: 150, date: "2026-03-28", anonymous: true, receiptId: "AMN-D-445301" },
  { id: "d-3", campaign: "Help Ustadh Ibrahim study at Madinah", creator: "Ustadh Ibrahim Siddiqui", amount: 30, tip: 3, giftAid: 7.50, total: 40.50, date: "2026-03-12", anonymous: false, receiptId: "AMN-D-432089" },
  { id: "d-4", campaign: "New women's prayer hall", creator: "Masjid As-Salam", amount: 200, tip: 20, giftAid: 50, total: 270, date: "2026-02-04", anonymous: false, receiptId: "AMN-D-419763" }
];

const MOCK_SAVED_SCHOLARS = [101, 104, 105];
const MOCK_SAVED_CAMPAIGNS = [1, 2];

// ==================== USER SIGN UP / LOGIN ====================
const UserAuth = ({ mode = "login", onBack, onComplete, onSwitchMode }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", email: "", password: "", interest: "" });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const isSignUp = mode === "signup";

  const handleSignUp = async () => {
    setError(null);
    setLoading(true);
    const { data, error: authError } = await signUp(form.email, form.password, form.name, form.interest);
    if (authError) {
      setError(authError.message || "Something went wrong");
      setLoading(false);
      return;
    }
    // Success! data.user contains the new user
    onComplete(form);
  };

  const handleSignIn = async () => {
    setError(null);
    setLoading(true);
    const { data, error: authError } = await signIn(form.email, form.password);
    if (authError) {
      setError(authError.message || "Invalid email or password");
      setLoading(false);
      return;
    }
    onComplete(form);
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-5 md:p-6" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="w-full max-w-md">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-5 md:mb-6"><ArrowLeft size={14} /> Back to Amanah</button>

        <div className="text-center mb-6 md:mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-900 mb-4 shadow-lg">
            <ShieldCheck className="text-emerald-50" size={22} />
          </div>
          <h1 className="text-3xl font-semibold text-stone-900 tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 p-6 md:p-8 shadow-sm">
          {isSignUp && step === 1 && (
            <>
              <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Create your account</h2>
              <p className="text-sm text-stone-500 mb-6">Book scholars, track your giving, save favourites.</p>
              <div className="space-y-3">
                <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Your name" className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="Email" className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="Password (min 6 characters)" className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                <button onClick={() => form.name && form.email && form.password.length >= 6 && setStep(2)} disabled={!form.name || !form.email || form.password.length < 6} className="w-full bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white py-3 rounded-xl text-sm font-medium transition-all hover:scale-[1.01] disabled:hover:scale-100 inline-flex items-center justify-center gap-2">
                  Continue <ArrowRight size={14} />
                </button>
              </div>
              <p className="text-[11px] text-stone-500 text-center mt-4 leading-relaxed">By continuing, you agree to Amanah's Terms and Privacy Policy.</p>
            </>
          )}

          {isSignUp && step === 2 && (
            <>
              <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Assalamu alaikum, {form.name.split(" ")[0]}</h2>
              <p className="text-sm text-stone-500 mb-6">What brings you to Amanah?</p>
              <div className="space-y-2">
                {[
                  { v: "parent", l: "Qur'an / Arabic lessons for my kids", i: Baby },
                  { v: "adult", l: "Learning for myself", i: BookOpen },
                  { v: "family", l: "Nikah, janazah, or family event", i: HeartHandshake },
                  { v: "donate", l: "Support Muslim causes", i: HandCoins },
                  { v: "browse", l: "Just browsing for now", i: Search }
                ].map(opt => {
                  const Icon = opt.i;
                  return (
                    <button
                      key={opt.v}
                      onClick={() => setForm({...form, interest: opt.v})}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${form.interest === opt.v ? "bg-emerald-50 border-emerald-400" : "bg-white border-stone-200 hover:border-stone-400"}`}
                    >
                      <Icon size={18} className={form.interest === opt.v ? "text-emerald-800" : "text-stone-500"} />
                      <span className="text-sm text-stone-900 flex-1">{opt.l}</span>
                      {form.interest === opt.v && <CheckCircle2 size={16} className="text-emerald-700" />}
                    </button>
                  );
                })}
              </div>
              {error && <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">{error}</div>}
              <button onClick={handleSignUp} disabled={!form.interest || loading} className="w-full mt-5 bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white py-3 rounded-xl text-sm font-medium transition-all hover:scale-[1.01] disabled:hover:scale-100 inline-flex items-center justify-center gap-2">
                {loading ? "Creating account..." : <>Create account <CheckCircle2 size={14} /></>}
              </button>
            </>
          )}

          {!isSignUp && (
            <>
              <h2 className="text-xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Welcome back</h2>
              <p className="text-sm text-stone-500 mb-6">Sign in to manage your bookings and giving.</p>
              <div className="space-y-3">
                <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="Email" className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="Password" className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm" />
                {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">{error}</div>}
                <button onClick={handleSignIn} disabled={loading || !form.email || !form.password} className="w-full bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white py-3 rounded-xl text-sm font-medium transition-all hover:scale-[1.01] disabled:hover:scale-100">
                  {loading ? "Signing in..." : "Sign in"}
                </button>
              </div>
              <div className="text-center mt-3">
                <button className="text-sm text-stone-500 hover:text-stone-900">Forgot password?</button>
              </div>
            </>
          )}

          <div className="mt-6 pt-6 border-t border-stone-100 text-center">
            <p className="text-sm text-stone-600 mb-2">
              {isSignUp ? "Already have an account?" : "New to Amanah?"}
            </p>
            <button onClick={onSwitchMode} className="inline-flex items-center gap-1 text-sm text-emerald-800 font-medium hover:gap-2 transition-all">
              {isSignUp ? "Sign in" : "Create an account"} <ArrowRight size={14} />
            </button>
          </div>
        </div>

        <div className="mt-5 text-center text-xs text-stone-500">
          Are you a <button onClick={onBack} className="text-emerald-800 font-medium hover:underline">mosque</button> or <button onClick={onBack} className="text-emerald-800 font-medium hover:underline">scholar</button>? Different sign-in.
        </div>
      </div>
    </div>
  );
};

// ==================== USER DASHBOARD ====================
const UserDashboard = ({ profile, isDemo, onProfileUpdate, onLogout, onPublic, onBookAgain, onReview, onViewCampaign, onOpenMessages }) => {
  const [tab, setTab] = useState("bookings");
  const [editingProfile, setEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", city: "", phone: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Students (real, from Supabase)
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [addingStudent, setAddingStudent] = useState(false);
  const [studentForm, setStudentForm] = useState({ name: "", age: "", relation: "Son", notes: "" });
  const [savingStudent, setSavingStudent] = useState(false);

  // Notifications (live-saved to Supabase)
  const [notifications, setNotifications] = useState(profile?.notifications || { email: true, sms: false, whatsapp: true });

  // Load students when dashboard mounts (for real users only)
  useEffect(() => {
    if (isDemo) {
      // Demo mode: use mock data
      setStudents(MOCK_USER.students);
      setStudentsLoading(false);
    } else {
      getStudents().then(data => {
        setStudents(data);
        setStudentsLoading(false);
      });
    }
  }, [isDemo]);

  // Keep notifications in sync when profile prop changes
  useEffect(() => {
    if (profile?.notifications) setNotifications(profile.notifications);
  }, [profile]);

  // Toggle notification (saves to Supabase)
  const toggleNotification = async (key) => {
    if (isDemo) return; // demo mode ignores
    const updated = { ...notifications, [key]: !notifications[key] };
    setNotifications(updated); // optimistic update
    const { error } = await updateNotifications(updated);
    if (error) {
      // Roll back if it failed
      setNotifications(notifications);
      console.error("Failed to save notification preference:", error);
    }
  };

  // Add a new student
  const handleAddStudent = async () => {
    if (!studentForm.name.trim()) return;
    setSavingStudent(true);
    const { data, error } = await addStudent({
      name: studentForm.name.trim(),
      age: studentForm.age ? parseInt(studentForm.age) : null,
      relation: studentForm.relation,
      notes: studentForm.notes.trim() || null
    });
    setSavingStudent(false);
    if (error) {
      console.error("Failed to add student:", error);
      return;
    }
    setStudents([...students, data]);
    setStudentForm({ name: "", age: "", relation: "Son", notes: "" });
    setAddingStudent(false);
  };

  // Delete a student
  const handleDeleteStudent = async (id) => {
    if (!confirm("Remove this student?")) return;
    const { error } = await deleteStudent(id);
    if (error) {
      console.error("Failed to delete:", error);
      return;
    }
    setStudents(students.filter(s => s.id !== id));
  };

  // Use real profile data when available, fall back to mock for demo
  const user = profile ? {
    name: profile.name || profile.email?.split("@")[0] || "Friend",
    email: profile.email,
    initials: profile.avatar_initials || (profile.name || profile.email || "??").substring(0, 2).toUpperCase(),
    avatarGradient: profile.avatar_gradient || "from-emerald-400 to-emerald-700",
    city: profile.city || "",
    joinedDate: profile.joined_date ? new Date(profile.joined_date).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "Recently",
    phone: profile.phone || "",
    notifications: profile.notifications || { email: true, sms: false, whatsapp: true },
    students: []
  } : MOCK_USER;

  // For real users (not demo), start with no bookings/donations/saved. They're a new user.
  const upcomingBookings = isDemo ? MOCK_USER_BOOKINGS.filter(b => b.status === "upcoming") : [];
  const pastBookings = isDemo ? MOCK_USER_BOOKINGS.filter(b => b.status === "completed") : [];
  const donations = isDemo ? MOCK_USER_DONATIONS : [];
  const savedScholars = isDemo ? MOCK_SAVED_SCHOLARS : [];
  const savedCampaigns = isDemo ? MOCK_SAVED_CAMPAIGNS : [];
  const totalGiven = donations.reduce((s, d) => s + d.amount, 0);
  const totalGiftAid = donations.reduce((s, d) => s + d.giftAid, 0);

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-5 md:px-6 py-3.5 md:py-4 flex items-center justify-between">
          <button onClick={onPublic} className="flex items-center gap-2.5 md:gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-900 flex items-center justify-center shadow-md"><ShieldCheck className="text-emerald-50" size={18} /></div>
            <div className="text-left">
              <h1 className="text-base md:text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
              <p className="text-xs text-stone-500 hidden md:block">{user.name}</p>
            </div>
          </button>
          <div className="flex items-center gap-2">
            <Avatar scholar={{ initials: user.initials, avatarGradient: user.avatarGradient }} size="sm" />
            <button onClick={onLogout} className="text-sm text-stone-600 hover:text-stone-900 p-2"><LogOut size={15} /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-5 md:px-6 flex gap-1 border-t border-stone-100 overflow-x-auto scrollbar-hide">
          {[
            { v: "bookings", l: "Bookings", i: Calendar, badge: upcomingBookings.length },
            { v: "donations", l: "My giving", i: HandCoins, badge: null },
            { v: "saved", l: "Saved", i: Heart, badge: savedScholars.length + savedCampaigns.length },
            { v: "messages", l: "Messages", i: MessageCircle, badge: isDemo ? 2 : 0 },
            { v: "account", l: "Account", i: Settings, badge: null }
          ].map(t => {
            const Icon = t.i;
            const isActive = tab === t.v;
            return (
              <button
                key={t.v}
                onClick={() => t.v === "messages" ? onOpenMessages() : setTab(t.v)}
                className={`px-3 md:px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${isActive ? "border-emerald-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}
              >
                <span className="flex items-center gap-1.5"><Icon size={14} /> {t.l} {t.badge > 0 && <span className="bg-emerald-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-0.5">{t.badge}</span>}</span>
              </button>
            );
          })}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 md:px-6 py-6 md:py-8">
        {tab === "bookings" && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Assalamu alaikum, {user.name.split(" ")[0]}</h2>
              <p className="text-stone-600 text-sm md:text-base">
                {upcomingBookings.length > 0 ? `You have ${upcomingBookings.length} upcoming sessions.` : "Welcome to Amanah. Ready to find your first scholar?"}
              </p>
            </div>

            {/* Empty state for new users with no bookings */}
            {upcomingBookings.length === 0 && pastBookings.length === 0 && (
              <div className="bg-white border border-stone-200 rounded-2xl p-8 md:p-12 text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-50 mb-4">
                  <BookOpen className="text-emerald-700" size={24} />
                </div>
                <h3 className="text-lg font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>No bookings yet</h3>
                <p className="text-sm text-stone-500 mb-5 max-w-sm mx-auto">Browse verified Qur'an tutors, Arabic teachers, imams and counsellors. All DBS-checked, all a click away.</p>
                <button onClick={onPublic} className="bg-emerald-900 hover:bg-emerald-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors inline-flex items-center gap-2">
                  <Search size={14} /> Find a scholar
                </button>
              </div>
            )}

            {/* Upcoming */}
            {upcomingBookings.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">Upcoming</h3>
                <div className="space-y-3">
                  {upcomingBookings.map(b => {
                    const dateObj = new Date(b.date);
                    const isTomorrow = toDateKey(new Date(Date.now() + 86400000)) === b.date;
                    const isToday_ = toDateKey(new Date()) === b.date;
                    return (
                      <div key={b.id} className="bg-white border border-stone-200 rounded-2xl p-4 md:p-5">
                        <div className="flex items-start gap-3 md:gap-4">
                          <Avatar scholar={{ initials: b.scholarInitials, avatarGradient: b.scholarGradient }} size="md" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                              <h4 className="text-base font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{b.scholarName}</h4>
                              {(isToday_ || isTomorrow) && (
                                <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-semibold uppercase tracking-wider">{isToday_ ? "Today" : "Tomorrow"}</span>
                              )}
                            </div>
                            <p className="text-xs text-stone-500 mb-2">{b.type} · for {b.student} · {b.package} package</p>
                            <div className="flex items-center gap-3 text-sm text-stone-700 mb-3 flex-wrap">
                              <span className="flex items-center gap-1"><Calendar size={13} /> {dateObj.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span>
                              <span className="flex items-center gap-1"><Clock size={13} /> {b.time}</span>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              <button className="bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5">
                                <Play size={13} /> Join session
                              </button>
                              <button className="bg-white border border-stone-300 text-stone-700 text-sm font-medium px-4 py-2 rounded-lg hover:border-stone-400">Reschedule</button>
                              <button className="text-sm text-stone-500 hover:text-rose-700 px-2 py-2">Cancel</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Past */}
            {pastBookings.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">Past sessions</h3>
                <div className="space-y-3">
                  {pastBookings.map(b => {
                    const dateObj = new Date(b.date);
                    return (
                      <div key={b.id} className="bg-white border border-stone-200 rounded-2xl p-4 md:p-5">
                        <div className="flex items-start gap-3 md:gap-4">
                          <Avatar scholar={{ initials: b.scholarInitials, avatarGradient: b.scholarGradient }} size="md" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <h4 className="text-base font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{b.scholarName}</h4>
                              <span className="text-[10px] px-2 py-0.5 bg-stone-100 text-stone-700 rounded-full uppercase tracking-wider font-medium">Completed</span>
                            </div>
                            <p className="text-xs text-stone-500 mb-2">{b.type} · for {b.student} · {dateObj.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                            <div className="flex gap-2 flex-wrap">
                              <button onClick={() => onBookAgain(b.scholarId)} className="text-sm text-emerald-800 font-medium hover:underline inline-flex items-center gap-1">Book again</button>
                              {!b.reviewLeft && (
                                <>
                                  <span className="text-stone-300">·</span>
                                  <button onClick={() => onReview(b.scholarId)} className="text-sm text-amber-700 font-medium hover:underline inline-flex items-center gap-1"><Star size={12} /> Leave a review</button>
                                </>
                              )}
                              {b.reviewLeft && (
                                <>
                                  <span className="text-stone-300">·</span>
                                  <span className="text-sm text-stone-500 inline-flex items-center gap-1"><CheckCircle2 size={12} className="text-emerald-600" /> Review left</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "donations" && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>My giving</h2>
              <p className="text-stone-600 text-sm md:text-base">Your sadaqah jariyah, tracked.</p>
            </div>

            {donations.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-2xl p-8 md:p-12 text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-50 mb-4">
                  <HandCoins className="text-amber-700" size={24} />
                </div>
                <h3 className="text-lg font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>No donations yet</h3>
                <p className="text-sm text-stone-500 mb-5 max-w-sm mx-auto">When you give to verified mosque and scholar campaigns, your sadaqah will be tracked here with Gift Aid receipts for tax purposes.</p>
                <button onClick={onPublic} className="bg-emerald-900 hover:bg-emerald-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors inline-flex items-center gap-2">
                  <Heart size={14} /> Browse campaigns
                </button>
              </div>
            ) : (
              <>
                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-2xl p-4">
                    <p className="text-xs text-emerald-700 uppercase tracking-wider font-medium mb-1">Total given</p>
                    <p className="text-2xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>£{totalGiven.toLocaleString()}</p>
                  </div>
                  <div className="bg-gradient-to-br from-amber-50 to-white border border-amber-200 rounded-2xl p-4">
                    <p className="text-xs text-amber-700 uppercase tracking-wider font-medium mb-1">Gift Aid boost</p>
                    <p className="text-2xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>£{totalGiftAid.toLocaleString()}</p>
                  </div>
                  <div className="bg-white border border-stone-200 rounded-2xl p-4">
                    <p className="text-xs text-stone-500 uppercase tracking-wider font-medium mb-1">Causes supported</p>
                    <p className="text-2xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{donations.length}</p>
                  </div>
              <div className="bg-white border border-stone-200 rounded-2xl p-4">
                <p className="text-xs text-stone-500 uppercase tracking-wider font-medium mb-1">Member since</p>
                <p className="text-sm font-semibold text-stone-900 mt-1.5">{user.joinedDate}</p>
              </div>
            </div>

            <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 mb-6 flex gap-3">
              <Info className="text-sky-800 flex-shrink-0 mt-0.5" size={16} />
              <p className="text-xs text-sky-900 leading-relaxed">Your 2025/26 giving summary is available for tax purposes. Total charitable contributions with Gift Aid: <strong>£{(totalGiven + totalGiftAid).toFixed(2)}</strong></p>
            </div>

            <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">All donations</h3>
            <div className="space-y-3">
              {donations.map(d => (
                <div key={d.id} className="bg-white border border-stone-200 rounded-2xl p-4 md:p-5">
                  <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                    <div className="min-w-0">
                      <h4 className="text-base font-semibold text-stone-900 mb-0.5" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{d.campaign}</h4>
                      <p className="text-xs text-stone-500">{d.creator}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>£{d.amount}</p>
                      {d.giftAid > 0 && <p className="text-[11px] text-emerald-700 font-medium">+£{d.giftAid} Gift Aid</p>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-stone-100 text-xs text-stone-500 flex-wrap">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1"><Calendar size={11} /> {new Date(d.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                      {d.anonymous && <span>· Anonymous</span>}
                      <span className="font-mono">· {d.receiptId}</span>
                    </div>
                    <button className="text-emerald-800 font-medium hover:underline inline-flex items-center gap-1">
                      <Download size={11} /> Receipt
                    </button>
                  </div>
                </div>
              ))}
            </div>
              </>
            )}
          </div>
        )}

        {tab === "saved" && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Saved</h2>
              <p className="text-stone-600 text-sm md:text-base">Scholars and campaigns you've hearted.</p>
            </div>

            {savedScholars.length === 0 && savedCampaigns.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-2xl p-8 md:p-12 text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-rose-50 mb-4">
                  <Heart className="text-rose-600" size={24} />
                </div>
                <h3 className="text-lg font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Nothing saved yet</h3>
                <p className="text-sm text-stone-500 mb-5 max-w-sm mx-auto">Tap the heart icon on scholars or campaigns to save them here for later.</p>
                <button onClick={onPublic} className="bg-emerald-900 hover:bg-emerald-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors inline-flex items-center gap-2">
                  <Search size={14} /> Start browsing
                </button>
              </div>
            ) : (
              <>
            {/* Saved scholars */}
            <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">Scholars ({savedScholars.length})</h3>
            <div className="grid md:grid-cols-2 gap-3 mb-8">
              {savedScholars.map(id => {
                const s = MOCK_SCHOLARS.find(x => x.id === id);
                if (!s) return null;
                return (
                  <div key={id} className="bg-white border border-stone-200 rounded-2xl p-4 flex items-center gap-3">
                    <Avatar scholar={s} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-900 truncate" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{s.name}</p>
                      <p className="text-xs text-stone-500">{s.city} · £{s.packages[1].price} / {s.packages[1].name}</p>
                    </div>
                    <button className="text-rose-500 hover:text-rose-700 p-2"><Heart size={16} fill="currentColor" /></button>
                  </div>
                );
              })}
            </div>

            {/* Saved campaigns */}
            <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">Campaigns ({savedCampaigns.length})</h3>
            <div className="grid md:grid-cols-2 gap-3">
              {savedCampaigns.map(id => {
                const c = MOCK_CAMPAIGNS.find(x => x.id === id);
                if (!c) return null;
                const pct = Math.min((c.raised / c.goal) * 100, 100);
                return (
                  <button key={id} onClick={() => onViewCampaign(c)} className="bg-white border border-stone-200 rounded-2xl overflow-hidden text-left hover:border-emerald-300 transition-colors">
                    <div className={`h-20 bg-gradient-to-br ${c.gradient}`}></div>
                    <div className="p-4">
                      <h4 className="text-sm font-semibold text-stone-900 line-clamp-1 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{c.title}</h4>
                      <p className="text-xs text-stone-500 mb-2">{c.creator}</p>
                      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden mb-1.5">
                        <div className={`h-full bg-gradient-to-r ${c.gradient}`} style={{ width: `${pct}%` }}></div>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-stone-900">£{c.raised.toLocaleString()}</span>
                        <span className="text-stone-500">{Math.round(pct)}%</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
              </>
            )}
          </div>
        )}

        {tab === "account" && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Account</h2>
              <p className="text-stone-600 text-sm md:text-base">Your profile and preferences.</p>
            </div>

            {/* Profile */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-5">
              {!editingProfile ? (
                <>
                  <div className="flex items-start gap-4 mb-5">
                    <Avatar scholar={{ initials: user.initials, avatarGradient: user.avatarGradient }} size="lg" />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{user.name}</h3>
                      <p className="text-sm text-stone-500 truncate">{user.email}</p>
                      <p className="text-xs text-stone-500 mt-1">Member since {user.joinedDate}</p>
                    </div>
                    {!isDemo && (
                      <button onClick={() => {
                        setEditForm({ name: user.name || "", city: user.city || "", phone: user.phone || "" });
                        setSaveError(null);
                        setEditingProfile(true);
                      }} className="text-sm text-emerald-800 font-medium hover:underline">Edit</button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-5 border-t border-stone-100 text-sm">
                    <div>
                      <p className="text-xs text-stone-500 uppercase tracking-wider font-medium mb-0.5">City</p>
                      <p className="text-stone-900">{user.city || <span className="text-stone-400">Not set</span>}</p>
                    </div>
                    <div>
                      <p className="text-xs text-stone-500 uppercase tracking-wider font-medium mb-0.5">Phone</p>
                      <p className="text-stone-900">{user.phone || <span className="text-stone-400">Not set</span>}</p>
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <Avatar scholar={{ initials: user.initials, avatarGradient: user.avatarGradient }} size="md" />
                    <div>
                      <h3 className="text-base font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Edit profile</h3>
                      <p className="text-xs text-stone-500">{user.email}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Name</label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={e => setEditForm({...editForm, name: e.target.value})}
                        placeholder="Your name"
                        className="w-full px-4 py-2.5 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">City</label>
                        <input
                          type="text"
                          value={editForm.city}
                          onChange={e => setEditForm({...editForm, city: e.target.value})}
                          placeholder="e.g. Birmingham"
                          className="w-full px-4 py-2.5 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-stone-700 mb-1.5 uppercase tracking-wider">Phone</label>
                        <input
                          type="tel"
                          value={editForm.phone}
                          onChange={e => setEditForm({...editForm, phone: e.target.value})}
                          placeholder="+44 7700 900000"
                          className="w-full px-4 py-2.5 rounded-xl border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm"
                        />
                      </div>
                    </div>
                  </div>
                  {saveError && <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">{saveError}</div>}
                  <div className="flex items-center justify-end gap-2 mt-5">
                    <button
                      onClick={() => { setEditingProfile(false); setSaveError(null); }}
                      disabled={savingProfile}
                      className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900"
                    >Cancel</button>
                    <button
                      onClick={async () => {
                        if (!editForm.name.trim()) { setSaveError("Name can't be empty"); return; }
                        setSavingProfile(true);
                        setSaveError(null);
                        const { data, error } = await updateProfile({
                          name: editForm.name.trim(),
                          city: editForm.city.trim() || null,
                          phone: editForm.phone.trim() || null,
                          avatar_initials: editForm.name.trim().split(" ").map(w => w[0]).join("").substring(0,2).toUpperCase()
                        });
                        if (error) {
                          setSaveError(error.message || "Couldn't save. Try again.");
                          setSavingProfile(false);
                          return;
                        }
                        // Tell the app the profile changed so it re-renders with fresh data
                        onProfileUpdate(data);
                        setSavingProfile(false);
                        setEditingProfile(false);
                      }}
                      disabled={savingProfile}
                      className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white px-5 py-2 rounded-xl text-sm font-medium inline-flex items-center gap-2"
                    >
                      {savingProfile ? "Saving..." : <><CheckCircle2 size={14} /> Save</>}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Kids/students */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>My students</h3>
                  <p className="text-xs text-stone-500 mt-0.5">Track learning for each child separately.</p>
                </div>
                {!addingStudent && (
                  <button onClick={() => setAddingStudent(true)} className="text-sm text-emerald-800 font-medium hover:underline inline-flex items-center gap-1">
                    <Plus size={14} /> Add
                  </button>
                )}
              </div>

              {/* Add student inline form */}
              {addingStudent && (
                <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 mb-3">
                  <div className="space-y-2.5">
                    <input
                      type="text"
                      value={studentForm.name}
                      onChange={e => setStudentForm({...studentForm, name: e.target.value})}
                      placeholder="Name (e.g. Yusuf)"
                      className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm bg-white"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={studentForm.age}
                        onChange={e => setStudentForm({...studentForm, age: e.target.value})}
                        placeholder="Age"
                        min="1" max="25"
                        className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm bg-white"
                      />
                      <select
                        value={studentForm.relation}
                        onChange={e => setStudentForm({...studentForm, relation: e.target.value})}
                        className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm bg-white"
                      >
                        <option>Son</option>
                        <option>Daughter</option>
                        <option>Ward</option>
                        <option>Nephew</option>
                        <option>Niece</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <input
                      type="text"
                      value={studentForm.notes}
                      onChange={e => setStudentForm({...studentForm, notes: e.target.value})}
                      placeholder="What are they learning? (optional)"
                      className="w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm bg-white"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-3">
                    <button
                      onClick={() => { setAddingStudent(false); setStudentForm({ name: "", age: "", relation: "Son", notes: "" }); }}
                      disabled={savingStudent}
                      className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900"
                    >Cancel</button>
                    <button
                      onClick={handleAddStudent}
                      disabled={savingStudent || !studentForm.name.trim()}
                      className="bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white px-4 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5"
                    >
                      {savingStudent ? "Saving..." : <><CheckCircle2 size={12} /> Save</>}
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {studentsLoading ? (
                  <div className="text-center py-6 text-sm text-stone-400">Loading...</div>
                ) : students.length === 0 ? (
                  <div className="text-center py-6 text-sm text-stone-500">
                    Add your kids to track their learning separately.
                  </div>
                ) : students.map(s => (
                  <div key={s.id} className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-700 flex items-center justify-center text-white text-sm font-semibold">
                      {s.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-900">
                        {s.name}
                        {(s.relation || s.age) && <span className="text-stone-500 font-normal">
                          {" · "}{s.relation}{s.age && `, age ${s.age}`}
                        </span>}
                      </p>
                      {s.notes && <p className="text-xs text-stone-500 truncate">{s.notes}</p>}
                    </div>
                    {!isDemo && (
                      <button onClick={() => handleDeleteStudent(s.id)} className="text-stone-400 hover:text-rose-600 p-1"><X size={16} /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Notifications */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-5">
              <h3 className="text-base font-semibold text-stone-900 mb-4" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Notifications</h3>
              <div className="space-y-3">
                {[
                  { k: "email", l: "Email", sub: "Booking reminders, receipts" },
                  { k: "sms", l: "SMS", sub: "Session reminders 1h before" },
                  { k: "whatsapp", l: "WhatsApp", sub: "Scholar messages & updates" }
                ].map(n => (
                  <button
                    type="button"
                    key={n.k}
                    onClick={() => toggleNotification(n.k)}
                    disabled={isDemo}
                    className="w-full flex items-center justify-between p-3 bg-stone-50 hover:bg-stone-100 disabled:opacity-70 disabled:cursor-not-allowed rounded-xl text-left transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-stone-900">{n.l}</p>
                      <p className="text-xs text-stone-500">{n.sub}</p>
                    </div>
                    <div className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${notifications[n.k] ? "bg-emerald-600" : "bg-stone-300"}`}>
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notifications[n.k] ? "translate-x-5" : "translate-x-0.5"}`}></div>
                    </div>
                  </button>
                ))}
              </div>
              {isDemo && (
                <p className="text-[11px] text-stone-400 mt-3 text-center">Sign in to manage notification preferences.</p>
              )}
            </div>

            <button onClick={onLogout} className="w-full bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 py-3 rounded-xl text-sm font-medium inline-flex items-center justify-center gap-2">
              <LogOut size={14} /> Sign out
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

// ==================== PRAYER HUB ====================

// Prayer times data - UK average April pattern. In production this comes from Aladhan API
const getPrayerTimes = () => {
  const today = new Date();
  // Approximate UK London prayer times for late April
  return {
    fajr: { time: "04:32", name: "Fajr", arabic: "الفجر", icon: Sunrise, desc: "Dawn prayer" },
    sunrise: { time: "05:54", name: "Sunrise", arabic: "الشروق", icon: Sun, desc: "Not a prayer — marks end of Fajr" },
    dhuhr: { time: "12:58", name: "Dhuhr", arabic: "الظهر", icon: Sun, desc: "Midday prayer" },
    asr: { time: "16:51", name: "Asr", arabic: "العصر", icon: Sun, desc: "Afternoon prayer" },
    maghrib: { time: "20:04", name: "Maghrib", arabic: "المغرب", icon: Sunset, desc: "Sunset prayer" },
    isha: { time: "21:32", name: "Isha", arabic: "العشاء", icon: Moon, desc: "Night prayer" }
  };
};

// Parse time string to Date today
const parseTimeToday = (timeStr) => {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};

// Find current and next prayer
const getCurrentPrayerState = (times) => {
  const now = new Date();
  const prayers = [
    { key: "fajr", ...times.fajr },
    { key: "dhuhr", ...times.dhuhr },
    { key: "asr", ...times.asr },
    { key: "maghrib", ...times.maghrib },
    { key: "isha", ...times.isha }
  ];

  let current = null;
  let next = null;

  for (let i = 0; i < prayers.length; i++) {
    const start = parseTimeToday(prayers[i].time);
    const end = i < prayers.length - 1 ? parseTimeToday(prayers[i + 1].time) : new Date(start.getTime() + 5 * 60 * 60 * 1000);

    if (now >= start && now < end) {
      current = prayers[i];
      next = prayers[i + 1] || null;
      break;
    }
    if (now < start) {
      next = prayers[i];
      current = i > 0 ? prayers[i - 1] : null;
      break;
    }
  }

  if (!current && !next) {
    // After Isha, next is Fajr tomorrow
    current = prayers[prayers.length - 1];
    next = { ...prayers[0], tomorrow: true };
  }

  return { current, next };
};

// Calculate time until a prayer
const timeUntil = (timeStr, tomorrow = false) => {
  const now = new Date();
  let target = parseTimeToday(timeStr);
  if (tomorrow || target < now) {
    target.setDate(target.getDate() + 1);
  }
  const diffMs = target - now;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 1) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

// Calculate qibla bearing (from UK cities to Mecca)
// Kaaba coordinates: 21.4225°N, 39.8262°E
const getQiblaBearing = (userLat, userLng) => {
  const kaabaLat = 21.4225 * Math.PI / 180;
  const kaabaLng = 39.8262 * Math.PI / 180;
  const lat1 = userLat * Math.PI / 180;
  const lng1 = userLng * Math.PI / 180;

  const dLng = kaabaLng - lng1;
  const y = Math.sin(dLng) * Math.cos(kaabaLat);
  const x = Math.cos(lat1) * Math.sin(kaabaLat) - Math.sin(lat1) * Math.cos(kaabaLat) * Math.cos(dLng);

  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  bearing = (bearing + 360) % 360;
  return bearing;
};

// Nearby mosques — these are the verified mosques from the register
const NEARBY_MOSQUES = [
  { id: 1, name: "Masjid Al-Noor", city: "Birmingham", postcode: "B12 9AA", distance: 0.8, denomination: "Sunni — Hanafi", verified: true, gradient: "from-emerald-400 to-emerald-700", initials: "MN", jumuahTime: "13:30", languages: ["English", "Urdu", "Arabic"] },
  { id: 2, name: "Masjid As-Salam", city: "Leicester", postcode: "LE2 7AA", distance: 1.2, denomination: "Sunni — Hanafi", verified: true, gradient: "from-rose-400 to-rose-700", initials: "AS", jumuahTime: "13:15", languages: ["English", "Gujarati"] },
  { id: 3, name: "Blackburn Islamic Centre", city: "Blackburn", postcode: "BB1 8AA", distance: 2.4, denomination: "Sunni — Hanafi", verified: true, gradient: "from-amber-400 to-amber-700", initials: "BI", jumuahTime: "13:00", languages: ["English", "Urdu"] },
  { id: 4, name: "Noor Academy", city: "London", postcode: "E1 1AA", distance: 3.7, denomination: "Non-denominational", verified: true, gradient: "from-indigo-400 to-indigo-700", initials: "NA", jumuahTime: "13:30", languages: ["English", "Arabic"] },
  { id: 5, name: "Darul Hikmah", city: "Cardiff", postcode: "CF10 1AA", distance: 5.2, denomination: "Sunni — Shafi'i", verified: true, gradient: "from-teal-400 to-teal-700", initials: "DH", jumuahTime: "13:15", languages: ["English", "Arabic", "Bengali"] }
];

// ==================== PRAYER HUB PAGE ====================
const PrayerHub = ({ onBack, onSignIn }) => {
  const [prayerTimes] = useState(getPrayerTimes());
  const [prayerState, setPrayerState] = useState(getCurrentPrayerState(prayerTimes));
  const [userCity, setUserCity] = useState("Birmingham, UK");
  // Rough Birmingham coordinates for qibla
  const userLat = 52.4862;
  const userLng = -1.8904;
  const qiblaBearing = getQiblaBearing(userLat, userLng);

  // Live countdown
  useEffect(() => {
    const id = setInterval(() => {
      setPrayerState(getCurrentPrayerState(prayerTimes));
    }, 30000); // refresh every 30s
    return () => clearInterval(id);
  }, [prayerTimes]);

  const { current, next } = prayerState;
  const nextTimeLeft = next ? timeUntil(next.time, next.tomorrow) : "";

  const CurrentIcon = current?.icon || Moon;

  return (
    <div className="min-h-screen bg-stone-950" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-stone-950 via-indigo-950 to-stone-900 pointer-events-none"></div>

      {/* Subtle twinkle pattern */}
      <div className="fixed inset-0 opacity-[0.08] pointer-events-none" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cpath d='M40 0L50 30L80 40L50 50L40 80L30 50L0 40L30 30Z' fill='%23fbbf24'/%3E%3C/svg%3E")`, backgroundSize: "120px 120px" }}></div>

      <div className="relative">
        <header className="sticky top-0 z-20 bg-stone-950/80 backdrop-blur-md border-b border-white/5">
          <div className="max-w-5xl mx-auto px-5 md:px-6 py-3.5 md:py-4 flex items-center justify-between">
            <button onClick={onBack} className="flex items-center gap-2.5 md:gap-3 text-white">
              <div className="w-9 h-9 rounded-xl bg-emerald-800 flex items-center justify-center"><ShieldCheck className="text-emerald-100" size={18} /></div>
              <h1 className="text-base md:text-lg font-semibold" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</h1>
            </button>
            <button onClick={onBack} className="text-sm text-white/70 hover:text-white flex items-center gap-2"><ArrowLeft size={14} /> Back</button>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-5 md:px-6 py-6 md:py-10 pb-24">
          {/* Page title */}
          <div className="text-center mb-8 md:mb-10">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/15 px-3 py-1 rounded-full text-[11px] uppercase tracking-widest text-white/80 mb-4">
              <MapPin size={11} /> {userCity}
              <button className="text-amber-300 hover:text-amber-200 ml-1">Change</button>
            </div>
            <h1 className="text-3xl md:text-5xl font-semibold text-white tracking-tight mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
              {new Date().toLocaleDateString("en-GB", { weekday: "long" })}
              <span className="italic text-amber-200/90">, </span>
              <span className="font-normal text-white/80">{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" })}</span>
            </h1>
            <p className="text-xs text-white/60 mt-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          </div>

          {/* Next prayer hero card */}
          {next && (
            <div className="relative mb-6 md:mb-8 bg-gradient-to-br from-amber-500/20 via-indigo-800/30 to-stone-900/60 border border-amber-300/20 rounded-3xl p-6 md:p-10 overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-amber-400 rounded-full blur-[120px] opacity-20"></div>
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500 rounded-full blur-[100px] opacity-30"></div>
              <div className="relative">
                <p className="text-xs uppercase tracking-widest text-amber-200/80 font-medium mb-3">Next prayer</p>
                <div className="flex items-end justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-5xl md:text-7xl font-semibold text-white tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{next.name}</h2>
                      <span className="text-xl md:text-3xl text-amber-200/80" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{next.arabic}</span>
                    </div>
                    <p className="text-lg md:text-xl text-white/80 font-medium">in {nextTimeLeft}</p>
                    <p className="text-sm text-white/60 mt-1">at {next.time}{next.tomorrow ? " tomorrow" : ""}</p>
                  </div>
                  <div className="hidden md:block">
                    {(() => { const Icon = next.icon; return <Icon className="text-amber-200/60" size={80} strokeWidth={1} />; })()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* All prayer times for today */}
          <div className="mb-6 md:mb-8">
            <h3 className="text-xs uppercase tracking-widest text-white/50 font-medium mb-3">Today's prayers</h3>
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
              {["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"].map((key, i) => {
                const p = prayerTimes[key];
                const Icon = p.icon;
                const parsedTime = parseTimeToday(p.time);
                const now = new Date();
                const isPast = parsedTime < now;
                const isCurrent = current?.key === key;

                return (
                  <div key={key} className={`flex items-center gap-4 px-5 py-4 ${i < 5 ? "border-b border-white/5" : ""} ${isCurrent ? "bg-amber-500/10" : ""}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isCurrent ? "bg-amber-400/20" : isPast ? "bg-white/5" : "bg-white/10"}`}>
                      <Icon className={isCurrent ? "text-amber-300" : isPast ? "text-white/30" : "text-white/70"} size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${isCurrent ? "text-amber-200" : isPast ? "text-white/40" : "text-white"}`} style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{p.name}</span>
                        {key === "sunrise" && <span className="text-[10px] px-1.5 py-0.5 bg-white/10 text-white/60 rounded uppercase tracking-wider">Not a prayer</span>}
                        {isCurrent && <span className="text-[10px] px-1.5 py-0.5 bg-amber-400/20 text-amber-200 rounded uppercase tracking-wider font-medium">Now</span>}
                      </div>
                      <p className={`text-[11px] ${isPast && !isCurrent ? "text-white/30" : "text-white/50"}`}>{p.desc}</p>
                    </div>
                    <div className={`text-right font-mono font-medium ${isCurrent ? "text-amber-200 text-lg" : isPast ? "text-white/40" : "text-white/90 text-base"}`}>
                      {p.time}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-white/40 text-center mt-3">
              Times calculated for {userCity}. Based on Muslim World League method. 
              <button className="text-amber-200/80 hover:text-amber-200 ml-1">Change method</button>
            </p>
          </div>

          {/* Qibla + Masjid grid */}
          <div className="grid md:grid-cols-2 gap-5 md:gap-6">
            {/* Qibla compass */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-6 md:p-8 flex flex-col items-center">
              <div className="w-full flex items-center justify-between mb-5">
                <h3 className="text-xs uppercase tracking-widest text-white/50 font-medium">Qibla direction</h3>
                <span className="text-[10px] px-2 py-0.5 bg-white/10 text-white/60 rounded uppercase tracking-wider">From {userCity.split(",")[0]}</span>
              </div>

              {/* The compass */}
              <div className="relative w-56 h-56 md:w-64 md:h-64 mb-5">
                {/* Outer ring with degrees */}
                <div className="absolute inset-0 rounded-full border-2 border-white/10"></div>
                {/* Cardinal direction markers */}
                {["N", "E", "S", "W"].map((dir, i) => {
                  const angle = i * 90;
                  const style = {
                    top: angle === 0 ? "8px" : angle === 180 ? "auto" : "50%",
                    bottom: angle === 180 ? "8px" : "auto",
                    left: angle === 270 ? "8px" : angle === 90 ? "auto" : "50%",
                    right: angle === 90 ? "8px" : "auto",
                    transform: angle === 0 || angle === 180 ? "translateX(-50%)" : angle === 90 || angle === 270 ? "translateY(-50%)" : "none"
                  };
                  return <span key={dir} className="absolute text-[10px] font-semibold text-white/40 uppercase tracking-widest" style={style}>{dir}</span>;
                })}
                {/* Middle soft glow */}
                <div className="absolute inset-6 rounded-full bg-gradient-to-br from-amber-500/10 via-transparent to-indigo-500/10"></div>
                <div className="absolute inset-12 rounded-full border border-white/5"></div>

                {/* Qibla arrow */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative" style={{ transform: `rotate(${qiblaBearing}deg)` }}>
                    {/* Arrow needle */}
                    <svg width="80" height="200" viewBox="0 0 80 200" className="drop-shadow-[0_0_12px_rgba(251,191,36,0.5)]">
                      <defs>
                        <linearGradient id="arrowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#fbbf24" stopOpacity="1" />
                          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.2" />
                        </linearGradient>
                      </defs>
                      {/* Needle */}
                      <path d="M 40 10 L 55 100 L 40 90 L 25 100 Z" fill="url(#arrowGrad)" stroke="#fbbf24" strokeWidth="1.5" />
                      {/* Kaaba icon at tip */}
                      <rect x="32" y="2" width="16" height="14" rx="1" fill="#1c1917" stroke="#fbbf24" strokeWidth="1.5" />
                      <line x1="32" y1="6" x2="48" y2="6" stroke="#fbbf24" strokeWidth="0.8" />
                    </svg>
                  </div>
                </div>

                {/* Center dot */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.8)]"></div>
              </div>

              {/* Bearing text */}
              <div className="text-center">
                <p className="text-4xl font-semibold text-amber-200 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{Math.round(qiblaBearing)}°</p>
                <p className="text-xs text-white/50">from North · {qiblaBearing > 90 && qiblaBearing < 270 ? "South-east" : "East-south-east"}</p>
              </div>

              <div className="mt-5 pt-5 border-t border-white/10 w-full">
                <p className="text-xs text-white/50 text-center leading-relaxed">
                  <Info size={11} className="inline mr-1" />
                  On mobile, the arrow will spin as you turn. For web, it shows the fixed bearing.
                </p>
              </div>
            </div>

            {/* Nearby mosques */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-6 md:p-8">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xs uppercase tracking-widest text-white/50 font-medium">Verified mosques near you</h3>
                <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded uppercase tracking-wider font-medium flex items-center gap-1"><ShieldCheck size={9} /> Vetted</span>
              </div>

              <div className="space-y-2">
                {NEARBY_MOSQUES.slice(0, 5).map(m => (
                  <button key={m.id} className="w-full flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-left transition-colors">
                    <Avatar scholar={{ initials: m.initials, avatarGradient: m.gradient }} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p className="text-sm font-semibold text-white truncate" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{m.name}</p>
                        {m.verified && <ShieldCheck size={11} className="text-emerald-400 flex-shrink-0" />}
                      </div>
                      <p className="text-[11px] text-white/50 truncate">{m.denomination}</p>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-white/60">
                        <span className="flex items-center gap-0.5"><MapPin size={10} /> {m.distance} mi</span>
                        <span>·</span>
                        <span>Jumu'ah {m.jumuahTime}</span>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-white/30 flex-shrink-0" />
                  </button>
                ))}
              </div>

              <button className="w-full mt-4 text-sm text-amber-200/80 hover:text-amber-200 font-medium flex items-center justify-center gap-1.5">
                View all mosques on map <ArrowRight size={13} />
              </button>

              <div className="mt-5 pt-5 border-t border-white/10">
                <div className="flex items-start gap-2.5 text-xs text-white/50 leading-relaxed">
                  <ShieldCheck className="text-emerald-400 flex-shrink-0 mt-0.5" size={13} />
                  <p>Every mosque shown is Charity Commission verified and has a designated safeguarding lead.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className="mt-8 md:mt-12 text-center">
            <p className="text-xs text-white/40 leading-relaxed max-w-lg mx-auto">
              May Allah accept your prayers and make them a source of peace and guidance in your life. Ameen.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
};

// ==================== ADMIN PANEL ====================
const ADMIN_MOSQUE_APPS = [
  { id: "mosque-app-1", name: "Masjid Ar-Rahma", city: "Sheffield", postcode: "S2 4AA", charityNumber: "1193847", submittedDate: "2026-04-18", contactName: "Ismail Khan", contactRole: "Chairperson", contactPhone: "+44 7700 900301", safeguardingLead: "Aisha Begum", docs: { proofOfAddress: true, trusteeConfirmation: true }, charityCommissionStatus: "match", notes: "" },
  { id: "mosque-app-2", name: "Darul Hikmah", city: "Cardiff", postcode: "CF10 1AA", charityNumber: "1167254", submittedDate: "2026-04-19", contactName: "Ahmed Saleh", contactRole: "Trustee", contactPhone: "+44 7700 900302", safeguardingLead: "Hafsa Ali", docs: { proofOfAddress: true, trusteeConfirmation: false }, charityCommissionStatus: "match", notes: "Trustee confirmation not yet uploaded" },
  { id: "mosque-app-3", name: "Noor Islamic Centre", city: "Newcastle", postcode: "NE1 2AA", charityNumber: "1198888", submittedDate: "2026-04-20", contactName: "Bilal Rashid", contactRole: "Secretary", contactPhone: "+44 7700 900303", safeguardingLead: "Maryam Shah", docs: { proofOfAddress: true, trusteeConfirmation: true }, charityCommissionStatus: "nomatch", notes: "Charity Commission number not found — may be a new registration or typo" }
];

const ADMIN_SCHOLAR_APPS = [
  { id: "scholar-app-1", name: "Sulaiman Idris", initials: "SI", city: "Nottingham", avatarGradient: "from-teal-400 to-teal-700", submittedDate: "2026-04-17", madhhab: "Hanafi", experience: 9, docs: { dbs: true, rtw: true, ijazah: true }, dbsReference: "DBS/2026/4782", ijazahInstitution: "Darul Uloom Leicester", notes: "" },
  { id: "scholar-app-2", name: "Ustadha Amina Yusuf", initials: "AY", city: "Online", avatarGradient: "from-rose-400 to-rose-700", submittedDate: "2026-04-18", madhhab: "Shafi'i", experience: 5, docs: { dbs: true, rtw: true, ijazah: false }, dbsReference: "DBS/2026/4819", ijazahInstitution: null, notes: "Self-taught with strong references — needs manual review" },
  { id: "scholar-app-3", name: "Hafiz Junaid Mohammed", initials: "JM", city: "Walsall", avatarGradient: "from-indigo-400 to-indigo-700", submittedDate: "2026-04-19", madhhab: "Hanafi", experience: 3, docs: { dbs: false, rtw: true, ijazah: true }, dbsReference: null, ijazahInstitution: "Al-Azhar University", notes: "DBS still pending from umbrella body — ETA 2-3 days" }
];

const ADMIN_CAMPAIGN_APPS = [
  { id: "camp-app-1", title: "Urgent roof repair after storm damage", creator: "Masjid Al-Falah", city: "Portsmouth", goal: 18000, category: "Emergency Repair", submittedDate: "2026-04-20", creatorVerified: true, riskScore: "low" },
  { id: "camp-app-2", title: "Arabic summer camp for teenagers", creator: "Ustadh Khalid Mahmud", city: "Online", goal: 4500, category: "Course Creation", submittedDate: "2026-04-19", creatorVerified: true, riskScore: "low" },
  { id: "camp-app-3", title: "Help our brother in hardship", creator: "Masjid Al-Hidayah", city: "Glasgow", goal: 50000, category: "Community Outreach", submittedDate: "2026-04-19", creatorVerified: true, riskScore: "medium" }
];

const ADMIN_FLAGS = [
  { id: "flag-1", type: "scholar", target: "Ustadh Bilal Cheikh", city: "Leicester", reportedBy: "Parent · verified booking", reason: "DBS expired — should not be accepting new bookings", severity: "high", date: "2026-04-20" },
  { id: "flag-2", type: "campaign", target: "Help our brother in hardship", creator: "Masjid Al-Hidayah", reportedBy: "Community member", reason: "Goal seems disproportionate with no breakdown", severity: "medium", date: "2026-04-19" },
  { id: "flag-3", type: "review", target: "Review on Ustadh Omar Farooq", reportedBy: "Scholar", reason: "Review appears to be from someone who never booked", severity: "low", date: "2026-04-18" }
];

const ADMIN_DBS_ORDERS = [
  { id: "order-1", candidate: "Harun Malik", mosque: "Masjid Al-Noor", type: "Enhanced", stage: "Certificate issued", progress: 100, orderedDate: "2026-03-28" },
  { id: "order-2", candidate: "Suleiman Ahmed", mosque: "Masjid Al-Noor", type: "Enhanced", stage: "Police check in progress", progress: 65, orderedDate: "2026-04-11" },
  { id: "order-3", candidate: "Nasir Begum", mosque: "Masjid Al-Noor", type: "Enhanced", stage: "Candidate ID verification", progress: 30, orderedDate: "2026-04-18" },
  { id: "order-4", candidate: "Yasmin Iqbal", mosque: "Darul Hikmah", type: "Standard", stage: "Awaiting candidate action", progress: 10, orderedDate: "2026-04-20" }
];

// Admin sidebar navigation
const AdminSidebar = ({ active, onNavigate, onLogout, counts }) => {
  const items = [
    { id: "overview", label: "Overview", icon: LayoutDashboard, count: null },
    { id: "mosques", label: "Mosque queue", icon: Building2, count: counts.mosques, urgent: counts.mosques > 0 },
    { id: "scholars", label: "Scholar queue", icon: Users, count: counts.scholars, urgent: counts.scholars > 0 },
    { id: "campaigns", label: "Campaign queue", icon: HandCoins, count: counts.campaigns, urgent: counts.campaigns > 0 },
    { id: "flags", label: "Flags & reports", icon: Flag, count: counts.flags, urgent: counts.flags > 0, highlight: true },
    { id: "dbs", label: "DBS orders", icon: FileCheck, count: counts.dbs, urgent: false },
    { id: "users", label: "All users", icon: Users, count: null },
    { id: "settings", label: "Settings", icon: Settings, count: null }
  ];

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-stone-950 text-stone-300 flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="px-5 py-5 border-b border-stone-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-700 flex items-center justify-center"><ShieldCheck className="text-emerald-50" size={16} /></div>
          <div>
            <p className="text-sm font-semibold text-white" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</p>
            <p className="text-[10px] uppercase tracking-widest text-emerald-400">Admin</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {items.map(item => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive ? "bg-stone-800 text-white" : "text-stone-400 hover:text-white hover:bg-stone-900"}`}
            >
              <Icon size={16} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.count !== null && item.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${item.highlight && item.urgent ? "bg-rose-600 text-white" : item.urgent ? "bg-amber-500 text-stone-950" : "bg-stone-700 text-stone-300"}`}>{item.count}</span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="px-3 py-4 border-t border-stone-800">
        <div className="px-3 py-2 mb-1">
          <p className="text-xs text-stone-400">Signed in as</p>
          <p className="text-sm font-medium text-white">Yusuf Rahman</p>
          <p className="text-xs text-stone-500">Platform admin</p>
        </div>
        <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-stone-400 hover:text-white hover:bg-stone-900">
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </aside>
  );
};

// ===== Overview =====
const AdminOverview = ({ onNavigate, counts }) => {
  const stats = [
    { label: "Live scholars", value: 127, change: "+8 this week", trend: "up", color: "emerald" },
    { label: "Active mosques", value: 42, change: "+3 this week", trend: "up", color: "sky" },
    { label: "Total bookings", value: 2340, change: "+184 this week", trend: "up", color: "amber" },
    { label: "Platform GMV", value: "£48,210", change: "+£6,432 this week", trend: "up", color: "purple" }
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Good morning, Yusuf</h1>
        <p className="text-stone-600">Here's what needs your attention today.</p>
      </div>

      {/* Urgent queue alert */}
      {(counts.flags > 0 || counts.mosques > 0) && (
        <div className="bg-gradient-to-br from-rose-50 to-white border border-rose-200 rounded-2xl p-5 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="text-rose-700" size={20} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-stone-900 mb-0.5" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{counts.flags + counts.mosques} items need review</p>
              <p className="text-sm text-stone-700">
                {counts.flags > 0 && `${counts.flags} flagged reports, `}{counts.mosques > 0 && `${counts.mosques} mosque applications, `}{counts.scholars > 0 && `${counts.scholars} scholar applications, `}{counts.campaigns > 0 && `${counts.campaigns} campaigns pending approval`}
              </p>
            </div>
            <button onClick={() => onNavigate("flags")} className="bg-rose-700 hover:bg-rose-800 text-white text-sm font-medium px-4 py-2 rounded-lg whitespace-nowrap">Review flags</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map(s => (
          <div key={s.label} className="bg-white border border-stone-200 rounded-2xl p-5">
            <p className="text-xs text-stone-500 uppercase tracking-wider font-medium mb-2">{s.label}</p>
            <p className="text-3xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{s.value}</p>
            <p className="text-xs text-emerald-700 flex items-center gap-1"><TrendingUp size={11} /> {s.change}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-stone-900 mb-4" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Platform activity (last 7 days)</h3>
          <div className="space-y-3">
            {[
              { label: "New bookings", value: 184, max: 200, color: "bg-emerald-600" },
              { label: "Donations made", value: 342, max: 400, color: "bg-amber-500" },
              { label: "Mosque sign-ups", value: 3, max: 10, color: "bg-sky-600" },
              { label: "Scholar sign-ups", value: 8, max: 10, color: "bg-purple-600" },
              { label: "DBS checks ordered", value: 26, max: 30, color: "bg-rose-500" }
            ].map(m => (
              <div key={m.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-stone-600">{m.label}</span>
                  <span className="text-stone-900 font-medium">{m.value}</span>
                </div>
                <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                  <div className={`h-full ${m.color} rounded-full transition-all`} style={{ width: `${(m.value / m.max) * 100}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-stone-900 mb-4" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Live feed</h3>
          <div className="space-y-3 text-sm">
            {[
              { icon: HandCoins, text: "£250 donation to Masjid Al-Noor roof fund", time: "2m ago", color: "text-emerald-700" },
              { icon: UserPlus, text: "Masjid Ar-Rahma submitted registration", time: "14m ago", color: "text-sky-700" },
              { icon: FileCheck, text: "DBS certificate issued for Harun Malik", time: "1h ago", color: "text-emerald-700" },
              { icon: CheckCircle2, text: "Ustadh Khalid booked 4-session package", time: "1h ago", color: "text-emerald-700" },
              { icon: Flag, text: "Campaign flagged for review", time: "2h ago", color: "text-rose-700" },
              { icon: Zap, text: "New campaign launched — Sheffield iftar", time: "3h ago", color: "text-amber-700" }
            ].map((a, i) => {
              const Icon = a.icon;
              return (
                <div key={i} className="flex items-start gap-3 pb-3 border-b border-stone-100 last:border-0 last:pb-0">
                  <Icon className={`${a.color} flex-shrink-0 mt-0.5`} size={14} />
                  <div className="flex-1 min-w-0">
                    <p className="text-stone-800 leading-snug">{a.text}</p>
                    <p className="text-xs text-stone-500 mt-0.5">{a.time}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// ===== Mosque queue =====
const AdminMosqueQueue = ({ apps, onAction }) => (
  <div>
    <div className="mb-6">
      <h1 className="text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Mosque applications</h1>
      <p className="text-stone-600">{apps.length} pending review · sorted oldest first</p>
    </div>
    <div className="space-y-3">
      {apps.map(app => (
        <div key={app.id} className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
          <div className="p-5">
            <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{app.name}</h3>
                  {app.charityCommissionStatus === "match" ? (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full font-medium uppercase tracking-wider">
                      <CheckCircle2 size={10} /> CC Match
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-full font-medium uppercase tracking-wider">
                      <AlertTriangle size={10} /> CC Mismatch
                    </span>
                  )}
                </div>
                <p className="text-sm text-stone-600">{app.city}, {app.postcode} · Charity no. {app.charityNumber}</p>
              </div>
              <span className="text-xs text-stone-500">Submitted {app.submittedDate}</span>
            </div>

            <div className="grid md:grid-cols-3 gap-3 mb-4">
              <div className="bg-stone-50 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-1">Primary contact</p>
                <p className="text-sm text-stone-900">{app.contactName}</p>
                <p className="text-xs text-stone-600">{app.contactRole}</p>
                <p className="text-xs text-stone-600">{app.contactPhone}</p>
              </div>
              <div className="bg-stone-50 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-1">Safeguarding lead</p>
                <p className="text-sm text-stone-900">{app.safeguardingLead}</p>
              </div>
              <div className="bg-stone-50 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-2">Documents</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    {app.docs.proofOfAddress ? <CheckCircle2 size={12} className="text-emerald-600" /> : <XCircle size={12} className="text-rose-500" />}
                    <span className={app.docs.proofOfAddress ? "text-stone-700" : "text-rose-700"}>Proof of address</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {app.docs.trusteeConfirmation ? <CheckCircle2 size={12} className="text-emerald-600" /> : <XCircle size={12} className="text-rose-500" />}
                    <span className={app.docs.trusteeConfirmation ? "text-stone-700" : "text-rose-700"}>Trustee letter</span>
                  </div>
                </div>
              </div>
            </div>

            {app.notes && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex gap-2 text-xs text-amber-900">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>{app.notes}</span>
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              <button onClick={() => onAction("approve", app)} className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1.5">
                <CheckCircle2 size={14} /> Approve
              </button>
              <button onClick={() => onAction("request", app)} className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1.5">
                <Mail size={14} /> Request info
              </button>
              <button onClick={() => onAction("reject", app)} className="bg-white border border-stone-300 hover:border-rose-300 hover:text-rose-700 text-stone-700 px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1.5">
                <XCircle size={14} /> Reject
              </button>
              <button className="ml-auto text-stone-500 hover:text-stone-900 px-3 py-2 text-sm inline-flex items-center gap-1">
                <Eye size={14} /> View full
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ===== Scholar queue =====
const AdminScholarQueue = ({ apps, onAction }) => (
  <div>
    <div className="mb-6">
      <h1 className="text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Scholar applications</h1>
      <p className="text-stone-600">{apps.length} pending review</p>
    </div>
    <div className="space-y-3">
      {apps.map(app => (
        <div key={app.id} className="bg-white border border-stone-200 rounded-2xl p-5">
          <div className="flex items-start gap-4 mb-4">
            <Avatar scholar={app} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
                <h3 className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{app.name}</h3>
                <span className="text-xs text-stone-500">Submitted {app.submittedDate}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-stone-600 mb-3 flex-wrap">
                <span className="flex items-center gap-1"><MapPin size={12} /> {app.city}</span>
                <span>{app.madhhab}</span>
                <span>{app.experience} years experience</span>
              </div>

              <div className="grid md:grid-cols-3 gap-2 mb-4">
                <div className={`rounded-lg p-3 border ${app.docs.dbs ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-wider font-medium text-stone-700">Enhanced DBS</span>
                    {app.docs.dbs ? <CheckCircle2 size={14} className="text-emerald-700" /> : <AlertCircle size={14} className="text-rose-600" />}
                  </div>
                  <p className="text-xs text-stone-700">{app.dbsReference || "Not yet provided"}</p>
                </div>
                <div className={`rounded-lg p-3 border ${app.docs.rtw ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-wider font-medium text-stone-700">Right to Work</span>
                    {app.docs.rtw ? <CheckCircle2 size={14} className="text-emerald-700" /> : <AlertCircle size={14} className="text-rose-600" />}
                  </div>
                  <p className="text-xs text-stone-700">{app.docs.rtw ? "Share code verified" : "Missing"}</p>
                </div>
                <div className={`rounded-lg p-3 border ${app.docs.ijazah ? "bg-emerald-50 border-emerald-200" : "bg-stone-50 border-stone-200"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-wider font-medium text-stone-700">Ijazah</span>
                    {app.docs.ijazah ? <CheckCircle2 size={14} className="text-emerald-700" /> : <Info size={14} className="text-stone-500" />}
                  </div>
                  <p className="text-xs text-stone-700">{app.ijazahInstitution || "Not provided (optional)"}</p>
                </div>
              </div>

              {app.notes && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex gap-2 text-xs text-amber-900">
                  <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>{app.notes}</span>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <button onClick={() => onAction("approve", app)} className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1.5">
                  <CheckCircle2 size={14} /> Approve
                </button>
                <button onClick={() => onAction("request", app)} className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1.5">
                  <Mail size={14} /> Request info
                </button>
                <button onClick={() => onAction("reject", app)} className="bg-white border border-stone-300 hover:border-rose-300 hover:text-rose-700 text-stone-700 px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1.5">
                  <XCircle size={14} /> Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ===== Campaign queue =====
const AdminCampaignQueue = ({ apps, onAction }) => (
  <div>
    <div className="mb-6">
      <h1 className="text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Campaign queue</h1>
      <p className="text-stone-600">Review before campaigns go live to the public</p>
    </div>
    <div className="space-y-3">
      {apps.map(app => (
        <div key={app.id} className="bg-white border border-stone-200 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="text-base font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{app.title}</h3>
                {app.creatorVerified && <ShieldCheck size={13} className="text-emerald-700" />}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider ${app.riskScore === "low" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : app.riskScore === "medium" ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-rose-50 text-rose-800 border border-rose-200"}`}>
                  {app.riskScore} risk
                </span>
              </div>
              <p className="text-sm text-stone-600">{app.creator} · {app.city}</p>
            </div>
            <span className="text-xs text-stone-500">Submitted {app.submittedDate}</span>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-stone-50 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-0.5">Goal</p>
              <p className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>£{app.goal.toLocaleString()}</p>
            </div>
            <div className="bg-stone-50 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-0.5">Category</p>
              <p className="text-sm text-stone-900 mt-1.5">{app.category}</p>
            </div>
            <div className="bg-stone-50 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-0.5">Creator verified</p>
              <p className="text-sm text-emerald-800 font-medium mt-1.5 flex items-center gap-1"><CheckCircle2 size={13} /> Yes</p>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button onClick={() => onAction("approve", app)} className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1.5">
              <CheckCircle2 size={14} /> Approve & launch
            </button>
            <button onClick={() => onAction("request", app)} className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1.5">
              <Mail size={14} /> Request changes
            </button>
            <button onClick={() => onAction("reject", app)} className="bg-white border border-stone-300 hover:border-rose-300 hover:text-rose-700 text-stone-700 px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1.5">
              <XCircle size={14} /> Reject
            </button>
            <button className="ml-auto text-stone-500 hover:text-stone-900 px-3 py-2 text-sm inline-flex items-center gap-1">
              <Eye size={14} /> Preview
            </button>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ===== Flags =====
const AdminFlags = ({ flags, onAction }) => (
  <div>
    <div className="mb-6">
      <h1 className="text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Flags & reports</h1>
      <p className="text-stone-600">User-submitted reports requiring action</p>
    </div>
    <div className="space-y-3">
      {flags.map(f => {
        const sevConfig = {
          high: { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-800", icon: AlertTriangle },
          medium: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", icon: AlertCircle },
          low: { bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-800", icon: Info }
        }[f.severity];
        const SevIcon = sevConfig.icon;
        return (
          <div key={f.id} className={`bg-white border-l-4 border-y border-r ${sevConfig.border.replace("border-", "border-l-")} border-stone-200 rounded-2xl p-5`}>
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-xl ${sevConfig.bg} flex items-center justify-center flex-shrink-0`}>
                <SevIcon className={sevConfig.text} size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider ${sevConfig.bg} ${sevConfig.text} border ${sevConfig.border}`}>{f.severity}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 uppercase tracking-wider font-medium">{f.type}</span>
                  <span className="text-xs text-stone-500">· Reported {f.date}</span>
                </div>
                <h3 className="text-base font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{f.target}</h3>
                {f.creator && <p className="text-xs text-stone-600 mb-1">{f.creator}</p>}
                <p className="text-sm text-stone-700 mb-1">{f.reason}</p>
                <p className="text-xs text-stone-500">Reported by: {f.reportedBy}</p>
                <div className="flex gap-2 mt-4 flex-wrap">
                  <button onClick={() => onAction("investigate", f)} className="bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1.5">
                    <Eye size={14} /> Investigate
                  </button>
                  <button onClick={() => onAction("resolve", f)} className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> Mark resolved
                  </button>
                  <button onClick={() => onAction("escalate", f)} className="bg-white border border-stone-300 hover:border-stone-400 text-stone-700 px-4 py-2 rounded-lg text-sm font-medium">
                    Escalate
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

// ===== DBS orders =====
const AdminDBSOrders = ({ orders }) => (
  <div>
    <div className="mb-6">
      <h1 className="text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>DBS check orders</h1>
      <p className="text-stone-600">Live pipeline of checks processing through our umbrella body partner</p>
    </div>

    <div className="grid grid-cols-4 gap-3 mb-6">
      {[
        { label: "Ordered this month", value: "26", color: "bg-stone-900" },
        { label: "In progress", value: "12", color: "bg-amber-500" },
        { label: "Completed this week", value: "8", color: "bg-emerald-700" },
        { label: "Failed/returned", value: "1", color: "bg-rose-500" }
      ].map(s => (
        <div key={s.label} className="bg-white border border-stone-200 rounded-2xl p-4">
          <div className={`w-2 h-2 rounded-full ${s.color} mb-2`}></div>
          <p className="text-2xl font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{s.value}</p>
          <p className="text-xs text-stone-500 mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>

    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 border-b border-stone-200">
          <tr>
            <th className="text-left text-xs uppercase tracking-wider text-stone-500 font-medium px-5 py-3">Candidate</th>
            <th className="text-left text-xs uppercase tracking-wider text-stone-500 font-medium px-5 py-3">Ordered by</th>
            <th className="text-left text-xs uppercase tracking-wider text-stone-500 font-medium px-5 py-3">Type</th>
            <th className="text-left text-xs uppercase tracking-wider text-stone-500 font-medium px-5 py-3">Stage</th>
            <th className="text-left text-xs uppercase tracking-wider text-stone-500 font-medium px-5 py-3">Progress</th>
            <th className="text-left text-xs uppercase tracking-wider text-stone-500 font-medium px-5 py-3">Ordered</th>
          </tr>
        </thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
              <td className="px-5 py-4 text-stone-900 font-medium">{o.candidate}</td>
              <td className="px-5 py-4 text-stone-700">{o.mosque}</td>
              <td className="px-5 py-4"><span className="text-[10px] px-2 py-0.5 bg-stone-100 rounded-full uppercase tracking-wider font-medium text-stone-700">{o.type}</span></td>
              <td className="px-5 py-4 text-stone-700">{o.stage}</td>
              <td className="px-5 py-4">
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${o.progress === 100 ? "bg-emerald-600" : "bg-amber-500"}`} style={{ width: `${o.progress}%` }}></div>
                  </div>
                  <span className="text-xs text-stone-500">{o.progress}%</span>
                </div>
              </td>
              <td className="px-5 py-4 text-stone-500 text-xs">{o.orderedDate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ===== Admin panel shell =====
const AdminPanel = ({ onExit }) => {
  const [section, setSection] = useState("overview");
  const [mosqueApps, setMosqueApps] = useState(ADMIN_MOSQUE_APPS);
  const [scholarApps, setScholarApps] = useState(ADMIN_SCHOLAR_APPS);
  const [campaignApps, setCampaignApps] = useState(ADMIN_CAMPAIGN_APPS);
  const [flags, setFlags] = useState(ADMIN_FLAGS);
  const [toast, setToast] = useState(null);

  const counts = {
    mosques: mosqueApps.length,
    scholars: scholarApps.length,
    campaigns: campaignApps.length,
    flags: flags.length,
    dbs: ADMIN_DBS_ORDERS.length
  };

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleMosqueAction = (action, app) => {
    setMosqueApps(mosqueApps.filter(a => a.id !== app.id));
    showToast(action === "approve" ? `${app.name} approved and live` : action === "reject" ? `${app.name} rejected` : `Info requested from ${app.name}`);
  };
  const handleScholarAction = (action, app) => {
    setScholarApps(scholarApps.filter(a => a.id !== app.id));
    showToast(action === "approve" ? `${app.name} approved and live` : action === "reject" ? `${app.name} rejected` : `Info requested from ${app.name}`);
  };
  const handleCampaignAction = (action, app) => {
    setCampaignApps(campaignApps.filter(a => a.id !== app.id));
    showToast(action === "approve" ? `Campaign "${app.title}" launched` : action === "reject" ? `Campaign rejected` : `Changes requested`);
  };
  const handleFlagAction = (action, flag) => {
    setFlags(flags.filter(f => f.id !== flag.id));
    showToast(action === "resolve" ? `Flag resolved` : action === "escalate" ? `Flag escalated` : `Investigation opened`);
  };

  return (
    <div className="min-h-screen bg-stone-50">
      <AdminSidebar active={section} onNavigate={setSection} onLogout={onExit} counts={counts} />
      <main className="ml-64 p-8 min-h-screen">
        {section === "overview" && <AdminOverview onNavigate={setSection} counts={counts} />}
        {section === "mosques" && <AdminMosqueQueue apps={mosqueApps} onAction={handleMosqueAction} />}
        {section === "scholars" && <AdminScholarQueue apps={scholarApps} onAction={handleScholarAction} />}
        {section === "campaigns" && <AdminCampaignQueue apps={campaignApps} onAction={handleCampaignAction} />}
        {section === "flags" && <AdminFlags flags={flags} onAction={handleFlagAction} />}
        {section === "dbs" && <AdminDBSOrders orders={ADMIN_DBS_ORDERS} />}
        {section === "users" && (
          <div>
            <h1 className="text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>All users</h1>
            <p className="text-stone-600 mb-8">Search, filter, and manage every account on the platform.</p>
            <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
              <Users className="mx-auto text-stone-300 mb-3" size={36} />
              <p className="text-stone-600">Full user management — coming in the next build.</p>
            </div>
          </div>
        )}
        {section === "settings" && (
          <div>
            <h1 className="text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Settings</h1>
            <p className="text-stone-600 mb-8">Platform configuration, fees, integrations, and admin team.</p>
            <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
              <Settings className="mx-auto text-stone-300 mb-3" size={36} />
              <p className="text-stone-600">Settings — coming in the next build.</p>
            </div>
          </div>
        )}
      </main>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-stone-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3" style={{ animation: "slideInRight 0.3s ease-out" }}>
          <CheckCircle2 className="text-emerald-400" size={18} />
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}
      <style>{`@keyframes slideInRight { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }`}</style>
    </div>
  );
};

// ==================== APP ROOT ====================
export default function App() {
  const [view, setView] = useState("publicHome");
  const [role, setRole] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedScholar, setSelectedScholar] = useState(null);
  const [selectedPkg, setSelectedPkg] = useState(null);
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  const [selectedImam, setSelectedImam] = useState(null);
  const [checks, setChecks] = useState(INITIAL_CHECKS);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [confirmedDonation, setConfirmedDonation] = useState(null);
  const [launchedCampaign, setLaunchedCampaign] = useState(null);
  const [campaignCreatorType, setCampaignCreatorType] = useState("mosque");
  const [reviewScholar, setReviewScholar] = useState(null);
  const [submittedReview, setSubmittedReview] = useState(null);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [myApplications, setMyApplications] = useState(MOCK_MY_APPLICATIONS);
  const [submittedApplication, setSubmittedApplication] = useState(null);
  const [registeredProfile, setRegisteredProfile] = useState(null);
  const [registrationType, setRegistrationType] = useState(null);
  const [scholarAvailability, setScholarAvailability] = useState(DEFAULT_AVAILABILITY);
  const [userAuthMode, setUserAuthMode] = useState("login");
  const [authedUser, setAuthedUser] = useState(null);
  const [authedProfile, setAuthedProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Check for existing session on page load — keeps users logged in across reloads
  useEffect(() => {
    getUser().then(async user => {
      setAuthedUser(user);
      if (user) {
        const profile = await getProfile();
        setAuthedProfile(profile);
      }
      setAuthLoading(false);
    });
  }, []);

  // Creator context for the launch flow — in real app this comes from auth
  const mosqueCreator = { name: "Masjid Al-Noor", city: "Birmingham" };
  const scholarCreator = { name: "Ustadh Yusuf Al-Rahman", city: "Birmingham" };
  const currentCreator = campaignCreatorType === "mosque" ? mosqueCreator : scholarCreator;

  // Mock completed booking for the review flow
  const mockBooking = { package: "Standard", completedDate: "yesterday" };

  if (view === "publicHome") return <PublicHome
    onCategory={(id) => { setSelectedCategory(id); setView("categoryListing"); }}
    onScholar={(s) => { setSelectedScholar(s); setView("scholarDetail"); }}
    onSignIn={(r) => {
      if (r === "prayer") { setView("prayerHub"); return; }
      if (r === "user") {
        // If already signed in, skip login and go straight to dashboard
        if (authedUser) { setView("userDashboard"); return; }
        setUserAuthMode("login"); setView("userAuth"); return;
      }
      // For mosque, imam, admin — go straight to role-specific login, skip picker
      setRole(r); setView("login");
    }}
    onCampaign={(c) => { setSelectedCampaign(c); setView("campaignDetail"); }}
    onAllCampaigns={() => setView("allCampaigns")}
    onLeaveReview={(s) => { setReviewScholar(s); setView("leaveReview"); }}
  />;
  if (view === "prayerHub") return <PrayerHub onBack={() => setView("publicHome")} onSignIn={(r) => { setRole(r); setView("login"); }} />;
  if (view === "userAuth") return <UserAuth mode={userAuthMode} onBack={() => setView("publicHome")} onComplete={async () => {
    const user = await getUser();
    setAuthedUser(user);
    if (user) {
      const profile = await getProfile();
      setAuthedProfile(profile);
    }
    setView("userDashboard");
  }} onSwitchMode={() => setUserAuthMode(userAuthMode === "login" ? "signup" : "login")} />;
  if (view === "userDashboard") return <UserDashboard
    profile={authedProfile}
    isDemo={!authedProfile}
    onProfileUpdate={(updated) => setAuthedProfile(updated)}
    onLogout={async () => { await signOut(); setAuthedUser(null); setAuthedProfile(null); setView("publicHome"); }}
    onPublic={() => setView("publicHome")}
    onBookAgain={(scholarId) => {
      const s = MOCK_SCHOLARS.find(x => x.id === scholarId);
      if (s) { setSelectedScholar(s); setView("scholarDetail"); }
    }}
    onReview={(scholarId) => {
      const s = MOCK_SCHOLARS.find(x => x.id === scholarId);
      if (s) { setReviewScholar(s); setView("leaveReview"); }
    }}
    onViewCampaign={(c) => { setSelectedCampaign(c); setView("campaignDetail"); }}
    onOpenMessages={() => { setRole("user"); setView("messagesInbox"); }}
  />;
  if (view === "leaveReview") return <LeaveReview scholar={reviewScholar} booking={mockBooking} onBack={() => setView("publicHome")} onSubmit={(r) => { setSubmittedReview(r); setView("reviewSubmitted"); }} />;
  if (view === "reviewSubmitted") return <ReviewSubmitted review={submittedReview} onHome={() => setView("publicHome")} />;
  if (view === "messagesInbox") return <MessagesInbox conversations={MOCK_CONVERSATIONS} onConversation={(c) => { setSelectedConversation(c); setView("conversationView"); }} onBack={() => setView(role === "mosque" ? "mosqueDashboard" : role === "user" ? "userDashboard" : "imamDashboard")} />;
  if (view === "conversationView") return <ConversationView conversation={selectedConversation} onBack={() => setView("messagesInbox")} />;
  if (view === "jobsBoard") return <JobsBoard onBack={() => setView("imamDashboard")} onJob={(j) => { setSelectedJob(j); setView("jobDetail"); }} myApplications={myApplications} />;
  if (view === "schedule") return <ScheduleView availability={scholarAvailability} bookings={DEFAULT_BOOKINGS} onBack={() => setView("imamDashboard")} onEditAvailability={() => setView("availabilityEditor")} />;
  if (view === "availabilityEditor") return <AvailabilityEditor availability={scholarAvailability} onBack={() => setView("schedule")} onChange={(a) => { setScholarAvailability(a); setView("schedule"); }} />;
  if (view === "jobDetail") return <JobDetail job={selectedJob} onBack={() => setView("jobsBoard")} onApply={(j) => { setSelectedJob(j); setView("applyJob"); }} applied={myApplications.some(a => a.jobId === selectedJob?.id)} />;
  if (view === "applyJob") return <ApplyToJob job={selectedJob} onBack={() => setView("jobDetail")} onSubmit={(app) => {
    const newApp = { id: `app-${Date.now()}`, jobId: app.job.id, status: "submitted", appliedDate: "just now", message: app.message };
    setMyApplications([newApp, ...myApplications]);
    setSubmittedApplication(app);
    setView("applicationSubmitted");
  }} />;
  if (view === "applicationSubmitted") return <ApplicationSubmitted application={submittedApplication} onJobs={() => setView("jobsBoard")} onHome={() => setView("imamDashboard")} />;
  if (view === "postJob") return <PostJob onBack={() => setView("mosqueDashboard")} onComplete={() => setView("mosqueDashboard")} mosqueName="Masjid Al-Noor" mosqueCity="Birmingham" />;
  if (view === "allCampaigns") return <AllCampaigns onBack={() => setView("publicHome")} onCampaign={(c) => { setSelectedCampaign(c); setView("campaignDetail"); }} onSignIn={(r) => { setRole(r); setView("login"); }} />;
  if (view === "campaignDetail") return <CampaignDetail campaign={selectedCampaign} onBack={() => setView("allCampaigns")} onDonate={(c) => { setSelectedCampaign(c); setView("donate"); }} />;
  if (view === "donate") return <DonateFlow campaign={selectedCampaign} onBack={() => setView("campaignDetail")} onDone={(d) => { setConfirmedDonation(d); setView("donationSuccess"); }} />;
  if (view === "donationSuccess") return <DonationSuccess donation={confirmedDonation} onHome={() => setView("publicHome")} />;
  if (view === "categoryListing") return <CategoryListing categoryId={selectedCategory} onBack={() => setView("publicHome")} onScholar={(s) => { setSelectedScholar(s); setView("scholarDetail"); }} onSignIn={(r) => { setRole(r); setView("login"); }} />;
  if (view === "scholarDetail") return <PublicScholarDetail scholar={selectedScholar} onBack={() => setView("publicHome")} onBook={(s, p) => { setSelectedScholar(s); setSelectedPkg(p); setView("bookingConfirm"); }} onMessage={() => { setSelectedConversation(MOCK_CONVERSATIONS[0]); setView("conversationView"); }} />;
  if (view === "bookingConfirm") return <BookingConfirm scholar={selectedScholar} pkg={selectedPkg} onBack={() => setView("scholarDetail")} onDone={(b) => { setConfirmedBooking(b); setView("bookingSuccess"); }} />;
  if (view === "bookingSuccess") return <BookingSuccess booking={confirmedBooking} onHome={() => setView("publicHome")} />;
  if (view === "rolePicker") return <RolePicker onPick={(r) => { setRole(r); setView("login"); }} onPublic={() => setView("publicHome")} />;
  if (view === "login") return <LoginScreen
    role={role}
    onLogin={() => setView(role === "mosque" ? "mosqueDashboard" : role === "admin" ? "adminPanel" : "imamDashboard")}
    onBack={() => setView("publicHome")}
    onGoRegister={() => setView(role === "mosque" ? "mosqueRegister" : "imamRegister")}
    onSwitchRole={(newRole) => setRole(newRole)}
  />;
  if (view === "mosqueRegister") return <MosqueRegister onBack={() => setView("login")} onComplete={(formData) => { setRegisteredProfile(formData); setRegistrationType("mosque"); setView("registrationPending"); }} />;
  if (view === "imamRegister") return <ImamRegister onBack={() => setView("login")} onComplete={(formData) => { setRegisteredProfile(formData); setRegistrationType("scholar"); setView("registrationPending"); }} />;
  if (view === "registrationPending") return <RegistrationPending type={registrationType} form={registeredProfile} onHome={() => setView("publicHome")} />;
  if (view === "adminPanel") return <AdminPanel onExit={() => setView("publicHome")} />;
  if (view === "mosqueDashboard") return <MosqueDashboard
    onLogout={() => setView("publicHome")}
    onPublic={() => setView("publicHome")}
    checks={checks}
    onOrderCheck={() => setView("orderCheck")}
    onViewImam={(i) => { setSelectedImam(i); setView("mosqueImamDetail"); }}
    onStartCampaign={() => { setCampaignCreatorType("mosque"); setView("createCampaign"); }}
    onOpenMessages={() => { setRole("mosque"); setView("messagesInbox"); }}
    onPostJob={() => setView("postJob")}
  />;
  if (view === "mosqueImamDetail") return <MosqueImamDetail imam={selectedImam} onBack={() => setView("mosqueDashboard")} />;
  if (view === "orderCheck") return <OrderCheck onBack={() => setView("mosqueDashboard")} onComplete={(form) => {
    const newCheck = { id: Date.now(), candidateName: form.candidateName, candidateEmail: form.candidateEmail, dbs: { type: form.dbsLevel.charAt(0).toUpperCase() + form.dbsLevel.slice(1), status: "awaitingcandidate", date: "—" }, rtw: { status: form.includeRtw ? "awaitingcandidate" : "incomplete", date: "—" }, requestedDate: new Date().toISOString().split("T")[0] };
    setChecks([newCheck, ...checks]);
    setView("mosqueDashboard");
  }} />;
  if (view === "imamDashboard") return <ImamDashboardView
    onLogout={() => setView("publicHome")}
    onPublic={() => setView("publicHome")}
    onStartCampaign={() => { setCampaignCreatorType("scholar"); setView("createCampaign"); }}
    onOpenMessages={() => { setRole("imam"); setView("messagesInbox"); }}
    onOpenJobs={() => setView("jobsBoard")}
    onOpenSchedule={() => setView("schedule")}
  />;
  if (view === "createCampaign") return <CreateCampaign
    creatorType={campaignCreatorType}
    creatorName={currentCreator.name}
    creatorCity={currentCreator.city}
    onBack={() => setView(campaignCreatorType === "mosque" ? "mosqueDashboard" : "imamDashboard")}
    onComplete={(form) => { setLaunchedCampaign(form); setView("campaignLaunched"); }}
  />;
  if (view === "campaignLaunched") return <CampaignLaunched
    campaign={launchedCampaign}
    onView={() => setView("publicHome")}
    onHome={() => setView(campaignCreatorType === "mosque" ? "mosqueDashboard" : "imamDashboard")}
  />;
  return null;
}
