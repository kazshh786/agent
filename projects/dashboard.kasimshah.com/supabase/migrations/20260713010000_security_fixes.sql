-- ============================================================================
-- SUPABASE MIGRATION 20260713010000 – Security Fixes
-- ============================================================================
-- Addresses security review failures:
-- 1. Enforce tenant consistency on brands/projects
-- 2. Drop insecure broad RLS policies
-- 3. Implement secure, locked RPCs for membership and audit logs

-- ---------------------------------------------------------------------------
-- 1. Tenant Consistency (Brands/Projects)
-- ---------------------------------------------------------------------------
DO $$ 
BEGIN 
    IF EXISTS (
        SELECT 1 FROM projects p 
        JOIN brands b ON p.brand_id = b.id 
        WHERE p.workspace_id != b.workspace_id
    ) THEN 
        RAISE EXCEPTION 'Cross-workspace brand references detected. Fix before migrating.'; 
    END IF; 
END $$;

ALTER TABLE brands ADD CONSTRAINT brands_workspace_id_id_key UNIQUE (workspace_id, id);

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_brand_id_fkey;
ALTER TABLE projects ADD CONSTRAINT projects_workspace_brand_fkey 
    FOREIGN KEY (workspace_id, brand_id) REFERENCES brands(workspace_id, id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2. Drop Insecure RLS Policies & Restrict Audit Logs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS workspaces_insert ON workspaces;
DROP POLICY IF EXISTS workspace_members_insert ON workspace_members;
DROP POLICY IF EXISTS workspace_members_update ON workspace_members;
DROP POLICY IF EXISTS workspace_members_delete ON workspace_members;
DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;

DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT 
    USING (has_workspace_role(workspace_id, ARRAY['owner'::workspace_role, 'admin'::workspace_role]));

-- ---------------------------------------------------------------------------
-- 3. Secure Audit Logging RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION write_audit_log(
    p_workspace_id UUID, 
    p_action TEXT, 
    p_entity_type TEXT, 
    p_entity_id UUID, 
    p_metadata JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF NOT is_workspace_member(p_workspace_id) THEN
        RAISE EXCEPTION 'Not a member of this workspace';
    END IF;

    INSERT INTO audit_logs (workspace_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (p_workspace_id, v_actor_id, p_action, p_entity_type, p_entity_id, COALESCE(p_metadata, '{}'::JSONB));
END;
$$;

REVOKE ALL ON FUNCTION write_audit_log(UUID, TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION write_audit_log(UUID, TEXT, TEXT, UUID, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Secure Membership RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION invite_workspace_member(p_workspace_id UUID, p_user_id UUID, p_role workspace_role)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role workspace_role;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    SELECT role INTO v_caller_role FROM workspace_members 
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid() FOR UPDATE;

    IF v_caller_role IS NULL THEN RAISE EXCEPTION 'Not a member of this workspace'; END IF;

    IF v_caller_role = 'owner' THEN
        IF p_role = 'owner' THEN RAISE EXCEPTION 'Cannot invite as owner. Use transfer ownership.'; END IF;
    ELSIF v_caller_role = 'admin' THEN
        IF p_role IN ('owner', 'admin') THEN RAISE EXCEPTION 'Admins can only invite editors and viewers'; END IF;
    ELSE
        RAISE EXCEPTION 'Insufficient permissions to invite members';
    END IF;

    INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES (p_workspace_id, p_user_id, p_role);
    
    PERFORM write_audit_log(p_workspace_id, 'member.invited', 'user', p_user_id, jsonb_build_object('role', p_role));
END;
$$;

CREATE OR REPLACE FUNCTION update_workspace_member_role(p_workspace_id UUID, p_user_id UUID, p_role workspace_role)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role workspace_role;
    v_target_role workspace_role;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF auth.uid() = p_user_id THEN RAISE EXCEPTION 'Cannot modify your own role'; END IF;

    SELECT role INTO v_caller_role FROM workspace_members 
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid() FOR UPDATE;
    
    SELECT role INTO v_target_role FROM workspace_members 
    WHERE workspace_id = p_workspace_id AND user_id = p_user_id FOR UPDATE;

    IF v_caller_role IS NULL OR v_target_role IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;

    IF v_caller_role = 'owner' THEN
        IF p_role = 'owner' THEN RAISE EXCEPTION 'Use transfer_workspace_ownership to promote to owner'; END IF;
        IF v_target_role = 'owner' THEN RAISE EXCEPTION 'Cannot modify another owner''s role directly'; END IF;
    ELSIF v_caller_role = 'admin' THEN
        IF v_target_role IN ('owner', 'admin') THEN RAISE EXCEPTION 'Admins cannot modify owners or admins'; END IF;
        IF p_role IN ('owner', 'admin') THEN RAISE EXCEPTION 'Admins cannot promote to owner or admin'; END IF;
    ELSE
        RAISE EXCEPTION 'Insufficient permissions';
    END IF;

    UPDATE workspace_members SET role = p_role WHERE workspace_id = p_workspace_id AND user_id = p_user_id;
    
    PERFORM write_audit_log(p_workspace_id, 'member.updated', 'user', p_user_id, jsonb_build_object('old_role', v_target_role, 'new_role', p_role));
END;
$$;

CREATE OR REPLACE FUNCTION remove_workspace_member(p_workspace_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role workspace_role;
    v_target_role workspace_role;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    SELECT role INTO v_caller_role FROM workspace_members 
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid() FOR UPDATE;
    
    SELECT role INTO v_target_role FROM workspace_members 
    WHERE workspace_id = p_workspace_id AND user_id = p_user_id FOR UPDATE;

    IF v_caller_role IS NULL OR v_target_role IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;

    IF auth.uid() = p_user_id THEN
        IF v_target_role = 'owner' THEN
            IF (SELECT count(*) FROM workspace_members WHERE workspace_id = p_workspace_id AND role = 'owner') <= 1 THEN
                RAISE EXCEPTION 'Cannot leave as the final owner';
            END IF;
        END IF;
    ELSE
        IF v_caller_role = 'owner' THEN
            IF v_target_role = 'owner' THEN RAISE EXCEPTION 'Owners cannot remove other owners'; END IF;
        ELSIF v_caller_role = 'admin' THEN
            IF v_target_role IN ('owner', 'admin') THEN RAISE EXCEPTION 'Admins cannot remove owners or admins'; END IF;
        ELSE
            RAISE EXCEPTION 'Insufficient permissions';
        END IF;
    END IF;

    DELETE FROM workspace_members WHERE workspace_id = p_workspace_id AND user_id = p_user_id;
    
    PERFORM write_audit_log(p_workspace_id, 'member.removed', 'user', p_user_id, '{}'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION transfer_workspace_ownership(p_workspace_id UUID, p_new_owner_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role workspace_role;
    v_target_role workspace_role;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    SELECT role INTO v_caller_role FROM workspace_members 
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid() FOR UPDATE;
    
    SELECT role INTO v_target_role FROM workspace_members 
    WHERE workspace_id = p_workspace_id AND user_id = p_new_owner_id FOR UPDATE;

    IF v_caller_role != 'owner' THEN RAISE EXCEPTION 'Only owners can transfer ownership'; END IF;
    IF v_target_role IS NULL THEN RAISE EXCEPTION 'Target user must already be a member'; END IF;

    UPDATE workspace_members SET role = 'owner' WHERE workspace_id = p_workspace_id AND user_id = p_new_owner_id;
    UPDATE workspace_members SET role = 'admin' WHERE workspace_id = p_workspace_id AND user_id = auth.uid();
    UPDATE workspaces SET owner_id = p_new_owner_id WHERE id = p_workspace_id;

    PERFORM write_audit_log(p_workspace_id, 'workspace.ownership_transferred', 'workspace', p_workspace_id, jsonb_build_object('from', auth.uid(), 'to', p_new_owner_id));
END;
$$;

REVOKE ALL ON FUNCTION invite_workspace_member(UUID, UUID, workspace_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION invite_workspace_member(UUID, UUID, workspace_role) TO authenticated;
REVOKE ALL ON FUNCTION update_workspace_member_role(UUID, UUID, workspace_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_workspace_member_role(UUID, UUID, workspace_role) TO authenticated;
REVOKE ALL ON FUNCTION remove_workspace_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION remove_workspace_member(UUID, UUID) TO authenticated;
REVOKE ALL ON FUNCTION transfer_workspace_ownership(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transfer_workspace_ownership(UUID, UUID) TO authenticated;

-- Also update create_workspace_with_owner to use write_audit_log (wait, create_workspace_with_owner is also SECURITY DEFINER, so it can just INSERT directly, but we'll update it for consistency and to enforce search_path).
CREATE OR REPLACE FUNCTION create_workspace_with_owner(p_name TEXT, p_slug TEXT)
RETURNS workspaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_workspace workspaces;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_name IS NULL OR p_name = '' THEN
        RAISE EXCEPTION 'Workspace name cannot be empty';
    END IF;

    IF p_slug !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' THEN
        RAISE EXCEPTION 'Invalid slug format';
    END IF;

    IF EXISTS (SELECT 1 FROM workspaces WHERE slug = p_slug) THEN
        RAISE EXCEPTION 'Slug already in use';
    END IF;

    INSERT INTO workspaces (name, slug, owner_id)
    VALUES (p_name, p_slug, v_user_id)
    RETURNING * INTO v_workspace;

    INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES (v_workspace.id, v_user_id, 'owner');

    -- Insert directly instead of calling write_audit_log to avoid recursion or permission issues if write_audit_log relies on membership existing which it does, but we are inside a transaction.
    INSERT INTO audit_logs (workspace_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (v_workspace.id, v_user_id, 'workspace.created', 'workspace', v_workspace.id, '{}'::JSONB);

    RETURN v_workspace;
END;
$$;
