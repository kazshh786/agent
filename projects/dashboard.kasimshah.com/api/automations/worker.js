const crypto=require('crypto');
const {createSupabaseServiceClient,errorResponse}=require('../_utils');
const {executeRun}=require('../_automations');
const {correlationId,logEvent}=require('../_observability');

function authorized(req){
  const expected=Buffer.from(process.env.AUTOMATION_WORKER_SECRET||process.env.CRON_SECRET||'');
  const supplied=Buffer.from(String(req.headers.authorization||'').replace(/^Bearer\s+/i,''));
  return expected.length>=32&&expected.length===supplied.length&&crypto.timingSafeEqual(expected,supplied);
}

module.exports=async function(req,res){
  const cid=correlationId(req);res.setHeader('X-Correlation-ID',cid);res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method))return errorResponse(res,405,'METHOD_NOT_ALLOWED','Only GET or POST is allowed');
  if(!authorized(req))return errorResponse(res,401,'UNAUTHORIZED','Worker authentication failed');
  const db=createSupabaseServiceClient(),results=[],workspaceIds=new Set();
  for(let index=0;index<10;index++){
    const {data,error}=await db.rpc('claim_automation_run',{p_lease_seconds:60});
    const claim=Array.isArray(data)?data[0]:data;
    if(error)return errorResponse(res,500,'WORKER_CLAIM_FAILED','Automation worker could not claim work');
    if(!claim?.run_id)break;
    const {data:claimedRun}=await db.from('automation_runs').select('workspace_id').eq('id',claim.run_id).single();if(claimedRun?.workspace_id)workspaceIds.add(claimedRun.workspace_id);
    results.push({runId:claim.run_id,...await executeRun(db,claim.run_id,claim.lease_token)});
  }
  if(!workspaceIds.size){const {data:active}=await db.from('automation_definitions').select('workspace_id').eq('status','active').limit(100);(active||[]).forEach(row=>workspaceIds.add(row.workspace_id));}
  if(workspaceIds.size)await db.from('analytics_runtime_health').upsert([...workspaceIds].map(workspace_id=>({workspace_id,component:'automation_worker',status:'healthy',last_success_at:new Date().toISOString(),checked_at:new Date().toISOString()})),{onConflict:'workspace_id,component'});
  logEvent('info','automation.worker_completed',cid,{processed:results.length,workspaceCount:workspaceIds.size,failed:results.filter(x=>!x.ok).length});
  return res.status(200).json({processed:results.length,results});
};
