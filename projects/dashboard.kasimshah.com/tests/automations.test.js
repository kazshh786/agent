const fs=require('fs');const path=require('path');const crypto=require('crypto');const {PGlite}=require('@electric-sql/pglite');
const {validateDefinition,verifyEventSignature,sanitizeEvent}=require('../api/_automations');
const OWNER='00000000-0000-0000-0000-000000000031',EDITOR='00000000-0000-0000-0000-000000000032',VIEWER='00000000-0000-0000-0000-000000000033',WS='30000000-0000-0000-0000-000000000001';

describe('launch automation contract',()=>{
  test('allows bounded launch actions and rejects deferred or unsafe actions',()=>{
    expect(validateDefinition('booking.created',{steps:[{type:'contact.add_tag',config:{tag:'booked'}}]}).valid).toBe(true);
    expect(validateDefinition('booking.created',{steps:[{type:'marketing_email.send',config:{template:'x'}}]}).code).toBe('MODULE_NOT_INSTALLED');
    expect(validateDefinition('booking.created',{steps:[{type:'internal_notification.create',config:{title:'x',message:'https://attacker.test',severity:'info'}}]}).code).toBe('UNSAFE_ACTION');
    expect(validateDefinition('booking.created',{steps:Array.from({length:26},()=>({type:'contact.add_tag',config:{tag:'x'}}))}).valid).toBe(false);
    expect(validateDefinition('booking.created',{steps:[{type:'delay.until',config:{seconds:7776001}}]}).code).toBe('INVALID_DELAY');
  });

  test('verifies exact signed bodies and rejects PII or stale events',()=>{
    process.env.AUTOMATION_EVENT_SECRET='a'.repeat(32);const timestamp=Math.floor(Date.now()/1000);
    const body={workspaceId:WS,eventType:'booking.created',source:'ks_os',sourceEventId:'event-12345678',subjectType:'booking',subjectId:'reference',occurredAt:new Date().toISOString(),payload:{bookingReference:'reference'},causationId:null,depth:0};
    const signature=crypto.createHmac('sha256',process.env.AUTOMATION_EVENT_SECRET).update(`${timestamp}.${JSON.stringify(body)}`).digest('hex');
    expect(verifyEventSignature(body,{'x-ks-timestamp':String(timestamp),'x-ks-signature':signature}).valid).toBe(true);
    expect(verifyEventSignature({...body,subjectId:'changed'},{'x-ks-timestamp':String(timestamp),'x-ks-signature':signature}).valid).toBe(false);
    expect(sanitizeEvent({...body,payload:{email:'private@example.com'}}).error).toBe('INVALID_EVENT_PAYLOAD');delete process.env.AUTOMATION_EVENT_SECRET;
  });
});

describe('automation database isolation and idempotency',()=>{
  let db;const as=async(role,uid,sql)=>{await db.exec("RESET ROLE;SET request.jwt.claim.sub='';");if(role)await db.exec(`SET ROLE ${role}`);if(uid)await db.exec(`SET request.jwt.claim.sub='${uid}'`);return db.exec(sql);};
  beforeAll(async()=>{
    db=new PGlite();await db.waitReady;await db.exec(`CREATE SCHEMA auth;CREATE TABLE auth.users(id UUID PRIMARY KEY,email TEXT,raw_user_meta_data JSONB DEFAULT '{}');CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::UUID';CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;`);
    const files=['20260713000000_initial_foundation.sql','20260713010000_security_fixes.sql','20260713020000_final_security_corrections.sql','20260714000000_platform_control_plane.sql','20260714010000_platform_control_security_fixes.sql','20260714020000_customer_invitations.sql','20260714030000_integration_job_foundation.sql','20260714040000_website_booking_analytics.sql','20260714050000_booking_rate_limits.sql','20260714070000_automation_engine.sql','20260714080000_unified_attribution.sql'];
    const dir=path.join(__dirname,'../supabase/migrations');for(const file of files){let sql=fs.readFileSync(path.join(dir,file),'utf8');if(file.includes('000000_initial_foundation'))sql=sql.replace(/CREATE TRIGGER on_auth_user_created[\s\S]*?EXECUTE FUNCTION handle_new_user\(\);/i,'');if(file.includes('customer_invitations'))sql=sql.replace(/CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;/i,'').replace(/\bCITEXT\b/g,'TEXT');await db.exec(sql);}
    await db.exec(`GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;INSERT INTO auth.users(id,email)VALUES('${OWNER}','owner@test.dev'),('${EDITOR}','editor@test.dev'),('${VIEWER}','viewer@test.dev');INSERT INTO workspaces(id,name,slug,owner_id,status)VALUES('${WS}','Automation Test','automation-test','${OWNER}','active');INSERT INTO workspace_members(workspace_id,user_id,role)VALUES('${WS}','${OWNER}','owner'),('${WS}','${EDITOR}','editor'),('${WS}','${VIEWER}','viewer');INSERT INTO workspace_modules(workspace_id,module,enabled)VALUES('${WS}','automations',true);`);
  },30000);
  afterAll(async()=>db.close());

  test('viewer cannot draft; editor drafts and owner activates an immutable version',async()=>{
    const definition=`'{"steps":[{"type":"contact.add_tag","config":{"tag":"booked"}}]}'::jsonb`;
    await expect(as('authenticated',VIEWER,`SELECT create_automation_draft('${WS}','Blocked','', 'booking.created',${definition})`)).rejects.toThrow(/Insufficient/);
    await as('authenticated',EDITOR,`SELECT create_automation_draft('${WS}','Booking follow-up','', 'booking.created',${definition})`);await db.exec('RESET ROLE');
    const row=(await db.query('SELECT id,latest_version_id FROM automation_definitions')).rows[0];
    await as('authenticated',OWNER,`SELECT set_automation_state('${row.id}','${row.latest_version_id}','active')`);await db.exec('RESET ROLE');
    expect((await db.query('SELECT status FROM automation_definitions')).rows[0].status).toBe('active');
    expect((await db.query(`SELECT action FROM audit_logs WHERE entity_id='${row.id}' ORDER BY created_at`)).rows.map(item=>item.action)).toEqual(expect.arrayContaining(['automation.created','automation.active']));
    await as('authenticated',EDITOR,`SELECT create_automation_version('${row.id}','booking.created','{"steps":[{"type":"internal_notification.create","config":{"title":"Unsafe","message":"https://attacker.test","severity":"info"}}]}'::jsonb)`);await db.exec('RESET ROLE');
    const unsafe=(await db.query('SELECT latest_version_id FROM automation_definitions')).rows[0].latest_version_id;
    await expect(as('authenticated',OWNER,`SELECT set_automation_state('${row.id}','${unsafe}','active')`)).rejects.toThrow(/Unsafe/);await db.exec('RESET ROLE');
  });

  test('duplicate source event creates one event and one run, and leasing is exclusive',async()=>{
    const call=`SELECT ingest_automation_event('${WS}','booking.created','ks_os','source-event-0001','booking','booking-1',now(),'{"bookingReference":"booking-1"}'::jsonb,NULL,0)`;
    await as('service_role',null,call);await as('service_role',null,call);await db.exec('RESET ROLE');
    expect((await db.query('SELECT id FROM automation_events')).rows).toHaveLength(1);expect((await db.query('SELECT id FROM automation_runs')).rows).toHaveLength(1);
    await as('service_role',null,'SELECT 1');const first=await db.query('SELECT * FROM claim_automation_run(60)');const second=await db.query('SELECT * FROM claim_automation_run(60)');
    expect(first.rows).toHaveLength(1);expect(second.rows).toHaveLength(0);await db.exec('RESET ROLE');expect((await db.query("SELECT status FROM automation_runs")).rows[0].status).toBe('running');
  });

  test('RLS prevents a non-member from reading automation definitions',async()=>{
    const stranger='00000000-0000-0000-0000-000000000039';await db.exec(`RESET ROLE;INSERT INTO auth.users(id,email)VALUES('${stranger}','stranger@test.dev')`);
    await as('authenticated',stranger,'SELECT 1');const visible=await db.query('SELECT count(*)::int AS count FROM automation_definitions');
    expect(visible.rows[0].count).toBe(0);await db.exec('RESET ROLE');
  });
});
