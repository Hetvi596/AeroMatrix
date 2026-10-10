// Major Pune / Pimpri-Chinchwad localities for map labels and "Go to area" shortcuts.
// Coordinates are APPROXIMATE area centres (± a few hundred metres), intended for
// navigation only — not survey-grade boundaries.

import type { LonLat } from '../../types';

export type LocalityRegion = 'Central' | 'East' | 'West' | 'North' | 'South' | 'PCMC';

export interface Locality {
  id: string;
  name: string;
  region: LocalityRegion;
  location: LonLat; // [lon, lat]
  /** Optional alternative names used for search. */
  aliases?: string[];
}

const L = (name: string, region: LocalityRegion, lat: number, lon: number, aliases?: string[]): Locality => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  region,
  location: [lon, lat],
  aliases,
});

export const PUNE_LOCALITIES: Locality[] = [
  // Central / old city
  L('Shivajinagar', 'Central', 18.5308, 73.8475),
  L('Deccan Gymkhana', 'Central', 18.5167, 73.8414, ['Deccan']),
  L('FC Road', 'Central', 18.5245, 73.841, ['Fergusson College Road']),
  L('JM Road', 'Central', 18.5196, 73.8466, ['Jangli Maharaj Road']),
  L('Shaniwar Wada', 'Central', 18.5195, 73.8553, ['Kasba Peth', 'Peth areas']),
  L('Sadashiv Peth', 'Central', 18.5095, 73.8495),
  L('Swargate', 'Central', 18.5018, 73.8636),
  L('Pune Station', 'Central', 18.5286, 73.8743, ['Railway Station']),
  L('Camp', 'Central', 18.511, 73.882, ['Pune Cantonment', 'Cantonment']),
  L('MG Road', 'Central', 18.5175, 73.8781, ['Mahatma Gandhi Road']),
  L('Model Colony', 'Central', 18.528, 73.836),
  L('Erandwane', 'Central', 18.51, 73.832),
  L('Parvati', 'Central', 18.497, 73.847, ['Parvati Hill']),
  L('Bund Garden', 'Central', 18.539, 73.884),
  // East
  L('Koregaon Park', 'East', 18.5362, 73.894, ['KP']),
  L('Kalyani Nagar', 'East', 18.5463, 73.9033),
  L('Yerawada', 'East', 18.5518, 73.8872, ['Yerwada']),
  L('Viman Nagar', 'East', 18.5679, 73.9143),
  L('Pune Airport', 'East', 18.5793, 73.9089, ['Lohegaon Airport', 'Airport']),
  L('Lohegaon', 'East', 18.5925, 73.928),
  L('Kharadi', 'East', 18.5515, 73.9348, ['EON IT Park']),
  L('Wagholi', 'East', 18.58, 73.982),
  L('Mundhwa', 'East', 18.533, 73.929),
  L('Ghorpadi', 'East', 18.526, 73.9),
  L('Magarpatta', 'East', 18.5155, 73.929, ['Magarpatta City']),
  L('Hadapsar', 'East', 18.5018, 73.9405),
  L('Fatima Nagar', 'East', 18.503, 73.901),
  L('Wanowrie', 'East', 18.4935, 73.9005),
  // South
  L('Kondhwa', 'South', 18.47, 73.89),
  L('NIBM Road', 'South', 18.476, 73.903, ['NIBM']),
  L('Undri', 'South', 18.456, 73.912),
  L('Salisbury Park', 'South', 18.4955, 73.873),
  L('Market Yard', 'South', 18.488, 73.865),
  L('Bibwewadi', 'South', 18.473, 73.866),
  L('Katraj', 'South', 18.4575, 73.858),
  L('Sahakar Nagar', 'South', 18.487, 73.853),
  L('Dhayari', 'South', 18.445, 73.81, ['Sinhagad Road']),
  L('Karve Nagar', 'South', 18.4893, 73.8197),
  // West
  L('Kothrud', 'West', 18.5074, 73.8077),
  L('Warje', 'West', 18.484, 73.8),
  L('Bavdhan', 'West', 18.513, 73.781),
  L('Pashan', 'West', 18.536, 73.797),
  L('Aundh', 'West', 18.558, 73.8075),
  L('Baner', 'West', 18.559, 73.7868),
  L('Balewadi', 'West', 18.576, 73.779, ['Balewadi High Street']),
  L('Wakad', 'West', 18.5987, 73.765),
  L('Hinjewadi', 'West', 18.5913, 73.7389, ['Rajiv Gandhi Infotech Park', 'Hinjawadi']),
  // North
  L('Khadki', 'North', 18.5671, 73.841, ['Kirkee']),
  L('Bopodi', 'North', 18.572, 73.832),
  L('Vishrantwadi', 'North', 18.573, 73.878),
  L('Dhanori', 'North', 18.59, 73.896),
  // Pimpri-Chinchwad
  L('Pimple Saudagar', 'PCMC', 18.599, 73.798),
  L('Pimpri', 'PCMC', 18.6279, 73.8009),
  L('Chinchwad', 'PCMC', 18.644, 73.79),
  L('Bhosari', 'PCMC', 18.6206, 73.8478, ['Bhosari MIDC']),
];

export function searchLocalities(q: string): Locality[] {
  const s = q.trim().toLowerCase();
  if (!s) return PUNE_LOCALITIES;
  const score = (l: Locality) => {
    const names = [l.name, ...(l.aliases ?? [])].map((n) => n.toLowerCase());
    if (names.some((n) => n.startsWith(s))) return 0;
    if (names.some((n) => n.split(/\s+/).some((w) => w.startsWith(s)))) return 1;
    if (names.some((n) => n.includes(s))) return 2;
    return 9;
  };
  return PUNE_LOCALITIES.map((l) => ({ l, sc: score(l) }))
    .filter((x) => x.sc < 9)
    .sort((a, b) => a.sc - b.sc || a.l.name.localeCompare(b.l.name))
    .map((x) => x.l);
}
