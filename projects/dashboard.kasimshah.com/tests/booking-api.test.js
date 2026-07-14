const mockResolve=jest.fn();const mockCall=jest.fn();const mockRate=jest.fn();
jest.mock('../api/_booking',()=>({UUID_RE:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,resolveBookingContext:(...args)=>mockResolve(...args),callKsOs:(...args)=>mockCall(...args),enforceBookingRateLimit:(...args)=>mockRate(...args)}));
jest.mock('../api/_utils',()=>({errorResponse:(res,status,code,message)=>res.status(status).json({error:{code,message}})}));
const handler=require('../api/booking');
const UUID='123e4567-e89b-12d3-a456-426614174000';
function response(){return{statusCode:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.statusCode=c;return this;},json(b){this.body=b;return this;},end(){return this;}};}
beforeEach(()=>{jest.clearAllMocks();mockResolve.mockResolvedValue({origin:'https://client.example.com',tenantId:'tenant-1',site:{payment_mode:'deposit'}});mockRate.mockResolvedValue({allowed:true});});

test('catalog is relayed with the agency payment policy',async()=>{
  mockCall.mockResolvedValue({ok:true,status:200,body:{services:[],staff:[]}});const res=response();
  await handler({method:'GET',headers:{origin:'https://client.example.com'},query:{action:'catalog',siteKey:UUID}},res);
  expect(res.statusCode).toBe(200);expect(res.body.paymentMode).toBe('deposit');expect(res.headers['Access-Control-Allow-Origin']).toBe('https://client.example.com');
});

test('booking creation forwards customer data only to KS OS and injects trusted payment mode',async()=>{
  mockCall.mockResolvedValue({ok:true,status:201,body:{booking:{reference:UUID,status:'PENDING'},payment:{required:true}}});const res=response();
  await handler({method:'POST',headers:{origin:'https://client.example.com'},query:{action:'create',siteKey:UUID},body:{serviceId:UUID,staffId:UUID,startTime:new Date().toISOString(),client:{name:'Jane Client',email:'jane@example.com',phone:'07123456789'},payNow:true,idempotencyKey:UUID}},res);
  const forwarded=JSON.parse(mockCall.mock.calls[0][2].body);expect(forwarded.paymentMode).toBe('deposit');expect(forwarded.client.email).toBe('jane@example.com');expect(res.statusCode).toBe(201);
});

test('denied origins and unknown fields never reach KS OS',async()=>{
  mockResolve.mockResolvedValue({error:'ORIGIN_DENIED',status:403});let res=response();
  await handler({method:'GET',headers:{origin:'https://attacker.example'},query:{action:'catalog',siteKey:UUID}},res);expect(res.statusCode).toBe(403);expect(mockCall).not.toHaveBeenCalled();
  mockResolve.mockResolvedValue({origin:'https://client.example.com',tenantId:'tenant-1',site:{payment_mode:'pay_later'}});res=response();
  await handler({method:'POST',headers:{origin:'https://client.example.com'},query:{action:'create',siteKey:UUID},body:{serviceId:UUID,staffId:UUID,idempotencyKey:UUID,client:{},medicalNotes:'private'}},res);expect(res.statusCode).toBe(400);expect(mockCall).not.toHaveBeenCalled();
});

test('distributed rate limit blocks booking creation before KS OS',async()=>{
  mockRate.mockResolvedValue({error:'RATE_LIMITED',status:429});const res=response();
  await handler({method:'POST',headers:{origin:'https://client.example.com'},query:{action:'create',siteKey:UUID},body:{}},res);
  expect(res.statusCode).toBe(429);expect(mockCall).not.toHaveBeenCalled();
});
