const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
const path = require('path');

let db;
const U1='00000000-0000-0000-0000-000000000001';
const U2='00000000-0000-0000-0000-000000000002';
const U3='00000000-0000-0000-0000-000000000003';

async function asUser(id, role='authenticated') {
  await db.exec(`RESET ROLE; SET request.jwt.claim.sub = ''; SET ROLE ${role}; SET request.jwt.claim.sub = '${id}';`);
}
async function asRoot() {
  await db.exec(`RESET ROLE; SET request.jwt.claim.sub = '';`);
}
async function expectDenied(promise, pattern=/permission denied|row-level security|Insufficient permissions|cannot|Only the owner/i) {
  try { await promise; throw new Error('EXPECTED_DENIAL'); }
  catch (e) {
    if (e.message === 'EXPECTED_DENIAL') throw e;
    expect(e.message).toMatch(pattern);
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id UUID PRIMARY KEY,email TEXT,raw_user_meta_data JSONB DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS
      'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::UUID';
    CREATE ROLE anon;
    CREATE ROLE authenticated;
  `);

  for (const name of [
    '20260713000000_initial_foundation.sql',
    '20260713010000_security_fixes.sql',
    '20260713020000_final_security_corrections.sql'
  ]) {
    let sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations',name),'utf8');
    if(name.includes('000000')) {
      sql=sql.replace(/CREATE TRIGGER on_auth_user_created[\s\S]*?EXECUTE FUNCTION handle_new_user\(\);/i,'');
    }
    await db.exec(sql);
  }

  // Model Supabase table grants without overriding function grants from migrations.
  await db.exec(`
    GRANT USAGE ON SCHEMA public TO anon,authenticated;
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
    INSERT INTO auth.users(id) VALUES ('${U1}'),('${U2}'),('${U3}');
  `);
});

afterAll(async()=>db.close());
beforeEach(asRoot);

describe('database tenant and privilege boundaries',()=>{
  test('anonymous has no execute privilege on privileged RPCs',async()=>{
    const r=await db.query(`
      SELECT
        has_function_privilege('anon','public.invite_workspace_member(uuid,uuid,workspace_role)','EXECUTE') invite,
        has_function_privilege('anon','public.update_workspace_member_role(uuid,uuid,workspace_role)','EXECUTE') update_role,
        has_function_privilege('anon','public.remove_workspace_member(uuid,uuid)','EXECUTE') remove_member,
        has_function_privilege('anon','public.transfer_workspace_ownership(uuid,uuid)','EXECUTE') transfer_owner,
        has_function_privilege('anon','public.write_audit_log(uuid,text,text,uuid,jsonb)','EXECUTE') write_audit
    `);
    expect(Object.values(r.rows[0]).every(v=>v===false)).toBe(true);
  });

  test('authenticated users cannot call the generic audit writer',async()=>{
    await asUser(U1);
    await expectDenied(db.query(
      `SELECT public.write_audit_log('11111111-1111-1111-1111-111111111111','fake','workspace',NULL,'{}')`,
      []
    ),/permission denied for function/i);
  });

  test('direct workspace and membership mutations are rejected',async()=>{
    await asUser(U1);
    await expectDenied(db.exec(
      `INSERT INTO public.workspaces(name,slug,owner_id) VALUES('Bad','bad-workspace','${U1}')`
    ));
    await expectDenied(db.exec(
      `INSERT INTO public.workspace_members(workspace_id,user_id,role)
       VALUES('11111111-1111-1111-1111-111111111111','${U1}','owner')`
    ));
  });

  test('workspace RPC creates one owner and an audit event',async()=>{
    await asUser(U1);
    const made=await db.query(`SELECT id FROM public.create_workspace_with_owner('Alpha','alpha-workspace')`);
    const ws=made.rows[0].id;
    await asRoot();
    const members=await db.query(`SELECT role FROM public.workspace_members WHERE workspace_id=$1`,[ws]);
    const audit=await db.query(`SELECT action FROM public.audit_logs WHERE workspace_id=$1`,[ws]);
    expect(members.rows).toEqual([{role:'owner'}]);
    expect(audit.rows[0].action).toBe('workspace.created');
  });

  test('admin cannot promote a member to admin or owner',async()=>{
    await asUser(U1);
    const made=await db.query(`SELECT id FROM public.create_workspace_with_owner('Beta','beta-workspace')`);
    const ws=made.rows[0].id;
    await db.query(`SELECT public.invite_workspace_member($1,$2,'admin')`,[ws,U2]);
    await db.query(`SELECT public.invite_workspace_member($1,$2,'viewer')`,[ws,U3]);
    await asUser(U2);
    await expectDenied(db.query(
      `SELECT public.update_workspace_member_role($1,$2,'admin')`,[ws,U3]
    ),/Admins cannot/i);
    await expectDenied(db.query(
      `SELECT public.update_workspace_member_role($1,$2,'owner')`,[ws,U3]
    ),/Admins cannot/i);
  });

  test('cross-workspace project reads are isolated',async()=>{
    await asUser(U1);
    const a=(await db.query(`SELECT id FROM public.create_workspace_with_owner('Gamma','gamma-workspace')`)).rows[0].id;
    await db.exec(`INSERT INTO public.projects(workspace_id,name,type,created_by) VALUES('${a}','Secret','website','${U1}')`);
    await asUser(U2);
    const b=(await db.query(`SELECT id FROM public.create_workspace_with_owner('Delta','delta-workspace')`)).rows[0].id;
    const rows=await db.query(`SELECT id FROM public.projects WHERE workspace_id=$1`,[a]);
    expect(rows.rows).toHaveLength(0);
    expect(b).toBeTruthy();
  });

  test('cross-workspace brand assignment is rejected by the composite foreign key',async()=>{
    await asRoot();
    const ws1=(await db.query(`SELECT id FROM public.workspaces WHERE slug='gamma-workspace'`)).rows[0].id;
    const ws2=(await db.query(`SELECT id FROM public.workspaces WHERE slug='delta-workspace'`)).rows[0].id;
    const brand=(await db.query(
      `INSERT INTO public.brands(workspace_id,name) VALUES($1,'Other Brand') RETURNING id`,[ws2]
    )).rows[0].id;
    await expectDenied(db.query(
      `INSERT INTO public.projects(workspace_id,brand_id,name,type,created_by)
       VALUES($1,$2,'Invalid','website',$3)`,[ws1,brand,U1]
    ),/foreign key constraint/i);
  });

  test('brand deletion is restricted while referenced and does not null workspace_id',async()=>{
    await asRoot();
    const ws=(await db.query(`SELECT id FROM public.workspaces WHERE slug='gamma-workspace'`)).rows[0].id;
    const brand=(await db.query(
      `INSERT INTO public.brands(workspace_id,name) VALUES($1,'Used Brand') RETURNING id`,[ws]
    )).rows[0].id;
    await db.query(`UPDATE public.projects SET brand_id=$1 WHERE workspace_id=$2 AND name='Secret'`,[brand,ws]);
    await expectDenied(db.query(`DELETE FROM public.brands WHERE id=$1`,[brand]),/foreign key constraint/i);
    const p=await db.query(`SELECT workspace_id FROM public.projects WHERE workspace_id=$1 AND name='Secret'`,[ws]);
    expect(p.rows[0].workspace_id).toBe(ws);
  });

  test('non-owner may leave and loses subsequent access',async()=>{
    await asUser(U1);
    const ws=(await db.query(`SELECT id FROM public.workspaces WHERE slug='alpha-workspace'`)).rows[0].id;
    await db.query(`SELECT public.invite_workspace_member($1,$2,'viewer')`,[ws,U3]);
    await asUser(U3);
    await db.query(`SELECT public.remove_workspace_member($1,$2)`,[ws,U3]);
    const visible=await db.query(`SELECT id FROM public.workspaces WHERE id=$1`,[ws]);
    expect(visible.rows).toHaveLength(0);
  });

  test('owner cannot leave without transferring ownership',async()=>{
    await asUser(U1);
    const ws=(await db.query(`SELECT id FROM public.workspaces WHERE slug='alpha-workspace'`)).rows[0].id;
    await expectDenied(db.query(`SELECT public.remove_workspace_member($1,$2)`,[ws,U1]),/transfer ownership/i);
  });

  test('ownership transfer updates owner_id and both roles atomically',async()=>{
    await asUser(U1);
    const ws=(await db.query(`SELECT id FROM public.workspaces WHERE slug='beta-workspace'`)).rows[0].id;
    await db.query(`SELECT public.transfer_workspace_ownership($1,$2)`,[ws,U2]);
    await asRoot();
    const w=(await db.query(`SELECT owner_id FROM public.workspaces WHERE id=$1`,[ws])).rows[0];
    const roles=await db.query(`SELECT user_id,role FROM public.workspace_members WHERE workspace_id=$1 ORDER BY user_id`,[ws]);
    expect(w.owner_id).toBe(U2);
    expect(roles.rows.find(r=>r.user_id===U1).role).toBe('admin');
    expect(roles.rows.find(r=>r.user_id===U2).role).toBe('owner');
  });
});
