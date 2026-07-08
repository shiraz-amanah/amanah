// useUrlState — lightweight pushState/popstate wrapper around the
// native History API. No router dependency: a single hook exposes the
// current { view, params, query } parsed from window.location, plus a
// navigate(view, params, query) that pushes a real URL into history.
// View names match the existing setView strings in App.jsx so the
// migration is mechanical.

import { useState, useEffect, useCallback } from 'react';

// ==================== ROUTE SCHEMA ====================
// Path tokens like ":slug" are captured into params. Order matters —
// more specific patterns must come before catch-alls. Unknown paths
// fall back to publicHome.
const ROUTES = [
  // Public
  { view: 'publicHome',                  path: '/' },
  { view: 'mosquesListing',              path: '/mosques' },
  { view: 'mosqueDetail',                path: '/mosque/:slug' },
  { view: 'allCampaigns',                path: '/campaigns' },
  { view: 'campaignDetail',              path: '/campaign/:id' },
  { view: 'scholarDetail',               path: '/scholar/:slug' },
  { view: 'categoryListing',             path: '/category/:id' },
  { view: 'prayerHub',                   path: '/prayer' },
  // Public QR check-in landing (?mosque=&session=). No auth required.
  { view: 'communityCheckIn',            path: '/check-in' },
  // Public Pledge Night page (?mosque=&session=). No auth required.
  { view: 'pledgePublic',                path: '/pledge' },
  // Legal policy pages (static). No auth required.
  { view: 'privacyPolicy',               path: '/privacy-policy' },
  { view: 'termsOfService',              path: '/terms' },
  { view: 'cookiePolicy',                path: '/cookies' },

  // Auth
  { view: 'userAuth',                    path: '/auth' },
  { view: 'rolePicker',                  path: '/signin' },
  { view: 'login',                       path: '/login' },
  { view: 'imamRegister',                path: '/register/scholar' },
  { view: 'mosqueRegister',              path: '/register/mosque' },
  { view: 'registrationPending',         path: '/registration-pending' },

  // Onboarding
  { view: 'scholarOnboarding',           path: '/onboarding/scholar' },
  { view: 'scholarOnboardingSuccess',    path: '/onboarding/scholar/success' },
  { view: 'scholarApplicationSubmitted', path: '/onboarding/scholar/submitted' },
  { view: 'scholarApplicationRejected',  path: '/onboarding/scholar/rejected' },
  { view: 'scholarVerificationPending',  path: '/onboarding/scholar/pending' },
  { view: 'mosqueOnboarding',            path: '/onboarding/mosque' },
  { view: 'mosqueApplicationSubmitted',  path: '/onboarding/mosque/submitted' },
  { view: 'mosqueApplicationRejected',   path: '/onboarding/mosque/rejected' },
  { view: 'mosqueVerificationPending',   path: '/onboarding/mosque/pending' },

  // Dashboards (tabs via ?tab=X / ?section=X)
  { view: 'userDashboard',               path: '/dashboard' },
  { view: 'scholarDashboard',            path: '/scholar-dashboard' },
  { view: 'mosqueDashboard',             path: '/mosque-dashboard' },
  { view: 'imamDashboard',               path: '/imam-dashboard' },

  // Booking flow
  { view: 'bookingConfirm',              path: '/book' },
  { view: 'bookingSuccess',              path: '/book/success' },

  // Donate flow
  { view: 'donate',                      path: '/donate' },
  { view: 'donationSuccess',             path: '/donate/success' },

  // Campaign authoring
  { view: 'createCampaign',              path: '/campaign/new' },
  { view: 'campaignLaunched',            path: '/campaign/launched' },

  // Reviews
  { view: 'leaveReview',                 path: '/review/new' },
  { view: 'reviewSubmitted',             path: '/review/submitted' },

  // Messaging
  { view: 'messagesInbox',               path: '/messages' },
  { view: 'conversationView',            path: '/messages/:id' },

  // Jobs
  { view: 'jobsBoard',                   path: '/jobs' },
  { view: 'postJob',                     path: '/jobs/new' },
  { view: 'applyJob',                    path: '/jobs/:id/apply' },
  { view: 'applicationSubmitted',        path: '/jobs/submitted' },
  { view: 'jobDetail',                   path: '/jobs/:id' },

  // Schedule
  { view: 'schedule',                    path: '/schedule' },
  { view: 'availabilityEditor',          path: '/schedule/edit' },

  // Order check (DBS)
  { view: 'orderCheck',                  path: '/order-check' },

  // Admin
  { view: 'adminLogin',                  path: '/admin/login' },
  { view: 'adminPanel',                  path: '/admin' },

  // Mosque internal
  { view: 'mosqueImamDetail',            path: '/mosque/imam/:slug' },

  // Staff invites (Session M Part B Day 1).
  // /mosque-dashboard/staff  — admin-facing invite wizard
  // /staff/accept/:token     — invitee-facing accept page
  { view: 'mosqueStaff',                 path: '/mosque-dashboard/staff' },
  { view: 'staffAccept',                 path: '/staff/accept/:token' },
  // Session W — remote staff onboarding wizard landing.
  { view: 'staffWizard',                 path: '/staff/onboard/:token' },
  // Session AM — public contract e-sign landing.
  { view: 'contractSign',                path: '/contract/sign/:token' },
  // Session AL — Path B madrasah enrolment accept (parent completes registration).
  { view: 'madrasaEnrolAccept',          path: '/enrol/accept/:token' },
  // Session AP — approved mosque-claim accept landing.
  { view: 'mosqueClaimAccept',           path: '/mosque/claim/accept/:token' },
];

const COMPILED = ROUTES.map(r => {
  const paramNames = [];
  const pattern = r.path.replace(/:([a-zA-Z]+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  return { ...r, regex: new RegExp(`^${pattern}/?$`), paramNames };
});

const VIEW_TO_ROUTE = Object.fromEntries(ROUTES.map(r => [r.view, r]));

export function parseUrl(pathname, search = '') {
  for (const r of COMPILED) {
    const m = pathname.match(r.regex);
    if (m) {
      const params = {};
      r.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
      const query = {};
      new URLSearchParams(search).forEach((v, k) => { query[k] = v; });
      return { view: r.view, params, query };
    }
  }
  return { view: 'publicHome', params: {}, query: {} };
}

export function buildUrl(view, params = {}, query = {}) {
  const route = VIEW_TO_ROUTE[view];
  if (!route) {
    console.warn(`[useUrlState] Unknown view: ${view}`);
    return '/';
  }
  const path = route.path.replace(/:([a-zA-Z]+)/g, (_, name) => {
    const v = params[name];
    if (v == null) {
      console.warn(`[useUrlState] Missing param "${name}" for view "${view}"`);
      return '';
    }
    return encodeURIComponent(v);
  });
  const qs = Object.entries(query)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return qs ? `${path}?${qs}` : path;
}

export function useUrlState() {
  const [state, setState] = useState(() =>
    parseUrl(window.location.pathname, window.location.search)
  );

  // Stamp the current (initial / refreshed / deep-linked) entry with a depth
  // index so goBack() can tell whether there is in-app history to return to
  // versus a cold/deep-link entry where Back would leave the site.
  useEffect(() => {
    if (window.history.state?.idx == null) {
      window.history.replaceState({ ...(window.history.state || {}), idx: 0 }, '');
    }
  }, []);

  useEffect(() => {
    const onPop = () => {
      setState(parseUrl(window.location.pathname, window.location.search));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((view, params = {}, query = {}, opts = {}) => {
    const url = buildUrl(view, params, query);
    const curIdx = window.history.state?.idx ?? 0;
    const idx = opts.replace ? curIdx : curIdx + 1;
    const method = opts.replace ? 'replaceState' : 'pushState';
    window.history[method]({ view, params, query, idx }, '', url);
    setState({ view, params, query });
  }, []);

  // The single back primitive for every view-level back button. Returns to the
  // actual previous view when in-app history exists (so Back is always correct,
  // regardless of how the user got here); only on a cold/deep-link entry does it
  // fall back to a sensible parent view so Back never dead-ends off-site.
  const goBack = useCallback((fallbackView = 'publicHome', fallbackQuery = {}) => {
    const curIdx = window.history.state?.idx ?? 0;
    if (curIdx > 0) {
      window.history.back();
    } else {
      const url = buildUrl(fallbackView, {}, fallbackQuery);
      window.history.replaceState({ view: fallbackView, params: {}, query: fallbackQuery, idx: 0 }, '', url);
      setState({ view: fallbackView, params: {}, query: fallbackQuery });
    }
  }, []);

  return { ...state, navigate, goBack };
}
