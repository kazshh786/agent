const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

describe('Platform Control Plane & Security Fixes', () => {
  let db;
  let anonDb;
  let ownerDb, adminDb, supportDb, customerDb, disabledDb;

  const TEST_USERS = {
    owner: '00000000-0000-0000-0000-000000000001',
    admin: '00000000-0000-0000-0000-000000000002',
    support: '00000000-0000-0000-0000-000000000003',
    customer: '00000000-0000-0000-0000-000000000004',
    customer2: '00000000-0000-0000-0000-000000000005',
    disabled: '00000000-0000-0000-0000-000000000006'
  };

  beforeAll(async () => {
    db = new PGlite();
    await db.waitReady;

    // Create auth schema mock
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id UUID PRIMARY KEY,email TEXT,raw_user_meta_data JSONB DEFAULT '{}');
      CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS
        'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::UUID';
      CREATE ROLE anon;
      CREATE ROLE authenticated;
    `);

    // Load migrations in exact order
    const migrations = [
      '20260713000000_initial_foundation.sql',
      '20260713010000_security_fixes.sql',
      '20260713020000_final_security_corrections.sql',
      '20260714000000_platform_control_plane.sql',
      '20260714010000_platform_control_security_fixes.sql'
    ];

    const dir = path.join(__dirname, '../supabase/migrations');
    for (const file of migrations) {
      let sql = fs.readFileSync(path.join(dir, file), 'utf8');
      if (file.includes('000000_initial_foundation.sql')) {
        sql = sql.replace(/CREATE TRIGGER on_auth_user_created[\s\S]*?EXECUTE FUNCTION handle_new_user\(\);/i, '');
      }
      try {
        await db.exec(sql);
      } catch (err) {
        console.error(`Migration failed: ${file}`);
        throw err;
      }
    }

    // Grant public usage to mocked roles
    await db.exec(`
      GRANT USAGE ON SCHEMA public TO anon, authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
      GRANT USAGE ON SCHEMA auth TO anon, authenticated;
    `);

    // Insert test users
    for (const [key, id] of Object.entries(TEST_USERS)) {
      await db.exec(`INSERT INTO auth.users (id) VALUES ('${id}');`);
    }

    // Insert platform users
    await db.exec(`
      INSERT INTO platform_users (user_id, role, is_active) VALUES
      ('${TEST_USERS.owner}', 'platform_owner', true),
      ('${TEST_USERS.admin}', 'platform_admin', true),
      ('${TEST_USERS.support}', 'platform_support', true),
      ('${TEST_USERS.disabled}', 'platform_owner', false);
    `);

    // Create client factories
    const createClient = (role, uid) => ({
      query: async (sql) => {
        await db.exec(`RESET ROLE; SET request.jwt.claim.sub = '';`);
        if (role) {
          await db.exec(`SET ROLE ${role};`);
        }
        if (uid) {
          await db.exec(`SET request.jwt.claim.sub = '${uid}';`);
        }
        return await db.exec(sql);
      }
    });

    anonDb = createClient('anon', '');
    ownerDb = createClient('authenticated', TEST_USERS.owner);
    adminDb = createClient('authenticated', TEST_USERS.admin);
    supportDb = createClient('authenticated', TEST_USERS.support);
    customerDb = createClient('authenticated', TEST_USERS.customer);
    disabledDb = createClient('authenticated', TEST_USERS.disabled);
  });

  afterAll(async () => {
    await db.close();
  });

  describe('Recursive RLS & Platform Visibility', () => {
    it('customer is not a platform user and sees 0 platform_users', async () => {
      const res = await customerDb.query('SELECT * FROM platform_users');
      // The query actually returns an array of result objects for each statement in the BEGIN...COMMIT block
      const selectResult = res.find(r => r.rows);
      expect(selectResult.rows).toHaveLength(0);
    });

    it('recursive RLS does not occur (queries succeed)', async () => {
      const res = await ownerDb.query('SELECT * FROM platform_users');
      const selectResult = res.find(r => r.rows);
      // Owner sees all 4
      expect(selectResult.rows).toHaveLength(4);
    });

    it('disabled platform user sees 0 platform_users', async () => {
      const res = await disabledDb.query('SELECT * FROM platform_users');
      const selectResult = res.find(r => r.rows);
      expect(selectResult.rows).toHaveLength(0);
    });
  });

  describe('Provisioning & Support Sanitization', () => {
    it('customer cannot provision workspaces', async () => {
      const res = await customerDb.query(`
        SELECT provision_customer_workspace('test', 'test-slug', 'Customer', 'c@c.com', ARRAY['website'::workspace_module]);
      `).catch(e => e);
      expect(res.message).toMatch(/Insufficient platform privileges/);
    });

    it('support cannot provision workspaces', async () => {
      const res = await supportDb.query(`
        SELECT provision_customer_workspace('test', 'test-slug', 'Customer', 'c@c.com', ARRAY['website'::workspace_module]);
      `).catch(e => e);
      expect(res.message).toMatch(/Insufficient platform privileges/);
    });

    it('admin can provision workspaces and it creates owner_id NULL with no membership', async () => {
      const res = await adminDb.query(`
        SELECT provision_customer_workspace('Admin WS', 'admin-ws', 'Customer', 'c@c.com', ARRAY['website'::workspace_module]);
      `);
      const selectResult = res.find(r => r.rows);
      const ws = selectResult.rows[0].provision_customer_workspace;
      expect(ws.status).toBe('provisioning');

      // Verify DB state
      const dbCheck = await db.query(`SELECT owner_id FROM workspaces WHERE id = '${ws.id}'`);
      expect(dbCheck.rows[0].owner_id).toBeNull();
      
      const memberCheck = await db.exec(`SELECT count(*) FROM workspace_members WHERE workspace_id = '${ws.id}'`);
      expect(Number(memberCheck.find(r => r.rows).rows[0].count)).toBe(0);
    });

    it('customer cannot list agency workspaces', async () => {
      const res = await customerDb.query('SELECT * FROM workspaces');
      const selectResult = res.find(r => r.rows);
      // A customer with no memberships sees 0 workspaces
      expect(selectResult.rows).toHaveLength(0);
    });

    it('support cannot directly query workspaces or workspace_modules', async () => {
      let res = await supportDb.query('SELECT * FROM workspaces').catch(e => e);
      // Wait, RLS just returns 0 rows if they query directly
      if (res.find) {
        const selectResult = res.find(r => r.rows);
        expect(selectResult.rows).toHaveLength(0);
      }
      
      res = await supportDb.query('SELECT * FROM workspace_modules').catch(e => e);
      if (res.find) {
        const selectResult = res.find(r => r.rows);
        expect(selectResult.rows).toHaveLength(0);
      }
    });

    it('support safe RPC returns only safe fields', async () => {
      const res = await supportDb.query('SELECT * FROM get_support_workspace_summaries()');
      const selectResult = res.find(r => r.rows);
      expect(selectResult.rows.length).toBeGreaterThan(0);
      const row = selectResult.rows[0];
      
      // Safe fields exist
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('name');
      expect(row).toHaveProperty('slug');
      expect(row).toHaveProperty('status');
      
      // Unsafe fields do not exist
      expect(row).not.toHaveProperty('metadata');
      expect(row).not.toHaveProperty('customer_email');
      expect(row).not.toHaveProperty('configuration');
    });

    it('customers cannot execute or obtain results from the support RPC', async () => {
      const res = await customerDb.query('SELECT * FROM get_support_workspace_summaries()').catch(e => e);
      expect(res.message).toMatch(/Insufficient privileges/);
    });
  });

  describe('Lifecycle and Audit', () => {
    let wsId;
    let wsIdUnactivated;
    beforeAll(async () => {
      const res1 = await adminDb.query(`
        SELECT provision_customer_workspace('Test WS', 'test-ws-2', 'Customer', 'c@c.com', ARRAY['website'::workspace_module]);
      `);
      wsId = res1.find(r => r.rows).rows[0].provision_customer_workspace.id;
      
      const res2 = await adminDb.query(`
        SELECT provision_customer_workspace('Test WS 3', 'test-ws-3', 'Customer', 'c@c.com', ARRAY['website'::workspace_module]);
      `);
      wsIdUnactivated = res2.find(r => r.rows).rows[0].provision_customer_workspace.id;

      // Setup wsId as active
      await db.exec(`
        RESET ROLE;
        SET request.jwt.claim.sub = '';
        UPDATE workspaces SET owner_id = '${TEST_USERS.customer}' WHERE id = '${wsId}';
        INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ('${wsId}', '${TEST_USERS.customer}', 'owner');
      `);
      await adminDb.query(`SELECT activate_workspace('${wsId}')`);
    });

    it('activation fails without accepted customer owner', async () => {
      const res = await adminDb.query(`SELECT activate_workspace('${wsIdUnactivated}')`).catch(e => e);
      expect(res.message).toMatch(/Complete customer invitation first/);
    });

    it('support cannot suspend, archive or update modules', async () => {
      const r1 = await supportDb.query(`SELECT suspend_workspace('${wsId}')`).catch(e => e);
      expect(r1.message).toMatch(/Insufficient platform privileges/);

      const r2 = await supportDb.query(`SELECT archive_workspace('${wsId}')`).catch(e => e);
      // Wait, archive requires owner, so it will fail for support either way
      expect(r2.message).toMatch(/Insufficient platform privileges|Only platform owners can archive/);

      const r3 = await supportDb.query(`SELECT update_workspace_modules('${wsId}', '[{"module":"website","enabled":false}]')`).catch(e => e);
      expect(r3.message).toMatch(/Insufficient platform privileges/);
    });

    it('admin cannot archive', async () => {
      const res = await adminDb.query(`SELECT archive_workspace('${wsId}')`).catch(e => e);
      expect(res.message).toMatch(/Only platform owners can archive workspaces/);
    });

    it('archived workspace cannot transition', async () => {
      await ownerDb.query(`SELECT archive_workspace('${wsId}')`);
      const res = await ownerDb.query(`SELECT suspend_workspace('${wsId}')`).catch(e => e);
      expect(res.message).toMatch(/Only active workspaces can be suspended/);
    });

    it('failed platform mutation creates no audit event', async () => {
      // The admin tried to archive and it failed. Check logs.
      const res = await ownerDb.query(`SELECT count(*) FROM platform_audit_logs WHERE action = 'workspace.archived' AND actor_id = '${TEST_USERS.admin}'`);
      expect(Number(res.find(r => r.rows).rows[0].count)).toBe(0);
    });

    it('lifecycle actions create platform audit events', async () => {
      const res = await ownerDb.query(`SELECT count(*) FROM platform_audit_logs WHERE action = 'workspace.archived' AND target_id = '${wsId}'`);
      expect(Number(res.find(r => r.rows).rows[0].count)).toBe(1);
    });
  });

  describe('Audit Permissions', () => {
    it('owner sees all platform audit types', async () => {
      const res = await ownerDb.query(`SELECT count(*) FROM platform_audit_logs`);
      expect(parseInt(res.find(r => r.rows).rows[0].count)).toBeGreaterThan(0);
    });

    it('admin sees only allowlisted operational events and cannot see archive or platform-role events', async () => {
      const res = await adminDb.query(`SELECT DISTINCT action FROM platform_audit_logs`);
      const actions = res.find(r => r.rows).rows.map(r => r.action);
      
      expect(actions).not.toContain('workspace.archived');
      expect(actions).not.toContain('platform_user.added');
      // But it should contain provisioned
      expect(actions).toContain('workspace.provisioned');
    });

    it('support sees none', async () => {
      const res = await supportDb.query(`SELECT count(*) FROM platform_audit_logs`);
      expect(Number(res.find(r => r.rows).rows[0].count)).toBe(0);
    });

    it('customer sees none', async () => {
      const res = await customerDb.query(`SELECT count(*) FROM platform_audit_logs`);
      expect(Number(res.find(r => r.rows).rows[0].count)).toBe(0);
    });

    it('direct audit INSERT fails', async () => {
      const res = await ownerDb.query(`INSERT INTO platform_audit_logs (actor_id, action, target_type) VALUES ('${TEST_USERS.owner}', 'workspace.provisioned', 'workspace')`).catch(e => e);
      expect(res.message).toMatch(/new row violates row-level security policy/);
    });

    it('direct audit UPDATE fails', async () => {
      const res = await ownerDb.query(`UPDATE platform_audit_logs SET action = 'workspace.suspended'`).catch(e => e);
      expect(res[0].affectedRows).toBe(0); // RLS prevents update
    });

    it('direct audit DELETE fails', async () => {
      const res = await ownerDb.query(`DELETE FROM platform_audit_logs`).catch(e => e);
      expect(res[0].affectedRows).toBe(0); // RLS prevents delete
    });
  });

  describe('Platform Users Protection', () => {
    it('platform owner cannot change/deactivate self', async () => {
      const r1 = await ownerDb.query(`SELECT update_platform_user_role('${TEST_USERS.owner}', 'platform_admin')`).catch(e => e);
      expect(r1.message).toMatch(/Cannot modify your own platform role/);

      const r2 = await ownerDb.query(`SELECT deactivate_platform_user('${TEST_USERS.owner}')`).catch(e => e);
      expect(r2.message).toMatch(/Cannot deactivate yourself/);
    });
  });
});
