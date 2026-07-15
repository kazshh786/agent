const fs=require('fs');const path=require('path');
const utils=require('../api/_utils');
const websiteAccess=require('../api/_website');

jest.mock('../api/_utils',()=>({
  requireAuth:jest.fn(),createSupabaseServiceClient:jest.fn(),requireEnabledModule:jest.fn(),requireActiveWorkspace:jest.fn(),validateBody:jest.fn(),validateUUID:jest.fn(),
  writeAuditLog:jest.fn(),errorResponse:jest.fn((res,status,code,message)=>res.status(status).json({error:{code,message}})),
  generateCorrelationId:jest.fn(()=> 'test-correlation-id'),handleCors:jest.fn(()=>false)
}));
jest.mock('../api/_website',()=>({requireWebsiteWrite:jest.fn()}));
const compileRoute=require('../api/website-engine/compile');

function queryClient(){
  return {from:jest.fn(table=>({select:()=>({eq:()=>({eq:()=>({single:async()=>table==='website_sites'?{data:{id:'site-id',workspace_id:'123e4567-e89b-12d3-a456-426614174000',project_id:'project-id',template_name:'editorial-luxe',primary_domain:'client.example.com',booking_path:'/book',payment_mode:'deposit',analytics_key:'323e4567-e89b-12d3-a456-426614174000'},error:null}:{data:{id:'project-id',name:'client-site'},error:null}})})})})),rpc:jest.fn().mockResolvedValue({error:null})};
}

describe('booking-first Website Engine proxy',()=>{
  let req,res,supabase,serviceClient;const OLD_ENV=process.env;
  beforeEach(()=>{
    process.env={...OLD_ENV,WEBSITE_ENGINE_API_URL:'https://engine.example.com',WEBSITE_ENGINE_API_TOKEN:'secret',WEBSITE_ENGINE_VERCEL_BYPASS_TOKEN:'preview-bypass',APP_URL:'https://dashboard.kasimshah.com'};
    supabase=queryClient();serviceClient={rpc:jest.fn().mockResolvedValue({error:null})};req={method:'POST',headers:{'x-workspace-id':'123e4567-e89b-12d3-a456-426614174000'},body:{siteId:'223e4567-e89b-12d3-a456-426614174000'}};
    res={status:jest.fn().mockReturnThis(),json:jest.fn(),setHeader:jest.fn(),end:jest.fn()};
    utils.requireAuth.mockResolvedValue({user:{id:'u1'},supabase});utils.createSupabaseServiceClient.mockReturnValue(serviceClient);websiteAccess.requireWebsiteWrite.mockResolvedValue({role:'editor'});
    utils.requireEnabledModule.mockResolvedValue({enabled:true});utils.requireActiveWorkspace.mockResolvedValue({status:'active'});utils.validateBody.mockReturnValue({valid:true});utils.validateUUID.mockReturnValue(true);
    global.fetch=jest.fn();jest.clearAllMocks();
  });
  afterAll(()=>{process.env=OLD_ENV;});

  test('requires the configured engine and analytics origin',async()=>{
    delete process.env.APP_URL;await compileRoute(req,res);expect(res.status).toHaveBeenCalledWith(503);
  });

  test('requires both website and booking entitlements',async()=>{
    utils.requireEnabledModule.mockResolvedValueOnce({enabled:true}).mockResolvedValueOnce({error:{code:'MODULE_DISABLED'}});
    await compileRoute(req,res);expect(res.status).toHaveBeenCalledWith(403);expect(res.json.mock.calls[0][0].error.code).toBe('MODULE_DISABLED');
  });

  test('does not compile a suspended workspace',async()=>{
    utils.requireActiveWorkspace.mockResolvedValue({error:{code:'WORKSPACE_SUSPENDED',message:'Workspace is suspended'},status:403});
    await compileRoute(req,res);expect(res.status).toHaveBeenCalledWith(403);expect(global.fetch).not.toHaveBeenCalled();
  });

  test('sends the same-domain booking contract and analytics identifiers',async()=>{
    global.fetch.mockResolvedValue({ok:true,status:200,json:async()=>({success:true})});
    await compileRoute(req,res);
    const body=JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).toEqual(expect.objectContaining({name:'client.example.com',bookingLink:'/book',bookingProvider:'ks_os',paymentMode:'deposit',analyticsEndpoint:'https://dashboard.kasimshah.com/api/analytics/collect',bookingApiEndpoint:'https://dashboard.kasimshah.com/api/booking'}));
    expect(body.analyticsKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(global.fetch.mock.calls[0][1].headers['x-vercel-protection-bypass']).toBe('preview-bypass');
    expect(serviceClient.rpc).toHaveBeenCalledWith('record_website_compile_result',expect.objectContaining({p_actor_id:'u1',p_success:true,p_website_id:'site-id'}));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('records controlled engine failures without leaking downstream bodies',async()=>{
    global.fetch.mockResolvedValue({ok:false,status:422,json:async()=>({secret:'do not leak'})});
    await compileRoute(req,res);expect(res.status).toHaveBeenCalledWith(422);expect(JSON.stringify(res.json.mock.calls)).not.toContain('do not leak');
    expect(serviceClient.rpc).toHaveBeenCalledWith('record_website_compile_result',expect.objectContaining({p_actor_id:'u1',p_success:false,p_error_code:'ENGINE_ERROR'}));
  });

  test('engine source enforces auth and generates a branded /book route',()=>{
    const source=fs.readFileSync(path.join(__dirname,'../../../control-panel/server.js'),'utf8');
    expect(source).toContain("bookingLink !== '/book'");expect(source).toContain('WEBSITE_ENGINE_API_TOKEN');
    expect(source).toContain('WEBSITE_ENGINE_ALLOWED_ORIGIN');
    expect(source).toContain("const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main'");
    expect(source).toContain("githubUrl.searchParams.set('ref', GITHUB_BRANCH)");
    expect(source).toContain('requestBody = { ...requestBody, branch: GITHUB_BRANCH }');
    expect(source).toContain('data-ks-booking-root');expect(source).toContain('data-ks-conversion-tracker');
    expect(source).toContain('data-ks-booking-widget');expect(source).toContain('stripe.confirmCardPayment');
    expect(source).not.toContain("track('payment_completed'");expect(source).not.toContain("track('booking_confirmed'");
    expect(source).not.toContain("track('customer_details_submitted'");expect(source).toContain("track('booking_started'");
    expect(source).toContain('bookingChannel:state.channel');
  });
});
