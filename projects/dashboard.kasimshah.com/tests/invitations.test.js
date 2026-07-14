const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ---------------------------------------------------------
// INVITATION ONBOARDING TEST SUITE
// ---------------------------------------------------------
// Verifies security properties and database constraints
// around the customer invitations flow.
// ---------------------------------------------------------

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function runTests() {
  console.log('--- Running Invitation Security Tests ---');

  // 1. Verify that raw tokens are not stored in database migrations
  console.log('1. Checking migration file for raw token security...');
  const migrationDir = path.join(__dirname, '../supabase/migrations');
  const files = fs.readdirSync(migrationDir);
  const inviteMigration = files.find(f => f.includes('customer_invitations'));
  
  if (!inviteMigration) {
    throw new Error('Could not find customer_invitations migration file');
  }

  const sql = fs.readFileSync(path.join(migrationDir, inviteMigration), 'utf8');

  // Must store token_hash, not token
  assert(sql.includes('token_hash'), 'Migration must contain token_hash');
  assert(!sql.match(/\btoken\s+text/i) && !sql.match(/\btoken\s+varchar/i), 'Migration must not define a raw token column');
  assert(sql.includes('p_token_hash'), 'RPCs must accept p_token_hash, not raw tokens');
  assert(!sql.includes('p_token '), 'RPCs must not accept raw tokens');
  
  console.log('✅ Migration uses hashed tokens exclusively.');

  // 2. Verify Vercel API files for hashing logic
  console.log('2. Checking Vercel API for correct SHA-256 hashing...');
  const createApiFile = path.join(__dirname, '../api/invitations/create.js');
  const acceptApiFile = path.join(__dirname, '../api/invitations/accept.js');
  const inspectApiFile = path.join(__dirname, '../api/invitations/inspect.js');

  const createContent = fs.readFileSync(createApiFile, 'utf8');
  assert(createContent.includes("crypto.randomBytes(32).toString('base64url')"), 'Must generate 32 bytes of secure randomness encoded in base64url');
  assert(createContent.includes("crypto.createHash('sha256')"), 'Must hash the token using sha256');

  const acceptContent = fs.readFileSync(acceptApiFile, 'utf8');
  assert(acceptContent.includes("crypto.createHash('sha256')"), 'Must hash the token in accept.js using sha256');

  const inspectContent = fs.readFileSync(inspectApiFile, 'utf8');
  assert(inspectContent.includes("crypto.createHash('sha256')"), 'Must hash the token in inspect.js using sha256');

  console.log('✅ Server-side token generation and hashing logic verified.');

  // 3. Verify RPC security definition
  console.log('3. Checking RPC SECURITY DEFINER and search_path...');
  assert(sql.includes('SECURITY DEFINER'), 'RPCs must be SECURITY DEFINER to bypass RLS');
  assert(sql.includes('SET search_path = public'), 'RPCs must set search_path = public to prevent search path injection');
  
  console.log('✅ RPC security definitions verified.');

  // 4. Verify Frontend storage (sessionStorage vs localStorage)
  console.log('4. Checking frontend sessionStorage usage...');
  const appJs = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  assert(appJs.includes("sessionStorage.setItem('agency_os_invite'"), 'Must store token in sessionStorage');
  assert(!appJs.includes("localStorage.setItem('agency_os_invite'"), 'Must NOT store token in localStorage');
  
  console.log('✅ Frontend token storage verified.');

  console.log('--- All tests passed! ---');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
