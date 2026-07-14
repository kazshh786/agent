const crypto=require('crypto');
const {requireActiveWorkspace,requireEnabledModule,requireWorkspaceRole}=require('./_utils');

const TRIGGERS=new Set(['contact.created','website.form_submitted','booking.created','booking.cancelled','appointment.completed','contact.added_to_list']);
const ACTIONS=new Set(['contact.add_tag','contact.remove_tag','contact.add_to_list','internal_notification.create','booking_link.create','delay.until']);
const DEFERRED_ACTIONS=new Set(['transactional_email.send','marketing_email.send','social.publish']);
const VARIABLES=new Set(['contact.id','booking.reference','booking.start_time','booking.end_time','booking.channel','workspace.name','website.booking_url']);
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function plain(value){return value&&typeof value==='object'&&!Array.isArray(value);}
function exactKeys(value,allowed){return plain(value)&&Object.keys(value).every(key=>allowed.includes(key));}
function text(value,max){return typeof value==='string'&&value.trim().length>0&&value.trim().length<=max?value.trim():null;}
function variablesIn(value){const found=[];const visit=item=>{if(typeof item==='string'){for(const match of item.matchAll(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi))found.push(match[1]);}else if(Array.isArray(item))item.forEach(visit);else if(plain(item))Object.values(item).forEach(visit);};visit(value);return found;}

function validateDefinition(triggerType,definition,{activation=false}={}){
  if(!TRIGGERS.has(triggerType)||!exactKeys(definition,['steps'])||!Array.isArray(definition.steps)||definition.steps.length<1||definition.steps.length>25)return{valid:false,code:'INVALID_DEFINITION',message:'Automation requires one to 25 valid steps'};
  for(let index=0;index<definition.steps.length;index++){
    const step=definition.steps[index];if(!exactKeys(step,['type','config'])||typeof step.type!=='string'||!plain(step.config))return{valid:false,code:'INVALID_STEP',message:`Step ${index+1} is invalid`};
    if(DEFERRED_ACTIONS.has(step.type))return{valid:false,code:'MODULE_NOT_INSTALLED',message:'Email marketing and social publishing actions are upcoming features'};
    if(!ACTIONS.has(step.type))return{valid:false,code:'ACTION_NOT_ALLOWED',message:`Step ${index+1} uses an unsupported action`};
    if(JSON.stringify(step.config).length>4096||/(javascript:|data:|<script|\bselect\b.+\bfrom\b|\b(drop|alter|insert|update)\s+table\b|https?:\/\/|\$\(|`)/i.test(JSON.stringify(step.config)))return{valid:false,code:'UNSAFE_ACTION',message:`Step ${index+1} contains unsafe configuration`};
    const allowed=step.type==='internal_notification.create'?['title','message','severity']:step.type==='delay.until'?['seconds','at']:step.type==='booking_link.create'?['title']:step.type==='contact.add_to_list'?['listKey']:['tag'];
    if(!exactKeys(step.config,allowed))return{valid:false,code:'INVALID_STEP_CONFIG',message:`Step ${index+1} contains unknown settings`};
    if(['contact.add_tag','contact.remove_tag'].includes(step.type)&&!text(step.config.tag,60))return{valid:false,code:'INVALID_STEP_CONFIG',message:'A valid tag is required'};
    if(step.type==='contact.add_to_list'&&!text(step.config.listKey,80))return{valid:false,code:'INVALID_STEP_CONFIG',message:'A valid list key is required'};
    if(step.type==='internal_notification.create'&&(!text(step.config.title,120)||!text(step.config.message,1000)||!['info','success','warning','error'].includes(step.config.severity||'info')))return{valid:false,code:'INVALID_STEP_CONFIG',message:'Notification settings are invalid'};
    if(step.type==='delay.until'){
      const seconds=step.config.seconds,at=step.config.at;const validSeconds=Number.isInteger(seconds)&&seconds>=60&&seconds<=7776000;const date=typeof at==='string'?new Date(at):null;
      if(!validSeconds&&(!date||!Number.isFinite(date.getTime())||date.getTime()<=Date.now()||date.getTime()>Date.now()+7776000000))return{valid:false,code:'INVALID_DELAY',message:'Delay must be between one minute and 90 days'};
    }
    const unknown=variablesIn(step.config).find(variable=>!VARIABLES.has(variable));if(unknown)return{valid:false,code:'UNKNOWN_VARIABLE',message:`Unknown variable: ${unknown}`};
  }
  return{valid:true,activation};
}

function substitute(value,variables){
  if(typeof value==='string')return value.replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi,(_,key)=>variables[key]??'');
  if(Array.isArray(value))return value.map(item=>substitute(item,variables));
  if(plain(value))return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,substitute(item,variables)]));
  return value;
}

async function requireAutomationAccess(supabase,userId,workspaceId,roles=['owner','admin','editor']){
  if(!UUID_RE.test(workspaceId||''))return{error:{code:'VALIDATION_ERROR',message:'Valid workspaceId required'},status:400};
  const active=await requireActiveWorkspace(supabase,workspaceId);if(active.error)return active;
  const enabled=await requireEnabledModule(supabase,workspaceId,'automations');if(enabled.error)return enabled;
  return requireWorkspaceRole(supabase,userId,workspaceId,roles);
}

function verifyEventSignature(body,headers){
  const secret=process.env.AUTOMATION_EVENT_SECRET||'';if(secret.length<32)return{valid:false,status:503,code:'EVENT_SECURITY_NOT_CONFIGURED'};
  const timestamp=Number(headers['x-ks-timestamp']);const signature=String(headers['x-ks-signature']||'');
  if(!Number.isFinite(timestamp)||Math.abs(Date.now()/1000-timestamp)>300)return{valid:false,status:401,code:'INVALID_EVENT_SIGNATURE'};
  const expected=crypto.createHmac('sha256',secret).update(`${timestamp}.${JSON.stringify(body)}`).digest('hex');const a=Buffer.from(signature);const b=Buffer.from(expected);
  return a.length===b.length&&crypto.timingSafeEqual(a,b)?{valid:true}:{valid:false,status:401,code:'INVALID_EVENT_SIGNATURE'};
}

function sanitizeEvent(body){
  if(!exactKeys(body,['workspaceId','eventType','source','sourceEventId','subjectType','subjectId','occurredAt','payload','causationId','depth'])||!UUID_RE.test(body.workspaceId||'')||!TRIGGERS.has(body.eventType)||!['website','ks_os','contacts','test'].includes(body.source)||!text(body.sourceEventId,200)||!text(body.subjectType,50)||!text(body.subjectId,200)||!plain(body.payload||{}))return{error:'INVALID_EVENT'};
  const date=new Date(body.occurredAt);if(!Number.isFinite(date.getTime())||Math.abs(Date.now()-date.getTime())>86400000)return{error:'INVALID_EVENT_TIME'};
  const allowed=body.eventType.startsWith('booking.')||body.eventType==='appointment.completed'?['bookingReference','status','startTime','endTime','bookingChannel','amountMinor','currency','contactId']:body.eventType==='website.form_submitted'?['formId','siteId','contactId']:['contactId','listKey'];
  if(Object.keys(body.payload).some(key=>!allowed.includes(key))||JSON.stringify(body.payload).length>8192)return{error:'INVALID_EVENT_PAYLOAD'};
  return{value:{...body,occurredAt:date.toISOString(),payload:body.payload,causationId:UUID_RE.test(body.causationId||'')?body.causationId:null,depth:Number.isInteger(body.depth)?body.depth:0}};
}

async function executeRun(db,runId,leaseToken){
  const {data:run,error}=await db.from('automation_runs').select('id,workspace_id,automation_id,automation_version_id,event_id,current_step,status,attempt_count,lease_token').eq('id',runId).eq('lease_token',leaseToken).single();
  if(error||!run)return{ok:false,code:'RUN_NOT_FOUND'};
  const [{data:version},{data:event},{data:workspace},{data:site}]=await Promise.all([
    db.from('automation_versions').select('definition').eq('id',run.automation_version_id).single(),
    db.from('automation_events').select('safe_payload,subject_id,event_type').eq('id',run.event_id).single(),
    db.from('workspaces').select('name,status').eq('id',run.workspace_id).single(),
    db.from('website_sites').select('primary_domain,live_url').eq('workspace_id',run.workspace_id).limit(1).maybeSingle(),
  ]);
  if(!version||!event||workspace?.status!=='active'){await db.from('automation_runs').update({status:'failed',failure_code:'RUN_CONTEXT_UNAVAILABLE',completed_at:new Date().toISOString(),lease_until:null}).eq('id',run.id);return{ok:false,code:'RUN_CONTEXT_UNAVAILABLE'};}
  const steps=version.definition.steps||[];if(run.current_step>=steps.length){await db.from('automation_runs').update({status:'completed',completed_at:new Date().toISOString(),lease_until:null,lease_token:null}).eq('id',run.id);return{ok:true,completed:true};}
  await db.from('automation_scheduled_tasks').update({status:'completed'}).eq('run_id',run.id).eq('status','scheduled').lte('execute_at',new Date().toISOString());
  const step=steps[run.current_step];const bookingUrl=site?.live_url?`${String(site.live_url).replace(/\/$/,'')}/book`:site?.primary_domain?`https://${site.primary_domain}/book`:'';
  const {data:lastAttempts}=await db.from('automation_run_steps').select('attempt_count').eq('run_id',run.id).eq('step_index',run.current_step).order('attempt_count',{ascending:false}).limit(1);const stepAttempt=(lastAttempts?.[0]?.attempt_count||0)+1;
  const variables={'contact.id':event.safe_payload.contactId||event.subject_id,'booking.reference':event.safe_payload.bookingReference||event.subject_id,'booking.start_time':event.safe_payload.startTime||'','booking.end_time':event.safe_payload.endTime||'','booking.channel':event.safe_payload.bookingChannel||'','workspace.name':workspace.name||'','website.booking_url':bookingUrl};
  const config=substitute(step.config,variables);const started=new Date().toISOString();let output={};
  try{
    if(step.type==='internal_notification.create'){
      const {data,error:insertError}=await db.from('internal_notifications').upsert({workspace_id:run.workspace_id,automation_run_id:run.id,step_index:run.current_step,title:config.title,message:config.message,severity:config.severity||'info'},{onConflict:'automation_run_id,step_index'}).select('id').single();if(insertError)throw Object.assign(new Error(),{code:'NOTIFICATION_FAILED'});output={notificationId:data.id};
    }else if(step.type==='contact.add_tag'){
      const {error:tagError}=await db.from('automation_contact_tags').upsert({workspace_id:run.workspace_id,contact_id:variables['contact.id'],tag:config.tag});if(tagError)throw Object.assign(new Error(),{code:'CONTACT_ACTION_FAILED'});
    }else if(step.type==='contact.remove_tag'){
      const {error:tagError}=await db.from('automation_contact_tags').delete().eq('workspace_id',run.workspace_id).eq('contact_id',variables['contact.id']).eq('tag',config.tag);if(tagError)throw Object.assign(new Error(),{code:'CONTACT_ACTION_FAILED'});
    }else if(step.type==='contact.add_to_list'){
      const {error:listError}=await db.from('automation_contact_list_members').upsert({workspace_id:run.workspace_id,contact_id:variables['contact.id'],list_key:config.listKey});if(listError)throw Object.assign(new Error(),{code:'CONTACT_ACTION_FAILED'});
    }else if(step.type==='booking_link.create'){
      if(!bookingUrl)throw Object.assign(new Error(),{code:'BOOKING_SITE_UNAVAILABLE'});const title=config.title||'Booking link ready';const {data,error:notificationError}=await db.from('internal_notifications').upsert({workspace_id:run.workspace_id,automation_run_id:run.id,step_index:run.current_step,title,message:`${workspace.name} booking link: ${bookingUrl}`,severity:'info'},{onConflict:'automation_run_id,step_index'}).select('id').single();if(notificationError)throw Object.assign(new Error(),{code:'NOTIFICATION_FAILED'});output={notificationId:data.id,bookingPath:'/book'};
    }else if(step.type==='delay.until'){
      const executeAt=config.at?new Date(config.at):new Date(Date.now()+config.seconds*1000);await db.from('automation_run_steps').insert({run_id:run.id,workspace_id:run.workspace_id,step_index:run.current_step,action_type:step.type,status:'waiting',attempt_count:stepAttempt,started_at:started,next_retry_at:executeAt.toISOString()});await db.from('automation_scheduled_tasks').upsert({workspace_id:run.workspace_id,run_id:run.id,execute_at:executeAt.toISOString(),status:'scheduled'});await db.from('automation_runs').update({status:'waiting',current_step:run.current_step+1,next_run_at:executeAt.toISOString(),lease_token:null,lease_until:null,updated_at:new Date().toISOString()}).eq('id',run.id).eq('lease_token',leaseToken);return{ok:true,waiting:true};
    }else throw Object.assign(new Error(),{code:'ACTION_NOT_ALLOWED'});
    await db.from('automation_run_steps').insert({run_id:run.id,workspace_id:run.workspace_id,step_index:run.current_step,action_type:step.type,status:'completed',attempt_count:stepAttempt,started_at:started,completed_at:new Date().toISOString(),safe_output:output});
    const next=run.current_step+1;await db.from('automation_runs').update({status:next>=steps.length?'completed':'queued',current_step:next,next_run_at:new Date().toISOString(),completed_at:next>=steps.length?new Date().toISOString():null,lease_token:null,lease_until:null,updated_at:new Date().toISOString()}).eq('id',run.id).eq('lease_token',leaseToken);return{ok:true,completed:next>=steps.length};
  }catch(error){const code=error.code||'ACTION_FAILED';const retry=stepAttempt<3;await db.from('automation_run_steps').insert({run_id:run.id,workspace_id:run.workspace_id,step_index:run.current_step,action_type:step.type,status:'failed',attempt_count:stepAttempt,started_at:started,completed_at:new Date().toISOString(),controlled_error_code:code});await db.from('automation_runs').update({status:retry?'waiting':'failed',failure_code:code,next_run_at:retry?new Date(Date.now()+Math.pow(2,stepAttempt-1)*60000).toISOString():new Date().toISOString(),completed_at:retry?null:new Date().toISOString(),lease_token:null,lease_until:null,updated_at:new Date().toISOString()}).eq('id',run.id).eq('lease_token',leaseToken);return{ok:false,code,retry};}
}

module.exports={TRIGGERS,ACTIONS,DEFERRED_ACTIONS,UUID_RE,validateDefinition,substitute,requireAutomationAccess,verifyEventSignature,sanitizeEvent,executeRun};
