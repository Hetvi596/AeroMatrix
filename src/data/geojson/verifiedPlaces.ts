// Reference points used to request location-specific air-quality model data.
//
// Each point was looked up in OpenStreetMap (Nominatim search, accessed 10 Oct 2026)
// and records the OSM object it came from. The monitoring files carry no station
// coordinates, so a station's point is the OSM position of the area or landmark in its
// name, not the monitor's exact position. Where no OSM object matched, the station has
// no point and location-specific data is reported as unavailable.

import type { LonLat } from '../../types';

export type PlacePrecision = 'area centre' | 'campus' | 'point on the road' | 'landmark' | 'bus stop';

export interface VerifiedPlace {
  id: string;
  name: string;
  location: LonLat; // [lon, lat]
  precision: PlacePrecision;
  /** OSM object the point comes from. */
  osm: string;
  accessed: string;
}

const ACCESSED = '10 Oct 2026';
const P = (id: string, name: string, lat: number, lon: number, precision: PlacePrecision, osm: string): VerifiedPlace => ({
  id,
  name,
  location: [lon, lat],
  precision,
  osm,
  accessed: ACCESSED,
});

export const VERIFIED_PLACES: Record<string, VerifiedPlace> = {
  alandi: P('alandi', 'Alandi', 18.67724, 73.89811, 'area centre', 'node/3237435456'),
  nigdi: P('nigdi', 'Nigdi', 18.66077, 73.77783, 'area centre', 'node/681316519'),
  'karve-road': P('karve-road', 'Karve Road, Erandwane', 18.50793, 73.83007, 'point on the road', 'way/1043506203'),
  sppu: P('sppu', 'Savitribai Phule Pune University', 18.55284, 73.82664, 'campus', 'way/995138926'),
  'bhumkar-nagar': P('bhumkar-nagar', 'Bhumkar Nagar', 18.60303, 73.74941, 'bus stop', 'node/10726443000'),
  dhankawadi: P('dhankawadi', 'Dhankawadi', 18.46542, 73.85015, 'bus stop', 'node/13781681733'),
  'katraj-dairy': P('katraj-dairy', 'Katraj Dairy', 18.45382, 73.85696, 'landmark', 'way/1232397249'),
  pashan: P('pashan', 'Pashan', 18.53867, 73.79525, 'area centre', 'node/761969935'),
  bhosari: P('bhosari', 'Bhosari', 18.62101, 73.85013, 'area centre', 'node/1226551292'),
  hadapsar: P('hadapsar', 'Hadapsar', 18.50077, 73.93791, 'bus stop', 'node/2280623602'),
  shivajinagar: P('shivajinagar', 'Shivajinagar', 18.52946, 73.84782, 'area centre', 'node/1229128806'),
  kothrud: P('kothrud', 'Kothrud', 18.50726, 73.80567, 'area centre', 'relation/19586503'),
  swargate: P('swargate', 'Swargate', 18.50068, 73.85863, 'area centre', 'node/245646553'),
};

/**
 * Monitoring station (backend id) → reference point. null: no OSM object matched the
 * station's name, so no location-specific value is requested for it.
 */
export const STATION_PLACE: Record<string, string | null> = {
  site_292: 'karve-road', // Karve Road, Pune - MPCB
  site_5404: null, // Mhada Colony, Pune - IITM: no matching place found
  site_5405: 'alandi',
  site_5406: 'bhosari',
  site_5407: 'hadapsar',
  site_5408: 'nigdi', // Transport Nagar-Nigdi
  site_5409: 'shivajinagar', // Revenue Colony-Shivajinagar
  site_5766: 'katraj-dairy',
  site_5767: 'sppu',
  site_5988: 'bhumkar-nagar',
  site_5996: 'pashan', // Panchawati Pashan
  site_6012: 'dhankawadi',
};

export function stationPlace(stationId: string): VerifiedPlace | null {
  const id = STATION_PLACE[stationId];
  return id ? (VERIFIED_PLACES[id] ?? null) : null;
}
