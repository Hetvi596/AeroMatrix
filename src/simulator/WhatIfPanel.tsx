import { useState } from 'react';
import { Play, RotateCcw, MousePointerClick, Plus, Trash2, Factory, TreePine, Car, CloudSun, Building2, ShieldCheck, Route, MapPin } from 'lucide-react';
import { useTwin } from '../store/useTwinStore';
import { Block, Button, DeltaText, Disclaimer, SectionHeader, Slider, Toggle } from '../components/ui';
import { RegionPicker, RegionScenarioBlock } from '../components/RegionScenarioPanels';
import { paramsKey } from '../scenarios/liveScenario';
import { cellAt, defaultParams, makeScenarioIndustry } from '../services/scenarioService';
import type { IndustryCategory, ScenarioParams } from '../types';
import { cellAreaKm2 } from '../utils/geo';
import { fmt } from '../utils/format';
import { majorRoads } from '../services/traffic';

const CATEGORIES: IndustryCategory[] = ['Manufacturing', 'Chemical', 'Power', 'Metal', 'Processing'];
const pct = (v: number) => `${Math.round(v * 100)}%`;
const signedPct = (v: number) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`;
const TREE_CANOPY_M2 = 40; // assumed mature canopy per tree (illustrative)
const FIELD = 'rounded-lg bg-ink-950 text-sand-100 ring-1 ring-inset ring-sand-100/15 outline-none focus-visible:ring-2 focus-visible:ring-accent-400';


function GroupTitle({ icon: Icon, children }: { icon: typeof Car; children: string }) {
  return (
    <h3 className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-sand-200">
      <Icon size={15} className="text-accent-400" aria-hidden="true" />
      {children}
    </h3>
  );
}

export function WhatIfPanel() {
  const base = useTwin((s) => s.base)!;
  const draft = useTwin((s) => s.draft)!;
  const update = useTwin((s) => s.updateDraft);
  const updateWeather = useTwin((s) => s.updateWeather);
  const reset = useTwin((s) => s.resetDraft);
  const run = useTwin((s) => s.runDraft);
  const errors = useTwin((s) => s.draftErrors);
  const interaction = useTwin((s) => s.interaction);
  const setInteraction = useTwin((s) => s.setInteraction);
  const pending = useTwin((s) => s.pendingIndustry);
  const setPending = useTwin((s) => s.setPendingIndustry);
  const selectedCellId = useTwin((s) => s.selectedCellId);
  const toggleArea = useTwin((s) => s.toggleAreaCell);
  const result = useTwin((s) => s.activeResult);
  const saved = useTwin((s) => s.saved);
  const setRightOpen = useTwin((s) => s.setRightOpen);
  const setSection = useTwin((s) => s.setSection);
  const runAndShow = () => {
    if (run()) setRightOpen(true);
  };
  const upToDate = !!result && paramsKey(result.params) === paramsKey(draft);
  const live = useTwin((s) => s.liveScenario);
  const setLive = useTwin((s) => s.setLiveScenario);
  const online = useTwin((s) => s.modelService.status === 'online');
  const weatherCases = useTwin((s) => s.industry?.weatherCases) ?? [];

  const [closure, setClosure] = useState({ roadId: majorRoads(base)[0]?.id ?? '', divertTo: '', share: 0.7 });
  const [trees, setTrees] = useState(-500);

  const areaCells = base.cells.filter((c) => draft.targetCells.includes(c.id));
  const hasArea = areaCells.length > 0;
  const areaKm2 = (hasArea ? areaCells : base.cells).reduce((a, c) => a + cellAreaKm2(c.bounds), 0);
  const treesToPts = (n: number) => ((n * TREE_CANOPY_M2) / (areaKm2 * 1e6)) * 100;

  const pendingCell = pending.location ? cellAt(base, pending.location) : undefined;
  const roadOptions = majorRoads(base);

  const applyPreset = (p: Partial<ScenarioParams>) => update({ ...defaultParams(base), ...p });

  return (
    <div className="flex min-h-full flex-col">
      <SectionHeader title="What-If" subtitle="Change conditions and see the modelled effect." />

      {online && (
        <Block title="Region forecast">
          <RegionPicker />
          <div className="mt-3">
            <RegionScenarioBlock />
          </div>
        </Block>
      )}

      <Block title="Scenario">
        <input
          value={draft.name === 'Baseline' ? '' : draft.name}
          placeholder="Scenario name (optional)"
          onChange={(e) => update({ name: e.target.value })}
          aria-label="Scenario name"
          className={`w-full px-2.5 py-1.5 text-[12.5px] placeholder:text-sand-500 ${FIELD}`}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button className="!min-h-7 !py-1 text-[12px]" onClick={() => applyPreset({ name: 'Traffic +30%', trafficMultiplier: 1.3 })}>Traffic +30%</Button>
          <Button className="!min-h-7 !py-1 text-[12px]" onClick={() => applyPreset({ name: 'Traffic restriction −20%', trafficMultiplier: 0.8 })}>Restriction −20%</Button>
          <Button
            className="!min-h-7 !py-1 text-[12px]"
            onClick={() =>
              applyPreset({
                name: 'Monsoon day',
                weather: { ...base.weather, windSpeed: 5.5, windDirection: 250, rainfall: 18, humidity: 85, temperature: 24 },
              })
            }
          >
            Monsoon day
          </Button>
          <Button
            className="!min-h-7 !py-1 text-[12px]"
            onClick={() =>
              applyPreset({
                name: 'Winter inversion',
                weather: { ...base.weather, windSpeed: 0.8, windDirection: 20, rainfall: 0, humidity: 62, temperature: 16, pressure: 1016 },
              })
            }
          >
            Winter inversion
          </Button>
        </div>
      </Block>

      {/* Area */}
      <Block>
        <GroupTitle icon={MapPin}>Scenario area</GroupTitle>
        <div className="flex items-center justify-between text-[12.5px]">
          <span className="text-sand-200">{hasArea ? `${areaCells.length} zone${areaCells.length === 1 ? '' : 's'} selected` : 'Whole analysis area'}</span>
          <span className="text-sand-500">{fmt(areaKm2, 0)} km²</span>
        </div>
        {hasArea && (
          <div className="mt-1 flex flex-wrap gap-1">
            {areaCells.slice(0, 18).map((c) => (
              <button key={c.id} onClick={() => toggleArea(c.id)} className="cursor-pointer rounded-md bg-accent-500/12 px-1.5 py-0.5 text-[11.5px] font-semibold text-accent-300 hover:bg-accent-500/20" title={`Remove ${c.id}`}>
                {c.id}
              </button>
            ))}
            {areaCells.length > 18 && <span className="text-[11.5px] text-sand-500">+{areaCells.length - 18}</span>}
          </div>
        )}
        <div className="mt-2 flex gap-1.5">
          <Button
            variant={interaction === 'select-area' ? 'primary' : 'default'}
            className="flex-1"
            onClick={() => setInteraction(interaction === 'select-area' ? 'select' : 'select-area')}
          >
            <MousePointerClick size={13} /> {interaction === 'select-area' ? 'Done selecting' : 'Select on map'}
          </Button>
          {selectedCellId && !draft.targetCells.includes(selectedCellId) && (
            <Button onClick={() => toggleArea(selectedCellId)}>+ {selectedCellId}</Button>
          )}
          {hasArea && (
            <Button variant="ghost" onClick={() => update({ targetCells: [] })}>
              Clear
            </Button>
          )}
        </div>
        <Disclaimer>Area traffic, green cover and building changes apply here. With no area, green and buildings apply city-wide.</Disclaimer>
      </Block>

      {/* Traffic */}
      <Block>
        <GroupTitle icon={Car}>Traffic</GroupTitle>
        <Slider label="City-wide traffic intensity" hint="Change in vehicle traffic on every road. 0% is today." value={draft.trafficMultiplier} min={0.3} max={2} step={0.05} format={signedPct} onChange={(v) => update({ trafficMultiplier: v })} />
        <Slider
          label={`Area traffic ${hasArea ? '' : '(select an area)'}`}
          value={draft.areaTrafficMultiplier}
          min={0}
          max={2}
          step={0.05}
          format={signedPct}
          onChange={(v) => update({ areaTrafficMultiplier: v })}
        />
        <Slider label="Public transport mode shift" hint="Share of trips moved from private vehicles to buses and metro." value={draft.publicTransportShift} min={0} max={0.5} step={0.01} format={pct} onChange={(v) => update({ publicTransportShift: v })} />
      </Block>

      {/* Roads */}
      <Block>
        <GroupTitle icon={Route}>Road closure & diversion</GroupTitle>
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <label className="text-sand-400">
            Close
            <select
              value={closure.roadId}
              onChange={(e) => setClosure({ ...closure, roadId: e.target.value })}
              className={`mt-1 w-full px-2 py-1.5 text-[12.5px] ${FIELD}`}
            >
              {roadOptions.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sand-400">
            Divert to
            <select
              value={closure.divertTo}
              onChange={(e) => setClosure({ ...closure, divertTo: e.target.value })}
              className={`mt-1 w-full px-2 py-1.5 text-[12.5px] ${FIELD}`}
            >
              <option value="">None (suppress traffic)</option>
              {roadOptions.filter((r) => r.id !== closure.roadId).map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
        </div>
        {closure.divertTo && (
          <Slider label="Share diverted" value={closure.share} min={0} max={1} step={0.05} format={pct} onChange={(v) => setClosure({ ...closure, share: v })} />
        )}
        <Button
          className="mt-1.5 w-full"
          onClick={() =>
            update({
              roadClosures: [
                ...draft.roadClosures.filter((c) => c.roadId !== closure.roadId),
                { roadId: closure.roadId, divertToRoadId: closure.divertTo || null, diversionShare: closure.share },
              ],
            })
          }
        >
          <Plus size={13} /> Add closure
        </Button>
        {draft.roadClosures.map((c) => (
          <div key={c.roadId} className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-sand-100/[0.05] px-2.5 py-1.5 text-[12px] text-sand-200">
            <span className="truncate">
              ✕ {base.roads.find((r) => r.id === c.roadId)?.name}
              {c.divertToRoadId && <span className="text-sand-500"> → {base.roads.find((r) => r.id === c.divertToRoadId)?.name} ({pct(c.diversionShare)})</span>}
            </span>
            <button aria-label="Remove closure" className="ml-auto cursor-pointer text-sand-500 hover:text-accent-300" onClick={() => update({ roadClosures: draft.roadClosures.filter((x) => x.roadId !== c.roadId) })}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </Block>

      {/* Industry */}
      <Block>
        <GroupTitle icon={Factory}>Industry</GroupTitle>
        <div className="rounded-xl bg-sand-100/[0.04] p-3 ring-1 ring-inset ring-sand-100/10">
          <div className="flex items-center gap-1.5">
            <select
              value={pending.category}
              onChange={(e) => setPending({ category: e.target.value as IndustryCategory })}
              aria-label="Industry category"
              className={`min-w-0 flex-1 px-2 py-1.5 text-[12.5px] ${FIELD}`}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <Button
              variant={interaction === 'add-industry' ? 'primary' : 'default'}
              onClick={() => setInteraction(interaction === 'add-industry' ? 'select' : 'add-industry')}
            >
              <MousePointerClick size={13} /> {pending.location ? 'Move' : 'Place on map'}
            </Button>
          </div>
          <Slider label="Emission intensity" value={pending.intensity} min={5} max={100} step={1} onChange={(v) => setPending({ intensity: v })} />
          <div className="text-[11.5px] text-sand-400">
            {pending.location
              ? `Site: ${pending.location[1].toFixed(4)}°N ${pending.location[0].toFixed(4)}°E${pendingCell ? ` · zone ${pendingCell.id} (${pendingCell.landUse}, green ${fmt(pendingCell.greenCover, 0)}%)` : ' · outside analysis area'}`
              : 'No site chosen yet. Use Place on map.'}
          </div>
          <Button
            variant="primary"
            className="mt-2 w-full"
            disabled={!pending.location}
            onClick={() => {
              if (!pending.location) return;
              update({ addedIndustries: [...draft.addedIndustries, makeScenarioIndustry(pending.location, pending.category, pending.intensity)] });
              setPending({ location: null });
              setInteraction('select');
            }}
          >
            <Plus size={13} /> Add industry to scenario
          </Button>
        </div>
        {draft.addedIndustries.map((i) => (
          <div key={i.id} className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-accent-500/[0.07] px-2.5 py-1.5 text-[12px] text-sand-200">
            <Factory size={13} className="text-accent-400" aria-hidden="true" />
            <span className="truncate">{i.name} · {i.emissionIntensity}</span>
            <button aria-label="Remove added industry" className="ml-auto cursor-pointer text-sand-500 hover:text-accent-300" onClick={() => update({ addedIndustries: draft.addedIndustries.filter((x) => x.id !== i.id) })}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {(draft.removedIndustryIds.length > 0 || Object.keys(draft.industryIntensityOverrides).length > 0) && (
          <div className="mt-1.5 text-[12px] text-sand-300">
            {draft.removedIndustryIds.length > 0 && <div>Removed: {draft.removedIndustryIds.join(', ')}</div>}
            {Object.entries(draft.industryIntensityOverrides).map(([id, v]) => (
              <div key={id}>
                {id} intensity → {v}
              </div>
            ))}
            <button className="cursor-pointer text-[12px] font-medium text-accent-300 hover:underline" onClick={() => update({ removedIndustryIds: [], industryIntensityOverrides: {} })}>
              Reset source edits
            </button>
          </div>
        )}
        <Disclaimer>Click an existing industry on the map to change its intensity or remove it.</Disclaimer>
      </Block>

      {/* Pollution control */}
      <Block>
        <GroupTitle icon={ShieldCheck}>Pollution control</GroupTitle>
        <Slider label="Additional industrial control efficiency" hint="Extra share of each factory's remaining emissions captured by new controls." value={draft.industrialControl} min={0} max={0.9} step={0.05} format={pct} onChange={(v) => update({ industrialControl: v })} />
        <Slider label="Vehicle emission control" hint="Cut in emissions per vehicle, e.g. cleaner fuel or engines." value={draft.vehicleEmissionControl} min={0} max={0.8} step={0.05} format={pct} onChange={(v) => update({ vehicleEmissionControl: v })} />
      </Block>

      {/* Green */}
      <Block>
        <GroupTitle icon={TreePine}>Green cover</GroupTitle>
        <Slider
          label={`Green cover change ${hasArea ? '(area)' : '(city-wide)'}`}
          value={draft.greenCoverDelta}
          min={-40}
          max={40}
          step={1}
          format={(v) => `${v > 0 ? '+' : ''}${v} pts`}
          onChange={(v) => update({ greenCoverDelta: v })}
        />
        <div className="flex items-end gap-1.5">
          <label className="flex-1 text-[12px] text-sand-400">
            Trees (negative removes, positive plants)
            <input
              type="number"
              value={trees}
              step={100}
              onChange={(e) => setTrees(Number(e.target.value))}
              inputMode="numeric"
              className={`num mt-1 w-full px-2.5 py-1.5 text-[12.5px] ${FIELD}`}
            />
          </label>
          <Button onClick={() => update({ greenCoverDelta: Math.max(-40, Math.min(40, Math.round(treesToPts(trees) * 10) / 10)) })}>Apply</Button>
        </div>
        <div className="mt-1 text-[11.5px] text-sand-500">
          About {fmt(treesToPts(trees), 2)} pts over {fmt(areaKm2, 1)} km², at {TREE_CANOPY_M2} m² canopy per tree.
        </div>
        <Toggle checked={draft.greenBuffer} onChange={(v) => update({ greenBuffer: v })} label="Green buffer around added industries" />
      </Block>

      {/* Buildings */}
      <Block>
        <GroupTitle icon={Building2}>Buildings</GroupTitle>
        <Slider
          label={`Building density ${hasArea ? '(area)' : '(city-wide)'}`}
          value={draft.buildingDensityDelta}
          min={-0.4}
          max={0.4}
          step={0.02}
          format={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} pts`}
          onChange={(v) => update({ buildingDensityDelta: v })}
        />
        <Slider label="Building height" hint="Taller buildings trap more pollution in street canyons." value={draft.buildingHeightMultiplier} min={0.5} max={3} step={0.1} format={(v) => `×${v.toFixed(1)}`} onChange={(v) => update({ buildingHeightMultiplier: v })} />
      </Block>

      {/* Weather */}
      <Block>
        <GroupTitle icon={CloudSun}>Weather</GroupTitle>
        <p className="mb-1 text-[11.5px] text-sand-500">Weather changes how far pollution spreads.</p>
        {weatherCases.length > 0 && (
          <label className="mb-1 block text-[12px] text-sand-400">
            ERA5 seasonal case (2024–25)
            <select
              value=""
              onChange={(e) => {
                const c = weatherCases[Number(e.target.value)];
                if (c) updateWeather(c.weather);
              }}
              className={`mt-1 w-full cursor-pointer px-2 py-1.5 text-[12.5px] ${FIELD}`}
            >
              <option value="" disabled>
                Choose an industrial area and season…
              </option>
              {weatherCases.map((c, i) => (
                <option key={`${c.areaCode}-${c.season}`} value={i}>
                  {c.areaName}: {c.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <Slider label="Temperature" value={draft.weather.temperature} min={5} max={45} step={0.5} format={(v) => `${v}°C`} onChange={(v) => updateWeather({ temperature: v })} />
        <Slider label="Wind speed" value={draft.weather.windSpeed} min={0.2} max={12} step={0.1} format={(v) => `${v.toFixed(1)} m/s`} onChange={(v) => updateWeather({ windSpeed: v })} />
        <Slider label="Wind direction (from)" value={draft.weather.windDirection} min={0} max={359} step={5} format={(v) => `${v}°`} onChange={(v) => updateWeather({ windDirection: v })} />
        <Slider label="Humidity" value={draft.weather.humidity} min={10} max={100} step={1} format={(v) => `${v}%`} onChange={(v) => updateWeather({ humidity: v })} />
        <Slider label="Rainfall" value={draft.weather.rainfall} min={0} max={60} step={1} format={(v) => `${v} mm`} onChange={(v) => updateWeather({ rainfall: v })} />
        <Slider label="Pressure" value={draft.weather.pressure} min={990} max={1030} step={1} format={(v) => `${v} hPa`} onChange={(v) => updateWeather({ pressure: v })} />
        <button className="cursor-pointer text-[12px] font-medium text-accent-300 hover:underline" onClick={() => update({ weather: { ...base.weather } })}>
          Reset to baseline weather
        </button>
      </Block>

      <div className="sticky bottom-0 mt-auto border-t hairline bg-ink-950/95 px-4 py-3 backdrop-blur">
        {errors.length > 0 && (
          <div role="alert" className="mb-2 rounded-lg bg-accent-500/10 px-2.5 py-1.5 text-[12px] text-accent-300">
            {errors.map((e) => (
              <div key={e}>• {e}</div>
            ))}
          </div>
        )}
        <div className="mb-2 flex items-center justify-between gap-2 text-[12px]" role="status" aria-live="polite">
          {upToDate && result ? (
            <span className="text-sand-300">
              Mean PM2.5 <span className="num font-semibold text-sand-50">{fmt(result.summary.meanBaseline)}</span>
              {' → '}
              <span className="num font-semibold text-sand-50">{fmt(result.summary.meanScenario)}</span> µg/m³ (
              <DeltaText value={result.summary.meanDeltaPct} unit="%" />)
            </span>
          ) : (
            <span className="text-sand-400">{result ? 'Changes not run yet' : 'Not run yet'}</span>
          )}
          {saved.length > 0 && (
            <button type="button" className="shrink-0 cursor-pointer font-medium text-accent-300 hover:underline" onClick={() => setSection('scenarios')}>
              Saved ({saved.length})
            </button>
          )}
        </div>
        <Toggle checked={live} onChange={setLive} label="Update map and chart as I change values" />
        <div className="flex gap-2">
          <Button onClick={reset} title="Reset all parameters to baseline">
            <RotateCcw size={14} aria-hidden="true" /> Reset scenario
          </Button>
          <Button variant="primary" className="flex-1 !min-h-9" onClick={runAndShow}>
            <Play size={14} aria-hidden="true" /> {upToDate ? 'Run again' : 'Run scenario'}
          </Button>
        </div>
      </div>
    </div>
  );
}
