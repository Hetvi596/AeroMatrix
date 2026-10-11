// Plan-It cost model: price records (sourced or estimated) and the intervention
// options built from them. Prices are planning inputs only — they never touch the
// environmental data. Every price is either traceable to a source or labelled an
// estimate with its basis. Line totals are rounded to whole rupees so every total
// reconciles exactly with its lines.

import type { BaseState, GridCell, Industry, ScenarioParams } from '../types';
import { cellAreaKm2, haversineKm } from '../utils/geo';

export type PriceKind = 'sourced' | 'estimate';

export interface PriceRecord {
  id: string;
  item: string;
  unit: string;
  unitPrice: number; // ₹ per unit
  kind: PriceKind;
  source?: { name: string; url: string; accessed: string; note: string };
  basis?: string; // for estimates: how the figure was arrived at
}

const ACCESSED = '10 Oct 2026';

export const PRICES: Record<string, PriceRecord> = {
  sapling: {
    id: 'sapling',
    item: 'Native tree sapling (neem)',
    unit: 'sapling',
    unitPrice: 199,
    kind: 'sourced',
    source: {
      name: 'Hunarsetu, neem plant listing',
      url: 'https://www.hunarsetu.com/en/product/neem-plant-nursery',
      accessed: ACCESSED,
      note: 'Online listing; sapling height not stated; not Pune-specific.',
    },
  },
  treeGuard: {
    id: 'treeGuard',
    item: 'Mild-steel tree guard, 5–6 ft',
    unit: 'guard',
    unitPrice: 900,
    kind: 'sourced',
    source: {
      name: 'IndiaMART, Pune tree guard listings (Saai Enterprises, Sasvad)',
      url: 'https://m.indiamart.com/city/pune/tree-guard.html',
      accessed: ACCESSED,
      note: 'Seller listing; other Pune listings on the page range from ₹400 to ₹2,100.',
    },
  },
  labourDay: {
    id: 'labourDay',
    item: 'Unskilled labour, Pune',
    unit: 'person-day',
    unitPrice: 524.42,
    kind: 'sourced',
    source: {
      name: 'Maharashtra minimum wages, Zone I unskilled (DCPSOL summary of the Jul–Dec 2025 notification)',
      url: 'https://www.dcpsol.com/maharashtra-minimum-wages-july-2025',
      accessed: ACCESSED,
      note: 'Statutory minimum for Pune Municipal Corporation (Zone I); a 2026 revision was not found.',
    },
  },
  labourMonth: {
    id: 'labourMonth',
    item: 'Unskilled staff, Pune',
    unit: 'person-month',
    unitPrice: 13635,
    kind: 'sourced',
    source: {
      name: 'Maharashtra minimum wages, Zone I unskilled (DCPSOL summary of the Jul–Dec 2025 notification)',
      url: 'https://www.dcpsol.com/maharashtra-minimum-wages-july-2025',
      accessed: ACCESSED,
      note: 'Statutory monthly minimum; a 2026 revision was not found.',
    },
  },
  compost: {
    id: 'compost',
    item: 'Compost for planting pits',
    unit: 'kg',
    unitPrice: 12,
    kind: 'estimate',
    basis: 'Lower end of a ₹12–15/kg retail range reported for Bengaluru (Citizen Matters, undated). No current Pune price was found.',
  },
  tankerTrip: {
    id: 'tankerTrip',
    item: 'Water tanker delivery',
    unit: 'trip',
    unitPrice: 1200,
    kind: 'sourced',
    source: {
      name: 'Pune Pulse, report on Pune tanker rates (2026)',
      url: 'https://www.mypunepulse.com/?p=204322',
      accessed: ACCESSED,
      note: 'Price reported by a housing-society chairman; tanker size not stated; not an official rate.',
    },
  },
  truckTrip: {
    id: 'truckTrip',
    item: 'Tempo hire for saplings and guards',
    unit: 'trip',
    unitPrice: 4000,
    kind: 'estimate',
    basis: 'No quotation found; assumed one local tempo trip within Pune.',
  },
  bagFilter: {
    id: 'bagFilter',
    item: 'Bag filter (dust collector), supply',
    unit: 'unit',
    unitPrice: 600000,
    kind: 'sourced',
    source: {
      name: 'Deepti Airsystem & Fabricators, Mumbai (GlobalLinker listing)',
      url: 'https://www.globallinker.com/seller/deepti-airsystem-and-fabricators-private-limited',
      accessed: ACCESSED,
      note: 'Seller listing; capacity not stated. Actual size and price depend on the unit’s airflow.',
    },
  },
  filterBag: {
    id: 'filterBag',
    item: 'Replacement filter bag',
    unit: 'bag',
    unitPrice: 500,
    kind: 'sourced',
    source: {
      name: 'Deepti Airsystem & Fabricators, Mumbai (GlobalLinker listing)',
      url: 'https://www.globallinker.com/seller/deepti-airsystem-and-fabricators-private-limited',
      accessed: ACCESSED,
      note: 'Seller listing, minimum order 10 bags.',
    },
  },
  ductInstall: {
    id: 'ductInstall',
    item: 'Ducting, fan and installation',
    unit: 'job',
    unitPrice: 150000,
    kind: 'estimate',
    basis: 'Assumed at 25% of the bag-filter supply price; needs a site quotation.',
  },
  stackTest: {
    id: 'stackTest',
    item: 'Stack emission test by an approved lab',
    unit: 'test',
    unitPrice: 25000,
    kind: 'estimate',
    basis: 'No public rate found; assumed per test.',
  },
  power: {
    id: 'power',
    item: 'Fan electricity',
    unit: 'kWh',
    unitPrice: 10,
    kind: 'estimate',
    basis: 'Assumed all-in industrial tariff of about ₹10/kWh; check the unit’s MSEDCL bill.',
  },
  anprCamera: {
    id: 'anprCamera',
    item: 'ANPR camera',
    unit: 'camera',
    unitPrice: 55000,
    kind: 'sourced',
    source: {
      name: 'Dhruva Technologies, Gurugram (IndiaMART listing)',
      url: 'https://m.indiamart.com/dhruvatechnologies/bullet-camera.html',
      accessed: ACCESSED,
      note: 'Camera only; excludes poles, power, network and software.',
    },
  },
  cameraInstall: {
    id: 'cameraInstall',
    item: 'Pole, power and network per camera',
    unit: 'camera',
    unitPrice: 20000,
    kind: 'estimate',
    basis: 'No quotation found; assumed per camera site.',
  },
  signBoard: {
    id: 'signBoard',
    item: 'Aluminium traffic sign, 900 mm square',
    unit: 'sq ft',
    unitPrice: 250,
    kind: 'sourced',
    source: {
      name: 'K.B. Fitness, Udaipur (IndiaMART traffic sign board listings)',
      url: 'https://m.indiamart.com/impcat/traffic-sign-board.html',
      accessed: ACCESSED,
      note: 'High-intensity aluminium board priced per sq ft; one 900 mm board is 8.72 sq ft.',
    },
  },
  anprSoftware: {
    id: 'anprSoftware',
    item: 'ANPR software and data',
    unit: 'camera-year',
    unitPrice: 12000,
    kind: 'estimate',
    basis: 'No public rate found; assumed annual licence and data per camera.',
  },
  awareness: {
    id: 'awareness',
    item: 'Public awareness campaign',
    unit: 'campaign',
    unitPrice: 50000,
    kind: 'estimate',
    basis: 'Assumed print and social-media outreach for one zone.',
  },
};

// ---------------------------------------------------------------- options

export type InterventionType = 'trees' | 'industry' | 'traffic';

export const INTERVENTION_LABEL: Record<InterventionType, string> = {
  trees: 'Tree planting',
  industry: 'Industrial emission control',
  traffic: 'Traffic enforcement zone',
};

export type CostCategory = 'Materials' | 'Labour' | 'Equipment' | 'Transport' | 'Maintenance' | 'Monitoring' | 'Utilities' | 'Outreach';

export interface CostLine {
  priceId: string;
  item: string;
  category: CostCategory;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number; // round(quantity × unitPrice)
  recurring: boolean; // first-year recurring
  kind: PriceKind;
  adjusted: boolean; // unit price changed by a sensitivity multiplier
}

export interface InterventionOption {
  key: string; // type + level, unique within a plan search
  type: InterventionType;
  label: string;
  quantity: number;
  quantityUnit: string;
  location: string;
  lines: CostLine[];
  oneTime: number;
  recurring: number;
  total: number;
  /** Scenario-engine parameters this option sets (merged into one plan). */
  patch: Partial<ScenarioParams>;
  /** Plain-English description of the modelled effect and its assumption. */
  effect: string;
  limitations: string[];
}

/** Modelled-response and cost assumptions; Plan-It's sensitivity analysis edits these. */
export interface PlanAssumptions {
  costMultiplier: Record<InterventionType, number>;
  /** Mature canopy area per planted tree, m² (shared with the What-If tree helper). */
  treeCanopyM2: number;
  /** Share of a source's remaining PM captured by a bag filter. */
  bagFilterCapture: number;
  /** Vehicle-traffic reduction inside an enforced zone, by enforcement level. */
  trafficReduction: { standard: number; intensive: number };
}

export const DEFAULT_ASSUMPTIONS: PlanAssumptions = {
  costMultiplier: { trees: 1, industry: 1, traffic: 1 },
  treeCanopyM2: 40,
  bagFilterCapture: 0.9,
  trafficReduction: { standard: 0.1, intensive: 0.2 },
};

export const TREE_LEVELS = [250, 500, 1000, 2000];
export const SIGN_SQFT = 8.72; // 0.9 m × 0.9 m board

/** Scenario target for a plan: one grid zone, or the whole analysis area. */
export interface PlanTarget {
  id: string; // cell id or 'city'
  label: string;
  cells: GridCell[]; // cells the effect is applied to (all cells for 'city')
  cityWide: boolean;
}

function line(priceId: string, category: CostCategory, quantity: number, recurring: boolean, multiplier: number, prices = PRICES): CostLine {
  const p = prices[priceId];
  if (!p) throw new MissingPriceError(priceId);
  const unitPrice = Math.round(p.unitPrice * multiplier * 100) / 100;
  return {
    priceId,
    item: p.item,
    category,
    quantity,
    unit: p.unit,
    unitPrice,
    total: Math.round(quantity * unitPrice),
    recurring,
    kind: p.kind,
    adjusted: multiplier !== 1,
  };
}

export class MissingPriceError extends Error {
  constructor(public priceId: string) {
    super(`No price record for "${priceId}"`);
  }
}

function finish(o: Omit<InterventionOption, 'oneTime' | 'recurring' | 'total'>): InterventionOption {
  const oneTime = o.lines.filter((l) => !l.recurring).reduce((a, l) => a + l.total, 0);
  const recurring = o.lines.filter((l) => l.recurring).reduce((a, l) => a + l.total, 0);
  return { ...o, oneTime, recurring, total: oneTime + recurring };
}

const areaKm2 = (cells: GridCell[]) => cells.reduce((a, c) => a + cellAreaKm2(c.bounds), 0);

/** Tree planting: n saplings with guards, planted and watered through the first year. */
export function treeOption(target: PlanTarget, n: number, a: PlanAssumptions, prices = PRICES): InterventionOption {
  const m = a.costMultiplier.trees;
  const km2 = areaKm2(target.cells);
  const pts = Math.round(((n * a.treeCanopyM2) / (km2 * 1e6)) * 100 * 1000) / 1000;
  const waterLitres = n * 10 * 30; // 10 L per sapling per week, 30 dry-season weeks
  return finish({
    key: `trees:${n}`,
    type: 'trees',
    label: INTERVENTION_LABEL.trees,
    quantity: n,
    quantityUnit: 'saplings',
    location: target.cityWide ? 'Spread across the analysis area' : `Zone ${target.id}`,
    lines: [
      line('sapling', 'Materials', n, false, m, prices),
      line('treeGuard', 'Materials', n, false, m, prices),
      line('compost', 'Materials', n * 5, false, m, prices),
      line('labourDay', 'Labour', Math.ceil(n / 8), false, m, prices),
      line('truckTrip', 'Transport', Math.ceil(n / 400), false, m, prices),
      line('tankerTrip', 'Maintenance', Math.ceil(waterLitres / 10000), true, m, prices),
      line('labourDay', 'Maintenance', Math.ceil(n * 0.05), true, m, prices),
    ],
    patch: { greenCoverDelta: pts },
    effect: `${n.toLocaleString('en-IN')} trees at an assumed ${a.treeCanopyM2} m² mature canopy each add ${pts} percentage points of green cover over ${km2.toFixed(1)} km².`,
    limitations: [
      'Canopy and its effect build up over years; first-year benefit is much smaller.',
      'Assumes 8 saplings planted per person-day, 5 kg compost per pit and 10 L of water per sapling per week for 30 weeks.',
    ],
  });
}

/** Modeled industrial sources the target covers (inside the zone or within 2 km of its centre). */
export function eligibleSources(base: BaseState, target: PlanTarget): Industry[] {
  const list = target.cityWide
    ? base.industries
    : base.industries.filter((i) => {
        const c = target.cells[0];
        const b = c.bounds;
        const inside = i.location[0] >= b.west && i.location[0] <= b.east && i.location[1] >= b.south && i.location[1] <= b.north;
        return inside || haversineKm(i.location, c.center) <= 2;
      });
  return [...list].sort((x, y) => y.emissionIntensity - x.emissionIntensity || x.id.localeCompare(y.id));
}

/** Bag-filter retrofit at the k highest-intensity modeled sources covered by the target. */
export function industryOption(sources: Industry[], k: number, a: PlanAssumptions, prices = PRICES): InterventionOption {
  const m = a.costMultiplier.industry;
  const chosen = sources.slice(0, k);
  const overrides: Record<string, number> = {};
  for (const s of chosen) overrides[s.id] = Math.round(s.emissionIntensity * (1 - a.bagFilterCapture) * 10) / 10;
  return finish({
    key: `industry:${k}`,
    type: 'industry',
    label: INTERVENTION_LABEL.industry,
    quantity: k,
    quantityUnit: k === 1 ? 'bag-filter retrofit' : 'bag-filter retrofits',
    location: chosen.map((s) => `${s.id} (${s.category})`).join(', '),
    lines: [
      line('bagFilter', 'Equipment', k, false, m, prices),
      line('ductInstall', 'Equipment', k, false, m, prices),
      line('stackTest', 'Monitoring', k * 2, false, m, prices),
      line('filterBag', 'Maintenance', k * 40, true, m, prices),
      line('power', 'Utilities', k * 18000, true, m, prices),
    ],
    patch: { industryIntensityOverrides: overrides },
    effect: `Bag filters are assumed to capture ${Math.round(a.bagFilterCapture * 100)}% of the remaining particulate emissions at ${chosen.map((s) => s.id).join(', ')}.`,
    limitations: [
      'The targeted sources are the twin’s illustrative modeled sources, not verified factories; their emission strengths are assumptions.',
      'Bag filters mainly cut particulates; the prototype engine scales all of a source’s pollutants, so only the PM2.5 result is meaningful.',
      'Assumes one test at commissioning and one in year 1, 40 replacement bags a year and a 7.5 kW fan running 2,400 hours.',
    ],
  });
}

/** Low-emission traffic zone with ANPR enforcement inside one target zone. */
export function trafficOption(target: PlanTarget, level: 'standard' | 'intensive', a: PlanAssumptions, prices = PRICES): InterventionOption {
  const m = a.costMultiplier.traffic;
  const cams = level === 'standard' ? 4 : 8;
  const signs = level === 'standard' ? 12 : 20;
  const wardens = level === 'standard' ? 2 : 4;
  const reduction = a.trafficReduction[level];
  return finish({
    key: `traffic:${level}`,
    type: 'traffic',
    label: INTERVENTION_LABEL.traffic,
    quantity: cams,
    quantityUnit: `ANPR cameras (${level} enforcement)`,
    location: `Zone ${target.id}`,
    lines: [
      line('anprCamera', 'Equipment', cams, false, m, prices),
      line('cameraInstall', 'Equipment', cams, false, m, prices),
      line('signBoard', 'Materials', Math.round(signs * SIGN_SQFT * 100) / 100, false, m, prices),
      line('awareness', 'Outreach', 1, false, m, prices),
      line('labourMonth', 'Labour', wardens * 12, true, m, prices),
      line('anprSoftware', 'Maintenance', cams, true, m, prices),
    ],
    patch: { areaTrafficMultiplier: Math.round((1 - reduction) * 1000) / 1000 },
    effect: `Enforcement is assumed to cut vehicle traffic in the zone by ${Math.round(reduction * 100)}%.`,
    limitations: [
      `The ${Math.round(reduction * 100)}% traffic cut is an illustrative assumption, not a measured response; some traffic may shift to nearby roads.`,
      `Assumes ${signs} signs of 900 mm, ${wardens} wardens for 12 months and one awareness campaign.`,
    ],
  });
}
