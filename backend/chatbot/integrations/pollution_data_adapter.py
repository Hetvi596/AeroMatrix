"""Formatting numerical claims is deterministic; generated prose cannot replace these values."""
import math
from datetime import datetime,timezone

def timestamp(value):
    try:
        d=datetime.fromisoformat(str(value).replace('Z','+00:00'))
        return d if d.tzinfo else None
    except (TypeError,ValueError):return None

def stale(value):
    d=timestamp(value)
    return d is None or (datetime.now(timezone.utc)-d).total_seconds()>10800

def number(v):return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)

async def retrieve(api,route,model_data=None,context=None):
    """ML backend first. For current (non-historical) observation requests the ML backend can't
    answer, fall back to Open-Meteo model data at the place's verified coordinates."""
    records=[]
    for region in route.regions:
        mode=route.mode if route.intent=='comparison' else route.intent
        if mode=='forecast':
            if route.pollutant=='aqi':
                # Backend explicitly withholds forecast AQI; do not infer it from point forecasts.
                payload=await api.get('/forecast',{'region':region,'pollutant':'pm25','allow_historical':str(route.historical).lower()})
                item=payload.get('aqi',{'status':'UNAVAILABLE','reason':payload.get('reason','Official AQI needs averaging windows; point forecasts are insufficient')})
                endpoint='/forecast'
            else:
                payload=await api.get('/forecast',{'region':region,'pollutant':route.pollutant,'allow_historical':str(route.historical).lower()})
                item=payload.get('pollutants',{}).get(route.pollutant,{'status':'UNAVAILABLE','reason':payload.get('reason','Requested forecast is unavailable')})
                endpoint='/forecast'
        else:
            payload=await api.get('/pollution',{'region':region});endpoint='/pollution'
            item=payload.get('aqi',{}) if route.pollutant=='aqi' else payload.get('pollutants',{}).get(route.pollutant,{})
            if not item:item={'status':'UNAVAILABLE','reason':payload.get('reason','Requested pollutant is unavailable')}
            if route.pollutant=='aqi' and route.historical and payload.get('status')=='UNAVAILABLE':
                archive=await api.get('/aqi/history',{'region':region})
                rows=archive.get('records',[])
                if rows:
                    latest=max(rows,key=lambda r:timestamp(r.get('time')) or datetime.min.replace(tzinfo=timezone.utc))
                    item={'status':'SOURCE_REPORTED_AQI','value':latest.get('aqi'),'category':latest.get('category'),'time':latest.get('time'),'historical':True};endpoint='/aqi/history'
        when=item.get('valid_at') or item.get('period_end') or item.get('time')
        historic=bool(item.get('historical') or payload.get('historical') or stale(when))
        available=item.get('status') not in ('UNAVAILABLE',None) and number(item.get('value'))
        if available and (not timestamp(when) or (route.pollutant!='aqi' and not item.get('unit'))):
            available=False;item={'status':'UNAVAILABLE','reason':'Backend value lacks a valid timestamp or unit'}
        if available and historic and not route.historical:
            available=False;item={'status':'UNAVAILABLE','reason':'Only historical data are available; request historical data explicitly to view them','time':when}
        record={'region':region,'pollutant':route.pollutant,'available':available,'historical':historic,'timestamp':when,'endpoint':endpoint,'data':item}
        if not available and mode!='forecast' and not route.historical and model_data is not None:
            fallback=await model_data.current(region,route.pollutant,context)
            if fallback is not None:
                if not fallback['available']:fallback['data']['reason']=f"{item.get('reason','No current station value')}. Model data: {fallback['data'].get('reason')}"
                record=fallback
        records.append(record)
    return records

def render(records,lang='en',comparison=False):
    labels={'en':('Historical','Observed','Forecast','Unavailable'), 'hi':('ऐतिहासिक','मापा गया','पूर्वानुमान','उपलब्ध नहीं'), 'hinglish':('Purana historical data','Measured reading','Model forecast','Data available nahi hai')}[lang]
    lines=[]
    for r in records:
        d=r['data'];prefix=f"{r['region']} — {r['pollutant'].upper()}"
        if not r['available']:
            lines.append(f"{prefix}: {labels[3]}. {d.get('reason','No valid API value returned')}.")
            if r.get('timestamp'):lines.append(f"Latest source timestamp: {r['timestamp']}.")
            continue
        kind=labels[2] if d.get('status')=='PREDICTED' else labels[1]
        if d.get('status')=='SOURCE_REPORTED_AQI':kind='Source-reported AQI'
        if d.get('status')=='MODEL_DATA':kind='Model data (Open-Meteo CAMS global model at this place; not a station measurement)'
        if d.get('status')=='MODEL_DATA_AQI_ESTIMATE':kind='Estimated AQI (CPCB breakpoints on Open-Meteo model concentrations; not an official station AQI)'
        if r['historical']:kind=labels[0]+' / '+kind
        unit=d.get('unit','AQI (dimensionless)')
        lines.append(f"{prefix}: {d['value']:g} {unit}. {kind}. Time: {r['timestamp']}.")
        if d.get('category'):lines.append('Category: '+str(d['category'])+'.')
        if d.get('dominant_pollutant'):lines.append('Dominant pollutant: '+str(d['dominant_pollutant']).upper()+'.')
        if d.get('reference_point'):lines.append(f"Reference point: {d['reference_point']}; model grid point {d.get('model_grid_point')}. Nearby places can share these values.")
        if d.get('issued_at'):lines.append('Issued: '+d['issued_at']+'.')
        if number(d.get('lower')) and number(d.get('upper')):lines.append(f"Prediction interval: {d['lower']:g}–{d['upper']:g} {unit}; uncertainty: {d.get('uncertainty',{})}.")
        if d.get('test_metrics'):lines.append('Held-out test metrics: '+str(d['test_metrics'])+'.')
        if d.get('reliability_warnings'):lines.append('Reliability: '+', '.join(d['reliability_warnings'])+'.')
    if comparison:
        ready=len(records)==2 and all(r['available'] for r in records)
        compatible=ready and records[0]['pollutant']==records[1]['pollutant'] and timestamp(records[0]['timestamp'])==timestamp(records[1]['timestamp']) and records[0]['data'].get('unit')==records[1]['data'].get('unit') and records[0]['data'].get('status')==records[1]['data'].get('status')
        if compatible:
            a,b=records; delta=a['data']['value']-b['data']['value']
            lines.append('The values are equal.' if delta==0 else f"{a['region'] if delta>0 else b['region']} has the higher value by {abs(delta):g}. This comparison does not explain the cause.")
        else:lines.append('A fair ranking is unavailable: both regions need the same pollutant, timestamp, units and measurement/prediction status.')
    return '\n\n'.join(lines)
