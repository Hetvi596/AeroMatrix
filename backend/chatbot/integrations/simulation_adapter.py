import httpx

async def get_scenario(settings,scenario_id):
    if not settings.simulation_url or not scenario_id:
        return {'status':'UNAVAILABLE','reason':'No verified simulation API result is connected. Explanations are conceptual and hypothetical.'}
    # Optional integration contract, not a claim that the existing frontend exposes this route.
    try:
        async with httpx.AsyncClient(timeout=settings.ml_timeout,trust_env=False,follow_redirects=False) as c:
            r=await c.get(settings.simulation_url+'/scenarios/'+scenario_id)
        if not r.is_success or len(r.content)>100000:return {'status':'UNAVAILABLE','reason':'Simulation result unavailable'}
        data=r.json()
        if data.get('status')!='MODELED_SCENARIO' or not isinstance(data.get('explanation'),str):
            return {'status':'UNAVAILABLE','reason':'Simulation response lacks required MODELED_SCENARIO status and explanation'}
        return {'status':'MODELED_SCENARIO','scenario_id':scenario_id,'explanation':data['explanation'][:8000],'assumptions':data.get('assumptions',[]),'validated':False}
    except (httpx.HTTPError,ValueError,AttributeError):return {'status':'UNAVAILABLE','reason':'Simulation service unreachable or invalid'}
