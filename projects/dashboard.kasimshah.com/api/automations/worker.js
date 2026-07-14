const crypto=require('crypto');
const {createSupabaseServiceClient,errorResponse}=require('../_utils');
const {executeRun}=require('../_automations');

function authorized(req){
  const expected=Buffer.from(process.env.AUTOMATION_WORKER_SECRET||process.env.CRON_SECRET||'');
  const supplied=Buffer.from(String(req.headers.authorization||'').replace(/^Bearer\s+/i,''));
  return expected.length>=32&&expected.length===supplied.length&&crypto.timingSafeEqual(expected,supplied);
}

module.exports=async function(req,res){
  if(!['GET','POST'].includes(req.method))return errorResponse(res,405,'METHOD_NOT_ALLOWED','Only GET or POST is allowed');
  if(!authorized(req))return errorResponse(res,401,'UNAUTHORIZED','Worker authentication failed');
  const db=createSupabaseServiceClient(),results=[];
  for(let index=0;index<10;index++){
    const {data,error}=await db.rpc('claim_automation_run',{p_lease_seconds:60});
    const claim=Array.isArray(data)?data[0]:data;
    if(error)return errorResponse(res,500,'WORKER_CLAIM_FAILED','Automation worker could not claim work');
    if(!claim?.run_id)break;
    results.push({runId:claim.run_id,...await executeRun(db,claim.run_id,claim.lease_token)});
  }
  return res.status(200).json({processed:results.length,results});
};
