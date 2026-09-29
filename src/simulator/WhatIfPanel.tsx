import { useState } from 'react';
import { Play, RotateCcw, MousePointerClick, Plus, Trash2, Factory, TreePine, Car, CloudSun, Building2, ShieldCheck, Route, MapPin, Zap } from 'lucide-react';
import { useTwin } from '../store/useTwinStore';
import { Block, Button, DataBadge, Disclaimer, SectionHeader, Slider, Toggle } from '../components/ui';
import { cellAt, defaultParams, makeScenarioIndustry } from '../services/scenarioService';
import type { IndustryCategory, ScenarioParams } from '../types';
import { cellAreaKm2 } from '../utils/geo';
import { fmt } from '../utils/format';

const CATEGORIES: IndustryCategory[] = ['Manufacturing', 'Chemical', 'Power', 'Metal', 'Processing'];
const pct = (v: number) => `${Math.round(v * 100)}%`;
const signedPct = (v: number) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`;
const TREE_CANOPY_M2 = 40; // assumed mature canopy per tree (illustrative)

function GroupTitle({ icon: Icon, children }: { icon: typeof Car; children: string }) {
  return (
    <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400">
      <Icon size={12} className="text-cyan-400" />
      {children}
    </div>
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

  const [closure, setClosure] = useState({ roadId: base.roads[0].id, divertTo: '', share: 0.7 });
  const [trees, setTrees] = useState(-500);

  const areaCells = base.cells.filter((c) => draft.targetCells.includes(c.id));
  const hasArea = areaCells.length > 0;
  const areaKm2 = (hasArea ? areaCells : base.cells).reduce((a, c) => a + cellAreaKm2(c.bounds), 0);
  const treesToPts = (n: number) => ((n * TREE_CANOPY_M2) / (areaKm2 * 1e6)) * 100;

  const pendingCell = pending.location ? cellAt(base, pending.location) : undefined;

  const applyPreset = (p: Partial<ScenarioParams>) => update({ ...defaultParams(base), ...p });

  return (
    <div className="flex min-h-full flex-col">
      <SectionHeader
        title="What-If Simulator"
        subtitle="Change urban & environmental parameters, then run the modeled scenario"
        right={<DataBadge status="MODELED_SCENARIO" />}
      />

      <Block title="Scenario">
        <input
          value={draft.name === 'Baseline' ? '' : draft.name}
          placeholder="Scenario name (optional)"
          onChange={(e) => update({ name: e.target.value })}
          className="w-full rounded-md bg-ink-800 px-2 py-1.5 text-[12px] text-slate-200 ring-1 ring-inset ring-ink-600 outline-none placeholder:text-slate-600 focus:ring-cyan-500"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          <Button className="!py-1 text-[11px]" onClick={() => applyPreset({ name: 'Traffic +30%', trafficMultiplier: 1.3 })}>Traffic +30%</Button>
          <Button className="!py-1 text-[11px]" onClick={() => applyPreset({ name: 'Traffic restriction −20%', trafficMultiplier: 0.8 })}>Restriction −20%</Button>
          <Button
            className="!py-1 text-[11px]"
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
            className="!py-1 text-[11px]"
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
        <div className="flex items-center justify-between text-[11.5px]">
          <span className="text-slate-300">{hasArea ? `${areaCells.length} zone(s) selected` : 'Whole analysis area'}</span>
          <span className="text-slate-500">{fmt(areaKm2, 0)} km²</span>
        </div>
        {hasArea && (
          <div className="mt-1 flex flex-wrap gap-1">
            {areaCells.slice(0, 18).map((c) => (
              <button key={c.id} onClick={() => toggleArea(c.id)} className="rounded bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[10px] text-cyan-200 hover:bg-rose-500/20" title="Remove">
                {c.id}
              </button>
            ))}
            {areaCells.length > 18 && <span className="text-[10px] text-slate-500">+{areaCells.length - 18}</span>}
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
        <Disclaimer>Area-level traffic, green-cover and building changes apply to these zones (green/buildings apply city-wide if none selected).</Disclaimer>
      </Block>

      {/* Traffic */}
      <Block>
        <GroupTitle icon={Car}>Traffic</GroupTitle>
        <Slider label="City-wide traffic intensity" value={draft.trafficMultiplier} min={0.3} max={2} step={0.05} format={signedPct} onChange={(v) => update({ trafficMultiplier: v })} />
        <Slider
          label={`Area traffic ${hasArea ? '' : '(select an area)'}`}
          value={draft.areaTrafficMultiplier}
          min={0}
          max={2}
          step={0.05}
          format={signedPct}
          onChange={(v) => update({ areaTrafficMultiplier: v })}
        />
        <Slider label="Public transport mode shift" value={draft.publicTransportShift} min={0} max={0.5} step={0.01} format={pct} onChange={(v) => update({ publicTransportShift: v })} />
      </Block>

      {/* Roads */}
      <Block>
        <GroupTitle icon={Route}>Road closure & diversion</GroupTitle>
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <label className="text-slate-500">
            Close
            <select
              value={closure.roadId}
              onChange={(e) => setClosure({ ...closure, roadId: e.target.value })}
              className="mt-0.5 w-full rounded bg-ink-800 px-1.5 py-1 text-slate-200 ring-1 ring-ink-600"
            >
              {base.roads.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
          <label className="text-slate-500">
            Divert to
            <select
              value={closure.divertTo}
              onChange={(e) => setClosure({ ...closure, divertTo: e.target.value })}
              className="mt-0.5 w-full rounded bg-ink-800 px-1.5 py-1 text-slate-200 ring-1 ring-ink-600"
            >
              <option value="">— none (suppress) —</option>
              {base.roads.filter((r) => r.id !== closure.roadId).map((r) => (
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
          <div key={c.roadId} className="mt-1 flex items-center gap-1.5 rounded bg-ink-800/70 px-2 py-1 text-[11px] text-slate-300">
            <span className="truncate">
              ✕ {base.roads.find((r) => r.id === c.roadId)?.name}
              {c.divertToRoadId && <span className="text-slate-500"> → {base.roads.find((r) => r.id === c.divertToRoadId)?.name} ({pct(c.diversionShare)})</span>}
            </span>
            <button className="ml-auto text-slate-500 hover:text-rose-300" onClick={() => update({ roadClosures: draft.roadClosures.filter((x) => x.roadId !== c.roadId) })}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </Block>

      {/* Industry */}
      <Block>
        <GroupTitle icon={Factory}>Industry</GroupTitle>
        <div className="rounded-md bg-ink-800/60 p-2">
          <div className="flex items-center gap-1.5">
            <select
              value={pending.category}
              onChange={(e) => setPending({ category: e.target.value as IndustryCategory })}
              className="flex-1 rounded bg-ink-800 px-1.5 py-1 text-[11.5px] text-slate-200 ring-1 ring-ink-600"
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
          <div className="text-[10.5px] text-slate-500">
            {pending.location
              ? `Site: ${pending.location[1].toFixed(4)}°N ${pending.location[0].toFixed(4)}°E${pendingCell ? ` · zone ${pendingCell.id} (${pendingCell.landUse}, green ${fmt(pendingCell.greenCover, 0)}%)` : ' · outside analysis area'}`
              : 'No site chosen — click "Place on map".'}
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
          <div key={i.id} className="mt-1 flex items-center gap-1.5 rounded bg-pink-500/10 px-2 py-1 text-[11px] text-slate-300">
            <Factory size={11} className="text-pink-300" />
            <span className="truncate">{i.name} · {i.emissionIntensity}</span>
            <button className="ml-auto text-slate-500 hover:text-rose-300" onClick={() => update({ addedIndustries: draft.addedIndustries.filter((x) => x.id !== i.id) })}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {(draft.removedIndustryIds.length > 0 || Object.keys(draft.industryIntensityOverrides).length > 0) && (
          <div className="mt-1.5 text-[11px] text-slate-400">
            {draft.removedIndustryIds.length > 0 && <div>Removed: {draft.removedIndustryIds.join(', ')}</div>}
            {Object.entries(draft.industryIntensityOverrides).map(([id, v]) => (
              <div key={id}>
                {id} intensity → {v}
              </div>
            ))}
            <button className="text-[10.5px] text-cyan-400 hover:underline" onClick={() => update({ removedIndustryIds: [], industryIntensityOverrides: {} })}>
              reset source edits
            </button>
          </div>
        )}
        <Disclaimer>Tip: click an existing industry on the map to change its intensity or remove it.</Disclaimer>
      </Block>

      {/* Pollution control */}
      <Block>
        <GroupTitle icon={ShieldCheck}>Pollution control</GroupTitle>
        <Slider label="Additional industrial control efficiency" value={draft.industrialControl} min={0} max={0.9} step={0.05} format={pct} onChange={(v) => update({ industrialControl: v })} />
        <Slider label="Vehicle emission control" value={draft.vehicleEmissionControl} min={0} max={0.8} step={0.05} format={pct} onChange={(v) => update({ vehicleEmissionControl: v })} />
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
          <label className="flex-1 text-[11px] text-slate-500">
            Trees (− removed / + planted)
            <input
              type="number"
              value={trees}
              step={100}
              onChange={(e) => setTrees(Number(e.target.value))}
              className="mt-0.5 w-full rounded bg-ink-800 px-2 py-1 text-[12px] text-slate-200 ring-1 ring-ink-600 outline-none"
            />
          </label>
          <Button onClick={() => update({ greenCoverDelta: Math.max(-40, Math.min(40, Math.round(treesToPts(trees) * 10) / 10)) })}>Apply</Button>
        </div>
        <div className="text-[10.5px] text-slate-500">
          ≈ {fmt(treesToPts(trees), 2)} pts over {fmt(areaKm2, 1)} km² (assumes {TREE_CANOPY_M2} m² canopy/tree). Select a small area for a local development.
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
        <Slider label="Building height" value={draft.buildingHeightMultiplier} min={0.5} max={3} step={0.1} format={(v) => `×${v.toFixed(1)}`} onChange={(v) => update({ buildingHeightMultiplier: v })} />
      </Block>

      {/* Weather */}
      <Block>
        <GroupTitle icon={CloudSun}>Weather</GroupTitle>
        <Slider label="Temperature" value={draft.weather.temperature} min={5} max={45} step={0.5} format={(v) => `${v}°C`} onChange={(v) => updateWeather({ temperature: v })} />
        <Slider label="Wind speed" value={draft.weather.windSpeed} min={0.2} max={12} step={0.1} format={(v) => `${v.toFixed(1)} m/s`} onChange={(v) => updateWeather({ windSpeed: v })} />
        <Slider label="Wind direction (from)" value={draft.weather.windDirection} min={0} max={359} step={5} format={(v) => `${v}°`} onChange={(v) => updateWeather({ windDirection: v })} />
        <Slider label="Humidity" value={draft.weather.humidity} min={10} max={100} step={1} format={(v) => `${v}%`} onChange={(v) => updateWeather({ humidity: v })} />
        <Slider label="Rainfall" value={draft.weather.rainfall} min={0} max={60} step={1} format={(v) => `${v} mm`} onChange={(v) => updateWeather({ rainfall: v })} />
        <Slider label="Pressure" value={draft.weather.pressure} min={990} max={1030} step={1} format={(v) => `${v} hPa`} onChange={(v) => updateWeather({ pressure: v })} />
        <button className="text-[10.5px] text-cyan-400 hover:underline" onClick={() => update({ weather: { ...base.weather } })}>
          reset to baseline weather
        </button>
      </Block>

      <div className="sticky bottom-0 mt-auto border-t border-ink-700 bg-ink-900/95 px-4 py-3 backdrop-blur">
        {errors.length > 0 && (
          <div className="mb-2 rounded bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-300">
            {errors.map((e) => (
              <div key={e}>• {e}</div>
            ))}
          </div>
        )}
        <div className="flex gap-1.5">
          <Button onClick={reset} title="Reset all parameters to baseline">
            <RotateCcw size={13} /> Reset
          </Button>
          <Button variant="primary" className="flex-1 !py-2" onClick={() => run()}>
            <Play size={14} /> RUN SCENARIO
          </Button>
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-500">
          <Zap size={10} /> Prototype modeled estimate — uncalibrated rule-based model on demo data.
        </div>
      </div>
    </div>
  );
}
