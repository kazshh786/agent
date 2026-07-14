-- ============================================================================
-- SUPABASE MIGRATION – Multi-Tenant Agency Dashboard
-- Generated: 2026-07-13
-- ============================================================================
-- This migration creates the full schema for a production-ready, multi-tenant
-- agency dashboard backed by Supabase Auth.  It covers:
--   1. Custom ENUM types
--   2. Tables (with UUID PKs, timestamps, constraints)
--   3. Indexes for query performance
--   4. Trigger functions (updated_at, profile auto-creation)
--   5. SQL helper functions for RLS
--   6. SECURITY DEFINER RPC for workspace creation
--   7. Row-Level Security policies on every table
-- ============================================================================


-- ############################################################################
-- 1. ENUMS
-- ############################################################################

CREATE TYPE workspace_role AS ENUM ('owner', 'admin', 'editor', 'viewer');

CREATE TYPE project_type AS ENUM ('website', 'landing_page', 'funnel', 'social_campaign');

CREATE TYPE project_status AS ENUM ('draft', 'active', 'paused', 'archived');


-- ############################################################################
-- 2. TABLES
-- ############################################################################

-- ---------------------------------------------------------------------------
-- profiles – mirrors auth.users; auto-populated via trigger
-- ---------------------------------------------------------------------------
CREATE TABLE profiles (
    id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name   TEXT,
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE profiles IS 'Public profile data for every authenticated user.';

-- ---------------------------------------------------------------------------
-- workspaces – top-level tenant container
-- ---------------------------------------------------------------------------
CREATE TABLE workspaces (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    slug        TEXT        NOT NULL UNIQUE,
    owner_id    UUID        NOT NULL REFERENCES auth.users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Slug must be 3-63 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphen
    CONSTRAINT workspaces_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$')
);

COMMENT ON TABLE workspaces IS 'Tenant workspace. All resources belong to exactly one workspace.';

-- ---------------------------------------------------------------------------
-- workspace_members – many-to-many join with role
-- ---------------------------------------------------------------------------
CREATE TABLE workspace_members (
    workspace_id UUID           NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      UUID           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role         workspace_role NOT NULL DEFAULT 'viewer',
    created_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),

    PRIMARY KEY (workspace_id, user_id)
    -- The composite PK already enforces uniqueness on (workspace_id, user_id).
);

COMMENT ON TABLE workspace_members IS 'Associates users with workspaces and assigns a role.';

-- ---------------------------------------------------------------------------
-- brands – client brands within a workspace
-- ---------------------------------------------------------------------------
CREATE TABLE brands (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id     UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name             TEXT        NOT NULL,
    website_url      TEXT,
    primary_colour   TEXT,
    secondary_colour TEXT,
    tone_of_voice    TEXT,
    target_audience  TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE brands IS 'Brand profiles containing visual identity and voice guidelines.';

-- ---------------------------------------------------------------------------
-- projects – deliverables linked to a workspace (and optionally a brand)
-- ---------------------------------------------------------------------------
CREATE TABLE projects (
    id                    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id          UUID           NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    brand_id              UUID           REFERENCES brands(id) ON DELETE SET NULL,
    name                  TEXT           NOT NULL,
    type                  project_type   NOT NULL DEFAULT 'website',
    status                project_status NOT NULL DEFAULT 'draft',
    external_project_path TEXT,
    created_by            UUID           NOT NULL REFERENCES auth.users(id),
    created_at            TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ    NOT NULL DEFAULT now()
);

COMMENT ON TABLE projects IS 'Projects (websites, funnels, campaigns, etc.) within a workspace.';

-- ---------------------------------------------------------------------------
-- integration_connections – third-party service connections
-- ---------------------------------------------------------------------------
CREATE TABLE integration_connections (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider            TEXT        NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'pending',
    external_account_id TEXT,
    metadata            JSONB       NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE integration_connections IS 'OAuth / API connections to external providers per workspace.';

-- ---------------------------------------------------------------------------
-- audit_logs – immutable event log (no updated_at)
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    actor_id      UUID        NOT NULL REFERENCES auth.users(id),
    action        TEXT        NOT NULL,
    entity_type   TEXT        NOT NULL,
    entity_id     UUID,
    metadata      JSONB       NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE audit_logs IS 'Immutable audit trail of user actions within a workspace.';


-- ############################################################################
-- 3. INDEXES
-- ############################################################################

-- workspace_members
CREATE INDEX idx_workspace_members_user_id      ON workspace_members(user_id);
CREATE INDEX idx_workspace_members_workspace_id ON workspace_members(workspace_id);

-- brands
CREATE INDEX idx_brands_workspace_id ON brands(workspace_id);

-- projects
CREATE INDEX idx_projects_workspace_id ON projects(workspace_id);
CREATE INDEX idx_projects_brand_id     ON projects(brand_id);
CREATE INDEX idx_projects_created_by   ON projects(created_by);
CREATE INDEX idx_projects_created_at   ON projects(created_at);

-- integration_connections
CREATE INDEX idx_integration_connections_workspace_id ON integration_connections(workspace_id);

-- audit_logs
CREATE INDEX idx_audit_logs_workspace_id ON audit_logs(workspace_id);
CREATE INDEX idx_audit_logs_actor_id     ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_created_at   ON audit_logs(created_at);


-- ############################################################################
-- 4. TRIGGER FUNCTION – auto-update updated_at
-- ############################################################################

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger to every table that carries an updated_at column
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_workspaces_updated_at
    BEFORE UPDATE ON workspaces
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_brands_updated_at
    BEFORE UPDATE ON brands
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_integration_connections_updated_at
    BEFORE UPDATE ON integration_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ############################################################################
-- 5. PROFILE AUTO-CREATION TRIGGER
-- ############################################################################

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data ->> 'full_name'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ############################################################################
-- 6. SQL HELPER FUNCTIONS FOR RLS
-- ############################################################################

-- Returns TRUE if the calling user is a member of the given workspace.
CREATE OR REPLACE FUNCTION is_workspace_member(ws_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM workspace_members
        WHERE workspace_id = ws_id
          AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Returns the role of the calling user within the given workspace (or NULL).
CREATE OR REPLACE FUNCTION get_workspace_role(ws_id UUID)
RETURNS workspace_role AS $$
    SELECT role
    FROM workspace_members
    WHERE workspace_id = ws_id
      AND user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Returns TRUE if the calling user holds one of the allowed roles.
CREATE OR REPLACE FUNCTION has_workspace_role(ws_id UUID, allowed_roles workspace_role[])
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM workspace_members
        WHERE workspace_id = ws_id
          AND user_id = auth.uid()
          AND role = ANY(allowed_roles)
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;


-- ############################################################################
-- 7. SECURITY DEFINER RPC – create_workspace_with_owner
-- ############################################################################

CREATE OR REPLACE FUNCTION create_workspace_with_owner(p_name TEXT, p_slug TEXT)
RETURNS workspaces AS $$
DECLARE
    v_user_id  UUID;
    v_workspace workspaces;
BEGIN
    -- 7a. Derive the calling user
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 7b. Validate name is not empty
    IF p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'Workspace name must not be empty';
    END IF;

    -- 7c. Validate slug format
    IF p_slug !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' THEN
        RAISE EXCEPTION 'Invalid slug format. Must be 3-63 lowercase alphanumeric characters or hyphens, cannot start or end with a hyphen.';
    END IF;

    -- 7d. Check slug uniqueness (explicit, friendly error)
    IF EXISTS (SELECT 1 FROM workspaces WHERE slug = p_slug) THEN
        RAISE EXCEPTION 'Slug "%" is already taken', p_slug;
    END IF;

    -- 7e. Insert the workspace
    INSERT INTO workspaces (name, slug, owner_id)
    VALUES (trim(p_name), p_slug, v_user_id)
    RETURNING * INTO v_workspace;

    -- 7f. Make the caller the owner member
    INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES (v_workspace.id, v_user_id, 'owner');

    -- 7g. Write an audit log entry
    INSERT INTO audit_logs (workspace_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (
        v_workspace.id,
        v_user_id,
        'workspace.created',
        'workspace',
        v_workspace.id,
        jsonb_build_object('name', v_workspace.name, 'slug', v_workspace.slug)
    );

    RETURN v_workspace;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- Grant only to authenticated users
GRANT EXECUTE ON FUNCTION create_workspace_with_owner(TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION create_workspace_with_owner(TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION create_workspace_with_owner(TEXT, TEXT) FROM public;


-- ############################################################################
-- 8. ROW LEVEL SECURITY
-- ############################################################################

-- Enable RLS on every table
ALTER TABLE profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces              ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects                ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs              ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- 8.1  profiles
-- ---------------------------------------------------------------------------

CREATE POLICY profiles_select ON profiles
    FOR SELECT USING (id = auth.uid());

CREATE POLICY profiles_update ON profiles
    FOR UPDATE
    USING  (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- ---------------------------------------------------------------------------
-- 8.2  workspaces
-- ---------------------------------------------------------------------------

CREATE POLICY workspaces_select ON workspaces
    FOR SELECT USING (is_workspace_member(id));

CREATE POLICY workspaces_insert ON workspaces
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY workspaces_update ON workspaces
    FOR UPDATE
    USING  (has_workspace_role(id, ARRAY['owner','admin']::workspace_role[]))
    WITH CHECK (has_workspace_role(id, ARRAY['owner','admin']::workspace_role[]));

CREATE POLICY workspaces_delete ON workspaces
    FOR DELETE USING (get_workspace_role(id) = 'owner');

-- ---------------------------------------------------------------------------
-- 8.3  workspace_members
-- ---------------------------------------------------------------------------

CREATE POLICY workspace_members_select ON workspace_members
    FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY workspace_members_insert ON workspace_members
    FOR INSERT WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner','admin']::workspace_role[]));

CREATE POLICY workspace_members_update ON workspace_members
    FOR UPDATE
    USING  (has_workspace_role(workspace_id, ARRAY['owner','admin']::workspace_role[]))
    WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner','admin']::workspace_role[]));

CREATE POLICY workspace_members_delete ON workspace_members
    FOR DELETE
    USING (
        has_workspace_role(workspace_id, ARRAY['owner','admin']::workspace_role[])
        AND role <> 'owner'
    );

-- ---------------------------------------------------------------------------
-- 8.4  brands
-- ---------------------------------------------------------------------------

CREATE POLICY brands_select ON brands
    FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY brands_insert ON brands
    FOR INSERT WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::workspace_role[]));

CREATE POLICY brands_update ON brands
    FOR UPDATE
    USING  (has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::workspace_role[]))
    WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::workspace_role[]));

CREATE POLICY brands_delete ON brands
    FOR DELETE USING (has_workspace_role(workspace_id, ARRAY['owner','admin']::workspace_role[]));

-- ---------------------------------------------------------------------------
-- 8.5  projects
-- ---------------------------------------------------------------------------

CREATE POLICY projects_select ON projects
    FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY projects_insert ON projects
    FOR INSERT WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::workspace_role[]));

CREATE POLICY projects_update ON projects
    FOR UPDATE
    USING  (has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::workspace_role[]))
    WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner','admin','editor']::workspace_role[]));

CREATE POLICY projects_delete ON projects
    FOR DELETE USING (has_workspace_role(workspace_id, ARRAY['owner','admin']::workspace_role[]));

-- ---------------------------------------------------------------------------
-- 8.6  integration_connections
-- ---------------------------------------------------------------------------

CREATE POLICY integration_connections_select ON integration_connections
    FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY integration_connections_insert ON integration_connections
    FOR INSERT WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner','admin']::workspace_role[]));

CREATE POLICY integration_connections_update ON integration_connections
    FOR UPDATE
    USING  (has_workspace_role(workspace_id, ARRAY['owner','admin']::workspace_role[]))
    WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner','admin']::workspace_role[]));

CREATE POLICY integration_connections_delete ON integration_connections
    FOR DELETE USING (has_workspace_role(workspace_id, ARRAY['owner','admin']::workspace_role[]));

-- ---------------------------------------------------------------------------
-- 8.7  audit_logs (immutable – no UPDATE or DELETE policies)
-- ---------------------------------------------------------------------------

CREATE POLICY audit_logs_select ON audit_logs
    FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY audit_logs_insert ON audit_logs
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- No UPDATE or DELETE policies – audit logs are immutable.


-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
