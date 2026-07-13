# Supabase Setup Guide

> Step-by-step guide for configuring Supabase as the backend for the agency dashboard.

---

## Prerequisites

- A [Supabase](https://supabase.com) account
- Access to the `supabase_migrations.sql` file in the project root
- A `.env` file (copy from `.env.example`)

---

## Step 1: Create a Supabase Project

1. Go to [app.supabase.com](https://app.supabase.com)
2. Click **New Project**
3. Fill in:
   - **Name**: `agency-dashboard` (or your preferred name)
   - **Database Password**: Generate a strong password and **save it securely**
   - **Region**: Choose the closest region to your users
4. Click **Create new project**
5. Wait for the project to finish provisioning (~2 minutes)

---

## Step 2: Run Database Migrations

1. In your Supabase dashboard, go to **SQL Editor**
2. Click **New query**
3. Open `supabase_migrations.sql` from the project root
4. Copy the **entire contents** and paste into the SQL Editor
5. Click **Run**

### What the Migration Creates

| Object Type | Items Created |
|-------------|---------------|
| **Enums** | `workspace_role`, `project_type`, `project_status` |
| **Tables** | `profiles`, `workspaces`, `workspace_members`, `brands`, `projects`, `integration_connections`, `audit_logs` |
| **RLS Policies** | SELECT/INSERT/UPDATE/DELETE policies on all tables |
| **Functions** | `create_workspace_with_owner()`, `get_user_role_in_workspace()` |
| **Triggers** | Auto-create profile on user signup |

### Expected Output

You should see output confirming each `CREATE TABLE`, `CREATE POLICY`, and `CREATE FUNCTION` statement succeeded. If any statement fails, check the error message — most common issues are:

- **Enum already exists**: Drop existing enums first if re-running
- **Table already exists**: Use `DROP TABLE IF EXISTS` or run on a fresh project

---

## Step 3: Configure Authentication

### Enable Email/Password Auth

1. Go to **Authentication** → **Providers**
2. Ensure **Email** provider is **enabled**
3. Settings:
   - ✅ Enable email signup
   - ✅ Enable email confirmations (recommended for production)
   - Set **Minimum password length**: `8`

### Configure Redirect URLs

Go to **Authentication** → **URL Configuration** and set:

| Setting | Value |
|---------|-------|
| **Site URL** | `https://dashboard.kasimshah.com` |
| **Redirect URLs** | Add all of the following: |

```
# Production
https://dashboard.kasimshah.com
https://dashboard.kasimshah.com/password-reset

# Vercel Preview Deployments
https://*-kasimshah.vercel.app
https://*-kasimshah.vercel.app/password-reset

# Local Development
http://localhost:3000
http://localhost:3000/password-reset
http://localhost:5500
http://localhost:5500/password-reset
```

> [!IMPORTANT]
> Supabase uses wildcard matching for preview URLs. The pattern `https://*-kasimshah.vercel.app` covers all Vercel preview deployments.

### Email Templates (Optional)

Go to **Authentication** → **Email Templates** to customize:

- **Confirm signup**: Welcome email with verification link
- **Reset password**: Password reset email
- **Magic link**: If you enable magic link auth later

---

## Step 4: Get Project Credentials

### Find Your Credentials

1. Go to **Settings** → **API**
2. Note the following values:

| Credential | Location | Use |
|-----------|----------|-----|
| **Project URL** | `Settings > API > Project URL` | Frontend + API |
| **Anon Key** | `Settings > API > Project API keys > anon public` | Frontend (safe for browser) |
| **Service Role Key** | `Settings > API > Project API keys > service_role` | API only (⚠️ NEVER in browser) |

### Update `.env`

Copy `.env.example` to `.env` and fill in:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Server-side only (Vercel environment variables)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> [!CAUTION]
> **NEVER put the `SUPABASE_SERVICE_ROLE_KEY` in frontend code, `.env` files committed to git, or any client-accessible location.** This key bypasses RLS and has full database access. It should ONLY be set as a Vercel environment variable for serverless functions.

---

## Step 5: Set Vercel Environment Variables

In your Vercel project dashboard:

1. Go to **Settings** → **Environment Variables**
2. Add `SUPABASE_SERVICE_ROLE_KEY`:
   - **Key**: `SUPABASE_SERVICE_ROLE_KEY`
   - **Value**: Your service role key
   - **Environments**: ✅ Production, ✅ Preview, ❌ Development (use `.env` locally)

See [VERCEL_SETUP.md](./VERCEL_SETUP.md) for the complete list of environment variables.

---

## Step 6: Verify RLS Is Enabled

### Via Dashboard

1. Go to **Table Editor**
2. Click on each table
3. Verify the **RLS Enabled** badge appears at the top

### Via SQL

Run this query to verify RLS status on all tables:

```sql
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

**Expected output** — all tables should show `rowsecurity = true`:

| schemaname | tablename              | rowsecurity |
|------------|------------------------|-------------|
| public     | audit_logs             | true        |
| public     | brands                 | true        |
| public     | integration_connections| true        |
| public     | profiles               | true        |
| public     | projects               | true        |
| public     | workspace_members      | true        |
| public     | workspaces             | true        |

> [!WARNING]
> If **any** table shows `rowsecurity = false`, enable it immediately:
> ```sql
> ALTER TABLE public.table_name ENABLE ROW LEVEL SECURITY;
> ```

---

## Step 7: Test the `create_workspace_with_owner` RPC

This function creates a workspace and simultaneously adds the creator as an `owner` member, ensuring atomicity.

### Test via SQL Editor

```sql
-- First, create a test user via Authentication → Users → Add User
-- Then use their UUID:

SELECT create_workspace_with_owner(
  'Test Agency',                           -- workspace name
  'test-agency',                           -- slug
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890'  -- user UUID
);
```

### Verify the Result

```sql
-- Check workspace was created
SELECT id, name, slug, created_at
FROM workspaces
WHERE slug = 'test-agency';

-- Check owner membership was created
SELECT wm.role, p.email
FROM workspace_members wm
JOIN profiles p ON p.id = wm.user_id
WHERE wm.workspace_id = (
  SELECT id FROM workspaces WHERE slug = 'test-agency'
);
```

Expected: One workspace row and one `workspace_members` row with `role = 'owner'`.

---

## Step 8: Verify RLS Isolation

These queries confirm that RLS properly isolates workspace data.

### Test 1: Anonymous Access Blocked

```sql
-- In SQL Editor, run as anon role:
SET ROLE anon;

SELECT * FROM workspaces;
-- Expected: 0 rows (anon users can't see any workspaces)

SELECT * FROM projects;
-- Expected: 0 rows

RESET ROLE;
```

### Test 2: Cross-Workspace Isolation

```sql
-- Create two workspaces with different owners
-- User A should NOT see User B's workspace data

-- As User A (set via auth.uid()):
SET request.jwt.claims = '{"sub": "user-a-uuid"}';
SET ROLE authenticated;

SELECT * FROM workspaces;
-- Expected: Only workspaces where User A is a member

RESET ROLE;
```

### Test 3: Role-Based Write Restrictions

```sql
-- Viewers should not be able to insert projects
-- Editors should not be able to delete projects

-- Test INSERT as viewer:
SET request.jwt.claims = '{"sub": "viewer-user-uuid"}';
SET ROLE authenticated;

INSERT INTO projects (workspace_id, name, type, status)
VALUES ('workspace-uuid', 'Test', 'website', 'draft');
-- Expected: ERROR - new row violates row-level security policy

RESET ROLE;
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "relation does not exist" | Migration not run | Run `supabase_migrations.sql` |
| "permission denied for table" | RLS blocking access | Check JWT claims and membership |
| "function does not exist" | Functions not created | Re-run migration or check for errors |
| Auth not working | Redirect URLs missing | Add all URLs in Step 3 |
| "JWT expired" | Clock skew or stale token | Client SDK auto-refreshes; check system clock |

### Reset Everything

If you need to start fresh:

```sql
-- ⚠️ DESTRUCTIVE: Drops all tables and recreates
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

-- Then re-run supabase_migrations.sql
```

---

## Next Steps

- [ ] Configure Vercel deployment → [VERCEL_SETUP.md](./VERCEL_SETUP.md)
- [ ] Review security design → [SECURITY.md](./SECURITY.md)
- [ ] Understand system architecture → [ARCHITECTURE.md](./ARCHITECTURE.md)
