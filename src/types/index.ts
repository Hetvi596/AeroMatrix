// Core domain types for the Urban Environmental Digital Twin.
// These are provider-agnostic: demo data, real datasets (CPCB / ERA5 / OSM / traffic)
// and future ML models all map into these shapes.

export type LonLat = [number, number];

/** Provenance of every value shown in the UI. Never mix silently. */
export type DataStatus = 'OBSERVED' | 'MODEL_PREDICTION' | 'MODELED_SCENARIO' | 'DEMO';

export type Pollutant = 'pm25' | 'pm10' | 'no2' | 'so2' | 'co' | 'o3';

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';

export type IndustryCategory = 'Manufacturing' | 'Chemical' | 'Power' | 'Metal' | 'Processing';

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface CityConfig {
  id: string;
  name: string;
  bbox: BBox;
  center: LonLat;
}

/** Static (slow-changing) attributes of a grid cell. */
export interface GridCell {
  id: string;
  index: number;
  row: number; // 0 = north
  col: number; // 0 = west
  bounds: BBox;
  center: LonLat;
  /** Traffic contribution per road id, 0-100 scale (sums to baseTraffic minus urban floor). */
  trafficByRoad: Record<string, number>;
  /** Diffuse urban traffic not tied to a major corridor (0-100). */
  localTraffic: number;
  greenCover: number; // %
  buildingDensity: number; // 0-1
  avgBuildingHeight: number; // m
  population: number;
  landUse: 'Urban core' | 'Residential' | 'Industrial' | 'Green / hills' | 'Mixed';
}

export interface Road {
  id: string;
  name: string;
  /** Baseline traffic volume index 0-100. */
  volume: number;
  path: LonLat[];
}

export interface Industry {
  id: string;
  name: string;
  category: IndustryCategory;
  location: LonLat;
  /** Relative emission intensity 0-100. */
  emissionIntensity: number;
  /** Existing emission-control efficiency 0-1. */
  controlEfficiency: number;
  mainPollutants: Pollutant[];
  emissionProfile: string;
  status: DataStatus;
  /** True if added in a what-if scenario. */
  scenarioAdded?: boolean;
}

export interface GreenArea {
  id: string;
  name: string;
  polygon: LonLat[];
}

export interface Weather {
  temperature: number; // °C
  windSpeed: number; // m/s
  windDirection: number; // degrees, direction wind blows FROM
  humidity: number; // %
  rainfall: number; // mm/day
  pressure: number; // hPa
}

export interface SourceContribution {
  traffic: number;
  industry: number;
  background: number;
  other: number;
}

/** Computed environmental state for one cell under one set of parameters. */
export interface CellState {
  cellId: string;
  pm25: number;
  pm10: number;
  no2: number;
  so2: number;
  co: number;
  o3: number;
  trafficIntensity: number; // 0-100
  industrialInfluence: number; // 0-100
  greenCover: number; // %
  buildingDensity: number;
  temperature: number;
  windInfluence: number; // meteorological multiplier (>1 = poorer dispersion)
  risk: RiskLevel;
  /** µg/m³ attributed to each source (sums to pm25). */
  contributionAbs: SourceContribution;
}

/** Everything the scenario engine needs as its starting point. */
export interface BaseState {
  city: CityConfig;
  gridSize: number;
  cells: GridCell[];
  roads: Road[];
  industries: Industry[];
  greenAreas: GreenArea[];
  weather: Weather;
  status: DataStatus;
}

export interface RoadClosure {
  roadId: string;
  /** Road that receives diverted traffic, or null = traffic simply suppressed. */
  divertToRoadId: string | null;
  /** Fraction of traffic diverted (0-1). */
  diversionShare: number;
}

export interface ScenarioParams {
  name: string;
  description?: string;
  /** Cells the "area" controls apply to. Empty = whole city for area controls. */
  targetCells: string[];
  trafficMultiplier: number; // city-wide, 1 = baseline
  areaTrafficMultiplier: number; // on targetCells, 1 = baseline
  vehicleEmissionControl: number; // 0-1 reduction of per-vehicle emission
  publicTransportShift: number; // 0-0.5 share of trips moved off roads
  roadClosures: RoadClosure[];
  addedIndustries: Industry[];
  removedIndustryIds: string[];
  industryIntensityOverrides: Record<string, number>;
  industrialControl: number; // 0-1 extra control applied to all industries
  greenCoverDelta: number; // percentage points on targetCells (or all)
  greenBuffer: boolean; // green buffer around added industries
  buildingDensityDelta: number; // on targetCells (or all), -0.5..0.5
  buildingHeightMultiplier: number; // on targetCells (or all)
  weather: Weather;
}

export interface ScenarioMetadata {
  status: DataStatus;
  engine: string;
  engineVersion: string;
  createdAt: string;
  disclaimer: string;
}

export interface ScenarioSummary {
  meanBaseline: number;
  meanScenario: number;
  meanDelta: number;
  meanDeltaPct: number;
  maxIncrease: number;
  maxDecrease: number;
  affectedCount: number;
  exposedPopulation: number;
  highRiskBaseline: number;
  highRiskScenario: number;
}

export interface ScenarioResult {
  id: string;
  params: ScenarioParams;
  baseline: CellState[];
  scenario: CellState[];
  /** Per-cell delta of every pollutant (scenario - baseline). */
  delta: Record<string, Record<Pollutant, number>>;
  affectedZones: string[];
  sourceContribution: { baseline: SourceContribution; scenario: SourceContribution };
  summary: ScenarioSummary;
  metadata: ScenarioMetadata;
}

export interface TimePoint {
  t: string;
  value: number;
}

export type LayerId =
  | 'heatmap'
  | 'grid'
  | 'roads'
  | 'traffic'
  | 'industries'
  | 'green'
  | 'buildings'
  | 'terrain'
  | 'satellite'
  | 'risk'
  | 'labels'
  | 'elevationTint';

export type DisplayMode = 'baseline' | 'scenario' | 'delta';

export type InteractionMode = 'select' | 'add-industry' | 'select-area' | 'pick-candidate';

export type Section =
  | 'overview'
  | 'air'
  | 'zones'
  | 'traffic'
  | 'industries'
  | 'green'
  | 'simulator'
  | 'scenarios'
  | 'actions'
  | 'locations'
  | 'analytics';

export interface CandidateLocation {
  id: string; // A, B, C...
  location: LonLat;
}
