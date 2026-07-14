-- Migration 20260714020000_customer_invitations.sql

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

CREATE TYPE public.invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');

CREATE TABLE public.workspace_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    email CITEXT NOT NULL,
    role public.workspace_role NOT NULL,
    token_hash TEXT NOT NULL,
    status public.invitation_status NOT NULL DEFAULT 'pending',
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valid_status_dates CHECK (
        (status = 'pending' AND accepted_at IS NULL AND revoked_at IS NULL) OR
        (status = 'accepted' AND accepted_at IS NOT NULL AND revoked_at IS NULL) OR
        (status = 'revoked' AND revoked_at IS NOT NULL AND accepted_at IS NULL) OR
        (status = 'expired' AND accepted_at IS NULL AND revoked_at IS NULL)
    ),
    CONSTRAINT workspace_invitations_workspace_tenant_check CHECK (
        workspace_id IS NOT NULL
    )
);

CREATE UNIQUE INDEX idx_workspace_invitations_token_hash ON public.workspace_invitations(token_hash);
CREATE UNIQUE INDEX idx_workspace_invitations_pending_email ON public.workspace_invitations(workspace_id, email) WHERE status = 'pending';

ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_workspace_invitations_updated_at
BEFORE UPDATE ON public.workspace_invitations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- RPCs for invitations
-- 1. Create Invitation
CREATE OR REPLACE FUNCTION public.create_workspace_invitation(
    p_workspace_id UUID,
    p_email CITEXT,
    p_role public.workspace_role,
    p_token_hash TEXT,
    p_expires_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_ws_role public.workspace_role;
    v_caller_platform_role public.platform_role;
    v_workspace_owner_exists BOOLEAN;
    v_new_invitation_id UUID;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Check caller platform role
    SELECT role INTO v_caller_platform_role FROM public.platform_users WHERE user_id = v_caller_id AND is_active = TRUE;
    
    -- Check caller workspace role
    SELECT role INTO v_caller_ws_role FROM public.workspace_members WHERE workspace_id = p_workspace_id AND user_id = v_caller_id;

    -- Permission logic:
    IF p_role = 'owner' THEN
        SELECT (owner_id IS NOT NULL) INTO v_workspace_owner_exists FROM public.workspaces WHERE id = p_workspace_id;
        IF v_workspace_owner_exists THEN
            IF v_caller_ws_role = 'owner' THEN
                -- Permitted to invite co-owner
                NULL;
            ELSE
                RAISE EXCEPTION 'Cannot overwrite existing owner or unauthorized';
            END IF;
        ELSE
            IF v_caller_platform_role IN ('platform_owner', 'platform_admin') THEN
                -- Permitted to invite initial owner
                NULL;
            ELSE
                RAISE EXCEPTION 'Unauthorized to invite initial owner';
            END IF;
        END IF;
    ELSIF p_role IN ('admin', 'editor', 'viewer') THEN
        IF v_caller_ws_role IN ('owner', 'admin') THEN
            -- Permitted
            NULL;
        ELSIF v_caller_platform_role IN ('platform_owner', 'platform_admin') THEN
            -- Permitted
            NULL;
        ELSE
            RAISE EXCEPTION 'Unauthorized to invite members';
        END IF;
    ELSE
        RAISE EXCEPTION 'Invalid role';
    END IF;

    -- Revoke existing pending invitations for this email/workspace
    UPDATE public.workspace_invitations
    SET status = 'revoked', revoked_at = now(), revoked_by = v_caller_id
    WHERE workspace_id = p_workspace_id AND email = p_email AND status = 'pending';

    -- Insert new invitation
    INSERT INTO public.workspace_invitations (
        workspace_id, email, role, token_hash, status, invited_by, expires_at
    ) VALUES (
        p_workspace_id, p_email, p_role, p_token_hash, 'pending', v_caller_id, p_expires_at
    ) RETURNING id INTO v_new_invitation_id;

    -- Log audit event (without token hash)
    INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (p_workspace_id, v_caller_id, 'invitation_created', 'workspace_invitations', v_new_invitation_id, jsonb_build_object('email', p_email, 'role', p_role));

    RETURN v_new_invitation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_workspace_invitation(UUID, CITEXT, public.workspace_role, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_workspace_invitation(UUID, CITEXT, public.workspace_role, TEXT, TIMESTAMPTZ) TO authenticated;

-- 2. Accept Invitation
CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(
    p_token_hash TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_email CITEXT;
    v_invitation RECORD;
    v_workspace RECORD;
    v_existing_member BOOLEAN;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get verified authenticated email from auth.users
    SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id AND email_confirmed_at IS NOT NULL;
    IF v_caller_email IS NULL THEN
        RAISE EXCEPTION 'Email not verified or not found';
    END IF;

    -- Lock the pending invitation
    SELECT * INTO v_invitation 
    FROM public.workspace_invitations 
    WHERE token_hash = p_token_hash 
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation not found or locked';
    END IF;

    IF v_invitation.status != 'pending' THEN
        RAISE EXCEPTION 'Invitation is no longer pending';
    END IF;

    IF v_invitation.expires_at < now() THEN
        UPDATE public.workspace_invitations SET status = 'expired' WHERE id = v_invitation.id;
        RAISE EXCEPTION 'Invitation has expired';
    END IF;

    IF v_invitation.email != v_caller_email THEN
        RAISE EXCEPTION 'Email mismatch';
    END IF;

    -- Lock and check workspace
    SELECT * INTO v_workspace 
    FROM public.workspaces 
    WHERE id = v_invitation.workspace_id 
    FOR UPDATE;

    IF v_workspace.lifecycle_status IN ('suspended', 'archived', 'deleted') THEN
        RAISE EXCEPTION 'Workspace is inactive';
    END IF;

    -- Check if user is already a member
    SELECT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = v_invitation.workspace_id AND user_id = v_caller_id) INTO v_existing_member;

    IF v_existing_member THEN
        UPDATE public.workspace_members SET role = v_invitation.role WHERE workspace_id = v_invitation.workspace_id AND user_id = v_caller_id;
    ELSE
        INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES (v_invitation.workspace_id, v_caller_id, v_invitation.role);
    END IF;

    -- Initial owner check
    IF v_invitation.role = 'owner' AND v_workspace.owner_id IS NULL THEN
        UPDATE public.workspaces SET owner_id = v_caller_id WHERE id = v_invitation.workspace_id;
        
        -- Conditionally activate workspace if provisioning is complete and lifecycle is provisioning
        IF v_workspace.lifecycle_status = 'provisioning' AND v_workspace.provisioned_by IS NOT NULL THEN
            UPDATE public.workspaces SET lifecycle_status = 'active', updated_at = now() WHERE id = v_invitation.workspace_id;
            INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, metadata)
            VALUES (v_invitation.workspace_id, v_caller_id, 'workspace_activated', 'workspaces', v_invitation.workspace_id, '{}'::jsonb);
        END IF;
    END IF;

    -- Mark invitation accepted
    UPDATE public.workspace_invitations
    SET status = 'accepted', accepted_at = now(), accepted_by = v_caller_id
    WHERE id = v_invitation.id;

    -- Log audit event
    INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (v_invitation.workspace_id, v_caller_id, 'invitation_accepted', 'workspace_invitations', v_invitation.id, '{}'::jsonb);

    RETURN v_invitation.workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_workspace_invitation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation(TEXT) TO authenticated;

-- 3. Revoke Invitation
CREATE OR REPLACE FUNCTION public.revoke_workspace_invitation(
    p_invitation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_ws_role public.workspace_role;
    v_caller_platform_role public.platform_role;
    v_invitation RECORD;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_invitation FROM public.workspace_invitations WHERE id = p_invitation_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation not found';
    END IF;

    IF v_invitation.status != 'pending' THEN
        RAISE EXCEPTION 'Invitation is not pending';
    END IF;

    SELECT role INTO v_caller_platform_role FROM public.platform_users WHERE user_id = v_caller_id AND is_active = TRUE;
    SELECT role INTO v_caller_ws_role FROM public.workspace_members WHERE workspace_id = v_invitation.workspace_id AND user_id = v_caller_id;

    IF v_caller_platform_role IN ('platform_owner', 'platform_admin') OR v_caller_ws_role IN ('owner', 'admin') THEN
        UPDATE public.workspace_invitations
        SET status = 'revoked', revoked_at = now(), revoked_by = v_caller_id
        WHERE id = p_invitation_id;

        INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, metadata)
        VALUES (v_invitation.workspace_id, v_caller_id, 'invitation_revoked', 'workspace_invitations', p_invitation_id, '{}'::jsonb);
    ELSE
        RAISE EXCEPTION 'Unauthorized';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_workspace_invitation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_workspace_invitation(UUID) TO authenticated;

-- 4. Rotate/Resend Invitation
CREATE OR REPLACE FUNCTION public.resend_workspace_invitation(
    p_invitation_id UUID,
    p_new_token_hash TEXT,
    p_new_expires_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_ws_role public.workspace_role;
    v_caller_platform_role public.platform_role;
    v_invitation RECORD;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_invitation FROM public.workspace_invitations WHERE id = p_invitation_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation not found';
    END IF;

    IF v_invitation.status IN ('accepted', 'revoked') THEN
        RAISE EXCEPTION 'Cannot resend this invitation';
    END IF;

    SELECT role INTO v_caller_platform_role FROM public.platform_users WHERE user_id = v_caller_id AND is_active = TRUE;
    SELECT role INTO v_caller_ws_role FROM public.workspace_members WHERE workspace_id = v_invitation.workspace_id AND user_id = v_caller_id;

    IF v_caller_platform_role IN ('platform_owner', 'platform_admin') OR v_caller_ws_role IN ('owner', 'admin') THEN
        UPDATE public.workspace_invitations
        SET token_hash = p_new_token_hash, expires_at = p_new_expires_at, updated_at = now(), status = 'pending'
        WHERE id = p_invitation_id;

        INSERT INTO public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, metadata)
        VALUES (v_invitation.workspace_id, v_caller_id, 'invitation_resent', 'workspace_invitations', p_invitation_id, '{}'::jsonb);
    ELSE
        RAISE EXCEPTION 'Unauthorized';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.resend_workspace_invitation(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resend_workspace_invitation(UUID, TEXT, TIMESTAMPTZ) TO authenticated;
