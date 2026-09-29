// DataProvider — abstraction over every input dataset.
//
// Current implementation: DemoDataProvider (deterministic, clearly DEMO).
// Future adapters (each returns data already mapped to the domain types):
//   - CPCB CAAQMS  → observed pollutant series per station → gridded via interpolation  (OBSERVED)
//   - ERA5          → weather / reanalysis per cell & hour                                (OBSERVED/REANALYSIS)
//   - OpenStreetMap → roads, buildings, POIs, land use                                   (OBSERVED geometry)
//   - Traffic API   → corridor volumes / congestion index                                (OBSERVED where available)
//   - Industry registry (MPCB/CPCB consent lists) → locations, categories, emissions
//   - DEM (SRTM / Copernicus) and land-cover (ESA WorldCover / Sentinel-2 NDVI)

import type { BaseState, CityGeometry, DataStatus, Pollutant, TimePoint } from '../types';
import {
  getDemoBaseState,
  getDemoBuildings,
  getDemoTimeSeries,
  type DemoBuilding,
  type TimeRange,
} from '../data/demo/demoDataProvider';

export interface DataProvider {
  readonly id: string;
  readonly label: string;
  readonly status: DataStatus;
  /** Grid + environment for the given city geometry (demo or real OSM). */
  getBaseState(gridSize: number, geometry?: CityGeometry): Promise<BaseState>;
  getTimeSeries(key: string, pollutant: Pollutant, reference: number, range: TimeRange): Promise<TimePoint[]>;
  getBuildings(): Promise<DemoBuilding[]>;
}

export class DemoDataProvider implements DataProvider {
  readonly id = 'demo';
  readonly label = 'Demo / simulated data (deterministic)';
  readonly status: DataStatus = 'DEMO';

  async getBaseState(gridSize: number, geometry?: CityGeometry) {
    return getDemoBaseState(gridSize, geometry);
  }
  async getTimeSeries(key: string, pollutant: Pollutant, reference: number, range: TimeRange) {
    return getDemoTimeSeries(key, pollutant, reference, range);
  }
  async getBuildings() {
    return getDemoBuildings();
  }
}

/** Active provider — swap for a real adapter when datasets are available. */
export const dataProvider: DataProvider = new DemoDataProvider();

export type { TimeRange, DemoBuilding };
