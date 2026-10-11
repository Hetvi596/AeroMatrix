import {it,expect,vi} from 'vitest';
import {existingTwinAdapter} from '../services/existingTwinAdapter';
it('maps verified store contracts and never guesses a coordinate',async()=>{
  const state={base:{},draft:{},activeResult:null as unknown,layers:{heatmap:false},setSection:vi.fn(),setPollutant:vi.fn(),setDisplayMode:vi.fn(),updateDraft:vi.fn(),runDraft:vi.fn(()=>true),resetDraft:vi.fn(),requestFlyTo:vi.fn(),toggleLayer:vi.fn()};
  const adapter=existingTwinAdapter(()=>state,{});
  expect(adapter.supports({type:'focus_map_location',region:'Hadapsar'})).toBe(false);
  await adapter.execute({type:'update_scenario_parameter',parameter:'traffic_reduction_pct',value:20});expect(state.updateDraft).toHaveBeenCalledWith({trafficMultiplier:.8});
  await adapter.execute({type:'show_heatmap',enabled:true});expect(state.toggleLayer).toHaveBeenCalledWith('heatmap');
  const r=await adapter.execute({type:'show_scenario',mode:'delta'});expect(r.status).toBe('error');expect(state.setDisplayMode).not.toHaveBeenCalled();
});
