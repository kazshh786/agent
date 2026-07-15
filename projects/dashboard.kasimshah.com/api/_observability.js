const crypto=require('crypto');

const SENSITIVE_KEY=/(authorization|cookie|secret|token|password|credential|email|phone|address|client.?secret|service.?role|api.?key)/i;
const SAFE_ID=/^[a-zA-Z0-9_-]{8,80}$/;

function correlationId(req){
  const supplied=String(req?.headers?.['x-correlation-id']||'').trim();
  return SAFE_ID.test(supplied)?supplied:crypto.randomUUID();
}

function sanitize(value,depth=0){
  if(depth>4)return'[TRUNCATED]';
  if(Array.isArray(value))return value.slice(0,25).map(item=>sanitize(item,depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,50).map(([key,item])=>[key,SENSITIVE_KEY.test(key)?'[REDACTED]':sanitize(item,depth+1)]));
  if(typeof value==='string')return value.length>500?`${value.slice(0,500)}…`:value;
  return value;
}

function logEvent(level,event,correlation,fields={}){
  const entry={timestamp:new Date().toISOString(),level,event,correlationId:correlation,...sanitize(fields)};
  const output=JSON.stringify(entry);if(level==='error')console.error(output);else if(level==='warn')console.warn(output);else console.log(output);
}

function bearerMatches(req,...names){
  const supplied=Buffer.from(String(req?.headers?.authorization||'').replace(/^Bearer\s+/i,''));
  const raw=names.map(name=>process.env[name]).find(value=>typeof value==='string'&&value.length>=32)||'';const expected=Buffer.from(raw);
  return expected.length>=32&&supplied.length===expected.length&&crypto.timingSafeEqual(supplied,expected);
}

module.exports={correlationId,sanitize,logEvent,bearerMatches};
