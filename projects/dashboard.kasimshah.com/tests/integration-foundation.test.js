const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');
const { encryptCredentials, decryptCredentials } = require('../api/_crypto');
const { getProvider, executeProviderJob } = require('../api/_providers');

const OWNER = '00000000-0000-0000-0000-000000000011';
const ADMIN = '00000000-0000-0000-0000-000000000012';
const VIEWER = '00000000-0000-0000-0000-000000000013';
const WS = '10000000-0000-0000-0000-000000000001';

describe('integration encryption and provider registry', () => {
  beforeAll(() => { process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64'); });
  afterAll(() => { delete process.env.INTEGRATION_ENCRYPTION_KEY; });

  test('AES-GCM round-trips without exposing plaintext', () => {
    const encrypted = encryptCredentials({ serviceToken: 'super-secret-token' });
    expect(encrypted.ciphertext).not.toContain('super-secret-token');
    expect(decryptCredentials(encrypted)).toEqual({ serviceToken: 'super-secret-token' });
  });

  test('KS OS is registered as the booking provider and fails honestly without a contract', async () => {
    expect(getProvider('ks_os').module).toBe('booking');
    const result = await executeProviderJob({ provider: 'ks_os', job_type: 'connection.test' });
    expect(result).toEqual(expect.objectContaining({ succeeded: false, errorCode: 'PROVIDER_NOT_CONFIGURED' }));
  });

  test('KS OS connection test calls the versioned tenant status contract', async () => {
    process.env.KS_OS_API_URL='https://booking.example.com';
    global.fetch=jest.fn().mockResolvedValue({ok:true,status:200,json:async()=>({tenant:{id:'tenant-id'},readiness:{ready:true}})});
    const result=await executeProviderJob({provider:'ks_os',job_type:'connection.test',workspace_id:WS},{credentials:{serviceToken:'service-secret'},connection:{external_account_id:'tenant-id'}});
    expect(result).toEqual(expect.objectContaining({succeeded:true,result:{tenantId:'tenant-id',readiness:{ready:true}}}));
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/service/tenants/tenant-id/status'),expect.objectContaining({headers:{Authorization:'Bearer service-secret'}}));
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/service/tenants/tenant-id/automation-link'),expect.objectContaining({method:'POST',body:JSON.stringify({workspaceId:WS})}));
    delete process.env.KS_OS_API_URL;delete global.fetch;
  });
});

describe('integration migration boundaries', () => {
  let db;
  const queryAs = async (role, uid, sql) => {
    await db.exec("RESET ROLE; SET request.jwt.claim.sub = '';");
    if (role) await db.exec(`SET ROLE ${role}`);
    if (uid) await db.exec(`SET request.jwt.claim.sub = '${uid}'`);
    return db.exec(sql);
  };

  beforeAll(async () => {
    db = new PGlite(); await db.waitReady;
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id UUID PRIMARY KEY,email TEXT,raw_user_meta_data JSONB DEFAULT '{}');
      CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS
        'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::UUID';
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    `);
    const migrations = [
      '20260713000000_initial_foundation.sql', '20260713010000_security_fixes.sql',
      '20260713020000_final_security_corrections.sql', '20260714000000_platform_control_plane.sql',
      '20260714010000_platform_control_security_fixes.sql', '20260714020000_customer_invitations.sql',
      '20260714030000_integration_job_foundation.sql'
    ];
    const dir = path.join(__dirname, '../supabase/migrations');
    for (const file of migrations) {
      let sql = fs.readFileSync(path.join(dir, file), 'utf8');
      if (file.includes('000000_initial_foundation.sql')) {
        sql = sql.replace(/CREATE TRIGGER on_auth_user_created[\s\S]*?EXECUTE FUNCTION handle_new_user\(\);/i, '');
      }
      if (file.includes('customer_invitations.sql')) {
        sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;/i, '').replace(/\bCITEXT\b/g, 'TEXT');
      }
      await db.exec(sql);
    }
    await db.exec(`
      GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
      INSERT INTO auth.users(id,email) VALUES ('${OWNER}','owner@test.dev'),('${ADMIN}','admin@test.dev'),('${VIEWER}','viewer@test.dev');
      INSERT INTO workspaces(id,name,slug,owner_id,status) VALUES ('${WS}','Test','test-workspace','${OWNER}','active');
      INSERT INTO workspace_members(workspace_id,user_id,role) VALUES
        ('${WS}','${OWNER}','owner'),('${WS}','${ADMIN}','admin'),('${WS}','${VIEWER}','viewer');
      INSERT INTO workspace_modules(workspace_id,module,enabled) VALUES ('${WS}','booking',true);
    `);
  });
  afterAll(async () => db.close());

  test('viewer cannot create a provider connection', async () => {
    await expect(queryAs('authenticated', VIEWER, `SELECT upsert_integration_connection('${WS}'::uuid,'ks_os','KS OS',NULL,'{}'::jsonb,'cipher','aXZpdml2aXZpdml2','dGFndGFndGFndGFn',1::smallint)`)).rejects.toThrow(/Insufficient/);
  });

  test('admin stores ciphertext in the service-only vault', async () => {
    await queryAs('authenticated', ADMIN, `SELECT upsert_integration_connection('${WS}'::uuid,'ks_os','KS OS','tenant-1','{}'::jsonb,'ciphertext-value','aXZpdml2aXZpdml2','dGFndGFndGFndGFn',1::smallint)`);
    const hidden = await queryAs('authenticated', ADMIN, 'SELECT * FROM integration_credentials');
    expect(hidden.find(result => result.rows)?.rows).toHaveLength(0);
    await db.exec('RESET ROLE');
    const result = await db.query('SELECT ciphertext FROM integration_credentials');
    expect(result.rows[0].ciphertext).toBe('ciphertext-value');
  });

  test('idempotent enqueue creates one job and service worker claims it once', async () => {
    const connection = await db.query(`SELECT id FROM integration_connections WHERE workspace_id='${WS}'`);
    const id = connection.rows[0].id;
    const call = `SELECT enqueue_integration_job('${WS}'::uuid,'${id}'::uuid,'ks_os','connection.test','{}'::jsonb,'idem-key-123',2::smallint)`;
    await queryAs('authenticated', ADMIN, call); await queryAs('authenticated', ADMIN, call);
    await db.exec('RESET ROLE');
    expect((await db.query('SELECT id FROM integration_jobs')).rows).toHaveLength(1);
    await expect(queryAs('authenticated', ADMIN, "SELECT * FROM claim_integration_jobs(10,'bad-worker')")).rejects.toThrow();
    const claimed = await queryAs('service_role', null, "SELECT * FROM claim_integration_jobs(10,'worker-1')");
    expect(claimed.find(result => result.rows)?.rows).toHaveLength(1);
    const second = await queryAs('service_role', null, "SELECT * FROM claim_integration_jobs(10,'worker-2')");
    expect(second.find(result => result.rows)?.rows).toHaveLength(0);
  });
});
