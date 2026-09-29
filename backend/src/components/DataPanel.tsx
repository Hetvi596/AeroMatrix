import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Upload, FileDown, Trash2, CircleAlert, CircleCheck, Info, Map as MapIcon, RadioTower, CloudSun } from 'lucide-react';
import { useTwin, type UploadedFile } from '../store/useTwinStore';
import { Block, Button, DataBadge, Disclaimer, Empty, SectionHeader, Segmented, Stat } from './ui';
import { OBSERVATION_TEMPLATE } from '../data/import/cpcbImport';
import { WEATHER_TEMPLATE } from '../data/import/weatherImport';
import { validateModel } from '../services/observations';
import { POLLUTANT_LABEL, POLLUTANT_UNIT } from '../utils/colors';
import { fmt } from '../utils/format';
import type { AggregationWindow, Station } from '../types';

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function readFiles(list: FileList | null): Promise<UploadedFile[]> {
  if (!list) return [];
  return Promise.all([...list].map(async (f) => ({ name: f.name, text: await f.text() })));
}

function DropZone({ label, multiple, onFiles }: { label: string; multiple?: boolean; onFiles: (f: UploadedFile[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const handle = async (list: FileList | null) => {
    setBusy(true);
    try {
      const files = await readFiles(list);
      if (files.length) onFiles(files);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      onDragOver={(e: DragEvent) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files);
      }}
      onClick={() => input.current?.click()}
      className={`cursor-pointer rounded-md border border-dashed px-3 py-4 text-center text-[11.5px] transition-colors ${
        over ? 'border-cyan-400 bg-cyan-500/10 text-cyan-200' : 'border-ink-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
      }`}
    >
      <Upload size={16} className="mx-auto mb-1" />
      {busy ? 'Reading…' : label}
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        multiple={multiple}
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          handle(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function StationRow({ station, count }: { station: Station; count: number }) {
  const setLocation = useTwin((s) => s.setStationLocation);
  const [lat, setLat] = useState(station.location ? String(station.location[1]) : '');
  const [lon, setLon] = useState(station.location ? String(station.location[0]) : '');
  const latN = Number(lat);
  const lonN = Number(lon);
  const valid = lat !== '' && lon !== '' && Number.isFinite(latN) && Number.isFinite(lonN) && Math.abs(latN) <= 90 && Math.abs(lonN) <= 180;
  const dirty = valid && (!station.location || station.location[0] !== lonN || station.location[1] !== latN);
  return (
    <div className={`rounded-md px-2 py-1.5 ${station.location ? 'bg-ink-800/50' : 'bg-amber-500/10 ring-1 ring-inset ring-amber-400/30'}`}>
      <div className="flex items-center gap-1.5 text-[11.5px]">
        <RadioTower size={12} className={station.location ? 'text-emerald-400' : 'text-amber-300'} />
        <span className="truncate text-slate-200">{station.name}</span>
        <span className="ml-auto text-[10px] text-slate-500">{count.toLocaleString()} rows</span>
      </div>
      <div className="mt-1 flex items-center gap-1">
        <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="lat e.g. 18.52" className="w-0 flex-1 rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-200 ring-1 ring-ink-600 outline-none focus:ring-cyan-500" />
        <input value={lon} onChange={(e) => setLon(e.target.value)} placeholder="lon e.g. 73.85" className="w-0 flex-1 rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-200 ring-1 ring-ink-600 outline-none focus:ring-cyan-500" />
        <Button className="!px-2 !py-0.5 text-[11px]" disabled={!dirty} onClick={() => setLocation(station.id, [lonN, latN])}>
          Set
        </Button>
      </div>
    </div>
  );
}

function CalibrationBlock() {
  const calibration = useTwin((s) => s.calibration);
  const calibrate = useTwin((s) => s.calibrateModel);
  const clear = useTwin((s) => s.clearCalibration);
  const canFit = useTwin((s) => s.stationSummaries.some((x) => x.cellId && x.values.pm25 !== undefined));
  return (
    <Block title="Calibrate prototype model (PM2.5)">
      {calibration ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Background ×" value={calibration.backgroundScale.toFixed(2)} />
            <Stat label="Local sources ×" value={calibration.localScale.toFixed(2)} />
            <Stat label="RMSE" value={`${calibration.rmseBefore.toFixed(1)}→${calibration.rmseAfter.toFixed(1)}`} sub="in-sample" />
          </div>
          <div className="mt-2 flex gap-1.5">
            <Button className="flex-1" disabled={!canFit} onClick={calibrate}>
              Re-fit
            </Button>
            <Button variant="ghost" onClick={clear}>
              Remove calibration
            </Button>
          </div>
          <Disclaimer>
            Fitted on {calibration.stations} station(s), {calibration.window}. Baseline and all scenarios now use these scalars. Still a rule-based
            MODELED estimate — in-sample fit, not a validated forecast.
          </Disclaimer>
        </>
      ) : (
        <>
          <Button className="w-full" variant="primary" disabled={!canFit} onClick={calibrate}>
            Fit model to observed PM2.5
          </Button>
          <Disclaimer>
            Least-squares fit of PM2.5 = α·background + β·(traffic + industry + other) to the station means (β only with fewer than 3 stations).
            Makes the what-if baseline match measured levels; relative scenario effects keep the prototype model’s structure.
          </Disclaimer>
        </>
      )}
    </Block>
  );
}

function GeometryBlock() {
  const geometry = useTwin((s) => s.geometry);
  const status = useTwin((s) => s.osmStatus);
  const loadOsm = useTwin((s) => s.loadOsmGeometry);
  const useDemo = useTwin((s) => s.useDemoGeometry);
  const isOsm = geometry.source === 'osm';
  const km = geometry.roads.reduce((a, r) => a + (r.lengthKm ?? 0), 0);
  return (
    <Block title="City geometry" right={<DataBadge status={isOsm ? 'OBSERVED' : 'DEMO'} />}>
      {isOsm ? (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Roads" value={geometry.roads.length} sub={`${fmt(km, 0)} km`} />
          <Stat label="Green areas" value={geometry.greenAreas.length} />
          <Stat label="Industrial zones" value={geometry.industrialAreas.length} />
        </div>
      ) : (
        <div className="text-[11.5px] text-slate-400">Using hand-drawn DEMO roads, green areas and industries.</div>
      )}
      <div className="mt-2 flex gap-1.5">
        {!isOsm && (
          <Button variant="primary" className="flex-1" disabled={status.state === 'loading'} onClick={() => loadOsm('snapshot')}>
            <MapIcon size={13} /> {status.state === 'loading' ? 'Loading…' : 'Load real OSM geometry'}
          </Button>
        )}
        <Button
          variant="default"
          className={isOsm ? 'flex-1' : ''}
          disabled={status.state === 'loading'}
          onClick={() => loadOsm('live')}
          title="Download the latest data from the Overpass API (public servers can be busy)"
        >
          {isOsm ? 'Refresh live from Overpass' : 'Live'}
        </Button>
        {isOsm && (
          <Button variant="ghost" onClick={useDemo} disabled={status.state === 'loading'}>
            Use demo
          </Button>
        )}
      </div>
      {status.message && (
        <div className={`mt-1.5 text-[11px] ${status.state === 'error' ? 'text-rose-300' : status.state === 'loading' ? 'text-cyan-300' : 'text-emerald-300'}`}>
          {status.message}
        </div>
      )}
      <Disclaimer>
        {isOsm
          ? `Real geometry © OpenStreetMap contributors (ODbL), fetched ${geometry.fetchedAt?.slice(0, 10)}. Traffic volumes are a DEMO proxy from road class/density, and the ${geometry.industries.length} emission sources sit on the largest OSM industrial zones with DEMO intensities.`
          : 'Loads real major roads, parks/forests and industrial zones for the analysis area (bundled OpenStreetMap snapshot, or "Live" from the Overpass API). Grid traffic, green cover and land use are then derived from real geometry.'}
      </Disclaimer>
    </Block>
  );
}

export function DataPanel() {
  const base = useTwin((s) => s.base)!;
  const ds = useTwin((s) => s.observations);
  const summaries = useTwin((s) => s.stationSummaries);
  const field = useTwin((s) => s.observedField);
  const aggWindow = useTwin((s) => s.aggWindow);
  const setAggWindow = useTwin((s) => s.setAggWindow);
  const importObs = useTwin((s) => s.importObservationFiles);
  const clearObs = useTwin((s) => s.clearObservations);
  const importWeather = useTwin((s) => s.importWeatherFile);
  const clearWeather = useTwin((s) => s.clearWeatherObservation);
  const weatherObs = useTwin((s) => s.weatherObs);
  const messages = useTwin((s) => s.importMessages);
  const pollutant = useTwin((s) => s.pollutant);
  const baseline = useTwin((s) => s.baseline);
  const mode = useTwin((s) => s.displayMode);
  const setMode = useTwin((s) => s.setDisplayMode);
  const flyTo = useTwin((s) => s.requestFlyTo);

  const validation = useMemo(() => validateModel(summaries, baseline, pollutant), [summaries, baseline, pollutant]);
  const missingCoords = ds?.stations.filter((s) => !s.location).length ?? 0;
  const outside = summaries.filter((s) => s.station.location && !s.cellId).length;
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    ds?.records.forEach((r) => m.set(r.stationId, (m.get(r.stationId) ?? 0) + 1));
    return m;
  }, [ds]);
  const digits = pollutant === 'co' ? 2 : 1;

  return (
    <>
      <SectionHeader title="Data sources" subtitle="Import real measurements — imported values are labelled OBSERVED" right={<DataBadge status="OBSERVED" />} />

      {messages.length > 0 && (
        <Block>
          <div className="space-y-1">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex gap-1.5 text-[11px] leading-snug ${m.level === 'error' ? 'text-rose-300' : m.level === 'warn' ? 'text-amber-300' : 'text-emerald-300'}`}
              >
                {m.level === 'error' ? <CircleAlert size={12} className="mt-0.5 shrink-0" /> : m.level === 'warn' ? <Info size={12} className="mt-0.5 shrink-0" /> : <CircleCheck size={12} className="mt-0.5 shrink-0" />}
                {m.text}
              </div>
            ))}
          </div>
        </Block>
      )}

      <GeometryBlock />

      <Block title="Air-quality observations (CPCB / CAAQMS CSV)">
        <DropZone label="Drop CSV file(s) here or click to browse" multiple onFiles={importObs} />
        <div className="mt-1.5 flex items-center justify-between">
          <button className="flex items-center gap-1 text-[10.5px] text-cyan-400 hover:underline" onClick={() => download('observations_template.csv', OBSERVATION_TEMPLATE)}>
            <FileDown size={11} /> template
          </button>
          {ds && (
            <button className="flex items-center gap-1 text-[10.5px] text-slate-500 hover:text-rose-300" onClick={clearObs}>
              <Trash2 size={11} /> clear observations
            </button>
          )}
        </div>
        <Disclaimer>
          Accepts CPCB CCR exports (metadata rows + "From Date, PM2.5 …" header), station_hour-style tables, or any CSV with station,
          datetime and pollutant columns. Files stay in this browser tab — nothing is uploaded to a server.
        </Disclaimer>
      </Block>

      {ds && (
        <>
          <Block title="Loaded dataset">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Stations" value={ds.stations.length} />
              <Stat label="Records" value={ds.records.length.toLocaleString()} />
              <Stat label="Pollutants" value={ds.pollutants.length} sub={ds.pollutants.map((p) => POLLUTANT_LABEL[p]).join(' ')} />
            </div>
            <div className="mt-2 text-[11px] text-slate-400">
              {ds.start.replace('T', ' ')} → {ds.end.replace('T', ' ')} · {ds.fileNames.length} file(s)
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400">Aggregate</span>
              <Segmented<AggregationWindow>
                size="xs"
                value={aggWindow}
                onChange={setAggWindow}
                options={[
                  { value: 'last24h', label: 'Last 24 h of data' },
                  { value: 'period', label: 'Whole period' },
                ]}
              />
            </div>
            <Button
              variant={mode === 'observed' ? 'primary' : 'default'}
              className="mt-2 w-full"
              disabled={!field}
              onClick={() => setMode(mode === 'observed' ? 'baseline' : 'observed')}
            >
              <MapIcon size={13} /> {mode === 'observed' ? 'Showing observed field — back to model' : `Show observed ${POLLUTANT_LABEL[pollutant]} field on map`}
            </Button>
            {!field && (
              <Disclaimer>
                No {POLLUTANT_LABEL[pollutant]} values with coordinates yet{missingCoords ? ' — set station coordinates below' : ''}. Switch
                pollutant in the header if your file has other pollutants.
              </Disclaimer>
            )}
            {outside > 0 && <Disclaimer>{outside} station(s) lie outside the analysis grid — used for interpolation (≤ 40 km) but not validation.</Disclaimer>}
          </Block>

          <Block title={`Stations${missingCoords ? ` · ${missingCoords} need coordinates` : ''}`}>
            <div className="max-h-[260px] space-y-1 overflow-y-auto pr-0.5">
              {ds.stations.map((s) => (
                <div key={s.id} onDoubleClick={() => s.location && flyTo(s.location, 5000)}>
                  <StationRow key={`${s.id}-${s.location?.join(',') ?? 'none'}`} station={s} count={counts.get(s.id) ?? 0} />
                </div>
              ))}
            </div>
            <Disclaimer>CPCB exports usually omit coordinates — enter them from the CPCB station list. Double-click a station to fly to it.</Disclaimer>
          </Block>

          <Block title={`Prototype model vs observed · ${POLLUTANT_LABEL[pollutant]}`}>
            {validation ? (
              <>
                <div className="grid grid-cols-4 gap-2">
                  <Stat label="Stations" value={validation.n} />
                  <Stat label="MAE" value={fmt(validation.mae, digits)} />
                  <Stat label="RMSE" value={fmt(validation.rmse, digits)} />
                  <Stat label="Bias" value={fmt(validation.bias, digits)} sub={validation.r !== null ? `r = ${validation.r.toFixed(2)}` : 'r needs ≥3'} />
                </div>
                <table className="mt-2 w-full text-[11px]">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="text-left font-medium">Station</th>
                      <th className="text-left font-medium">Zone</th>
                      <th className="text-right font-medium">Obs.</th>
                      <th className="text-right font-medium">Model</th>
                      <th className="text-right font-medium">Error</th>
                    </tr>
                  </thead>
                  <tbody className="num">
                    {validation.rows.map((r) => (
                      <tr key={r.stationName} className="border-t border-ink-800">
                        <td className="max-w-[90px] truncate py-1 text-slate-300">{r.stationName}</td>
                        <td className="font-mono text-slate-500">{r.cellId}</td>
                        <td className="text-right text-emerald-200">{fmt(r.observed, digits)}</td>
                        <td className="text-right text-slate-300">{fmt(r.modeled, digits)}</td>
                        <td className={`text-right ${r.error > 0 ? 'text-rose-300' : 'text-sky-300'}`}>{fmt(r.error, digits)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Disclaimer>
                  Compares the uncalibrated demo baseline (demo inputs, {POLLUTANT_UNIT[pollutant]}) with observed station means for the selected window.
                  Large errors are expected — this is the benchmark a trained model must beat. Observed/model ratio: ×{validation.ratio.toFixed(2)}.
                </Disclaimer>
              </>
            ) : (
              <Empty>Needs stations with coordinates inside the grid and {POLLUTANT_LABEL[pollutant]} values.</Empty>
            )}
          </Block>
          <CalibrationBlock />
        </>
      )}

      <Block title="Weather (ERA5 point extract / station met)" right={<CloudSun size={13} className="text-slate-500" />}>
        <DropZone label="Drop a weather CSV here or click to browse" onFiles={(f) => importWeather(f[0])} />
        <div className="mt-1.5 flex items-center justify-between">
          <button className="flex items-center gap-1 text-[10.5px] text-cyan-400 hover:underline" onClick={() => download('weather_template.csv', WEATHER_TEMPLATE)}>
            <FileDown size={11} /> template
          </button>
          {weatherObs && (
            <button className="flex items-center gap-1 text-[10.5px] text-slate-500 hover:text-rose-300" onClick={clearWeather}>
              <Trash2 size={11} /> revert to demo weather
            </button>
          )}
        </div>
        {weatherObs ? (
          <div className="mt-2 rounded-md bg-emerald-500/10 px-2.5 py-2 text-[11px] text-emerald-200 ring-1 ring-inset ring-emerald-400/20">
            Baseline weather from <b>{weatherObs.fileName}</b> ({weatherObs.period}): {weatherObs.weather.temperature}°C, wind{' '}
            {weatherObs.weather.windSpeed} m/s from {weatherObs.weather.windDirection}°, RH {weatherObs.weather.humidity}%, rain{' '}
            {weatherObs.weather.rainfall} mm, {weatherObs.weather.pressure} hPa.
          </div>
        ) : (
          <Disclaimer>Uses the last 24 h of the file (means; rainfall summed; wind direction vector-averaged). Kelvin, Pa, mmHg and ERA5 u10/v10 are converted automatically.</Disclaimer>
        )}
      </Block>

      <Block title="Grid">
        <div className="text-[11px] text-slate-400">
          Analysis area {base.city.bbox.south.toFixed(2)}–{base.city.bbox.north.toFixed(2)}°N, {base.city.bbox.west.toFixed(2)}–{base.city.bbox.east.toFixed(2)}°E ·{' '}
          {base.gridSize}×{base.gridSize} cells. Stations are matched to the cell that contains them.
        </div>
      </Block>
    </>
  );
}
