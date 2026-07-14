const fs=require('fs');const path=require('path');const {PGlite}=require('@electric-sql/pglite');
const {summarizeEvents}=require('../api/_analytics');
const OWNER='00000000-0000-0000-0000-000000000021',EDITOR='00000000-0000-0000-0000-000000000022',VIEWER='00000000-0000-0000-0000-000000000023',WS='20000000-0000-0000-0000-000000000001';

describe('booking-first website database foundation',()=>{
  let db;const as=async(role,uid,sql)=>{await db.exec("RESET ROLE; SET request.jwt.claim.sub = '';");if(role)await db.exec(`SET ROLE ${role}`);if(uid)await db.exec(`SET request.jwt.claim.sub='${uid}'`);return db.exec(sql);};
  beforeAll(async()=>{
    db=new PGlite();await db.waitReady;await db.exec(`CREATE SCHEMA auth;CREATE TABLE auth.users(id UUID PRIMARY KEY,email TEXT,raw_user_meta_data JSONB DEFAULT '{}');CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::UUID';CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;`);
    const files=['20260713000000_initial_foundation.sql','20260713010000_security_fixes.sql','20260713020000_final_security_corrections.sql','20260714000000_platform_control_plane.sql','20260714010000_platform_control_security_fixes.sql','20260714020000_customer_invitations.sql','20260714030000_integration_job_foundation.sql','20260714040000_website_booking_analytics.sql'];
    const dir=path.join(__dirname,'../supabase/migrations');for(const file of files){let sql=fs.readFileSync(path.join(dir,file),'utf8');if(file.includes('000000_initial_foundation'))sql=sql.replace(/CREATE TRIGGER on_auth_user_created[\s\S]*?EXECUTE FUNCTION handle_new_user\(\);/i,'');if(file.includes('customer_invitations'))sql=sql.replace(/CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;/i,'').replace(/\bCITEXT\b/g,'TEXT');await db.exec(sql);}
    await db.exec(`GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated,service_role;INSERT INTO auth.users(id,email)VALUES('${OWNER}','owner@test.dev'),('${EDITOR}','editor@test.dev'),('${VIEWER}','viewer@test.dev');INSERT INTO workspaces(id,name,slug,owner_id,status)VALUES('${WS}','Web Test','web-test','${OWNER}','active');INSERT INTO workspace_members(workspace_id,user_id,role)VALUES('${WS}','${OWNER}','owner'),('${WS}','${EDITOR}','editor'),('${WS}','${VIEWER}','viewer');INSERT INTO workspace_modules(workspace_id,module,enabled)VALUES('${WS}','website',true),('${WS}','booking',true),('${WS}','analytics',true);`);
  });
  afterAll(async()=>db.close());

  test('viewer cannot create a site and editor creates a required /book site atomically',async()=>{
    const call=user=>as('authenticated',user,`SELECT create_booking_first_website('${WS}'::uuid,'Client Site','editorial-luxe','client.example.com','deposit'::website_payment_mode)`);
    await expect(call(VIEWER)).rejects.toThrow(/Insufficient/);await call(EDITOR);await db.exec('RESET ROLE');
    const site=await db.query('SELECT booking_path,booking_provider,payment_mode,status FROM website_sites');
    expect(site.rows[0]).toEqual(expect.objectContaining({booking_path:'/book',booking_provider:'ks_os',payment_mode:'deposit',status:'draft'}));
    expect((await db.query('SELECT * FROM projects')).rows).toHaveLength(1);
  });

  test('browser roles cannot insert conversion events directly',async()=>{
    const site=(await db.query('SELECT id FROM website_sites')).rows[0].id;
    await expect(as('authenticated',EDITOR,`INSERT INTO website_conversion_events(id,website_id,workspace_id,session_id,event_name,occurred_at,path)VALUES(gen_random_uuid(),'${site}','${WS}',gen_random_uuid(),'page_view',now(),'/')`)).rejects.toThrow();
  });

  test('compile result moves the site to ready but does not publish it',async()=>{
    await db.exec('RESET ROLE');const site=(await db.query('SELECT id FROM website_sites')).rows[0].id;
    await as('service_role',EDITOR,`SELECT record_website_compile_result('${EDITOR}'::uuid,'${site}'::uuid,'correlation-1',true,'engine-site','https://client.example.com',NULL)`);
    await db.exec('RESET ROLE');const state=(await db.query(`SELECT status,published_at FROM website_sites WHERE id='${site}'`)).rows[0];
    expect(state.status).toBe('ready');expect(state.published_at).toBeNull();
  });

  test('database RPCs reject suspended workspace mutations',async()=>{
    await db.exec(`RESET ROLE;UPDATE workspaces SET status='suspended' WHERE id='${WS}'`);
    await expect(as('authenticated',EDITOR,`SELECT create_booking_first_website('${WS}'::uuid,'Blocked Site','editorial-luxe','blocked.example.com','pay_later'::website_payment_mode)`)).rejects.toThrow(/not active/);
    await db.exec('RESET ROLE');const site=(await db.query('SELECT id FROM website_sites LIMIT 1')).rows[0].id;
    await expect(as('service_role',EDITOR,`SELECT record_website_compile_result('${EDITOR}'::uuid,'${site}'::uuid,'correlation-blocked',true,'engine-site','https://client.example.com',NULL)`)).rejects.toThrow(/not active/);
    await db.exec(`RESET ROLE;UPDATE workspaces SET status='active' WHERE id='${WS}'`);
  });

  test('browser users cannot forge a successful compile result',async()=>{
    await db.exec('RESET ROLE');const site=(await db.query('SELECT id FROM website_sites LIMIT 1')).rows[0].id;
    await expect(as('authenticated',EDITOR,`SELECT record_website_compile_result('${EDITOR}'::uuid,'${site}'::uuid,'forged-correlation',true,'forged','https://attacker.example',NULL)`)).rejects.toThrow();
  });
});

test('analytics summary measures confirmed bookings with and without payment',()=>{
  const events=[{session_id:'s1',event_name:'page_view'},{session_id:'s1',event_name:'booking_cta_clicked'},{session_id:'s1',event_name:'booking_confirmed_no_payment'},{session_id:'s2',event_name:'page_view'},{session_id:'s2',event_name:'payment_completed',value_minor:2500,currency:'GBP'},{session_id:'s2',event_name:'booking_confirmed'}];
  expect(summarizeEvents(events,30)).toEqual(expect.objectContaining({sessions:2,confirmedBookings:2,bookingConversionRate:100,revenueMinor:2500,currency:'GBP'}));
});
