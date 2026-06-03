import { useState } from "react";
import { CheckCircle2, ArrowRight } from "lucide-react";

// Post-submission confirmation for the scholar onboarding wizard. Shows a
// reference number and tailors the copy for existing-DBS applicants (their cert
// is verified rather than a new check arranged).

const ScholarOnboardingSuccess = ({ application, onExplore }) => {
  // Booking-style reference, generated once on mount. Math.random is fine in the
  // browser; prefix matches the platform's AMN-XXXXXXXX convention.
  const [ref] = useState(() => "AMN-" + String(Math.floor(10000000 + Math.random() * 90000000)));
  const isExisting = application?.dbsOption === "existing";

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-3xl mx-auto px-5 md:px-6 py-3.5">
          <span className="text-lg font-semibold text-emerald-900 tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Amanah</span>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-5 py-12">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 size={34} className="text-emerald-600" />
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-3" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
            Application submitted — JazakAllah khair!
          </h1>
          <p className="text-stone-600 text-sm leading-relaxed mb-2">
            We'll review your application and DBS documentation. You'll hear from us within 3–5 working days.
          </p>
          {isExisting && (
            <p className="text-stone-600 text-sm leading-relaxed mb-2">Our team will verify your existing certificate.</p>
          )}

          <div className="inline-flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-4 py-2.5 mt-4 mb-7">
            <span className="text-xs text-stone-500 uppercase tracking-wider">Application ref</span>
            <span className="text-sm font-mono font-semibold text-stone-900">{ref}</span>
          </div>

          <div>
            <button
              onClick={onExplore}
              className="inline-flex items-center gap-2 bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium px-5 py-3 rounded-xl transition-all hover:scale-[1.02] active:scale-95"
            >
              While you wait, explore Amanah <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScholarOnboardingSuccess;
