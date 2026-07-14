const { createSupabaseServiceClient, rejectUnknownFields, errorResponse } = require('../_utils');

const EVENTS=new Set(['page_view','booking_cta_clicked','booking_page_viewed','booking_started','service_selected','slot_selected','customer_details_submitted','payment_started','payment_completed','booking_confirmed','booking_confirmed_no_payment','booking_abandoned']);
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const META_KEYS=new Set(['serviceId','paymentMode','abandonmentStage']);
const cleanText=(value,max=100)=>typeof value==='string'?value.trim().slice(0,max)||null:null;

module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method==='OPTIONS'){
    try{const origin=new URL(req.headers.origin||'');if(origin.protocol==='https:'||origin.hostname==='localhost'){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');}}catch{}
    res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type');
    return res.status(204).end();
  }
  if(req.method!=='POST') return errorResponse(res,405,'METHOD_NOT_ALLOWED','Only POST is allowed');
  const allowed=['siteKey','eventId','sessionId','eventName','occurredAt','path','utm','bookingReference','valueMinor','currency','metadata'];
  if(!rejectUnknownFields(req.body,allowed).valid) return errorResponse(res,400,'INVALID_EVENT','Unknown event fields');
  const {siteKey,eventId,sessionId,eventName}=req.body||{};
  if(!UUID_RE.test(siteKey||'')||!UUID_RE.test(eventId||'')||!UUID_RE.test(sessionId||'')||!EVENTS.has(eventName)) return errorResponse(res,400,'INVALID_EVENT','Invalid event');
  const occurredAt=new Date(req.body.occurredAt);
  const now=Date.now();
  if(!Number.isFinite(occurredAt.getTime())||occurredAt.getTime()>now+300000||occurredAt.getTime()<now-86400000) return errorResponse(res,400,'INVALID_EVENT_TIME','Event time is outside the accepted window');
  const path=cleanText(req.body.path,500);
  if(!path||!path.startsWith('/')||path.includes('?')) return errorResponse(res,400,'INVALID_PATH','Path must be a query-free site path');
  const supabase=createSupabaseServiceClient();
  const {data:site,error:siteError}=await supabase.from('website_sites').select('id,workspace_id,primary_domain').eq('analytics_key',siteKey).single();
  if(siteError||!site) return errorResponse(res,404,'SITE_NOT_FOUND','Site not found');
  let originHost;
  try{originHost=new URL(req.headers.origin||'').hostname.toLowerCase();}catch{return errorResponse(res,403,'ORIGIN_DENIED','Origin is required');}
  if(originHost!==site.primary_domain&&originHost!==`www.${site.primary_domain}`) return errorResponse(res,403,'ORIGIN_DENIED','Origin is not allowed');
  res.setHeader('Access-Control-Allow-Origin',req.headers.origin);
  res.setHeader('Vary','Origin');
  let referrerHost=null;
  try{if(req.headers.referer) referrerHost=new URL(req.headers.referer).hostname.slice(0,253);}catch{}
  const utm=req.body.utm&&typeof req.body.utm==='object'&&!Array.isArray(req.body.utm)?req.body.utm:{};
  const metadata={};
  if(req.body.metadata&&typeof req.body.metadata==='object'&&!Array.isArray(req.body.metadata)){
    Object.entries(req.body.metadata).forEach(([key,value])=>{if(META_KEYS.has(key)&&['string','number','boolean'].includes(typeof value)) metadata[key]=typeof value==='string'?value.slice(0,100):value;});
  }
  const valueMinor=Number.isInteger(req.body.valueMinor)&&req.body.valueMinor>=0&&req.body.valueMinor<=100000000?req.body.valueMinor:null;
  const currency=/^[A-Z]{3}$/.test(req.body.currency||'')?req.body.currency:null;
  const {error}=await supabase.from('website_conversion_events').insert({
    id:eventId,website_id:site.id,workspace_id:site.workspace_id,session_id:sessionId,event_name:eventName,
    occurred_at:occurredAt.toISOString(),path,referrer_host:referrerHost,utm_source:cleanText(utm.source),
    utm_medium:cleanText(utm.medium),utm_campaign:cleanText(utm.campaign),booking_reference:cleanText(req.body.bookingReference,200),
    value_minor:valueMinor,currency,metadata
  });
  if(error&&error.code!=='23505') return errorResponse(res,500,'COLLECT_FAILED','Event could not be recorded');
  return res.status(202).json({accepted:true});
};
