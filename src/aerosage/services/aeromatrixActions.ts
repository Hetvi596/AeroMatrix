export type SectionTarget='map'|'analytics'|'simulator'|'data'|'air'|'zones'|'actions'|'sites'|'sensors';
export type Action =
 | {type:'navigate_to_section';section:SectionTarget}
 | {type:'select_region'|'focus_map_location';region:string}
 | {type:'set_pollutant';pollutant:'pm25'|'pm10'|'no2'|'so2'|'co'|'o3'}
 | {type:'show_heatmap';enabled:true}
 | {type:'set_forecast_time';timestamp:string}
 | {type:'compare_regions';regions:[string,string]}
 | {type:'open_scenario'|'run_scenario'|'reset_scenario'}
 | {type:'update_scenario_parameter';parameter:'traffic_reduction_pct';value:number}
 | {type:'show_scenario';mode:'baseline'|'delta'}
 | {type:'show_industries'}
 | {type:'highlight_chart_data';chartId:string};
export type Outcome={status:'executed'|'unsupported'|'error';message:string;result?:unknown};
export interface ActionAdapter{supports:(action:Action)=>boolean;execute:(action:Action)=>Promise<Outcome>}
export const disruptive=(action:Action)=>['update_scenario_parameter','run_scenario','reset_scenario'].includes(action.type);
export function validateAction(a:Action):boolean{
  if(!a||typeof a!=='object')return false;
  switch(a.type){
    case 'navigate_to_section':return ['map','analytics','simulator','data','air','zones','actions','sites','sensors'].includes(a.section);
    case 'select_region':case 'focus_map_location':return typeof a.region==='string'&&a.region.length>0&&a.region.length<=120;
    case 'set_pollutant':return ['pm25','pm10','no2','so2','co','o3'].includes(a.pollutant);
    case 'show_heatmap':return a.enabled===true;
    case 'update_scenario_parameter':return a.parameter==='traffic_reduction_pct'&&Number.isFinite(a.value)&&a.value>=0&&a.value<=100;
    case 'set_forecast_time':return typeof a.timestamp==='string'&&/T.*(Z|[+-]\d\d:\d\d)$/.test(a.timestamp)&&Number.isFinite(Date.parse(a.timestamp));
    case 'compare_regions':return Array.isArray(a.regions)&&a.regions.length===2&&a.regions.every(r=>typeof r==='string'&&r.length>0&&r.length<=120);
    case 'show_scenario':return ['baseline','delta'].includes(a.mode);
    case 'highlight_chart_data':return typeof a.chartId==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(a.chartId);
    case 'open_scenario':case 'run_scenario':case 'reset_scenario':case 'show_industries':return true;
    default:return false;
  }
}
export function parseAction(text:string):Action[]|null{
  const t=text.trim().toLowerCase().replace(/[.!?]+$/,'');let m:RegExpMatchArray|null;
  if(/^(open|show) (the )?(pune )?(pollution )?map$|^map kholo$|^नक्शा खोलो$/.test(t))return[{type:'navigate_to_section',section:'map'}];
  if(/^(open|show) (the )?(what[- ]if )?simulator$|^open (the )?scenario$|^simulator kholo$/.test(t))return[{type:'open_scenario'}];
  if((m=t.match(/^(open|show) (the )?(analytics|data)$/)))return[{type:'navigate_to_section',section:m[3] as 'analytics'|'data'}];
  if((m=t.match(/^(?:open|show|go to) (?:the )?(air quality|zones|actions|recommendations|sites|site comparison|sensors|sensor intelligence|missing sensors?)(?: screen| section| panel)?$/))){
    const k=m[1];
    return[{type:'navigate_to_section',section:k==='air quality'?'air':k==='recommendations'?'actions':k.startsWith('site')?'sites':k.includes('sensor')?'sensors':k as SectionTarget}];
  }
  if((m=t.match(/^(?:switch to|show|select) (?:the )?(pm2\.5|pm25|pm10|no2|so2|co|o3)(?: heatmap)?$/)))return[{type:'set_pollutant',pollutant:m[1].replace('.','') as 'pm25'},...(t.includes('heatmap')?[{type:'show_heatmap' as const,enabled:true as const}]:[])];
  if((m=t.match(/^(?:set traffic reduction to|reduce traffic by|traffic kam karo)\s+(-?\d+(?:\.\d+)?)\s*(?:percent|%)(?: and show (?:the )?difference)?$/)))return[{type:'update_scenario_parameter',parameter:'traffic_reduction_pct',value:Number(m[1])},...(t.includes('difference')?[{type:'run_scenario' as const},{type:'show_scenario' as const,mode:'delta' as const}]:[])];
  if(/^(?:show|open|turn on) (?:the )?(?:pollution )?heat ?map$/.test(t))return[{type:'show_heatmap',enabled:true}];
  if(/^reset (the )?scenario$/.test(t))return[{type:'reset_scenario'}];
  if(/^run (the )?scenario$/.test(t))return[{type:'run_scenario'}];
  if(/^show (the )?baseline( scenario)?$/.test(t))return[{type:'show_scenario',mode:'baseline'}];
  if(/^compare before and after$|^show (the )?difference$/.test(t))return[{type:'show_scenario',mode:'delta'}];
  if(/^(?:show|open) (?:the )?(nearby )?(?:industrial areas|industries)$/.test(t))return[{type:'show_industries'}];
  if((m=t.match(/^(?:zoom into|focus on|show) ([a-z\u0900-\u097f][a-z\u0900-\u097f -]{1,100})$/)))return[{type:'focus_map_location',region:m[1]}];
  return null;
}
export async function executeActions(actions:Action[],adapter:ActionAdapter|undefined,confirmed=false):Promise<Outcome[]>{
  if(actions.some(a=>!validateAction(a)))return[{status:'error',message:'The requested application action or parameter is invalid.'}];
  if(!adapter||actions.some(a=>!adapter.supports(a)))return[{status:'unsupported',message:'This action is not connected in the current application. No changes were made.'}];
  if(actions.some(disruptive)&&!confirmed)return[{status:'error',message:'Confirmation is required before changing or running a scenario.'}];
  const results:Outcome[]=[];
  for(const action of actions){try{const outcome=await adapter.execute(action);results.push(outcome);if(outcome.status!=='executed')break;}catch{results.push({status:'error',message:'The application action failed. Check the current application state; earlier steps may have completed.'});break;}}
  return results;
}
