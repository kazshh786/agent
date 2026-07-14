-- Phase 4: provider connections, encrypted credential vault and durable jobs.

ALTER TABLE public.integration_connections
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_code text;

ALTER TABLE public.integration_connections
  ADD CONSTRAINT integration_connections_provider_format
    CHECK (provider ~ '^[a-z][a-z0-9_]{1,49}$') NOT VALID,
  ADD CONSTRAINT integration_connections_status_values
    CHECK (status IN ('pending', 'connected', 'degraded', 'disconnected', 'error')) NOT VALID,
  ADD CONSTRAINT integration_connections_safe_json_size
    CHECK (pg_column_size(metadata) <= 8192 AND pg_column_size(configuration) <= 8192) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS integration_connections_workspace_provider_account_uidx
  ON public.integration_connections (workspace_id, provider, coalesce(external_account_id, ''));

-- Browser users may read safe connection metadata but never mutate it directly.
DROP POLICY IF EXISTS integration_connections_insert ON public.integration_connections;
DROP POLICY IF EXISTS integration_connections_update ON public.integration_connections;
DROP POLICY IF EXISTS integration_connections_delete ON public.integration_connections;
CREATE POLICY integration_connections_platform_select ON public.integration_connections FOR SELECT USING (
  public.has_platform_role(ARRAY['platform_owner'::platform_role, 'platform_admin'::platform_role])
);

CREATE TABLE public.integration_credentials (
  connection_id uuid PRIMARY KEY REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  key_version smallint NOT NULL DEFAULT 1 CHECK (key_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_credentials_ciphertext_size CHECK (length(ciphertext) BETWEEN 1 AND 32768),
  CONSTRAINT integration_credentials_iv_size CHECK (length(iv) BETWEEN 16 AND 64),
  CONSTRAINT integration_credentials_auth_tag_size CHECK (length(auth_tag) BETWEEN 16 AND 64)
);
ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integration_credentials FROM PUBLIC, anon, authenticated;

CREATE TYPE public.integration_job_status AS ENUM ('queued', 'running', 'retrying', 'succeeded', 'failed', 'cancelled');

CREATE TABLE public.integration_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.integration_connections(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider ~ '^[a-z][a-z0-9_]{1,49}$'),
  job_type text NOT NULL CHECK (job_type ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  status public.integration_job_status NOT NULL DEFAULT 'queued',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(payload) <= 16384),
  result jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(result) <= 16384),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts smallint NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  run_after timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error_code text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (workspace_id, provider, idempotency_key)
);
CREATE INDEX integration_jobs_claim_idx ON public.integration_jobs(status, run_after, created_at)
  WHERE status IN ('queued', 'retrying');
CREATE INDEX integration_jobs_workspace_idx ON public.integration_jobs(workspace_id, created_at DESC);
ALTER TABLE public.integration_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY integration_jobs_workspace_read ON public.integration_jobs FOR SELECT USING (
  public.has_workspace_role(workspace_id, ARRAY['owner'::workspace_role, 'admin'::workspace_role])
);
CREATE POLICY integration_jobs_platform_read ON public.integration_jobs FOR SELECT USING (
  public.has_platform_role(ARRAY['platform_owner'::platform_role, 'platform_admin'::platform_role])
);

CREATE TABLE public.integration_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL CHECK (pg_column_size(payload) <= 65536),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (connection_id, external_event_id)
);
ALTER TABLE public.integration_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integration_webhook_events FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.upsert_integration_connection(
  p_workspace_id uuid,
  p_provider text,
  p_display_name text,
  p_external_account_id text,
  p_configuration jsonb,
  p_ciphertext text,
  p_iv text,
  p_auth_tag text,
  p_key_version smallint DEFAULT 1
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role workspace_role;
  v_platform_role platform_role;
  v_connection_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT role INTO v_platform_role FROM public.platform_users WHERE user_id = v_actor AND is_active = true;
  SELECT role INTO v_role FROM public.workspace_members WHERE workspace_id = p_workspace_id AND user_id = v_actor;
  IF NOT coalesce(v_platform_role IN ('platform_owner', 'platform_admin'), false)
     AND NOT coalesce(v_role IN ('owner', 'admin'), false) THEN
    RAISE EXCEPTION 'Insufficient integration privileges';
  END IF;
  IF p_provider !~ '^[a-z][a-z0-9_]{1,49}$' THEN RAISE EXCEPTION 'Invalid provider'; END IF;
  IF pg_column_size(coalesce(p_configuration, '{}'::jsonb)) > 8192 THEN RAISE EXCEPTION 'Configuration too large'; END IF;

  SELECT id INTO v_connection_id FROM public.integration_connections
    WHERE workspace_id = p_workspace_id AND provider = p_provider
      AND coalesce(external_account_id, '') = coalesce(p_external_account_id, '') FOR UPDATE;
  IF v_connection_id IS NULL THEN
    INSERT INTO public.integration_connections(workspace_id, provider, status, display_name, external_account_id, configuration, metadata)
    VALUES (p_workspace_id, p_provider, 'pending', nullif(trim(p_display_name), ''), nullif(trim(p_external_account_id), ''), coalesce(p_configuration, '{}'::jsonb), '{}'::jsonb)
    RETURNING id INTO v_connection_id;
  ELSE
    UPDATE public.integration_connections SET
      display_name = nullif(trim(p_display_name), ''),
      configuration = coalesce(p_configuration, '{}'::jsonb),
      status = 'pending', last_error_code = NULL
    WHERE id = v_connection_id;
  END IF;

  IF p_ciphertext IS NOT NULL THEN
    INSERT INTO public.integration_credentials(connection_id, ciphertext, iv, auth_tag, key_version)
    VALUES (v_connection_id, p_ciphertext, p_iv, p_auth_tag, p_key_version)
    ON CONFLICT (connection_id) DO UPDATE SET ciphertext = EXCLUDED.ciphertext, iv = EXCLUDED.iv,
      auth_tag = EXCLUDED.auth_tag, key_version = EXCLUDED.key_version, updated_at = now();
  END IF;
  INSERT INTO public.audit_logs(workspace_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (p_workspace_id, v_actor, 'integration.connection_upserted', 'integration_connection', v_connection_id, jsonb_build_object('provider', p_provider));
  RETURN v_connection_id;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_integration_connection(uuid,text,text,text,jsonb,text,text,text,smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_integration_connection(uuid,text,text,text,jsonb,text,text,text,smallint) TO authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_integration_job(
  p_workspace_id uuid, p_connection_id uuid, p_provider text, p_job_type text,
  p_payload jsonb, p_idempotency_key text, p_max_attempts smallint DEFAULT 5
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := auth.uid(); v_role workspace_role; v_platform_role platform_role; v_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT role INTO v_platform_role FROM public.platform_users WHERE user_id = v_actor AND is_active = true;
  SELECT role INTO v_role FROM public.workspace_members WHERE workspace_id = p_workspace_id AND user_id = v_actor;
  IF NOT coalesce(v_platform_role IN ('platform_owner','platform_admin'), false)
     AND NOT coalesce(v_role IN ('owner','admin'), false) THEN
    RAISE EXCEPTION 'Insufficient job privileges';
  END IF;
  IF p_connection_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.integration_connections WHERE id = p_connection_id AND workspace_id = p_workspace_id AND provider = p_provider
  ) THEN RAISE EXCEPTION 'Connection does not belong to workspace/provider'; END IF;
  INSERT INTO public.integration_jobs(workspace_id, connection_id, provider, job_type, payload, idempotency_key, max_attempts, created_by)
  VALUES (p_workspace_id, p_connection_id, p_provider, p_job_type, coalesce(p_payload,'{}'::jsonb), p_idempotency_key, p_max_attempts, v_actor)
  ON CONFLICT (workspace_id, provider, idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_integration_job(uuid,uuid,text,text,jsonb,text,smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_integration_job(uuid,uuid,text,text,jsonb,text,smallint) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_integration_jobs(p_limit integer, p_worker_id text)
RETURNS SETOF public.integration_jobs
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.integration_jobs j SET status = 'running', locked_at = now(), locked_by = p_worker_id,
    attempts = attempts + 1, updated_at = now()
  WHERE j.id IN (
    SELECT id FROM public.integration_jobs
    WHERE status IN ('queued','retrying') AND run_after <= now()
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT greatest(1, least(p_limit, 25))
  ) RETURNING j.*;
$$;
REVOKE ALL ON FUNCTION public.claim_integration_jobs(integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_integration_jobs(integer,text) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_integration_job(
  p_job_id uuid, p_succeeded boolean, p_result jsonb, p_error_code text, p_retry_seconds integer DEFAULT 60
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_job public.integration_jobs;
BEGIN
  SELECT * INTO v_job FROM public.integration_jobs WHERE id = p_job_id AND status = 'running' FOR UPDATE;
  IF v_job.id IS NULL THEN RAISE EXCEPTION 'Job is not running'; END IF;
  IF p_succeeded THEN
    UPDATE public.integration_jobs SET status='succeeded', result=coalesce(p_result,'{}'::jsonb), completed_at=now(),
      locked_at=NULL, locked_by=NULL, last_error_code=NULL, updated_at=now() WHERE id=p_job_id;
  ELSIF p_retry_seconds > 0 AND v_job.attempts < v_job.max_attempts THEN
    UPDATE public.integration_jobs SET status='retrying', run_after=now()+make_interval(secs => greatest(1,p_retry_seconds)),
      locked_at=NULL, locked_by=NULL, last_error_code=p_error_code, updated_at=now() WHERE id=p_job_id;
  ELSE
    UPDATE public.integration_jobs SET status='failed', result=coalesce(p_result,'{}'::jsonb), completed_at=now(),
      locked_at=NULL, locked_by=NULL, last_error_code=p_error_code, updated_at=now() WHERE id=p_job_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_integration_job(uuid,boolean,jsonb,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_integration_job(uuid,boolean,jsonb,text,integer) TO service_role;

CREATE TRIGGER trg_integration_credentials_updated_at BEFORE UPDATE ON public.integration_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_integration_jobs_updated_at BEFORE UPDATE ON public.integration_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
