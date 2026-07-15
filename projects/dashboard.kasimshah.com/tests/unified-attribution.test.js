const crypto=require('crypto');
const {parseFilters,summarizeCanonical,toCsv}=require('../api/_unified-analytics');
const {channelFor,reducedUserAgent}=require('../api/analytics/collect');
const {verifySignedRequest,identityHmac}=require('../api/_trusted-analytics');
const launch=require('../api/platform/launch-readiness');
const fs=require('fs');const path=require('path');

describe('unified attribution rules',()=>{
  const filters={from:'2026-07-01',to:'2026-07-30',days:30};
  test('classifies direct, organic, referral, paid and preserves reduced user agents',()=>{
    expect(channelFor({},null,'example.com')).toBe('direct');expect(channelFor({},'www.google.com','example.com')).toBe('organic');expect(channelFor({},'partner.test','example.com')).toBe('referral');expect(channelFor({medium:'cpc'},null,'example.com')).toBe('paid');expect(reducedUserAgent('Mozilla iPhone')).toBe('mobile');expect(reducedUserAgent('Crawler Bot')).toBe('bot');
  });
  test('calculates first and last touch without fabricated channel or spend data',()=>{
    const data={sessions:[{id:'s1',last_seen_at:'2026-07-04T00:00:00Z'}],touchpoints:[{event_name:'page_view',occurred_at:'2026-07-01T00:00:00Z'},{event_name:'booking_cta_clicked',occurred_at:'2026-07-02T00:00:00Z'},{event_name:'booking_started',occurred_at:'2026-07-03T00:00:00Z'}],conversions:[{id:'c1',conversion_type:'booking_confirmed',booking_type:'mobile',received_at:'2026-07-04T00:00:00Z'},{id:'c2',conversion_type:'payment_succeeded',revenue_minor:12500,currency:'GBP',received_at:'2026-07-04T00:00:00Z'}],models:[{conversion_id:'c1',model_type:'first_touch',channel:'organic',model_version:1},{conversion_id:'c1',model_type:'last_touch',channel:'referral',model_version:1}],health:[],limited:false};
    const out=summarizeCanonical(data,filters);expect(out.firstTouch.organic).toBe(1);expect(out.lastTouch.referral).toBe(1);expect(out.metrics.mobileBookings).toBe(1);expect(out.metrics.verifiedRevenueMinor).toBe(12500);expect(out.futureChannels).toEqual({email:'NOT_CONNECTED',social:'NOT_CONNECTED'});expect(out.roas).toBeNull();expect(out.spendDataAvailable).toBe(false);
  });
  test('enforces date ranges and CSV formula injection safety',()=>{
    expect(parseFilters({workspaceId:'00000000-0000-0000-0000-000000000001',from:'2025-01-01',to:'2026-07-01'}).error).toMatch(/366/);expect(toCsv([{source:'=HYPERLINK("bad")'}],['source'])).toContain("'=HYPERLINK");
  });
  test('browser ingestion rejects attempted revenue fields before database access',async()=>{const handler=require('../api/analytics/collect'),res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn()};await handler({method:'POST',headers:{},body:{siteKey:'00000000-0000-0000-0000-000000000001',eventId:'00000000-0000-0000-0000-000000000002',sessionId:'00000000-0000-0000-0000-000000000003',eventName:'booking_started',occurredAt:new Date().toISOString(),path:'/book',revenueMinor:9999}},res);expect(res.status).toHaveBeenCalledWith(400);expect(res.json.mock.calls[0][0].error.code).toBe('INVALID_EVENT');});
  test('collector source enforces an exact configured HTTPS origin',()=>{const source=fs.readFileSync(path.join(__dirname,'../api/analytics/collect.js'),'utf8');expect(source).toMatch(/allowed\.has\(origin\.origin\.toLowerCase\(\)\)/);expect(source).not.toMatch(/originHost!==site\.primary_domain/);});
});

describe('trusted attribution security',()=>{
  afterEach(()=>{delete process.env.AUTOMATION_EVENT_SECRET;delete process.env.ATTRIBUTION_IDENTITY_SECRET;});
  test('accepts an exact fresh KS OS signature and rejects replay-age or tampering',()=>{
    process.env.AUTOMATION_EVENT_SECRET='a'.repeat(32);const body={workspaceId:'w',conversionType:'payment_succeeded'},timestamp=Math.floor(Date.now()/1000),raw=JSON.stringify(body),signature=crypto.createHmac('sha256',process.env.AUTOMATION_EVENT_SECRET).update(`${timestamp}.${raw}`).digest('hex');
    expect(verifySignedRequest({body,headers:{'x-ks-timestamp':String(timestamp),'x-ks-signature':signature}}).valid).toBe(true);expect(verifySignedRequest({body:{...body,revenueMinor:1},headers:{'x-ks-timestamp':String(timestamp),'x-ks-signature':signature}}).valid).toBe(false);
  });
  test('uses workspace-specific one-way identity HMAC values',()=>{process.env.ATTRIBUTION_IDENTITY_SECRET='b'.repeat(32);expect(identityHmac('workspace-a','Person@Example.com')).toMatch(/^[0-9a-f]{64}$/);expect(identityHmac('workspace-a','Person@Example.com')).not.toBe(identityHmac('workspace-b','Person@Example.com'));});
  test('launch state is deterministic',()=>{expect(launch.overallStatus({a:{state:'READY'}})).toBe('READY');expect(launch.overallStatus({a:{state:'READY'},b:{state:'DEGRADED'}})).toBe('DEGRADED');expect(launch.overallStatus({a:{state:'DEGRADED'},b:{state:'BLOCKED'}})).toBe('BLOCKED');});
  test('stale integrations and failed webhook health remain non-ready',()=>{expect(launch.fresh(new Date(Date.now()-31*60000).toISOString(),30)).toBe(false);expect(launch.stripeCheck(true,{status:'failed',last_success_at:new Date().toISOString()}).code).toBe('STRIPE_WEBHOOK_UNHEALTHY');expect(launch.stripeCheck(false,null).state).toBe('READY');});
  test('agency analytics implementation never selects customer PII or mobile addresses',()=>{const source=fs.readFileSync(path.join(__dirname,'../api/platform/analytics.js'),'utf8');expect(source).not.toMatch(/customer_email|client_email|phone_number|mobile_address|card_number/i);});
});
