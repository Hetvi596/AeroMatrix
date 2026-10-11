// Industrial What-If scenarios against the real processed industry dataset
// (public/data/industry/industry_data.json) and the real scenario engine.

import { describe, expect, it } from 'vitest';
import { getDemoBaseState } from '../data/demo/demoDataProvider';
import { defaultParams, runScenario } from '../services/scenarioService';
import { emittedKg, modeledSourcesFor, sitesNear, type IndustryData, type IndustrialTarget } from '../services/industryData';
import { cellsInTarget, localImpact, reductionScenario, relocationScenario, shutdownScenario } from './industryScenarios';
import { haversineKm } from '../utils/geo';
import { PUNE_LOCALITIES } from '../data/geojson/puneLocalities';
import { evaluateActions } from './actions';
import industryJson from '../../public/data/industry/industry_data.json';

const data = industryJson as unknown as IndustryData;
const base = getDemoBaseState(10);
const area = (code: number) => data.areas.find((a) => a.code === code)!;
const locality = (name: string) => PUNE_LOCALITIES.find((l) => l.name === name)!.location;

describe('processed industry dataset', () => {
  it('has the verified record counts and no invented emissions', () => {
    expect(data.areas).toHaveLength(28);
    expect(data.sites).toHaveLength(551);
    expect(new Set(data.sites.map((s) => s.id)).size).toBe(551);
    expect(data.emissionFactors).toHaveLength(11);
    // No estate or site carries an emissions figure.
    expect(data.sites.every((s) => !('emissions' in s))).toBe(true);
    expect(data.areas.every((a) => !('emissions' in a))).toBe(true);
  });

  it('keeps missing emission factors as null, not zero', () => {
    const wood = data.emissionFactors.find((f) => f.fuel === 'wood')!;
    expect(wood.kgPerUnit.nmvoc).toBeNull();
    expect(emittedKg(wood, 2).nmvoc).toBeNull();
    expect(emittedKg(wood, 2).pm25).toBeCloseTo(31.4, 6); // 2 t × 15.7 kg/t
  });
});

describe('Test 1: Bhosari / Pimpri Industrial Area (MIDC 501)', () => {
  const pimpri = area(501);
  const target: IndustrialTarget = { kind: 'area', area: pimpri };

  it('is the estate next to Bhosari and overlaps the map area', () => {
    expect(pimpri.name).toBe('Pimpri Industrial Area');
    expect(pimpri.analysisArea).toBe('partial');
    expect(haversineKm(locality('Bhosari'), pimpri.centroid)).toBeLessThan(5);
  });

  it('selects the modeled sources inside or within 1 km of the estate', () => {
    const ids = modeledSourcesFor(target, base.industries).map((s) => s.industry.id);
    expect(ids).toEqual(['IND-03', 'IND-02', 'IND-01']);
  });

  it('a 30% reduction lowers PM2.5 most near the estate', () => {
    const sources = modeledSourcesFor(target, base.industries);
    const params = reductionScenario(base, target, sources, 30)!;
    expect(params.industryIntensityOverrides['IND-02']).toBeCloseTo(84 * 0.7, 6);
    expect(Object.keys(params.industryIntensityOverrides).sort()).toEqual(['IND-01', 'IND-02', 'IND-03']);
    const r = runScenario(base, params);
    const local = localImpact(r, cellsInTarget(base, target))!;
    expect(r.summary.meanDelta).toBeLessThan(0);
    expect(local.delta).toBeLessThan(r.summary.meanDelta); // stronger decrease near the estate than city-wide
  });
});

describe('Test 2: Hadapsar and mapped-site clusters', () => {
  it('Hadapsar is not supported by this dataset: no MIDC estate and almost no mapped sites (OSM tile edge at 73.925°E)', () => {
    const h = locality('Hadapsar');
    expect(data.areas.every((a) => haversineKm(a.centroid, h) > 3)).toBe(true);
    expect(sitesNear(h, data.sites, 3).length).toBeLessThanOrEqual(2);
    expect(Math.max(...data.sites.map((s) => s.location[0]))).toBeLessThan(h[0]);
  });

  it('a Hadapsar mapped site has no modeled source within 1 km, so no shutdown effect is computed', () => {
    for (const site of sitesNear(locality('Hadapsar'), data.sites, 3)) {
      const target: IndustrialTarget = { kind: 'site', site, radiusKm: 1 };
      expect(shutdownScenario(base, target, modeledSourcesFor(target, base.industries))).toBeNull();
    }
  });

  it('shutdown through a supported site cluster (inside Pimpri MIDC) lowers PM2.5, and restoring gives zero change', () => {
    const site = data.sites.find((s) => s.midcCode === 501 && s.inAnalysisArea && modeledSourcesFor({ kind: 'site', site: s, radiusKm: 1 }, base.industries).length > 0);
    expect(site).toBeDefined();
    const target: IndustrialTarget = { kind: 'site', site: site!, radiusKm: 1 };
    const r = runScenario(base, shutdownScenario(base, target, modeledSourcesFor(target, base.industries))!);
    expect(r.summary.meanDelta).toBeLessThan(0);
    expect(localImpact(r, cellsInTarget(base, target))!.delta).toBeLessThan(0);
    expect(runScenario(base, defaultParams(base)).summary.meanDelta).toBeCloseTo(0, 10);
  });
});

describe('Test 3: relocation', () => {
  it('moves Pimpri sources to Kharadi Knowledge Park without deleting their emissions', () => {
    const target: IndustrialTarget = { kind: 'area', area: area(501) };
    const kharadi = area(508);
    const sources = modeledSourcesFor(target, base.industries);
    const params = relocationScenario(base, target, sources, kharadi)!;
    expect(params.removedIndustryIds.sort()).toEqual(['IND-01', 'IND-02', 'IND-03']);
    expect(params.addedIndustries).toHaveLength(3);
    expect(new Set(params.addedIndustries.map((i) => i.id)).size).toBe(3); // ids stay unique when made in one tick
    for (const a of params.addedIndustries) expect(a.location).toEqual(kharadi.centroid);
    const before = sources.reduce((s, x) => s + x.industry.emissionIntensity, 0);
    const after = params.addedIndustries.reduce((s, x) => s + x.emissionIntensity, 0);
    expect(after).toBe(before); // relocation conserves assumed source strength
    const r = runScenario(base, params);
    expect(localImpact(r, cellsInTarget(base, target))!.delta).toBeLessThan(0); // origin improves
    expect(localImpact(r, cellsInTarget(base, { kind: 'area', area: kharadi }))!.delta).toBeGreaterThan(0); // destination worsens
  });
});

describe('Test 4: unsupported / missing data', () => {
  it('reports no effect where no modeled source exists instead of inventing one', () => {
    const target: IndustrialTarget = { kind: 'area', area: area(508) }; // Kharadi Knowledge Park
    const sources = modeledSourcesFor(target, base.industries);
    expect(sources).toHaveLength(0);
    expect(reductionScenario(base, target, sources, 30)).toBeNull();
    expect(shutdownScenario(base, target, sources)).toBeNull();
  });

  it('estates outside the modeled grid have no zones to report', () => {
    const chakan = data.areas.find((a) => a.name.startsWith('Chakan Industrial Area Ph-II'))!;
    expect(chakan.analysisArea).toBe('outside');
    expect(cellsInTarget(base, { kind: 'area', area: chakan })).toHaveLength(0);
  });
});

describe('Tests 5–6: existing scenarios and reproducibility', () => {
  it('existing reduction actions still evaluate', () => {
    const rows = evaluateActions(base);
    expect(rows).toHaveLength(6);
    expect(rows.find((r) => r.action.id === 'traffic-restriction')!.result.summary.meanDelta).toBeLessThan(0);
  });

  it('the same industrial scenario gives identical results twice', () => {
    const target: IndustrialTarget = { kind: 'area', area: area(501) };
    const params = reductionScenario(base, target, modeledSourcesFor(target, base.industries), 50)!;
    const a = runScenario(base, params);
    const b = runScenario(base, params);
    expect(a.scenario.map((s) => s.pm25)).toEqual(b.scenario.map((s) => s.pm25));
  });
});
