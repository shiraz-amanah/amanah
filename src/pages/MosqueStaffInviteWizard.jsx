import { useState } from 'react';
import { ArrowLeft, ShieldCheck, Mail, User, Users, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { createStaffInvite } from '../auth';
import { sendStaffInviteEmail } from '../lib/resend';

const ROLE_OPTIONS = [
  { value: 'imam', label: 'Imam' },
  { value: 'admin', label: 'Admin' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'other', label: 'Other' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function MosqueStaffInviteWizard({ mosque, onBack }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('imam');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { invitee_email, emailOk }

  if (!mosque) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="max-w-md w-full bg-white border border-stone-200 rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto text-stone-300 mb-4" size={36} />
          <h2 className="text-xl font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>No mosque linked</h2>
          <p className="text-sm text-stone-600 mb-5">Sign in via the mosque admin path to manage staff.</p>
          <button onClick={onBack} className="bg-emerald-900 hover:bg-emerald-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium">Back</button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!role) {
      setError('Please select a role.');
      return;
    }

    setSubmitting(true);
    const { data, error: insertErr } = await createStaffInvite({
      mosqueId: mosque.id,
      email: trimmedEmail,
      name: name.trim() || null,
      role,
    });

    if (insertErr) {
      // 23505 = unique_violation (duplicate live invite for this email)
      if (insertErr.code === '23505') {
        setError(`A pending invite already exists for ${trimmedEmail}. Revoke or wait for it to expire (24h) before re-inviting.`);
      } else {
        setError(insertErr.message || 'Could not create invite.');
      }
      setSubmitting(false);
      return;
    }

    // Best-effort email send. If this fails the row still exists; the
    // admin can re-send from a future "pending invites" surface.
    const emailRes = await sendStaffInviteEmail({ token: data.token });
    setResult({ invitee_email: data.invitee_email, emailOk: emailRes.ok, emailError: emailRes.error });
    setSubmitting(false);
  };

  const reset = () => {
    setEmail('');
    setName('');
    setRole('imam');
    setResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-5 md:px-6 py-3.5 md:py-4 flex items-center gap-3">
          <button onClick={onBack} className="text-stone-600 hover:text-stone-900 p-2 -ml-2" aria-label="Back"><ArrowLeft size={18} /></button>
          <div className="w-9 h-9 rounded-xl bg-emerald-700 flex items-center justify-center shadow-md">
            <ShieldCheck className="text-emerald-50" size={18} />
          </div>
          <div className="text-left">
            <h1 className="text-base md:text-lg font-semibold text-stone-900" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Invite staff</h1>
            <p className="text-[11px] md:text-xs text-stone-500 truncate max-w-[60vw]">{mosque.name} · {mosque.city}</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 md:px-6 py-6 md:py-10">
        {result ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-6 md:p-8 max-w-xl mx-auto">
            <div className="text-center">
              <CheckCircle2 className="mx-auto text-emerald-700 mb-4" size={40} />
              <h2 className="text-xl md:text-2xl font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Invite sent</h2>
              <p className="text-sm text-stone-600">
                We've emailed <strong className="text-stone-900">{result.invitee_email}</strong> with a link to join {mosque.name}. The invite expires in 24 hours.
              </p>
              {!result.emailOk && (
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-left">
                  <p className="text-xs text-amber-900 font-medium mb-1">Invite created, but the email didn't send.</p>
                  <p className="text-xs text-amber-800">
                    The pending invite row exists — share the accept link manually, or re-send once the email service is reachable. Reason: <code className="font-mono text-[11px]">{result.emailError || 'unknown'}</code>.
                  </p>
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mt-6 justify-center">
              <button onClick={reset} className="bg-emerald-900 hover:bg-emerald-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium">Invite another</button>
              <button onClick={onBack} className="bg-white border border-stone-300 hover:border-stone-400 text-stone-700 px-5 py-2.5 rounded-xl text-sm font-medium">Back to dashboard</button>
            </div>
          </div>
        ) : (
          <div className="max-w-xl mx-auto">
            <div className="mb-5">
              <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 tracking-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Invite a staff member</h2>
              <p className="text-sm text-stone-600">They'll receive an email with a 24-hour link to set up their account and join {mosque.name}.</p>
            </div>

            <form onSubmit={handleSubmit} className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1.5" htmlFor="invitee-email">Email address <span className="text-rose-600">*</span></label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={15} />
                  <input
                    id="invitee-email"
                    type="email"
                    required
                    autoComplete="off"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={submitting}
                    placeholder="staff@example.com"
                    className="w-full pl-9 pr-3 py-2.5 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-transparent disabled:bg-stone-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1.5" htmlFor="invitee-name">Name <span className="text-stone-400">(optional)</span></label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={15} />
                  <input
                    id="invitee-name"
                    type="text"
                    autoComplete="off"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={submitting}
                    placeholder="e.g. Yusuf Ali"
                    className="w-full pl-9 pr-3 py-2.5 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-transparent disabled:bg-stone-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1.5" htmlFor="invitee-role">Role <span className="text-rose-600">*</span></label>
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" size={15} />
                  <select
                    id="invitee-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    disabled={submitting}
                    className="w-full pl-9 pr-3 py-2.5 border border-stone-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-transparent disabled:bg-stone-50 appearance-none"
                  >
                    {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle className="text-rose-700 flex-shrink-0 mt-0.5" size={15} />
                  <p className="text-xs text-rose-900">{error}</p>
                </div>
              )}

              <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-end">
                <button
                  type="button"
                  onClick={onBack}
                  disabled={submitting}
                  className="bg-white border border-stone-300 hover:border-stone-400 text-stone-700 px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !email.trim()}
                  className="inline-flex items-center justify-center gap-2 bg-emerald-900 hover:bg-emerald-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={14} /> {submitting ? 'Sending…' : 'Send invite'}
                </button>
              </div>
            </form>

            <p className="text-[11px] text-stone-500 mt-3 text-center">Invitees receive two emails: this invite link, plus a Supabase verification email after they sign up. Day-1 limitation.</p>
          </div>
        )}
      </main>
    </div>
  );
}
