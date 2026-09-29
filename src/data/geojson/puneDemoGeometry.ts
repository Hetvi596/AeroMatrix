// Lightweight, hand-digitised APPROXIMATE geometry for the Pune demonstration area.
// Road corridors, green areas and industrial sites are simplified DEMO features —
// they are NOT survey-grade and NOT official data. Replace with OSM / municipal /
// MPCB datasets via a real DataProvider.

import type { CityConfig, GreenArea, Industry, Road } from '../../types';

export const PUNE: CityConfig = {
  id: 'pune',
  name: 'Pune',
  bbox: { west: 73.74, south: 18.44, east: 73.98, north: 18.64 },
  center: [73.855, 18.53],
};

export const DEMO_ROADS: Road[] = [
  {
    id: 'R-OLD-NH48',
    name: 'Old Mumbai–Pune Highway',
    volume: 88,
    path: [[73.785, 18.636], [73.80, 18.627], [73.822, 18.607], [73.838, 18.578], [73.842, 18.566], [73.848, 18.531]],
  },
  {
    id: 'R-NAGAR',
    name: 'Pune–Nagar Road',
    volume: 92,
    path: [[73.874, 18.529], [73.886, 18.542], [73.893, 18.552], [73.910, 18.557], [73.935, 18.561], [73.958, 18.571], [73.98, 18.580]],
  },
  {
    id: 'R-SOLAPUR',
    name: 'Pune–Solapur Road',
    volume: 85,
    path: [[73.868, 18.512], [73.880, 18.514], [73.900, 18.508], [73.925, 18.505], [73.950, 18.498], [73.98, 18.489]],
  },
  {
    id: 'R-SATARA',
    name: 'Pune–Satara Road',
    volume: 80,
    path: [[73.864, 18.502], [73.861, 18.488], [73.860, 18.475], [73.858, 18.458], [73.857, 18.44]],
  },
  {
    id: 'R-BYPASS',
    name: 'Western Bypass (NH48)',
    volume: 95,
    path: [[73.748, 18.64], [73.760, 18.600], [73.774, 18.578], [73.781, 18.560], [73.786, 18.530], [73.785, 18.508], [73.800, 18.482], [73.825, 18.462], [73.850, 18.448], [73.857, 18.44]],
  },
  {
    id: 'R-KARVE',
    name: 'Karve Road',
    volume: 70,
    path: [[73.841, 18.516], [73.830, 18.510], [73.818, 18.507], [73.806, 18.507], [73.786, 18.508]],
  },
  {
    id: 'R-UNIVERSITY',
    name: 'Ganeshkhind / University Road',
    volume: 78,
    path: [[73.848, 18.531], [73.838, 18.538], [73.826, 18.545], [73.815, 18.553], [73.808, 18.558], [73.790, 18.562], [73.781, 18.560]],
  },
  {
    id: 'R-SINHAGAD',
    name: 'Sinhagad Road',
    volume: 62,
    path: [[73.846, 18.500], [73.835, 18.487], [73.822, 18.472], [73.808, 18.458], [73.795, 18.44]],
  },
  {
    id: 'R-AIRPORT',
    name: 'Airport Road',
    volume: 66,
    path: [[73.893, 18.552], [73.898, 18.563], [73.905, 18.573], [73.910, 18.580]],
  },
  {
    id: 'R-BHOSARI',
    name: 'Nashik Phata – Bhosari Road',
    volume: 72,
    path: [[73.822, 18.607], [73.835, 18.615], [73.848, 18.624], [73.860, 18.632]],
  },
  {
    id: 'R-HADAPSAR-KHARADI',
    name: 'Hadapsar – Kharadi Bypass',
    volume: 64,
    path: [[73.925, 18.505], [73.930, 18.520], [73.933, 18.535], [73.936, 18.550], [73.935, 18.561]],
  },
  {
    id: 'R-KATRAJ-KONDHWA',
    name: 'Katraj – Kondhwa Road',
    volume: 58,
    path: [[73.858, 18.456], [73.875, 18.462], [73.890, 18.470], [73.905, 18.480], [73.925, 18.505]],
  },
];

export const DEMO_INDUSTRIES: Industry[] = [
  { id: 'IND-01', name: 'Demo Manufacturing Unit 01', category: 'Manufacturing', location: [73.815, 18.630], emissionIntensity: 72, controlEfficiency: 0.35, mainPollutants: ['pm25', 'pm10', 'no2'], emissionProfile: 'Automotive components; process + boiler stacks', status: 'DEMO' },
  { id: 'IND-02', name: 'Demo Metal Works 02', category: 'Metal', location: [73.845, 18.627], emissionIntensity: 84, controlEfficiency: 0.3, mainPollutants: ['pm10', 'pm25', 'so2'], emissionProfile: 'Foundry / forging; furnace emissions', status: 'DEMO' },
  { id: 'IND-03', name: 'Demo Chemical Plant 03', category: 'Chemical', location: [73.832, 18.620], emissionIntensity: 66, controlEfficiency: 0.45, mainPollutants: ['so2', 'no2', 'pm25'], emissionProfile: 'Specialty chemicals; solvent + combustion', status: 'DEMO' },
  { id: 'IND-04', name: 'Demo Processing Unit 04', category: 'Processing', location: [73.935, 18.498], emissionIntensity: 58, controlEfficiency: 0.4, mainPollutants: ['pm25', 'pm10'], emissionProfile: 'Food & agro processing; biomass boilers', status: 'DEMO' },
  { id: 'IND-05', name: 'Demo Manufacturing Unit 05', category: 'Manufacturing', location: [73.942, 18.506], emissionIntensity: 61, controlEfficiency: 0.4, mainPollutants: ['pm25', 'no2'], emissionProfile: 'Engineering goods; DG sets + paint shop', status: 'DEMO' },
  { id: 'IND-06', name: 'Demo Power / Captive Plant 06', category: 'Power', location: [73.925, 18.532], emissionIntensity: 78, controlEfficiency: 0.5, mainPollutants: ['so2', 'no2', 'pm25'], emissionProfile: 'Captive thermal generation', status: 'DEMO' },
  { id: 'IND-07', name: 'Demo Metal Works 07', category: 'Metal', location: [73.965, 18.572], emissionIntensity: 55, controlEfficiency: 0.3, mainPollutants: ['pm10', 'so2'], emissionProfile: 'Rolling / fabrication', status: 'DEMO' },
  { id: 'IND-08', name: 'Demo Processing Unit 08', category: 'Processing', location: [73.878, 18.458], emissionIntensity: 42, controlEfficiency: 0.35, mainPollutants: ['pm25', 'pm10'], emissionProfile: 'Printing & packaging', status: 'DEMO' },
  { id: 'IND-09', name: 'Demo Chemical Plant 09', category: 'Chemical', location: [73.770, 18.612], emissionIntensity: 50, controlEfficiency: 0.5, mainPollutants: ['no2', 'so2'], emissionProfile: 'Pharma intermediates', status: 'DEMO' },
  { id: 'IND-10', name: 'Demo Manufacturing Unit 10', category: 'Manufacturing', location: [73.890, 18.585], emissionIntensity: 46, controlEfficiency: 0.4, mainPollutants: ['pm25', 'no2'], emissionProfile: 'Electronics assembly; DG backup', status: 'DEMO' },
];

export const DEMO_GREEN_AREAS: GreenArea[] = [
  { id: 'G-VETAL', name: 'Vetal / Hanuman Hill (approx.)', polygon: [[73.812, 18.522], [73.822, 18.536], [73.836, 18.537], [73.840, 18.527], [73.830, 18.518], [73.818, 18.517]] },
  { id: 'G-TALJAI', name: 'Taljai / Parvati Hills (approx.)', polygon: [[73.832, 18.462], [73.838, 18.482], [73.852, 18.487], [73.860, 18.476], [73.852, 18.460], [73.840, 18.456]] },
  { id: 'G-ARAI', name: 'ARAI Hill (approx.)', polygon: [[73.806, 18.509], [73.810, 18.519], [73.820, 18.518], [73.822, 18.511], [73.815, 18.506]] },
  { id: 'G-UNI', name: 'University Campus (approx.)', polygon: [[73.818, 18.547], [73.820, 18.557], [73.832, 18.558], [73.834, 18.549], [73.826, 18.545]] },
  { id: 'G-PASHAN', name: 'Pashan Hills (approx.)', polygon: [[73.770, 18.525], [73.776, 18.548], [73.795, 18.550], [73.800, 18.534], [73.788, 18.522]] },
  { id: 'G-SOUTHWEST', name: 'Southwest Hill Forest (approx.)', polygon: [[73.745, 18.445], [73.748, 18.485], [73.775, 18.492], [73.790, 18.470], [73.780, 18.445]] },
  { id: 'G-EMPRESS', name: 'Empress Garden / Race Course (approx.)', polygon: [[73.887, 18.504], [73.888, 18.515], [73.900, 18.516], [73.901, 18.505]] },
  { id: 'G-BUND', name: 'Bund Garden / Riverside (approx.)', polygon: [[73.874, 18.537], [73.878, 18.545], [73.893, 18.544], [73.890, 18.537]] },
];

/** Landmarks used for building-density demo generation. */
export const URBAN_CENTRES: { name: string; loc: [number, number]; weight: number }[] = [
  { name: 'Shivajinagar / Deccan', loc: [73.848, 18.522], weight: 1.0 },
  { name: 'Camp / Station', loc: [73.877, 18.520], weight: 0.9 },
  { name: 'Hinjewadi–Wakad', loc: [73.762, 18.598], weight: 0.65 },
  { name: 'Kharadi–Viman Nagar', loc: [73.925, 18.558], weight: 0.75 },
  { name: 'Pimpri–Chinchwad', loc: [73.805, 18.625], weight: 0.8 },
  { name: 'Hadapsar', loc: [73.928, 18.505], weight: 0.7 },
  { name: 'Kothrud', loc: [73.808, 18.505], weight: 0.7 },
];
