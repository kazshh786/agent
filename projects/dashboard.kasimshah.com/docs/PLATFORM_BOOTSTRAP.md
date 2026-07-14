# Platform Bootstrap Procedure

The agency platform requires a manual bootstrap to provision the initial `platform_owner`. This ensures secure, explicit initiation of the agency control plane.

> [!WARNING]
> **Security Critical**
> Never expose this SQL directly in an API route. Never run this script without verifying the target UUID. This is a one-time operation.

## Prerequisites

1. The `20260714000000_platform_control_plane.sql` migration must be successfully applied to the database.
2. The target user must have created a standard Supabase authentication account.
3. The target user must have verified their email address (`email_confirmed_at IS NOT NULL`).

## Procedure

1. Open the Supabase Dashboard for your project.
2. Navigate to **Authentication** -> **Users**.
3. Locate the intended platform owner and copy their **User UID**.
4. Navigate to the **SQL Editor**.
5. Copy the bootstrap script below, replacing `<REPLACE_WITH_VERIFIED_USER_UUID>` with the actual UUID.
6. Run the script.

## Bootstrap SQL

```sql
DO $$
DECLARE
  v_target_user_id UUID := '<REPLACE_WITH_VERIFIED_USER_UUID>';
BEGIN
  -- 1. Check user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_target_user_id) THEN
    RAISE EXCEPTION 'User % does not exist in auth.users', v_target_user_id;
  END IF;
  
  -- 2. Check email verified
  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = v_target_user_id AND email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'User % has not verified their email', v_target_user_id;
  END IF;
  
  -- 3. Check no existing active platform_owner
  IF EXISTS (SELECT 1 FROM platform_users WHERE role = 'platform_owner' AND is_active = true) THEN
    RAISE EXCEPTION 'An active platform owner already exists. This bootstrap is one-time only.';
  END IF;
  
  -- 4. Insert the initial platform owner
  INSERT INTO platform_users (user_id, role, is_active, created_by, created_at, updated_at)
  VALUES (v_target_user_id, 'platform_owner', true, v_target_user_id, now(), now());
  
  RAISE NOTICE 'Platform owner bootstrapped successfully for user %', v_target_user_id;
END $$;
```

## Verification
After running the script, log into the dashboard with that user account. You should be automatically routed to the **Agency Control Centre** rather than the standard customer onboarding flow.
