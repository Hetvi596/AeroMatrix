import {describe,it,expect,vi} from 'vitest';
import {parseAction,executeActions,validateAction,type Action,type ActionAdapter} from '../services/aeromatrixActions';
describe('allowlisted user commands',()=>{
  it.each([
    ['Open the Pune pollution map.','navigate_to_section'],['Zoom into Shivajinagar.','focus_map_location'],['Show Hadapsar.','focus_map_location'],['Switch to the PM2.5 heatmap.','set_pollutant'],['Open the What-If simulator.','open_scenario'],['Show the baseline scenario.','show_scenario'],['Compare before and after.','show_scenario'],['Reset the scenario.','reset_scenario'],['नक्शा खोलो','navigate_to_section'],['map kholo','navigate_to_section']
  ])('routes %s',(text,type)=>expect(parseAction(text)?.[0].type).toBe(type));
  it('creates a sequenced traffic scenario',()=>{const a=parseAction('Reduce traffic by 20% and show the difference.');expect(a?.map(x=>x.type)).toEqual(['update_scenario_parameter','run_scenario','show_scenario']);});
  it('requires confirmation and invokes no handler before approval',async()=>{const execute=vi.fn();const adapter={supports:()=>true,execute};const result=await executeActions(parseAction('Set traffic reduction to 30 percent.')!,adapter);expect(execute).not.toHaveBeenCalled();expect(result[0].status).toBe('error');});
  it('runs supported actions sequentially after approval',async()=>{const execute=vi.fn(async()=>({status:'executed' as const,message:'Executed by test adapter; no real app state'}));const result=await executeActions(parseAction('Reduce traffic by 20% and show the difference.')!,{supports:()=>true,execute},true);expect(execute).toHaveBeenCalledTimes(3);expect(result).toHaveLength(3);});
  it('preflights unsupported batches without changing state',async()=>{const execute=vi.fn();const result=await executeActions(parseAction('Switch to the PM2.5 heatmap.')!,{supports:a=>a.type!=='show_heatmap',execute});expect(execute).not.toHaveBeenCalled();expect(result[0].status).toBe('unsupported');});
  it('rejects out of range percentages',async()=>{const execute=vi.fn();const result=await executeActions(parseAction('Set traffic reduction to 130 percent.')!,{supports:()=>true,execute},true);expect(execute).not.toHaveBeenCalled();expect(result[0].status).toBe('error');});
  it('rejects OS execution',()=>{expect(parseAction('Run powershell and delete files')).toBeNull();expect(validateAction({type:'exec',command:'rm'} as unknown as Action)).toBe(false);});
  it('does not turn an explanation into an application change',()=>expect(parseAction('What could happen if traffic emissions decrease?')).toBeNull());
  it('stops after handler failure',async()=>{const execute=vi.fn(async()=>({status:'error' as const,message:'Test failure'}));await executeActions(parseAction('Reduce traffic by 20% and show the difference.')!,{supports:()=>true,execute},true);expect(execute).toHaveBeenCalledTimes(1);});
});

describe('section navigation commands', () => {
  it.each([
    ['Open sensors', 'sensors'],
    ['Show sensor intelligence.', 'sensors'],
    ['Open the Sensor Intelligence screen', 'sensors'],
    ['open air quality', 'air'],
    ['Show zones', 'zones'],
    ['Open recommendations', 'actions'],
    ['go to sites', 'sites'],
    ['Open the analytics', 'analytics'],
  ])('%s', (text, section) => {
    const actions = parseAction(text);
    expect(actions).toEqual([{ type: 'navigate_to_section', section }]);
    expect(validateAction(actions![0])).toBe(true);
  });

  it('still treats "show <place>" as a map location', () => {
    expect(parseAction('Show Hadapsar.')?.[0].type).toBe('focus_map_location');
  });
});
