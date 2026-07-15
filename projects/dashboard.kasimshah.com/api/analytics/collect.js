const {createSupabaseServiceClient,rejectUnknownFields,errorResponse}=require('../_utils');
const {CHANNELS}=require('../_unified-analytics');

const EVENTS=new Set(['page_view','booking_cta_clicked','booking_page_viewed','booking_type_selected','service_selected','slot_selected','booking_started']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const META=new Set(['serviceId','bookingType','paymentMode']);
const clean=(value,max)=>typeof value==='string'&&value.trim()?value.trim().slice(0,max):null;
function channelFor(utm,referrerHost,siteHost){
  const medium=(utm.medium||'').toLowerCase(),source=(utm.source||'').toLowerCase();
  if(medium.includes('cpc')||medium.includes('paid')||medium.includes('ppc'))return'paid';
  if(medium==='email')return'email';if(medium==='social')return'social';if(source==='agency'||medium==='manual')return'agency';
  if(source||medium)return'unknown';if(!referrerHost||referrerHost===siteHost||referrerHost===`www.${siteHost}`)return'direct';
  if(/google\.|bing\.|duckduckgo\.|yahoo\./i.test(referrerHost))return'organic';return'referral';
}
function reducedUserAgent(value){const ua=String(value||'');if(/bot|crawler|spider/i.test(ua))return'bot';if(/mobile|android|iphone/i.test(ua))return'mobile';if(ua)return'desktop';return null;}

module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method==='OPTIONS'){
    let origin;try{origin=new URL(req.headers.origin||'');if(origin.protocol!=='https:'&&origin.hostname!=='localhost')throw new Error();}catch{return errorResponse(res,403,'ORIGIN_DENIED','A valid site origin is required');}
    res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');return res.status(204).end();
  }
  if(req.method!=='POST')return errorResponse(res,405,'METHOD_NOT_ALLOWED','Only POST is allowed');
  const allowed=['siteKey','eventId','sessionId','eventName','occurredAt','path','utm','consent','metadata'];if(!rejectUnknownFields(req.body,allowed).valid)return errorResponse(res,400,'INVALID_EVENT','Unknown event fields');
  const b=req.body||{},occurred=new Date(b.occurredAt);if(!UUID.test(b.siteKey||'')||!UUID.test(b.eventId||'')||!UUID.test(b.sessionId||'')||!EVENTS.has(b.eventName)||!Number.isFinite(occurred.getTime())||occurred.getTime()>Date.now()+300000||occurred.getTime()<Date.now()-86400000)return errorResponse(res,400,'INVALID_EVENT','Browser event is invalid');
  const path=clean(b.path,500);if(!path||!path.startsWith('/')||path.includes('?'))return errorResponse(res,400,'INVALID_PATH','Path must be a query-free site path');
  const db=createSupabaseServiceClient();const {data:site,error:siteError}=await db.from('website_sites').select('id,workspace_id,primary_domain').eq('analytics_key',b.siteKey).single();if(siteError||!site)return errorResponse(res,404,'SITE_NOT_FOUND','Site not found');
  let originHost;try{const origin=new URL(req.headers.origin||''),siteHost=String(site.primary_domain||'').toLowerCase(),allowed=new Set([`https://${siteHost}`,`https://www.${siteHost}`]);if(!allowed.has(origin.origin.toLowerCase()))throw new Error();originHost=origin.hostname.toLowerCase();}catch{return errorResponse(res,403,'ORIGIN_DENIED','Origin must exactly match the configured HTTPS site origin');}
  res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');
  let referrerHost=null;try{const ref=new URL(req.headers.referer||'');referrerHost=ref.hostname.toLowerCase().slice(0,253);}catch{}
  const utm=b.utm&&typeof b.utm==='object'&&!Array.isArray(b.utm)?b.utm:{};const channel=channelFor(utm,referrerHost,site.primary_domain);if(!CHANNELS.has(channel))return errorResponse(res,400,'INVALID_CHANNEL','Channel is invalid');
  const metadata={};if(b.metadata&&typeof b.metadata==='object'&&!Array.isArray(b.metadata))Object.entries(b.metadata).forEach(([k,v])=>{if(META.has(k)&&['string','number','boolean'].includes(typeof v))metadata[k]=typeof v==='string'?v.slice(0,100):v;});
  const consent=['analytics','marketing','withdrawn'].includes(b.consent)?b.consent:'unknown';const {error}=await db.rpc('record_browser_attribution_event',{p_workspace_id:site.workspace_id,p_website_id:site.id,p_session_id:b.sessionId,p_source_event_id:b.eventId,p_event_name:b.eventName,p_occurred_at:occurred.toISOString(),p_path:path,p_referrer_host:referrerHost,p_channel:channel,p_source:clean(utm.source,100),p_medium:clean(utm.medium,100),p_campaign:clean(utm.campaign,150),p_content:clean(utm.content,150),p_term:clean(utm.term,150),p_consent:consent,p_user_agent_family:reducedUserAgent(req.headers['user-agent']),p_safe_metadata:metadata});
  if(error)return errorResponse(res,409,'EVENT_REJECTED','Browser event was not accepted');return res.status(202).json({accepted:true});
};

module.exports.channelFor=channelFor;module.exports.reducedUserAgent=reducedUserAgent;
