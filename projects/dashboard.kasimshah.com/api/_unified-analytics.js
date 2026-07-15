const {requireAuth,requireWorkspaceMembership,requireWorkspaceRole,requireActiveWorkspace,requireEnabledModule,validateUUID}=require('./_utils');

const CHANNELS=new Set(['direct','organic','referral','paid','agency','unknown','email','social']);
const BOOKING_TYPES=new Set(['shop','mobile']);
const METRICS={
  sessions:{label:'Unique sessions',definition:'Distinct first-party website sessions in the selected period.',source:'First-party website events'},
  ctaClicks:{label:'Booking CTA clicks',definition:'Booking call-to-action clicks recorded by the website.',source:'First-party website events'},
  bookingStarts:{label:'Booking starts',definition:'Sessions that began the KS OS booking flow.',source:'First-party website events'},
  confirmedBookings:{label:'Confirmed bookings',definition:'Bookings confirmed by signed KS OS server events.',source:'KS OS signed events'},
  bookingConversionRate:{label:'Booking conversion rate',definition:'Confirmed bookings divided by unique sessions.',source:'Website sessions + KS OS signed events'},
  verifiedRevenueMinor:{label:'Verified booking revenue',definition:'Successful payment value reported by signed KS OS server events.',source:'KS OS + verified Stripe webhook'}
};

function isoDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))?value:null;}
function parseFilters(query={},maxDays=366){
  const workspaceId=query.workspaceId;if(!validateUUID(workspaceId))return{error:'Valid workspaceId required'};
  const to=isoDate(query.to)||new Date().toISOString().slice(0,10);const defaultFrom=new Date(`${to}T00:00:00Z`);defaultFrom.setUTCDate(defaultFrom.getUTCDate()-29);
  const from=isoDate(query.from)||defaultFrom.toISOString().slice(0,10);const span=Math.floor((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86400000)+1;
  if(span<1||span>maxDays)return{error:`Date range must be between 1 and ${maxDays} days`};
  if(query.websiteId&&!validateUUID(query.websiteId))return{error:'Invalid websiteId'};
  if(query.channel&&!CHANNELS.has(query.channel))return{error:'Invalid channel'};
  if(query.bookingType&&!BOOKING_TYPES.has(query.bookingType))return{error:'Invalid bookingType'};
  const clean=(v,n)=>typeof v==='string'&&v.trim()?v.trim().slice(0,n):null;
  return{workspaceId,websiteId:query.websiteId||null,from,to,fromIso:`${from}T00:00:00.000Z`,toIso:`${to}T23:59:59.999Z`,days:span,channel:query.channel||null,source:clean(query.source,100),campaign:clean(query.campaign,150),bookingType:query.bookingType||null,page:Math.max(1,Math.min(Number.parseInt(query.page,10)||1,10000)),pageSize:Math.max(1,Math.min(Number.parseInt(query.pageSize,10)||50,100))};
}

async function authorize(req,allowedRoles){
  const auth=await requireAuth(req);if(auth.error)return auth;
  const filters=parseFilters(req.query||{});if(filters.error)return{error:'VALIDATION_ERROR',message:filters.error,status:400};
  const member=allowedRoles?await requireWorkspaceRole(auth.supabase,auth.user.id,filters.workspaceId,allowedRoles):await requireWorkspaceMembership(auth.supabase,auth.user.id,filters.workspaceId);
  if(member.error)return{error:'FORBIDDEN',message:'Analytics access denied',status:403};
  const active=await requireActiveWorkspace(auth.supabase,filters.workspaceId);if(active.error)return{error:active.error.code,message:active.error.message,status:active.status};
  const module=await requireEnabledModule(auth.supabase,filters.workspaceId,'analytics');if(module.error)return{error:'MODULE_DISABLED',message:'Analytics module is disabled',status:403};
  return{...auth,filters,workspaceRole:member.role};
}

function applyRange(query,filters,column='occurred_at'){let q=query.gte(column,filters.fromIso).lte(column,filters.toIso);if(filters.websiteId)q=q.eq('website_id',filters.websiteId);return q;}
async function loadCanonical(db,filters,limit=50000){
  let sessions=db.from('attribution_sessions').select('id,website_id,first_channel,first_source,last_channel,last_source,utm_campaign,first_seen_at,last_seen_at').eq('workspace_id',filters.workspaceId).lte('first_seen_at',filters.toIso).gte('last_seen_at',filters.fromIso);
  if(filters.websiteId)sessions=sessions.eq('website_id',filters.websiteId);sessions=sessions.limit(limit);
  let touches=db.from('attribution_touchpoints').select('id,website_id,session_id,event_name,channel,source,medium,campaign,occurred_at').eq('workspace_id',filters.workspaceId);
  touches=applyRange(touches,filters).limit(limit);
  let conversions=db.from('attribution_conversions').select('id,website_id,session_id,conversion_type,booking_reference,booking_type,occurred_at,revenue_minor,currency,source,source_event_id,received_at').eq('workspace_id',filters.workspaceId);
  conversions=applyRange(conversions,filters);if(filters.bookingType)conversions=conversions.eq('booking_type',filters.bookingType);conversions=conversions.limit(limit);
  let models=db.from('attribution_models').select('conversion_id,model_type,channel,source,medium,campaign,model_version,calculated_at').eq('workspace_id',filters.workspaceId).limit(limit);
  let health=db.from('analytics_runtime_health').select('component,status,last_success_at,last_failure_at,last_error_code,checked_at').eq('workspace_id',filters.workspaceId);
  const results=await Promise.all([sessions,touches,conversions,models,health]);const failed=results.find(x=>x.error);if(failed)throw new Error('ANALYTICS_QUERY_FAILED');
  let [s,t,c,m,h]=results.map(x=>x.data||[]);
  if(filters.channel){s=s.filter(x=>x.first_channel===filters.channel||x.last_channel===filters.channel);t=t.filter(x=>x.channel===filters.channel);m=m.filter(x=>x.channel===filters.channel);}
  if(filters.source){s=s.filter(x=>x.first_source===filters.source||x.last_source===filters.source);t=t.filter(x=>x.source===filters.source);m=m.filter(x=>x.source===filters.source);}
  if(filters.campaign){s=s.filter(x=>x.utm_campaign===filters.campaign);t=t.filter(x=>x.campaign===filters.campaign);m=m.filter(x=>x.campaign===filters.campaign);}
  if(filters.channel||filters.source||filters.campaign){const conversionIds=new Set(m.map(x=>x.conversion_id));c=c.filter(x=>conversionIds.has(x.id));}
  return{sessions:s,touchpoints:t,conversions:c,models:m,health:h,limited:[s,t,c,m].some(x=>x.length>=limit)};
}

function countBy(rows,key){return rows.reduce((out,row)=>{const value=row[key]||'unknown';out[value]=(out[value]||0)+1;return out;},{});}
function latestModels(models){const map=new Map();models.forEach(row=>{const key=`${row.conversion_id}:${row.model_type}`,old=map.get(key);if(!old||row.model_version>old.model_version)map.set(key,row);});return[...map.values()];}
function summarizeCanonical(data,filters){
  const sessions=new Set(data.sessions.map(x=>x.id));const touches=data.touchpoints;const conversions=data.conversions;const latest=latestModels(data.models);
  const confirmed=conversions.filter(x=>x.conversion_type==='booking_confirmed');const revenue=conversions.filter(x=>x.conversion_type==='payment_succeeded');
  const currencySet=new Set(revenue.map(x=>x.currency).filter(Boolean));const latestTimes=[...data.sessions.map(x=>x.last_seen_at),...touches.map(x=>x.occurred_at),...conversions.map(x=>x.received_at)].filter(Boolean).sort();
  const confirmedIds=new Set(confirmed.map(x=>x.id));const channelRows=type=>latest.filter(x=>x.model_type===type&&confirmedIds.has(x.conversion_id));
  const campaignMap=new Map();latest.filter(x=>x.model_type==='last_touch'&&confirmedIds.has(x.conversion_id)).forEach(row=>{const key=`${row.channel}|${row.source||''}|${row.campaign||''}`;if(!campaignMap.has(key))campaignMap.set(key,{channel:row.channel,source:row.source||null,campaign:row.campaign||null,conversions:0,verifiedRevenueMinor:0,spendMinor:null,roas:null});campaignMap.get(key).conversions++;});
  revenue.forEach(payment=>{const model=latest.find(x=>x.conversion_id===payment.id&&x.model_type==='last_touch');if(model){const key=`${model.channel}|${model.source||''}|${model.campaign||''}`;if(campaignMap.has(key))campaignMap.get(key).verifiedRevenueMinor+=Number(payment.revenue_minor||0);}});
  const metrics={sessions:sessions.size,ctaClicks:touches.filter(x=>x.event_name==='booking_cta_clicked').length,bookingStarts:touches.filter(x=>x.event_name==='booking_started').length,confirmedBookings:confirmed.length,bookingConversionRate:sessions.size?Number((confirmed.length/sessions.size*100).toFixed(2)):0,verifiedRevenueMinor:revenue.reduce((n,x)=>n+Number(x.revenue_minor||0),0),currency:currencySet.size===1?[...currencySet][0]:null,shopBookings:confirmed.filter(x=>x.booking_type==='shop').length,mobileBookings:confirmed.filter(x=>x.booking_type==='mobile').length};
  const warnings=[];if(!sessions.size)warnings.push('LIMITED_DATA');if(data.limited)warnings.push('QUERY_LIMIT_REACHED');if(currencySet.size>1)warnings.push('MULTIPLE_CURRENCIES');
  const pageViews=touches.filter(x=>x.event_name==='page_view').length,drop=(from,to)=>from?Number(((from-to)/from*100).toFixed(2)):null;
  return{range:{from:filters.from,to:filters.to,days:filters.days},metrics,definitions:METRICS,funnel:{pageViews,ctaClicks:metrics.ctaClicks,bookingPageViews:touches.filter(x=>x.event_name==='booking_page_viewed').length,bookingStarts:metrics.bookingStarts,confirmedBookings:metrics.confirmedBookings,pageToCtaDropOffPercent:drop(pageViews,metrics.ctaClicks),ctaToStartDropOffPercent:drop(metrics.ctaClicks,metrics.bookingStarts),startToConfirmedDropOffPercent:drop(metrics.bookingStarts,metrics.confirmedBookings)},firstTouch:countBy(channelRows('first_touch'),'channel'),lastTouch:countBy(channelRows('last_touch'),'channel'),campaigns:[...campaignMap.values()],futureChannels:{email:'NOT_CONNECTED',social:'NOT_CONNECTED'},spendDataAvailable:false,roas:null,freshness:{asOf:latestTimes.at(-1)||null,health:data.health},warnings};
}

function safeCsvCell(value){const text=value==null?'':String(value).replace(/[\r\n]+/g,' ');return /^[=+\-@]/.test(text)?`'${text}`:text;}
function toCsv(rows,columns){const escape=value=>`"${safeCsvCell(value).replace(/"/g,'""')}"`;return[columns.join(','),...rows.map(row=>columns.map(key=>escape(row[key])).join(','))].join('\r\n');}

module.exports={CHANNELS,BOOKING_TYPES,METRICS,parseFilters,authorize,loadCanonical,summarizeCanonical,latestModels,safeCsvCell,toCsv};
