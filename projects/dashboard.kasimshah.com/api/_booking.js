const crypto=require('crypto');
const {createSupabaseServiceClient}=require('./_utils');
const {decryptCredentials}=require('./_crypto');

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeOrigin(req,domain){
  try{const url=new URL(req.headers.origin||'');return url.protocol==='https:'&&(url.hostname===domain||url.hostname===`www.${domain}`)?req.headers.origin:null;}catch{return null;}
}

function allowedApiUrl(value){
  try{const url=new URL(value);return url.protocol==='https:'||(process.env.NODE_ENV!=='production'&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname));}catch{return false;}
}

async function resolveBookingContext(req,siteKey){
  if(!UUID_RE.test(siteKey||''))return {error:'INVALID_SITE',status:400};
  const db=createSupabaseServiceClient();
  const {data:site,error:siteError}=await db.from('website_sites').select('id,workspace_id,primary_domain,payment_mode,status,booking_provider').eq('analytics_key',siteKey).single();
  if(siteError||!site||site.booking_provider!=='ks_os')return {error:'SITE_NOT_FOUND',status:404};
  const origin=safeOrigin(req,site.primary_domain);if(!origin)return {error:'ORIGIN_DENIED',status:403};
  const [{data:workspace},{data:module},{data:connection,error:connectionError}]=await Promise.all([
    db.from('workspaces').select('status').eq('id',site.workspace_id).single(),
    db.from('workspace_modules').select('enabled').eq('workspace_id',site.workspace_id).eq('module','booking').single(),
    db.from('integration_connections').select('id,external_account_id,status').eq('workspace_id',site.workspace_id).eq('provider','ks_os').eq('status','connected').single(),
  ]);
  if(workspace?.status!=='active')return {error:'WORKSPACE_INACTIVE',status:403};
  if(!module?.enabled)return {error:'MODULE_DISABLED',status:403};
  if(connectionError||!connection?.external_account_id)return {error:'BOOKING_NOT_CONFIGURED',status:503};
  const {data:credential,error:credentialError}=await db.from('integration_credentials').select('ciphertext,iv,auth_tag,key_version').eq('connection_id',connection.id).single();
  if(credentialError||!credential)return {error:'BOOKING_NOT_CONFIGURED',status:503};
  let credentials;try{credentials=decryptCredentials(credential);}catch{return {error:'BOOKING_NOT_CONFIGURED',status:503};}
  const apiUrl=process.env.KS_OS_API_URL;if(!credentials.serviceToken||!allowedApiUrl(apiUrl))return {error:'BOOKING_NOT_CONFIGURED',status:503};
  return {db,site,origin,tenantId:connection.external_account_id,serviceToken:credentials.serviceToken,apiUrl:apiUrl.replace(/\/$/,'')};
}

async function callKsOs(context,path,options={}){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(`${context.apiUrl}${path}`,{...options,headers:{Authorization:`Bearer ${context.serviceToken}`,'Content-Type':'application/json',...(options.headers||{})},signal:controller.signal});
    clearTimeout(timeout);let body={};try{body=await response.json();}catch{}
    return {ok:response.ok,status:response.status,body};
  }catch{clearTimeout(timeout);return {ok:false,status:503,body:{error:{code:'KS_OS_UNAVAILABLE'}}};}
}

async function enforceBookingRateLimit(context,req,limit){
  const salt=process.env.BOOKING_RATE_LIMIT_SALT||'';
  if(salt.length<32)return {error:'BOOKING_SECURITY_NOT_CONFIGURED',status:503};
  const forwarded=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||'').split(',')[0].trim();
  const ip=forwarded||String(req.socket?.remoteAddress||'unknown');
  const key=crypto.createHmac('sha256',salt).update(`${context.site.id}:${ip}`).digest('hex');
  const {data,error}=await context.db.rpc('consume_booking_rate_limit',{p_key_hash:key,p_limit:limit,p_window_seconds:60});
  if(error)return {error:'RATE_LIMIT_UNAVAILABLE',status:503};
  return data?{allowed:true}:{error:'RATE_LIMITED',status:429};
}

module.exports={UUID_RE,resolveBookingContext,callKsOs,enforceBookingRateLimit};
