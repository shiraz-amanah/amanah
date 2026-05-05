import { useState } from "react";

// Haversine distance between two lat/lng points, returns km
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Custom hook for browser geolocation
// Returns { coords: {lat, lng} | null, status: 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported' }
export function useGeolocation() {
  const [coords, setCoords] = useState(null);
  const [status, setStatus] = useState('idle');

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setStatus('unsupported');
      return;
    }
    setStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus('granted');
      },
      (err) => {
        console.warn('Geolocation error:', err.message);
        setStatus('denied');
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  return { coords, status, requestLocation };
}
