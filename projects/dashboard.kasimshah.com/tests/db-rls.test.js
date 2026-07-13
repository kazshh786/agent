const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
const path = require('path');

let db;

beforeAll(async () => {
  db = new PGlite();

  // 1. Mock Supabase Auth Schema
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT, raw_user_meta_data JSONB DEFAULT '{}');
    
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
    $$ LANGUAGE SQL;
  `);

  // 2. Helper Roles (Must exist before migrations)
  await db.exec(`
    DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF; END $$;
    DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF; END $$;
  `);

  // 3. Load Migrations
  const m1 = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260713000000_initial_foundation.sql'), 'utf8');
  const m2 = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260713010000_security_fixes.sql'), 'utf8');

  // Strip CREATE TRIGGER and related functions for auth.users, as they aren't strictly needed for RLS tests
  // and PGlite might stumble on some complex trigger specifics if they refer to missing auth tables.
  const cleanM1 = m1.replace(/CREATE TRIGGER handle_new_user.*?;/is, '')
                    .replace(/CREATE OR REPLACE FUNCTION handle_new_user.*?;\$\$;/is, '');

  await db.exec(cleanM1);
  await db.exec(m2);

  // 4. Supabase Default Grants
  await db.exec(`
    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
    GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated;
  `);
});

afterAll(async () => {
  await db.close();
});

describe('Database Security & RLS', () => {
  
  beforeEach(async () => {
    // Reset connection
    await db.exec(`RESET ROLE; SET request.jwt.claim.sub = '';`);
  });

  it('direct inserts into workspaces fail for authenticated users', async () => {
    await db.exec(`
      INSERT INTO auth.users (id) VALUES ('00000000-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
    `);

    try {
      await db.exec(`INSERT INTO workspaces (id, name, slug, owner_id) VALUES ('11111111-1111-1111-1111-111111111111', 'Test', 'test', '00000000-0000-0000-0000-000000000001');`);
      fail('Insert should have failed');
    } catch (err) {
      expect(err.message).toMatch(/permission denied for table workspaces|violates row-level security policy/);
    }
  });

  it('RPC workspace creation succeeds and creates audit log + member', async () => {
    const userId = '22222222-2222-2222-2222-222222222222';
    await db.exec(`
      INSERT INTO auth.users (id) VALUES ('${userId}') ON CONFLICT DO NOTHING;
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '${userId}';
    `);

    const res = await db.query(`SELECT * FROM create_workspace_with_owner('Test WS', 'test-ws-slug')`);
    expect(res.rows.length).toBe(1);
    const wsId = res.rows[0].id;

    // Verify member exists
    const mRes = await db.query(`SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`, [wsId, userId]);
    expect(mRes.rows[0].role).toBe('owner');

    // Verify audit log exists
    const aRes = await db.query(`SELECT action FROM audit_logs WHERE workspace_id = $1`, [wsId]);
    expect(aRes.rows[0].action).toBe('workspace.created');
  });

  it('anon cannot execute privileged RPCs', async () => {
    await db.exec(`SET ROLE anon;`);
    try {
      await db.query(`SELECT * FROM invite_workspace_member('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', 'admin')`);
      fail('Anon should not execute RPC');
    } catch (err) {
      expect(err.message).toMatch(/permission denied for function|Not authenticated/);
    }
  });
});
