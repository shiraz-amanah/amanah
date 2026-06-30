// Shared adhan/iqamah time-input pair, used by the prayer-times editor and the
// Ramadan mode/times editor. Module-level (stable component identity) so the
// native time inputs don't remount and lose focus on each keystroke — that bug
// is why it can't live inside a parent component body.

const labelCls = "text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1";
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 outline-none text-sm";

const TimePair = ({ value, onAdhan, onIqamah, labelAr, labelEn }) => (
  <div className="bg-stone-50 border border-stone-200 rounded-xl p-3">
    <p className="text-sm font-medium text-stone-800">{labelEn} <span className="text-stone-400" dir="rtl" lang="ar" style={{ fontFamily: "'Amiri', serif" }}>{labelAr}</span></p>
    <div className="grid grid-cols-2 gap-2 mt-2">
      <div><label className={labelCls}>Adhan</label><input type="time" className={inputCls} value={value.adhan} onChange={(e) => onAdhan(e.target.value)} /></div>
      <div><label className={labelCls}>Iqamah</label><input type="time" className={inputCls} value={value.iqamah} onChange={(e) => onIqamah(e.target.value)} /></div>
    </div>
  </div>
);

export default TimePair;
