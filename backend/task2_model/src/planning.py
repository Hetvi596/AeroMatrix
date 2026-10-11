"""Transparent hypothetical sensitivity; caller supplies effect/cost assumptions."""
from itertools import combinations
def optimize(actions,budget,baseline,effect_factor,unavailable=None):
    allowed=[a for a in actions if a['id']!=unavailable];best={'selected':[],'cost':0.,'benefit':0.}
    for n in range(len(allowed)+1):
      for group in combinations(allowed,n):
        cost=sum(a['cost'] for a in group)
        if cost>budget:continue
        remaining=1.
        for a in group:remaining*=1-min(1,a['fraction']*effect_factor)
        benefit=baseline*(1-remaining)
        if benefit>best['benefit'] or (benefit==best['benefit'] and cost<best['cost']):best={'selected':[a['id'] for a in group],'cost':cost,'benefit':benefit}
    return best
def analyze(prediction,actions,budget):
    if prediction.get('value') is None:return {'status':'UNAVAILABLE','reason':'No supported pollution prediction'}
    if not actions:return {'status':'UNAVAILABLE','reason':'No justified intervention cost/effect assumptions supplied'}
    if len(actions)>12 or budget<0:raise ValueError('At most 12 actions and nonnegative budget')
    if len({a['id'] for a in actions})!=len(actions) or any(a['cost']<0 or not 0<=a['fraction']<=1 or not a.get('source') for a in actions):raise ValueError('Unique actions, nonnegative cost, fraction 0..1 and assumption source required')
    central=optimize(actions,budget,prediction['value'],1);rows=[]
    for label,base in zip(['lower','central','upper'],[prediction['interval'][0],prediction['value'],prediction['interval'][1]]):
     for factor in [.7,1.,1.3]:
      for b in sorted(set([budget,budget*.7])):
       for unavailable in [None,actions[0]['id']]:
        x=optimize(actions,b,base,factor,unavailable);rows.append({**x,'baseline_case':label,'baseline':base,'effect_factor':factor,'budget':b,'unavailable_action':unavailable,'feasible':x['cost']<=b,'original_package_feasible':central['cost']<=b and unavailable not in central['selected'],'changed':x['selected']!=central['selected']})
    return {'status':'HYPOTHETICAL_SENSITIVITY','central':central,'scenarios':rows,'unchanged_fraction':sum(not x['changed'] for x in rows)/len(rows),'assumptions':actions,'limitations':'Effects and costs are supplied assumptions, not pollution-model causal estimates. Counts are scenario frequencies, not probabilities. Common baseline scaling can leave package rankings unchanged.'}
