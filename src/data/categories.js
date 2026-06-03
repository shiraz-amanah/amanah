import { Baby, Globe, BookOpen, BookMarked, Heart, Sparkles, Home, MessageCircle, Mic, BookHeart, GraduationCap, Moon } from "lucide-react";

export const CATEGORIES = [
  { id: "quran-kids", name: "Qur'an for Kids", icon: Baby, desc: "1-on-1 tajweed for children", tint: "from-amber-100 to-amber-50", iconBg: "bg-amber-500", count: 24 },
  { id: "arabic", name: "Arabic Lessons", icon: Globe, desc: "Modern & Classical Arabic", tint: "from-sky-100 to-sky-50", iconBg: "bg-sky-500", count: 31 },
  { id: "islamic-studies", name: "Islamic Studies", icon: BookOpen, desc: "Aqeedah, fiqh, seerah", tint: "from-emerald-100 to-emerald-50", iconBg: "bg-emerald-600", count: 18 },
  { id: "hifz", name: "Hifz Programmes", icon: BookMarked, desc: "Structured memorisation", tint: "from-purple-100 to-purple-50", iconBg: "bg-purple-600", count: 12 },
  { id: "revert", name: "Revert Support", icon: Heart, desc: "Guidance for new Muslims", tint: "from-rose-100 to-rose-50", iconBg: "bg-rose-500", count: 9 },
  { id: "nikah", name: "Nikah Services", icon: Sparkles, desc: "Marriage officiation", tint: "from-fuchsia-100 to-fuchsia-50", iconBg: "bg-fuchsia-500", count: 15 },
  { id: "janazah", name: "Janazah & Duas", icon: Home, desc: "Funeral & home visits", tint: "from-stone-100 to-stone-50", iconBg: "bg-stone-600", count: 22 },
  { id: "counselling", name: "Islamic Counselling", icon: MessageCircle, desc: "Faith-based support", tint: "from-indigo-100 to-indigo-50", iconBg: "bg-indigo-600", count: 7 },
  { id: "tajweed", name: "Tajweed", icon: Mic, desc: "Rules of Quranic recitation", tint: "from-teal-100 to-teal-50", iconBg: "bg-teal-600", count: 11 },
  { id: "childrens-stories", name: "Children's Islamic Stories", icon: BookHeart, desc: "Islamic storytelling for kids", tint: "from-orange-100 to-orange-50", iconBg: "bg-orange-500", count: 6 },
  { id: "aalim-course", name: "Aalim Course / Dars-e-Nizami", icon: GraduationCap, desc: "Traditional Islamic seminary curriculum", tint: "from-green-100 to-green-50", iconBg: "bg-green-700", count: 4 },
  { id: "spirituality", name: "Spirituality & Tasawwuf", icon: Moon, desc: "Islamic spirituality and self-purification", tint: "from-lime-100 to-lime-50", iconBg: "bg-emerald-700", count: 8 }
];
