import { useState, useEffect, useRef } from 'react';
import { ShieldCheck, CheckCircle2, AlertCircle, Mail, Lock, User, Loader2, Building2, Clock } from 'lucide-react';
import { supabase } from '../supabaseClient';
import {
  validateStaffInvite,
  acceptStaffInvite,
  signUpForStaffInvite,
} from '../auth';

// Phases drive the single render switch below.
//   validating       — initial token check
//   invalid          — token absent / not_found / expired / accepted / revoked
//   preview_anon     — token valid, no session; show signup form
//   submitting       — signUp in flight
//   email_sent       — Supabase confirmations on; user must verify
//                      via email before returning to complete acceptance
//   accepting        — token valid, session exists; firing acceptStaffInvite
//   accepted         — final confirmation screen
//   email_mismatch   — signed in as a different email than the invitee
//   accept_error     — accept_staff_invite returned ok=false for a
//                      reason other than the above (e.g. rpc_error)
const REASON_COPY = {
  not_found: "This invite link isn't valid. Ask your mosque admin to resend.",
  expired: 'This invite has expired. Ask your mosque admin to send a new one.',
  'status:accepted': "You've already accepted this invite. Sign in to view your role.",
  'status:revoked': 'This invite was revoked by your mosque admin.',
  'status:expired': 'This invite has expired. Ask your mosque admin to send a new one.',
};

function reasonText(reason, fallback) {
  if (!reason) return fallback;
  return REASON_COPY[reason] || fallback;
}

export default function MosqueStaffInviteAccept({ token, onBrowse }) {
  const [phase, setPhase] = useState('validating');
  const [invite, setInvite] = useState(null); // validate_staff_invite row
  const [session, setSession] = useState(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitError, setSubmitError] = useState(null);
  const [acceptResult, setAcceptResult] = useState(null);
  // Guard against double-firing acceptStaffInvite from the
  // mount-time check + the onAuthStateChange listener.
  const acceptedRef = useRef(false);

  // --- Mount: validate token + read existing session ---
  useEffect(() => {
    let cancelled = false;
    if (!token) { setPhase('invalid'); return; }

    (async () => {
      const row = await validateStaffInvite(token);
      if (cancelled) return;
      setInvite(row);
      if (!row || !row.valid) {
        setPhase('invalid');
        return;
      }
      const { data: { session: s } } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(s);
      setName(row.invitee_name || '');
      if (s) {
        runAcceptIfMatch(row, s);
      } else {
        setPhase('preview_anon');
      }
    })().catch((err) => {
      if (cancelled) return;
      console.error('[StaffInviteAccept] mount error', err);
      setPhase('invalid');
    });

    // Subscribe to auth changes for the post-verification return.
    // Supabase parses the verification URL fragment automatically
    // (detectSessionInUrl), then fires SIGNED_IN — we react here.
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (cancelled) return;
      if (event === 'SIGNED_IN' && s) {
        setSession(s);
        // Re-validate (in case the invite changed status while
        // they were away verifying email) then accept.
        validateStaffInvite(token).then((row) => {
          if (cancelled) return;
          setInvite(row);
          if (!row || !row.valid) { setPhase('invalid'); return; }
          runAcceptIfMatch(row, s);
        });
      }
    });

    return () => { cancelled = true; sub?.subscription?.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function runAcceptIfMatch(row, s) {
    if (acceptedRef.current) return;
    const userEmail = (s?.user?.email || '').toLowerCase();
    const inviteEmail = (row?.invitee_email || '').toLowerCase();
    if (userEmail !== inviteEmail) {
      setPhase('email_mismatch');
      return;
    }
    acceptedRef.current = true;
    setPhase('accepting');
    const result = await acceptStaffInvite(token);
    setAcceptResult(result);
    if (result?.ok) {
      setPhase('accepted');
    } else if (result?.reason && REASON_COPY[result.reason]) {
      // RPC rejection mappable to a friendly invalid state
      setInvite((prev) => ({ ...(prev || {}), valid: false, reason: result.reason }));
      setPhase('invalid');
    } else {
      setPhase('accept_error');
    }
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setSubmitError(null);

    if (!invite?.invitee_email) {
      setSubmitError('Invite is missing an email. Ask your mosque admin to resend.');
      return;
    }
    if (!name.trim()) { setSubmitError('Please enter your name.'); return; }
    if (!password || password.length < 8) {
      setSubmitError('Password must be at least 8 characters.');
      return;
    }

    setPhase('submitting');
    const { data, error } = await signUpForStaffInvite({
      email: invite.invitee_email,
      password,
      name: name.trim(),
      redirectTo: window.location.href,
    });

    if (error) {
      setSubmitError(error.message || 'Could not create account.');
      setPhase('preview_anon');
      return;
    }

    // If Supabase email confirmations are off, signUp returns a
    // session immediately — the SIGNED_IN listener picks it up and
    // fires acceptStaffInvite. We just transition through email_sent
    // briefly. If confirmations are on (Option B for Day 1), session
    // is null and the user must verify before returning.
    if (data?.session) {
      // Listener will run accept; stay in submitting until it lands
      return;
    }
    setPhase('email_sent');
  }

  async function handleSignOutAndRetry() {
    await supabase.auth.signOut();
    setSession(null);
    acceptedRef.current = false;
    setPhase('preview_anon');
  }

  // ---- RENDER ----

  if (phase === 'validating' || phase === 'accepting' || phase === 'submitting') {
    const labels = {
      validating: 'Checking your invite…',
      accepting: 'Finalising your acceptance…',
      submitting: 'Creating your account…',
    };
    return (
      <Frame>
        <div className="text-center">
          <Loader2 className="mx-auto text-brand-700 animate-spin mb-4" size={36} />
          <p className="text-sm text-stone-600">{labels[phase]}</p>
        </div>
      </Frame>
    );
  }

  if (phase === 'invalid') {
    const reason = invite?.reason || 'not_found';
    return (
      <Frame>
        <div className="text-center">
          <AlertCircle className="mx-auto text-stone-300 mb-4" size={36} />
          <h2 className="text-xl font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Invite unavailable</h2>
          <p className="text-sm text-stone-600 mb-2">{reasonText(reason, 'This invite link isn’t valid.')}</p>
          <p className="text-[11px] text-stone-400 font-mono break-all mb-5">Reason: {reason}</p>
          <button onClick={onBrowse} className="bg-brand-900 hover:bg-brand-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium">Browse Amanah</button>
        </div>
      </Frame>
    );
  }

  if (phase === 'email_sent') {
    return (
      <Frame>
        <div className="text-center">
          <Mail className="mx-auto text-brand-700 mb-4" size={36} />
          <h2 className="text-xl font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Check your email</h2>
          <p className="text-sm text-stone-600 mb-2">
            We've sent a verification email to <strong className="text-stone-900">{invite?.invitee_email}</strong>.
          </p>
          <p className="text-sm text-stone-600">
            Click the link in that email to verify your address — you'll land back here and your role at <strong>{invite?.mosque_name}</strong> will be set up automatically.
          </p>
        </div>
      </Frame>
    );
  }

  if (phase === 'email_mismatch') {
    return (
      <Frame>
        <div className="text-center">
          <AlertCircle className="mx-auto text-amber-600 mb-4" size={36} />
          <h2 className="text-xl font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Wrong account signed in</h2>
          <p className="text-sm text-stone-600 mb-1">
            You're signed in as <strong className="text-stone-900">{session?.user?.email}</strong>, but this invite is for <strong className="text-stone-900">{invite?.invitee_email}</strong>.
          </p>
          <p className="text-sm text-stone-600 mb-5">Sign out and try again with the invited email address.</p>
          <button onClick={handleSignOutAndRetry} className="bg-brand-900 hover:bg-brand-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium">Sign out and continue</button>
        </div>
      </Frame>
    );
  }

  if (phase === 'accept_error') {
    return (
      <Frame>
        <div className="text-center">
          <AlertCircle className="mx-auto text-rose-600 mb-4" size={36} />
          <h2 className="text-xl font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Couldn't complete acceptance</h2>
          <p className="text-sm text-stone-600 mb-3">Something went wrong while linking you to {invite?.mosque_name}. Please ask your mosque admin to resend the invite.</p>
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-2.5 mb-5 text-left">
            <p className="text-[11px] text-stone-400 font-mono break-all">Reason: {acceptResult?.reason || 'unknown'}</p>
            {acceptResult?.code && <p className="text-[11px] text-stone-400 font-mono break-all">Code: {acceptResult.code}</p>}
            {acceptResult?.message && <p className="text-[11px] text-stone-500 font-mono break-all">{acceptResult.message}</p>}
          </div>
          <button onClick={onBrowse} className="bg-brand-900 hover:bg-brand-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium">Browse Amanah</button>
        </div>
      </Frame>
    );
  }

  if (phase === 'accepted') {
    return (
      <Frame>
        <div className="text-center">
          <CheckCircle2 className="mx-auto text-brand-700 mb-4" size={40} />
          <h2 className="text-xl md:text-2xl font-semibold text-stone-900 mb-2" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>You're in</h2>
          <p className="text-sm text-stone-600 mb-4">
            Welcome to <strong className="text-stone-900">{invite?.mosque_name}</strong>. You've joined as <strong>{invite?.role}</strong>.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-left mb-5">
            <p className="text-xs font-medium text-amber-900 mb-1 flex items-center gap-1.5"><Clock size={12} /> Next step: Right-to-Work check</p>
            <p className="text-xs text-amber-800">
              Your status is set to <code className="font-mono text-[11px]">pending_rtw</code>. The RTW form ships in the next release; your mosque admin will let you know when it's live.
            </p>
          </div>
          <button onClick={onBrowse} className="bg-brand-900 hover:bg-brand-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium">Browse Amanah</button>
        </div>
      </Frame>
    );
  }

  // phase === 'preview_anon'
  return (
    <Frame wide>
      <div className="text-center mb-5">
        <ShieldCheck className="mx-auto text-brand-700 mb-3" size={32} />
        <h2 className="text-xl md:text-2xl font-semibold text-stone-900 mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>You've been invited</h2>
        <p className="text-sm text-stone-600">
          to join <strong className="text-stone-900">{invite?.mosque_name}</strong> as <strong>{invite?.role}</strong>.
        </p>
      </div>

      <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 mb-4 flex items-start gap-2">
        <Building2 className="text-stone-500 flex-shrink-0 mt-0.5" size={14} />
        <div className="text-xs text-stone-600 leading-relaxed">
          <p>Set a password to create your Amanah account. Your email is already linked to the invite.</p>
          <p className="mt-1.5 text-stone-500">Invite expires {invite?.expires_at ? new Date(invite.expires_at).toUTCString() : '—'}.</p>
        </div>
      </div>

      <form onSubmit={handleSignUp} className="space-y-3">
        <Field icon={Mail} label="Email">
          <input
            type="email"
            value={invite?.invitee_email || ''}
            readOnly
            className="w-full pl-9 pr-3 py-2.5 border border-stone-300 rounded-xl text-sm bg-stone-100 text-stone-700"
          />
        </Field>

        <Field icon={User} label="Your name">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Yusuf Ali"
            className="w-full pl-9 pr-3 py-2.5 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-transparent"
          />
        </Field>

        <Field icon={Lock} label="Password (8+ characters)">
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full pl-9 pr-3 py-2.5 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-transparent"
          />
        </Field>

        {submitError && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2">
            <AlertCircle className="text-rose-700 flex-shrink-0 mt-0.5" size={15} />
            <p className="text-xs text-rose-900">{submitError}</p>
          </div>
        )}

        <button
          type="submit"
          className="w-full bg-brand-900 hover:bg-brand-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium"
        >
          Create account & accept invite
        </button>
        <p className="text-[11px] text-stone-500 text-center">
          By accepting, you'll also receive a verification email from Supabase. Click it to finalise your acceptance.
        </p>
      </form>
    </Frame>
  );
}

// --- Small layout helpers (kept local; tiny + page-specific) ---

function Frame({ children, wide }) {
  const max = wide ? 'max-w-md' : 'max-w-md';
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className={`${max} w-full bg-white border border-stone-200 rounded-2xl p-6 md:p-8`}>
        {children}
      </div>
    </div>
  );
}

function Field({ icon: Icon, label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-stone-700 mb-1.5">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" size={15} />
        {children}
      </div>
    </div>
  );
}
