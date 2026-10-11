"""Bulk, cached ERA5 retrieval through Open-Meteo; no per-pollution-record requests."""
from pathlib import Path
import json,time,hashlib,gzip
import pandas as pd,httpx
ROOT=Path(__file__).resolve().parent
VARIABLES=['temperature_2m','relative_humidity_2m','dew_point_2m','wind_speed_10m','wind_direction_10m','precipitation','surface_pressure']
def main():
    stations=json.loads((ROOT/'config/stations.json').read_text());source='https://www.greentribunal.gov.in/sites/default/files/news_updates/Affidavit%20in%20Reply%20by%20R-1%20in%20OA%20No.48-2025%20%28page%20nos.245-352%29.pdf'
    coords={'site_5407':(18.501793,73.927532),'site_5409':(18.52974978,73.84968215),'site_5766':(18.45445,73.854155),'site_5996':(18.536457,73.805454),'site_6012':(18.459883,73.852193)}
    for id,s in stations.items():
        if id in coords:s.update(latitude=coords[id][0],longitude=coords[id][1],coordinate_status='Exact station name matched to official Annexure R1-IV, printed page 342',coordinate_source=source,weather_grid=f'{round(coords[id][0]*4)/4}_{round(coords[id][1]*4)/4}')
    (ROOT/'config/stations.json').write_text(json.dumps(stations,indent=2));audit=json.loads((ROOT/'data/audit.json').read_text());start=pd.Timestamp(audit['start']).date();end=pd.Timestamp(audit['end']).date()
    cache=ROOT/'data/weather_cache';cache.mkdir(exist_ok=True);frames=[];requests=[]
    for grid in sorted({s['weather_grid'] for s in stations.values() if 'weather_grid' in s}):
      lat,lon=map(float,grid.split('_'))
      for year in range(start.year,end.year+1):
        begin=max(start,pd.Timestamp(f'{year}-01-01').date());finish=min(end,pd.Timestamp(f'{year}-12-31').date());params={'latitude':lat,'longitude':lon,'start_date':str(begin),'end_date':str(finish),'hourly':','.join(VARIABLES),'models':'era5','timezone':'UTC','wind_speed_unit':'ms','cell_selection':'nearest','elevation':'nan'}
        path=cache/f'{grid}_{year}.json.gz';record={'request':params,'endpoint':'https://archive-api.open-meteo.com/v1/archive','cache_file':path.name}
        if path.exists():payload=json.loads(gzip.decompress(path.read_bytes()))
        else:
          payload=None
          for attempt in range(3):
            try:
              response=httpx.get(record['endpoint'],params=params,timeout=60)
              response.raise_for_status();payload=response.json();assert 'hourly' in payload;path.write_bytes(gzip.compress(response.content));break
            except (httpx.HTTPError,ValueError,AssertionError) as e:
              record['error']=type(e).__name__;time.sleep(2*(attempt+1))
          if payload is None:record['status']='FAILED';requests.append(record);continue
        h=pd.DataFrame(payload['hourly']);h['timestamp']=pd.to_datetime(h.pop('time'),utc=True);h['grid']=grid;frames.append(h)
        record.update(status='DOWNLOADED_OR_CACHED',sha256=hashlib.sha256(path.read_bytes()).hexdigest(),rows=len(h),returned_latitude=payload.get('latitude'),returned_longitude=payload.get('longitude'),units=payload.get('hourly_units'));requests.append(record);print(grid,year,len(h),flush=True)
    if frames:pd.concat(frames).to_csv(ROOT/'data/weather.csv.gz',index=False,compression='gzip')
    report={'source':'ERA5 via Open-Meteo Historical Weather API','primary_dataset':'https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels','documentation':'https://open-meteo.com/en/docs/historical-weather-api','attribution':'Generated using Copernicus Climate Change Service information; ECMWF ERA5 DOI 10.24381/cds.adbb2d47; Open-Meteo.com; CC BY 4.0','direct_CDS':'No CDS credentials supplied; used public ERA5 redistributor instead','retrieved_utc':pd.Timestamp.now(tz='UTC').isoformat(),'requests':requests,'rows':sum(len(f) for f in frames),'grids':len({s['weather_grid'] for s in stations.values() if 'weather_grid' in s}),'availability_policy':'For model features, final ERA5 weather is delayed 120 days, beyond documented finalization of 2–3 months. As-of vintage files unavailable: retrospective archive revision caveat remains. Contemporary weather is archived but never used as a forecasting input.','spatial_policy':'Stations mapped to nearest 0.25-degree requested grid; returned grid coordinates stored. Nearby stations sharing a grid do not supply independent weather measurements.'}
    (ROOT/'data/weather_provenance.json').write_text(json.dumps(report,indent=2));print('weather rows',report['rows'],flush=True)
if __name__=='__main__':main()
