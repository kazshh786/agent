-- Final security corrections after independent review
-- Keeps prior migrations immutable.

-- A composite ON DELETE SET NULL would also null workspace_id, which is NOT NULL.
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_workspace_brand_fkey;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_workspace_brand_fkey
  FOREIGN KEY (workspace_id, brand_id)
  REFERENCES public.brands(workspace_id, id)
  ON DELETE RESTRICT;

-- A generic client-callable audit writer permits fabricated events.
REVOKE ALL ON FUNCTION public.write_audit_log(UUID, TEXT, TEXT, UUID, JSONB)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.invite_workspace_member(
  p_workspace_id UUID, p_user_id UUID, p_role public.workspace_role
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_caller_role public.workspace_role;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT role INTO v_caller_role FROM public.workspace_members
    WHERE workspace_id=p_workspace_id AND user_id=auth.uid() FOR UPDATE;
  IF v_caller_role='owner' THEN
    IF p_role='owner' THEN RAISE EXCEPTION 'Use ownership transfer'; END IF;
  ELSIF v_caller_role='admin' THEN
    IF p_role IN ('owner','admin') THEN RAISE EXCEPTION 'Admins may invite editors or viewers only'; END IF;
  ELSE RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  IF p_user_id=auth.uid() THEN RAISE EXCEPTION 'Cannot invite yourself'; END IF;
  INSERT INTO public.workspace_members(workspace_id,user_id,role)
    VALUES(p_workspace_id,p_user_id,p_role);
  INSERT INTO public.audit_logs(workspace_id,actor_id,action,entity_type,entity_id,metadata)
    VALUES(p_workspace_id,auth.uid(),'member.invited','user',p_user_id,
      jsonb_build_object('role',p_role));
END $$;

CREATE OR REPLACE FUNCTION public.update_workspace_member_role(
  p_workspace_id UUID, p_user_id UUID, p_role public.workspace_role
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_caller_role public.workspace_role;
  v_target_role public.workspace_role;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF auth.uid()=p_user_id THEN RAISE EXCEPTION 'Cannot modify your own role'; END IF;
  SELECT role INTO v_caller_role FROM public.workspace_members
    WHERE workspace_id=p_workspace_id AND user_id=auth.uid() FOR UPDATE;
  SELECT role INTO v_target_role FROM public.workspace_members
    WHERE workspace_id=p_workspace_id AND user_id=p_user_id FOR UPDATE;
  IF v_caller_role IS NULL OR v_target_role IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_caller_role='owner' THEN
    IF v_target_role='owner' OR p_role='owner' THEN RAISE EXCEPTION 'Use ownership transfer'; END IF;
  ELSIF v_caller_role='admin' THEN
    IF v_target_role IN ('owner','admin') OR p_role IN ('owner','admin') THEN
      RAISE EXCEPTION 'Admins cannot manage owners or admins';
    END IF;
  ELSE RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  UPDATE public.workspace_members SET role=p_role
    WHERE workspace_id=p_workspace_id AND user_id=p_user_id;
  INSERT INTO public.audit_logs(workspace_id,actor_id,action,entity_type,entity_id,metadata)
    VALUES(p_workspace_id,auth.uid(),'member.role_updated','user',p_user_id,
      jsonb_build_object('old_role',v_target_role,'new_role',p_role));
END $$;

CREATE OR REPLACE FUNCTION public.remove_workspace_member(
  p_workspace_id UUID, p_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_caller_role public.workspace_role;
  v_target_role public.workspace_role;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM 1 FROM public.workspaces WHERE id=p_workspace_id FOR UPDATE;
  SELECT role INTO v_caller_role FROM public.workspace_members
    WHERE workspace_id=p_workspace_id AND user_id=auth.uid() FOR UPDATE;
  SELECT role INTO v_target_role FROM public.workspace_members
    WHERE workspace_id=p_workspace_id AND user_id=p_user_id FOR UPDATE;
  IF v_caller_role IS NULL OR v_target_role IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;

  IF auth.uid()=p_user_id THEN
    IF v_target_role='owner' THEN RAISE EXCEPTION 'Owner must transfer ownership before leaving'; END IF;
  ELSIF v_caller_role='owner' THEN
    IF v_target_role='owner' THEN RAISE EXCEPTION 'Use ownership transfer'; END IF;
  ELSIF v_caller_role='admin' THEN
    IF v_target_role IN ('owner','admin') THEN RAISE EXCEPTION 'Admins cannot remove owners or admins'; END IF;
  ELSE RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- Audit before deletion so a self-removing member is still authorised contextually.
  INSERT INTO public.audit_logs(workspace_id,actor_id,action,entity_type,entity_id,metadata)
    VALUES(p_workspace_id,auth.uid(),'member.removed','user',p_user_id,
      jsonb_build_object('old_role',v_target_role));
  DELETE FROM public.workspace_members
    WHERE workspace_id=p_workspace_id AND user_id=p_user_id;
END $$;

CREATE OR REPLACE FUNCTION public.transfer_workspace_ownership(
  p_workspace_id UUID, p_new_owner_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_target_role public.workspace_role;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF auth.uid()=p_new_owner_id THEN RAISE EXCEPTION 'Already the owner'; END IF;
  PERFORM 1 FROM public.workspaces WHERE id=p_workspace_id FOR UPDATE;
  IF NOT EXISTS(
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id=p_workspace_id AND user_id=auth.uid() AND role='owner'
  ) THEN RAISE EXCEPTION 'Only the owner can transfer ownership'; END IF;
  SELECT role INTO v_target_role FROM public.workspace_members
    WHERE workspace_id=p_workspace_id AND user_id=p_new_owner_id FOR UPDATE;
  IF v_target_role IS NULL THEN RAISE EXCEPTION 'Target must already be a member'; END IF;

  UPDATE public.workspace_members SET role='owner'
    WHERE workspace_id=p_workspace_id AND user_id=p_new_owner_id;
  UPDATE public.workspace_members SET role='admin'
    WHERE workspace_id=p_workspace_id AND user_id=auth.uid();
  UPDATE public.workspaces SET owner_id=p_new_owner_id WHERE id=p_workspace_id;
  INSERT INTO public.audit_logs(workspace_id,actor_id,action,entity_type,entity_id,metadata)
    VALUES(p_workspace_id,auth.uid(),'workspace.ownership_transferred','workspace',p_workspace_id,
      jsonb_build_object('from',auth.uid(),'to',p_new_owner_id));
END $$;

-- Reassert exact execution privileges.
REVOKE ALL ON FUNCTION public.invite_workspace_member(UUID,UUID,public.workspace_role) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.update_workspace_member_role(UUID,UUID,public.workspace_role) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.remove_workspace_member(UUID,UUID) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.transfer_workspace_ownership(UUID,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.invite_workspace_member(UUID,UUID,public.workspace_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_workspace_member_role(UUID,UUID,public.workspace_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_workspace_member(UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_workspace_ownership(UUID,UUID) TO authenticated;
