import type {Action,ActionAdapter,Outcome} from './aeromatrixActions';
// Structural adapter for methods verified in src/store/useTwinStore.ts.
// Pass your actual store getState and vetted region centers; no guessed coordinates.
interface TwinState {
  base:unknown;draft:unknown;activeResult:unknown;
  layers:Record<string,boolean>;
  setSection:(section:'overview'|'analytics'|'simulator'|'data'|'industries'|'air'|'zones'|'actions'|'locations'|'sensors')=>void;
  setPollutant:(pollutant:'pm25'|'pm10'|'no2'|'so2'|'co'|'o3')=>void;
  setDisplayMode:(mode:'baseline'|'delta')=>void;
  updateDraft:(params:{trafficMultiplier:number})=>void;
  runDraft:()=>boolean;resetDraft:()=>void;
  requestFlyTo:(location:[number,number],range?:number)=>void;
  toggleLayer:(id:'heatmap')=>void;
}
export function existingTwinAdapter(getState:()=>TwinState,regions:Record<string,[number,number]>):ActionAdapter {
  const types=['navigate_to_section','set_pollutant','show_heatmap','open_scenario','update_scenario_parameter','run_scenario','reset_scenario','show_scenario','focus_map_location','show_industries'];
  return {
    supports:(a:Action)=>types.includes(a.type)&&(a.type!=='focus_map_location'||Object.keys(regions).some(k=>k.toLowerCase()===a.region.toLowerCase())),
    async execute(a:Action):Promise<Outcome>{
      const s=getState();
      switch(a.type){
        case 'navigate_to_section':s.setSection(a.section==='map'?'overview':a.section==='sites'?'locations':a.section);break;
        case 'set_pollutant':s.setPollutant(a.pollutant);break;
        case 'show_heatmap':if(!s.layers.heatmap)s.toggleLayer('heatmap');break;
        case 'open_scenario':s.setSection('simulator');break;
        case 'show_industries':s.setSection('industries');return {status:'executed',message:'Opened the industrial areas panel. Proximity filtering is not provided by this adapter.'};
        case 'focus_map_location':{
          const key=Object.keys(regions).find(k=>k.toLowerCase()===a.region.toLowerCase());
          if(!key)return {status:'unsupported',message:'No verified map coordinates are configured for that location.'};
          s.requestFlyTo(regions[key],5000);break;
        }
        case 'update_scenario_parameter':
          if(!s.draft)return {status:'error',message:'Load the baseline and open a scenario first.'};
          s.updateDraft({trafficMultiplier:1-a.value/100});return {status:'executed',message:`Set scenario traffic reduction to ${a.value}%. This is an input assumption, not an observed pollution change.`};
        case 'run_scenario':
          if(!s.runDraft())return {status:'error',message:'The application rejected this scenario. Review the draft and baseline.'};
          return {status:'executed',message:'The application completed its prototype scenario calculation. The result is hypothetical; view the scenario panel for the actual output.',result:getState().activeResult};
        case 'reset_scenario':
          if(!s.base)return {status:'error',message:'No baseline is loaded.'};
          s.resetDraft();return {status:'executed',message:'Reset the scenario draft to the loaded baseline. Saved scenarios were not deleted.'};
        case 'show_scenario':
          if(a.mode==='delta'&&!s.activeResult)return {status:'error',message:'Run a scenario before viewing its difference.'};
          s.setDisplayMode(a.mode);break;
        default:return {status:'unsupported',message:'This command has no connected application handler.'};
      }
      return {status:'executed',message:`Application updated: ${a.type.replaceAll('_',' ')}.`};
    }
  };
}
