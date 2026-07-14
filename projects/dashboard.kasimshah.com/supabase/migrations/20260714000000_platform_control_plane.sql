-- ============================================================================
-- SUPABASE MIGRATION 20260714000000 – Platform Control Plane
-- ============================================================================
-- Replaces the self-service workspace model with an agency-managed platform.
-- Only authorised platform users may provision customer workspaces.
--
-- Changes:
--   1.  platform_role enum + platform_users table + RLS
--   2.  Platform role helper functions (SECURITY DEFINER)
--   3.  workspace_status + workspace_module enums
--   4.  ALTER workspaces: add lifecycle columns, make owner_id nullable
--   5.  workspace_modules table + RLS
--   6.  provision_customer_workspace RPC
--   7.  activate_workspace / suspend_workspace / archive_workspace RPCs
--   8.  retry_workspace_provisioning RPC
--   9.  update_workspace_modules RPC
--  10.  Platform role management RPCs
--  11.  Revoke self-service workspace creation
--  12.  Platform workspace visibility RLS
--  13.  Migrate existing workspaces to active status
--
-- Does NOT modify prior migrations.
-- ============================================================================


-- ############################################################################
-- 1. PLATFORM USERS
-- ############################################################################

CREATE TYPE platform_role AS ENUM ('platform_owner', 'platform_admin', 'platform_support');

CREATE TABLE platform_users (
    user_id     UUID          PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role        platform_role NOT NULL,
    is_active   BOOLEAN       NOT NULL DEFAULT true,
    created_by  UUID          REFERENCES auth.users(id),
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE platform_users IS
  'Agency platform users. Only a DBA or platform_owner may populate this table.';

CREATE INDEX idx_platform_users_role ON platform_users(role);
CREATE INDEX idx_platform_users_active ON platform_users(is_active) WHERE is_active = true;

-- updated_at trigger
CREATE TRIGGER trg_platform_users_updated_at
    BEFORE UPDATE ON platform_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE platform_users ENABLE ROW LEVEL SECURITY;

-- platform_owner sees all
CREATE POLICY platform_users_owner_select ON platform_users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM platform_users pu
            WHERE pu.user_id = auth.uid()
              AND pu.role = 'platform_owner'
              AND pu.is_active = true
        )
    );

-- platform_admin sees active users
CREATE POLICY platform_users_admin_select ON platform_users
    FOR SELECT USING (
        is_active = true
        AND EXISTS (
            SELECT 1 FROM platform_users pu
            WHERE pu.user_id = auth.uid()
              AND pu.role = 'platform_admin'
              AND pu.is_active = true
        )
    );

-- platform_support sees only their own row
CREATE POLICY platform_users_support_select ON platform_users
    FOR SELECT USING (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM platform_users pu
            WHERE pu.user_id = auth.uid()
              AND pu.role = 'platform_support'
              AND pu.is_active = true
        )
    );

-- NO INSERT/UPDATE/DELETE policies — mutations via RPCs only


-- ############################################################################
-- 2. PLATFORM ROLE HELPER FUNCTIONS
-- ############################################################################

-- Returns TRUE if the calling user is an active platform user.
CREATE OR REPLACE FUNCTION is_platform_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM platform_users
        WHERE user_id = auth.uid()
          AND is_active = true
    );
$$;

REVOKE ALL ON FUNCTION is_platform_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_platform_user() TO authenticated;


-- Returns the platform role of the calling user, or NULL.
CREATE OR REPLACE FUNCTION get_platform_role()
RETURNS platform_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT role FROM platform_users
    WHERE user_id = auth.uid()
      AND is_active = true;
$$;

REVOKE ALL ON FUNCTION get_platform_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_platform_role() TO authenticated;


-- Returns TRUE if the calling user holds one of the allowed platform roles.
CREATE OR REPLACE FUNCTION has_platform_role(allowed_roles platform_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM platform_users
        WHERE user_id = auth.uid()
          AND is_active = true
          AND role = ANY(allowed_roles)
    );
$$;

REVOKE ALL ON FUNCTION has_platform_role(platform_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION has_platform_role(platform_role[]) TO authenticated;


-- ############################################################################
-- 3. WORKSPACE STATUS & MODULE ENUMS
-- ############################################################################

CREATE TYPE workspace_status AS ENUM (
    'provisioning', 'active', 'suspended', 'archived', 'failed'
);

CREATE TYPE workspace_module AS ENUM (
    'website', 'analytics', 'contacts', 'email', 'social', 'booking', 'crm'
);


-- ############################################################################
-- 4. ALTER WORKSPACES – lifecycle columns + nullable owner_id
-- ############################################################################

-- Make owner_id nullable for provisioning workspaces (no customer yet)
ALTER TABLE workspaces ALTER COLUMN owner_id DROP NOT NULL;

-- Add lifecycle columns
ALTER TABLE workspaces ADD COLUMN status         workspace_status NOT NULL DEFAULT 'active';
ALTER TABLE workspaces ADD COLUMN provisioned_by  UUID REFERENCES auth.users(id);
ALTER TABLE workspaces ADD COLUMN provisioned_at  TIMESTAMPTZ;
ALTER TABLE workspaces ADD COLUMN suspended_at    TIMESTAMPTZ;
ALTER TABLE workspaces ADD COLUMN archived_at     TIMESTAMPTZ;
ALTER TABLE workspaces ADD COLUMN customer_name   TEXT;
ALTER TABLE workspaces ADD COLUMN customer_email  TEXT;
ALTER TABLE workspaces ADD COLUMN metadata        JSONB NOT NULL DEFAULT '{}';

-- Size limit on metadata (16 KB)
ALTER TABLE workspaces ADD CONSTRAINT workspaces_metadata_size
    CHECK (pg_column_size(metadata) <= 16384);

-- Indexes for the new columns
CREATE INDEX idx_workspaces_status ON workspaces(status);
CREATE INDEX idx_workspaces_provisioned_by ON workspaces(provisioned_by);


-- ############################################################################
-- 5. WORKSPACE MODULES TABLE
-- ############################################################################

CREATE TABLE workspace_modules (
    workspace_id   UUID             NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    module         workspace_module NOT NULL,
    enabled        BOOLEAN          NOT NULL DEFAULT true,
    configuration  JSONB            NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ      NOT NULL DEFAULT now(),

    PRIMARY KEY (workspace_id, module),

    CONSTRAINT workspace_modules_config_size
        CHECK (pg_column_size(configuration) <= 8192)
);

COMMENT ON TABLE workspace_modules IS
  'Enabled modules per customer workspace. Mutations via RPC only.';

CREATE TRIGGER trg_workspace_modules_updated_at
    BEFORE UPDATE ON workspace_modules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE workspace_modules ENABLE ROW LEVEL SECURITY;

-- Platform owner/admin can see all modules
CREATE POLICY workspace_modules_platform_select ON workspace_modules
    FOR SELECT USING (
        has_platform_role(ARRAY['platform_owner'::platform_role, 'platform_admin'::platform_role])
    );

-- Platform support can see modules (read-only support visibility)
CREATE POLICY workspace_modules_support_select ON workspace_modules
    FOR SELECT USING (
        has_platform_role(ARRAY['platform_support'::platform_role])
    );

-- Customer workspace members can see their own enabled modules
CREATE POLICY workspace_modules_member_select ON workspace_modules
    FOR SELECT USING (
        enabled = true
        AND is_workspace_member(workspace_id)
    );

-- NO INSERT/UPDATE/DELETE policies — all mutations via update_workspace_modules RPC


-- ############################################################################
-- 6. PROVISION CUSTOMER WORKSPACE RPC
-- ############################################################################

CREATE OR REPLACE FUNCTION provision_customer_workspace(
    p_name           TEXT,
    p_slug           TEXT,
    p_customer_name  TEXT,
    p_customer_email TEXT,
    p_modules        workspace_module[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id    UUID;
    v_caller_role  platform_role;
    v_workspace_id UUID;
    v_mod          workspace_module;
    v_seen_modules workspace_module[] := '{}';
BEGIN
    -- 1. Authentication
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 2. Platform role check
    SELECT role INTO v_caller_role
    FROM platform_users
    WHERE user_id = v_caller_id AND is_active = true;

    IF v_caller_role IS NULL OR v_caller_role NOT IN ('platform_owner', 'platform_admin') THEN
        RAISE EXCEPTION 'Insufficient platform privileges';
    END IF;

    -- 3. Validate workspace name
    IF p_name IS NULL OR length(trim(p_name)) < 2 THEN
        RAISE EXCEPTION 'Workspace name must be at least 2 characters';
    END IF;
    IF length(trim(p_name)) > 100 THEN
        RAISE EXCEPTION 'Workspace name must not exceed 100 characters';
    END IF;

    -- 4. Validate slug
    IF p_slug IS NULL OR p_slug !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' THEN
        RAISE EXCEPTION 'Invalid slug format. Must be 3-63 lowercase alphanumeric characters or hyphens.';
    END IF;
    IF EXISTS (SELECT 1 FROM workspaces WHERE slug = p_slug) THEN
        RAISE EXCEPTION 'Slug "%" is already taken', p_slug;
    END IF;

    -- 5. Validate customer name
    IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 1 THEN
        RAISE EXCEPTION 'Customer name is required';
    END IF;
    IF length(trim(p_customer_name)) > 200 THEN
        RAISE EXCEPTION 'Customer name must not exceed 200 characters';
    END IF;

    -- 6. Validate customer email
    IF p_customer_email IS NULL OR p_customer_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'Valid customer email is required';
    END IF;
    IF length(p_customer_email) > 254 THEN
        RAISE EXCEPTION 'Customer email must not exceed 254 characters';
    END IF;

    -- 7. Validate modules: non-empty, no duplicates, all supported
    IF p_modules IS NULL OR array_length(p_modules, 1) IS NULL OR array_length(p_modules, 1) = 0 THEN
        RAISE EXCEPTION 'At least one module must be specified';
    END IF;

    FOREACH v_mod IN ARRAY p_modules LOOP
        IF v_mod = ANY(v_seen_modules) THEN
            RAISE EXCEPTION 'Duplicate module: %', v_mod;
        END IF;
        v_seen_modules := array_append(v_seen_modules, v_mod);
    END LOOP;

    -- 8. Create workspace
    INSERT INTO workspaces (
        name, slug, owner_id, status,
        provisioned_by, provisioned_at,
        customer_name, customer_email, metadata
    ) VALUES (
        trim(p_name), p_slug, NULL, 'provisioning',
        v_caller_id, now(),
        trim(p_customer_name), lower(trim(p_customer_email)), '{}'::JSONB
    )
    RETURNING id INTO v_workspace_id;

    -- 9. Create module rows
    FOREACH v_mod IN ARRAY p_modules LOOP
        INSERT INTO workspace_modules (workspace_id, module, enabled, configuration)
        VALUES (v_workspace_id, v_mod, true, '{}'::JSONB);
    END LOOP;

    -- 10. Audit log
    INSERT INTO audit_logs (workspace_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (
        v_workspace_id, v_caller_id,
        'workspace.provisioned', 'workspace', v_workspace_id,
        jsonb_build_object(
            'name', trim(p_name),
            'slug', p_slug,
            'customer_name', trim(p_customer_name),
            'customer_email', lower(trim(p_customer_email)),
            'modules', to_jsonb(p_modules)
        )
    );

    -- 11. Return minimal info
    RETURN jsonb_build_object(
        'id', v_workspace_id,
        'name', trim(p_name),
        'slug', p_slug,
        'status', 'provisioning'
    );
END;
$$;

REVOKE ALL ON FUNCTION provision_customer_workspace(TEXT, TEXT, TEXT, TEXT, workspace_module[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION provision_customer_workspace(TEXT, TEXT, TEXT, TEXT, workspace_module[]) TO authenticated;


-- ############################################################################
-- 7. WORKSPACE LIFECYCLE RPCs
-- ############################################################################

-- ---------------------------------------------------------------------------
-- activate_workspace
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION activate_workspace(p_workspace_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id   UUID;
    v_caller_role platform_role;
    v_ws_status   workspace_status;
    v_owner_id    UUID;
    v_has_owner   BOOLEAN;
    v_has_module  BOOLEAN;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    SELECT role INTO v_caller_role FROM platform_users
    WHERE user_id = v_caller_id AND is_active = true;
    IF v_caller_role IS NULL OR v_caller_role NOT IN ('platform_owner', 'platform_admin') THEN
        RAISE EXCEPTION 'Insufficient platform privileges';
    END IF;

    -- Lock workspace row
    SELECT status, owner_id INTO v_ws_status, v_owner_id
    FROM workspaces WHERE id = p_workspace_id FOR UPDATE;

    IF v_ws_status IS NULL THEN
        RAISE EXCEPTION 'Workspace not found';
    END IF;

    -- Valid source states: provisioning, suspended
    IF v_ws_status NOT IN ('provisioning', 'suspended') THEN
        RAISE EXCEPTION 'Cannot activate workspace with status: %', v_ws_status;
    END IF;

    -- owner_id must be set
    IF v_owner_id IS NULL THEN
        RAISE EXCEPTION 'Cannot activate: workspace has no assigned owner. Complete customer invitation first.';
    END IF;

    -- Matching owner membership must exist
    SELECT EXISTS (
        SELECT 1 FROM workspace_members
        WHERE workspace_id = p_workspace_id
          AND user_id = v_owner_id
          AND role = 'owner'
    ) INTO v_has_owner;

    IF NOT v_has_owner THEN
        RAISE EXCEPTION 'Cannot activate: no owner membership record found for workspace owner';
    END IF;

    -- At least one enabled module
    SELECT EXISTS (
        SELECT 1 FROM workspace_modules
        WHERE workspace_id = p_workspace_id AND enabled = true
    ) INTO v_has_module;

    IF NOT v_has_module THEN
        RAISE EXCEPTION 'Cannot activate: workspace must have at least one enabled module';
    END IF;

    -- Transition
    UPDATE workspaces
    SET status = 'active', updated_at = now()
    WHERE id = p_workspace_id;

    INSERT INTO audit_logs (workspace_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (p_workspace_id, v_caller_id, 'workspace.activated', 'workspace', p_workspace_id,
        jsonb_build_object('from_status', v_ws_status));
END;
$$;

REVOKE ALL ON FUNCTION activate_workspace(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION activate_workspace(UUID) TO authenticated;


-- ---------------------------------------------------------------------------
-- suspend_workspace
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION suspend_workspace(p_workspace_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id   UUID;
    v_caller_role platform_role;
    v_ws_status   workspace_status;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    SELECT role INTO v_caller_role FROM platform_users
    WHERE user_id = v_caller_id AND is_active = true;
    IF v_caller_role IS NULL OR v_caller_role NOT IN ('platform_owner', 'platform_admin') THEN
        RAISE EXCEPTION 'Insufficient platform privileges';
    END IF;

    SELECT status INTO v_ws_status FROM workspaces
    WHERE id = p_workspace_id FOR UPDATE;

    IF v_ws_status IS NULL THEN
        RAISE EXCEPTION 'Workspace not found';
    END IF;

    IF v_ws_status != 'active' THEN
        RAISE EXCEPTION 'Only active workspaces can be suspended. Current status: %', v_ws_status;
    END IF;

    UPDATE workspaces
    SET status = 'suspended', suspended_at = now(), updated_at = now()
    WHERE id = p_workspace_id;

    INSERT INTO audit_logs (workspace_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (p_workspace_id, v_caller_id, 'workspace.suspended', 'workspace', p_workspace_id, '{}'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION suspend_workspace(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION suspend_workspace(UUID) TO authenticated;


-- ---------------------------------------------------------------------------
-- archive_workspace
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION archive_workspace(p_workspace_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id   UUID;
    v_caller_role platform_role;
    v_ws_status   workspace_status;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    SELECT role INTO v_caller_role FROM platform_users
    WHERE user_id = v_caller_id AND is_active = true;
    -- Only platform_owner can archive
    IF v_caller_role IS NULL OR v_caller_role != 'platform_owner' THEN
        RAISE EXCEPTION 'Only platform owners can archive workspaces';
    END IF;

    SELECT status INTO v_ws_status FROM workspaces
    WHERE id = p_workspace_id FOR UPDATE;

    IF v_ws_status IS NULL THEN
        RAISE EXCEPTION 'Workspace not found';
    END IF;

    IF v_ws_status NOT IN ('active', 'suspended') THEN
        RAISE EXCEPTION 'Only active or suspended workspaces can be archived. Current status: %', v_ws_status;
    END IF;

    UPDATE workspaces
    SET status = 'archived', archived_at = now(), updated_at = now()
    WHERE id = p_workspace_id;

    INSERT INTO audit_logs (workspace_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (p_workspace_id, v_caller_id, 'workspace.archived', 'workspace', p_workspace_id,
        jsonb_build_object('from_status', v_ws_status));
END;
$$;

REVOKE ALL ON FUNCTION archive_workspace(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION archive_workspace(UUID) TO authenticated;


-- ---------------------------------------------------------------------------
-- retry_workspace_provisioning
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION retry_workspace_provisioning(p_workspace_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id   UUID;
    v_caller_role platform_role;
    v_ws_status   workspace_status;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    SELECT role INTO v_caller_role FROM platform_users
    WHERE user_id = v_caller_id AND is_active = true;
    IF v_caller_role IS NULL OR v_caller_role NOT IN ('platform_owner', 'platform_admin') THEN
        RAISE EXCEPTION 'Insufficient platform privileges';
    END IF;

    SELECT status INTO v_ws_status FROM workspaces
    WHERE id = p_workspace_id FOR UPDATE;

    IF v_ws_status IS NULL THEN
        RAISE EXCEPTION 'Workspace not found';
    END IF;

    IF v_ws_status != 'failed' THEN
        RAISE EXCEPTION 'Only failed workspaces can be retried. Current status: %', v_ws_status;
    END IF;

    UPDATE workspaces
    SET status = 'provisioning', updated_at = now()
    WHERE id = p_workspace_id;

    INSERT INTO audit_logs (workspace_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (p_workspace_id, v_caller_id, 'workspace.provisioning_retried', 'workspace', p_workspace_id, '{}'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION retry_workspace_provisioning(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION retry_workspace_provisioning(UUID) TO authenticated;


-- ############################################################################
-- 8. UPDATE WORKSPACE MODULES RPC
-- ############################################################################

CREATE OR REPLACE FUNCTION update_workspace_modules(
    p_workspace_id UUID,
    p_modules      JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id   UUID;
    v_caller_role platform_role;
    v_ws_status   workspace_status;
    v_entry       JSONB;
    v_module_name TEXT;
    v_enabled     BOOLEAN;
    v_config      JSONB;
    v_config_key  TEXT;
    v_allowed_config_keys TEXT[] := ARRAY['theme', 'plan', 'limits', 'features'];
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    SELECT role INTO v_caller_role FROM platform_users
    WHERE user_id = v_caller_id AND is_active = true;
    IF v_caller_role IS NULL OR v_caller_role NOT IN ('platform_owner', 'platform_admin') THEN
        RAISE EXCEPTION 'Insufficient platform privileges';
    END IF;

    -- Verify workspace exists and lock
    SELECT status INTO v_ws_status FROM workspaces
    WHERE id = p_workspace_id FOR UPDATE;
    IF v_ws_status IS NULL THEN
        RAISE EXCEPTION 'Workspace not found';
    END IF;

    -- Validate p_modules is a JSON array
    IF p_modules IS NULL OR jsonb_typeof(p_modules) != 'array' THEN
        RAISE EXCEPTION 'modules must be a JSON array';
    END IF;

    IF jsonb_array_length(p_modules) = 0 THEN
        RAISE EXCEPTION 'At least one module update is required';
    END IF;

    -- Process each module entry
    FOR v_entry IN SELECT * FROM jsonb_array_elements(p_modules) LOOP
        -- Validate structure
        v_module_name := v_entry ->> 'module';
        IF v_module_name IS NULL THEN
            RAISE EXCEPTION 'Each module entry must have a "module" field';
        END IF;

        -- Validate module is a known enum value
        BEGIN
            PERFORM v_module_name::workspace_module;
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'Unknown module: %', v_module_name;
        END;

        -- Validate enabled field
        IF v_entry ? 'enabled' THEN
            IF jsonb_typeof(v_entry -> 'enabled') != 'boolean' THEN
                RAISE EXCEPTION 'enabled must be a boolean for module: %', v_module_name;
            END IF;
            v_enabled := (v_entry ->> 'enabled')::BOOLEAN;
        ELSE
            v_enabled := NULL; -- no change
        END IF;

        -- Validate configuration
        IF v_entry ? 'configuration' THEN
            v_config := v_entry -> 'configuration';
            IF jsonb_typeof(v_config) != 'object' THEN
                RAISE EXCEPTION 'configuration must be an object for module: %', v_module_name;
            END IF;
            IF pg_column_size(v_config) > 8192 THEN
                RAISE EXCEPTION 'configuration too large for module: %', v_module_name;
            END IF;
            -- Reject unknown configuration keys
            FOR v_config_key IN SELECT jsonb_object_keys(v_config) LOOP
                IF NOT (v_config_key = ANY(v_allowed_config_keys)) THEN
                    RAISE EXCEPTION 'Unknown configuration key "%" for module: %', v_config_key, v_module_name;
                END IF;
            END LOOP;
        ELSE
            v_config := NULL; -- no change
        END IF;

        -- Upsert the module row
        INSERT INTO workspace_modules (workspace_id, module, enabled, configuration)
        VALUES (
            p_workspace_id,
            v_module_name::workspace_module,
            COALESCE(v_enabled, true),
            COALESCE(v_config, '{}'::JSONB)
        )
        ON CONFLICT (workspace_id, module) DO UPDATE SET
            enabled = COALESCE(v_enabled, workspace_modules.enabled),
            configuration = COALESCE(v_config, workspace_modules.configuration),
            updated_at = now();
    END LOOP;

    -- Audit
    INSERT INTO audit_logs (workspace_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (p_workspace_id, v_caller_id, 'workspace.modules_updated', 'workspace', p_workspace_id,
        jsonb_build_object('modules', p_modules));
END;
$$;

REVOKE ALL ON FUNCTION update_workspace_modules(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_workspace_modules(UUID, JSONB) TO authenticated;


-- ############################################################################
-- 9. PLATFORM ROLE MANAGEMENT RPCs
-- ############################################################################

-- ---------------------------------------------------------------------------
-- add_platform_user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION add_platform_user(p_user_id UUID, p_role platform_role)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- Only platform_owner can manage platform users
    IF NOT EXISTS (
        SELECT 1 FROM platform_users
        WHERE user_id = v_caller_id AND role = 'platform_owner' AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Only platform owners can add platform users';
    END IF;

    -- Cannot add yourself (you're already a platform user)
    IF v_caller_id = p_user_id THEN
        RAISE EXCEPTION 'Cannot add yourself as a platform user';
    END IF;

    -- Target user must exist in auth.users
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
        RAISE EXCEPTION 'Target user does not exist';
    END IF;

    -- Check if already a platform user
    IF EXISTS (SELECT 1 FROM platform_users WHERE user_id = p_user_id) THEN
        RAISE EXCEPTION 'User is already a platform user';
    END IF;

    INSERT INTO platform_users (user_id, role, is_active, created_by, created_at, updated_at)
    VALUES (p_user_id, p_role, true, v_caller_id, now(), now());

    -- Audit: use a workspace-independent audit. We'll use a NULL workspace_id sentinel.
    -- Since audit_logs requires workspace_id NOT NULL, we create a platform-level audit
    -- by inserting directly with a known sentinel pattern.
    -- For platform-level audits, we skip the workspace_id constraint by using the
    -- platform_users table's own audit trail (created_by + timestamps).
    -- The API layer will record platform audit events separately.
END;
$$;

REVOKE ALL ON FUNCTION add_platform_user(UUID, platform_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION add_platform_user(UUID, platform_role) TO authenticated;


-- ---------------------------------------------------------------------------
-- update_platform_user_role
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_platform_user_role(p_user_id UUID, p_role platform_role)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id  UUID;
    v_old_role   platform_role;
    v_is_active  BOOLEAN;
    v_owner_count INTEGER;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- Only platform_owner can manage roles
    IF NOT EXISTS (
        SELECT 1 FROM platform_users
        WHERE user_id = v_caller_id AND role = 'platform_owner' AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Only platform owners can modify platform roles';
    END IF;

    -- Cannot modify own role
    IF v_caller_id = p_user_id THEN
        RAISE EXCEPTION 'Cannot modify your own platform role';
    END IF;

    -- Lock and fetch target
    SELECT role, is_active INTO v_old_role, v_is_active
    FROM platform_users WHERE user_id = p_user_id FOR UPDATE;

    IF v_old_role IS NULL THEN
        RAISE EXCEPTION 'Target is not a platform user';
    END IF;

    -- If demoting an owner, check they are not the last active owner
    IF v_old_role = 'platform_owner' AND p_role != 'platform_owner' THEN
        SELECT count(*) INTO v_owner_count
        FROM platform_users
        WHERE role = 'platform_owner' AND is_active = true;

        IF v_owner_count <= 1 THEN
            RAISE EXCEPTION 'Cannot demote the last active platform owner';
        END IF;
    END IF;

    UPDATE platform_users SET role = p_role, updated_at = now()
    WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION update_platform_user_role(UUID, platform_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_platform_user_role(UUID, platform_role) TO authenticated;


-- ---------------------------------------------------------------------------
-- deactivate_platform_user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deactivate_platform_user(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id   UUID;
    v_target_role platform_role;
    v_is_active   BOOLEAN;
    v_owner_count INTEGER;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- Only platform_owner can deactivate
    IF NOT EXISTS (
        SELECT 1 FROM platform_users
        WHERE user_id = v_caller_id AND role = 'platform_owner' AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Only platform owners can deactivate platform users';
    END IF;

    -- Cannot deactivate self
    IF v_caller_id = p_user_id THEN
        RAISE EXCEPTION 'Cannot deactivate yourself';
    END IF;

    -- Lock and fetch target
    SELECT role, is_active INTO v_target_role, v_is_active
    FROM platform_users WHERE user_id = p_user_id FOR UPDATE;

    IF v_target_role IS NULL THEN
        RAISE EXCEPTION 'Target is not a platform user';
    END IF;

    IF NOT v_is_active THEN
        RAISE EXCEPTION 'User is already deactivated';
    END IF;

    -- If deactivating an owner, check they are not the last
    IF v_target_role = 'platform_owner' THEN
        SELECT count(*) INTO v_owner_count
        FROM platform_users
        WHERE role = 'platform_owner' AND is_active = true;

        IF v_owner_count <= 1 THEN
            RAISE EXCEPTION 'Cannot deactivate the last active platform owner';
        END IF;
    END IF;

    UPDATE platform_users SET is_active = false, updated_at = now()
    WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION deactivate_platform_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION deactivate_platform_user(UUID) TO authenticated;


-- ############################################################################
-- 10. REVOKE SELF-SERVICE WORKSPACE CREATION
-- ############################################################################

-- The function is preserved but no browser user can call it.
REVOKE EXECUTE ON FUNCTION create_workspace_with_owner(TEXT, TEXT) FROM authenticated;


-- ############################################################################
-- 11. PLATFORM WORKSPACE VISIBILITY
-- ############################################################################

-- Platform users need to see all workspaces for the agency control centre.
-- This supplements the existing workspaces_select policy which only allows
-- workspace members to see their own workspaces.

CREATE POLICY workspaces_platform_select ON workspaces
    FOR SELECT USING (is_platform_user());


-- ############################################################################
-- 12. MIGRATE EXISTING WORKSPACES
-- ############################################################################

-- Mark all existing workspaces as active with pre-platform migration metadata.
-- owner_id and memberships are preserved unchanged.
UPDATE workspaces
SET metadata = jsonb_build_object('migration_source', 'pre_platform')
WHERE metadata = '{}'::JSONB;

-- Note: status defaults to 'active' via column default, so existing rows
-- already have status = 'active'.


-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
