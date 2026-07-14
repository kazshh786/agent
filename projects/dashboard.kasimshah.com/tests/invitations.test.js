const fs = require('fs');
const path = require('path');
const { test, expect, describe } = require('@jest/globals');

// ---------------------------------------------------------
// INVITATION ONBOARDING TEST SUITE
// ---------------------------------------------------------
// Verifies security properties and database constraints
// around the customer invitations flow.
// ---------------------------------------------------------

describe('Invitation Security Tests', () => {
  test('Checking migration file for raw token security', () => {
    const migrationDir = path.join(__dirname, '../supabase/migrations');
    const files = fs.readdirSync(migrationDir);
    const inviteMigration = files.find(f => f.includes('customer_invitations'));
    
    expect(inviteMigration).toBeDefined();

    const sql = fs.readFileSync(path.join(migrationDir, inviteMigration), 'utf8');

    // Must store token_hash, not token
    expect(sql.includes('token_hash')).toBe(true);
    expect(sql.match(/\btoken\s+text/i)).toBeNull();
    expect(sql.match(/\btoken\s+varchar/i)).toBeNull();
    expect(sql.includes('p_token_hash')).toBe(true);
    expect(sql.includes('p_token ')).toBe(false);
  });

  test('Checking Vercel API for correct SHA-256 hashing', () => {
    const createApiFile = path.join(__dirname, '../api/invitations/create.js');
    const acceptApiFile = path.join(__dirname, '../api/invitations/accept.js');
    const inspectApiFile = path.join(__dirname, '../api/invitations/inspect.js');

    const createContent = fs.readFileSync(createApiFile, 'utf8');
    expect(createContent.includes("crypto.randomBytes(32).toString('base64url')")).toBe(true);
    expect(createContent.includes("crypto.createHash('sha256')")).toBe(true);

    const acceptContent = fs.readFileSync(acceptApiFile, 'utf8');
    expect(acceptContent.includes("crypto.createHash('sha256')")).toBe(true);

    const inspectContent = fs.readFileSync(inspectApiFile, 'utf8');
    expect(inspectContent.includes("crypto.createHash('sha256')")).toBe(true);
  });

  test('Checking RPC SECURITY DEFINER and search_path', () => {
    const migrationDir = path.join(__dirname, '../supabase/migrations');
    const files = fs.readdirSync(migrationDir);
    const inviteMigration = files.find(f => f.includes('customer_invitations'));
    const sql = fs.readFileSync(path.join(migrationDir, inviteMigration), 'utf8');

    expect(sql.includes('SECURITY DEFINER')).toBe(true);
    expect(sql.includes('SET search_path = public')).toBe(true);
  });

  test('Checking frontend sessionStorage usage', () => {
    const appJs = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    expect(appJs.includes("sessionStorage.setItem('agency_os_invite'")).toBe(true);
    expect(appJs.includes("localStorage.setItem('agency_os_invite'")).toBe(false);
  });
});
