const {errorResponse}=require('./_utils');
const {UUID_RE,resolveBookingContext,callKsOs,enforceBookingRateLimit}=require('./_booking');
const {identityHmac}=require('./_trusted-analytics');
const {correlationId,logEvent}=require('./_observability');

const ACTIONS=new Set(['catalog','availability','create','status']);
const safeText=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.trim().length<=max?value.trim():null;

module.exports=async function(req,res){
  const cid=correlationId(req);res.setHeader('X-Correlation-ID',cid);
  res.setHeader('Cache-Control','no-store');
  const action=req.query.action;const siteKey=req.query.siteKey;
  if(!ACTIONS.has(action))return errorResponse(res,400,'INVALID_ACTION','Invalid booking action');
  const context=await resolveBookingContext(req,siteKey);
  if(context.error)return errorResponse(res,context.status,context.error,context.error==='ORIGIN_DENIED'?'Booking origin is not allowed':'Booking is not available');
  res.setHeader('Access-Control-Allow-Origin',context.origin);res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS')return res.status(204).end();
  const rate=await enforceBookingRateLimit(context,req,action==='create'?10:action==='status'?30:60);
  if(rate.error)return errorResponse(res,rate.status,rate.error,rate.error==='RATE_LIMITED'?'Too many booking requests':'Booking security is unavailable');
  if(action==='catalog'&&req.method==='GET'){
    const result=await callKsOs(context,`/api/v1/service/tenants/${encodeURIComponent(context.tenantId)}/catalog`);
    if(!result.ok)return errorResponse(res,result.status,result.body?.error?.code||'KS_OS_UNAVAILABLE','Booking catalog is unavailable');
    return res.status(200).json({...result.body,paymentMode:context.site.payment_mode});
  }
  if(action==='availability'&&req.method==='GET'){
    const {serviceId,date,staffId='any',bookingChannel}=req.query;
    if(!UUID_RE.test(serviceId||'')||!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||(staffId!=='any'&&!UUID_RE.test(staffId||''))||!['in_shop','mobile'].includes(bookingChannel))return errorResponse(res,400,'INVALID_REQUEST','Invalid availability request');
    const query=new URLSearchParams({serviceId,date,staffId,bookingChannel});
    const result=await callKsOs(context,`/api/v1/service/tenants/${encodeURIComponent(context.tenantId)}/availability?${query}`);
    if(!result.ok)return errorResponse(res,result.status,result.body?.error?.code||'KS_OS_UNAVAILABLE','Availability is unavailable');
    return res.status(200).json(result.body);
  }
  if(action==='create'&&req.method==='POST'){
    const allowed=['serviceId','staffId','startTime','client','payNow','idempotencyKey','bookingChannel','mobileAddress','sessionId','consentBasis'];
    if(!req.body||typeof req.body!=='object'||Object.keys(req.body).some(key=>!allowed.includes(key)))return errorResponse(res,400,'INVALID_REQUEST','Unknown booking fields');
    const client=req.body.client;
    if(!UUID_RE.test(req.body.serviceId||'')||!UUID_RE.test(req.body.staffId||'')||!UUID_RE.test(req.body.idempotencyKey||'')||!UUID_RE.test(req.body.sessionId||'')||!['in_shop','mobile'].includes(req.body.bookingChannel)||!client||typeof client!=='object'||Array.isArray(client))return errorResponse(res,400,'INVALID_REQUEST','Invalid booking details');
    const name=safeText(client.name,120),email=safeText(client.email,254),phone=safeText(client.phone,30);
    if(!name||!email||!phone||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return errorResponse(res,400,'INVALID_CUSTOMER','Valid customer details are required');
    const mobileAddress=req.body.bookingChannel==='mobile'?safeText(req.body.mobileAddress,300):null;if(req.body.bookingChannel==='mobile'&&!mobileAddress)return errorResponse(res,400,'INVALID_MOBILE_ADDRESS','A mobile service address is required');if(req.body.bookingChannel==='in_shop'&&req.body.mobileAddress!=null)return errorResponse(res,400,'INVALID_MOBILE_ADDRESS','A shop booking must not include a mobile address');
    const consentBasis=['analytics','marketing'].includes(req.body.consentBasis)?req.body.consentBasis:null;
    const result=await callKsOs(context,`/api/v1/service/tenants/${encodeURIComponent(context.tenantId)}/bookings`,{method:'POST',body:JSON.stringify({serviceId:req.body.serviceId,staffId:req.body.staffId,startTime:req.body.startTime,client:{name,email:email.toLowerCase(),phone},paymentMode:context.site.payment_mode,payNow:req.body.payNow===true,idempotencyKey:req.body.idempotencyKey,bookingChannel:req.body.bookingChannel,mobileAddress})});
    if(!result.ok)return errorResponse(res,result.status,result.body?.error?.code||'BOOKING_FAILED',result.body?.error?.message||'Booking could not be completed');
    try{const identity=consentBasis?identityHmac(context.site.workspace_id,email):null;const {error:linkError}=await context.db.rpc('link_booking_attribution',{p_workspace_id:context.site.workspace_id,p_website_id:context.site.id,p_session_id:req.body.sessionId,p_booking_reference:result.body?.booking?.reference,p_identity_hmac:identity,p_consent_basis:consentBasis});if(linkError)throw new Error('LINK_FAILED');}catch{logEvent('warn','booking.attribution_link_failed',cid,{workspaceId:context.site.workspace_id,websiteId:context.site.id});}
    return res.status(201).json(result.body);
  }
  if(action==='status'&&req.method==='GET'){
    const reference=req.query.reference;if(!UUID_RE.test(reference||''))return errorResponse(res,400,'INVALID_REQUEST','Invalid booking reference');
    const result=await callKsOs(context,`/api/v1/service/tenants/${encodeURIComponent(context.tenantId)}/bookings/${encodeURIComponent(reference)}`);
    if(!result.ok)return errorResponse(res,result.status,result.body?.error?.code||'BOOKING_NOT_FOUND','Booking status is unavailable');
    return res.status(200).json(result.body);
  }
  return errorResponse(res,405,'METHOD_NOT_ALLOWED','Method is not allowed for this booking action');
};
