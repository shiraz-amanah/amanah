import { useEffect, useRef } from "react";
import { getMyCommunityMemberships, getCommunityCurrentSession, getMosqueById, communityCheckIn } from "../auth";
import { haversineDistance } from "./geo";

const GEO_OPTIN_KEY = "amanah_geofence_optin";
const GEOFENCE_METRES = 100;

// Passive, site-wide geofence auto check-in (Session AZ, item 6). Runs ONCE after
// the user is authenticated, on ANY page — not just the Community tab. If they've
// opted in (localStorage) and have an OPEN session at a mosque they belong to and
// are within 100m, they're silently checked in. No UI at all except a success
// toast via onCheckedIn. Location is requested once; if permission was already
// granted (opt-in implies a prior grant) the browser resolves it silently.
// member_id + dedup are enforced server-side (community_check_in resolves the
// member from auth.uid() and the partial-unique index dedups vs any QR scan).
export function useSilentGeofence(userId, onCheckedIn) {
  const fired = useRef(false);
  useEffect(() => {
    if (!userId || fired.current) return;
    let optedIn = false;
    try { optedIn = localStorage.getItem(GEO_OPTIN_KEY) === "1"; } catch { /* ignore */ }
    if (!optedIn || typeof navigator === "undefined" || !navigator.geolocation) return;
    fired.current = true;
    let cancelled = false;

    (async () => {
      try {
        const memberships = await getMyCommunityMemberships();
        if (cancelled || !memberships.length) return;

        // Which of the member's mosques have an open session + usable coords?
        const open = [];
        for (const m of memberships) {
          const session = await getCommunityCurrentSession(m.mosque_id);
          if (!session) continue;
          const mosque = await getMosqueById(m.mosque_id);
          if (mosque && mosque.lat != null && mosque.lng != null) open.push({ session, mosque });
        }
        if (cancelled || !open.length) return;

        // One location read for all candidates.
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000, maximumAge: 60000 })
        ).catch(() => null);
        if (cancelled || !pos) return;

        for (const { session, mosque } of open) {
          const metres = Math.round(haversineDistance(pos.coords.latitude, pos.coords.longitude, Number(mosque.lat), Number(mosque.lng)) * 1000);
          if (metres > GEOFENCE_METRES) continue;
          const { data, error } = await communityCheckIn({ sessionId: session.id, method: "geofence" });
          if (!error && data && !data.already) onCheckedIn?.(session.name, mosque.name);
          return; // at most one check-in per page load
        }
      } catch { /* silent — geofence must never surface an error */ }
    })();

    return () => { cancelled = true; };
  }, [userId]);
}
