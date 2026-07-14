-- Phase 5: booking-first websites and privacy-conscious conversion analytics.

CREATE TYPE public.website_status AS ENUM ('draft', 'compiling', 'ready', 'published', 'degraded', 'failed', 'archived');
CREATE TYPE public.website_payment_mode AS ENUM ('no_payment', 'pay_later', 'deposit', 'full_payment', 'customer_choice');
CREATE TYPE public.website_event_name AS ENUM (
  'page_view', 'booking_cta_clicked', 'booking_page_viewed', 'booking_started',
  'service_selected', 'slot_selected', 'customer_details_submitted',
  'payment_started', 'payment_completed', 'booking_confirmed',
  'booking_confirmed_no_payment', 'booking_abandoned'
);

-- Composite tenant keys let downstream tables prove that a project belongs to
-- the same workspace as the website that references it.
ALTER TABLE public.projects
  ADD CONSTRAINT projects_workspace_id_id_key UNIQUE (workspace_id, id);

CREATE TABLE public.website_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  template_name text NOT NULL CHECK (template_name ~ '^[a-z0-9-]{2,50}$'),
  status public.website_status NOT NULL DEFAULT 'draft',
  primary_domain text NOT NULL CHECK (primary_domain ~ '^[a-z0-9][a-z0-9.-]{1,251}[a-z0-9]$' AND primary_domain !~ '\.\.'),
  booking_path text NOT NULL DEFAULT '/book' CHECK (booking_path = '/book'),
  booking_provider text NOT NULL DEFAULT 'ks_os' CHECK (booking_provider = 'ks_os'),
  booking_external_tenant_id text,
  payment_mode public.website_payment_mode NOT NULL DEFAULT 'pay_later',
  analytics_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  engine_project_id text,
  live_url text,
  last_compile_correlation_id text,
  last_error_code text,
  booking_health_checked_at timestamptz,
  published_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, project_id),
  UNIQUE (primary_domain),
  FOREIGN KEY (workspace_id, project_id) REFERENCES public.projects(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT website_live_url_https CHECK (live_url IS NULL OR live_url ~ '^https://')
);
CREATE INDEX website_sites_workspace_idx ON public.website_sites(workspace_id, created_at DESC);
ALTER TABLE public.website_sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY website_sites_workspace_read ON public.website_sites FOR SELECT USING (public.is_workspace_member(workspace_id));
CREATE POLICY website_sites_platform_read ON public.website_sites FOR SELECT USING (
  public.has_platform_role(ARRAY['platform_owner'::platform_role,'platform_admin'::platform_role])
);

CREATE TABLE public.website_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id uuid NOT NULL REFERENCES public.website_sites(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('queued','building','succeeded','failed')),
  correlation_id text NOT NULL,
  engine_project_id text,
  deployment_url text CHECK (deployment_url IS NULL OR deployment_url ~ '^https://'),
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (correlation_id)
);
CREATE INDEX website_deployments_site_idx ON public.website_deployments(website_id, created_at DESC);
ALTER TABLE public.website_deployments ENABLE ROW LEVEL SECURITY;
CREATE POLICY website_deployments_workspace_read ON public.website_deployments FOR SELECT USING (public.is_workspace_member(workspace_id));
CREATE POLICY website_deployments_platform_read ON public.website_deployments FOR SELECT USING (
  public.has_platform_role(ARRAY['platform_owner'::platform_role,'platform_admin'::platform_role])
);

CREATE TABLE public.website_conversion_events (
  id uuid PRIMARY KEY,
  website_id uuid NOT NULL REFERENCES public.website_sites(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  event_name public.website_event_name NOT NULL,
  occurred_at timestamptz NOT NULL,
  path text NOT NULL CHECK (length(path) BETWEEN 1 AND 500),
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  booking_reference text,
  value_minor integer CHECK (value_minor IS NULL OR value_minor >= 0),
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(metadata) <= 4096),
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_events_time_window CHECK (occurred_at <= received_at + interval '5 minutes')
);
CREATE INDEX website_events_funnel_idx ON public.website_conversion_events(website_id, occurred_at DESC, event_name);
CREATE INDEX website_events_workspace_idx ON public.website_conversion_events(workspace_id, occurred_at DESC);
ALTER TABLE public.website_conversion_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY website_events_workspace_read ON public.website_conversion_events FOR SELECT USING (public.is_workspace_member(workspace_id));
CREATE POLICY website_events_platform_read ON public.website_conversion_events FOR SELECT USING (
  public.has_platform_role(ARRAY['platform_owner'::platform_role,'platform_admin'::platform_role])
);
REVOKE INSERT, UPDATE, DELETE ON public.website_conversion_events FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_booking_first_website(
  p_workspace_id uuid, p_name text, p_template_name text, p_primary_domain text,
  p_payment_mode public.website_payment_mode
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor uuid := auth.uid(); v_workspace_role workspace_role; v_platform_role platform_role;
  v_project_id uuid; v_site_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT role INTO v_workspace_role FROM public.workspace_members WHERE workspace_id=p_workspace_id AND user_id=v_actor;
  SELECT role INTO v_platform_role FROM public.platform_users WHERE user_id=v_actor AND is_active=true;
  IF NOT coalesce(v_workspace_role IN ('owner','admin','editor'),false)
     AND NOT coalesce(v_platform_role IN ('platform_owner','platform_admin'),false) THEN
    RAISE EXCEPTION 'Insufficient website privileges';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id=p_workspace_id AND status='active') THEN
    RAISE EXCEPTION 'Workspace is not active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_modules WHERE workspace_id=p_workspace_id AND module='website' AND enabled=true)
     OR NOT EXISTS (SELECT 1 FROM public.workspace_modules WHERE workspace_id=p_workspace_id AND module='booking' AND enabled=true) THEN
    RAISE EXCEPTION 'Website and booking modules must both be enabled';
  END IF;
  IF length(trim(p_name)) NOT BETWEEN 2 AND 200 OR p_name ~ '[\\/]' OR p_name LIKE '%..%' THEN RAISE EXCEPTION 'Invalid website name'; END IF;
  IF p_template_name !~ '^[a-z0-9-]{2,50}$' THEN RAISE EXCEPTION 'Invalid template'; END IF;
  IF lower(p_primary_domain) !~ '^[a-z0-9][a-z0-9.-]{1,251}[a-z0-9]$' OR lower(p_primary_domain) ~ '\.\.' THEN RAISE EXCEPTION 'Invalid domain'; END IF;

  INSERT INTO public.projects(workspace_id,name,type,status,created_by)
  VALUES(p_workspace_id,trim(p_name),'website','draft',v_actor) RETURNING id INTO v_project_id;
  INSERT INTO public.website_sites(workspace_id,project_id,template_name,primary_domain,payment_mode,created_by)
  VALUES(p_workspace_id,v_project_id,p_template_name,lower(p_primary_domain),p_payment_mode,v_actor) RETURNING id INTO v_site_id;
  INSERT INTO public.audit_logs(workspace_id,actor_id,action,entity_type,entity_id,metadata)
  VALUES(p_workspace_id,v_actor,'website.created','website',v_site_id,jsonb_build_object('domain',lower(p_primary_domain),'booking_path','/book'));
  RETURN v_site_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_booking_first_website(uuid,text,text,text,public.website_payment_mode) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_booking_first_website(uuid,text,text,text,public.website_payment_mode) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_website_compile_result(
  p_actor_id uuid, p_website_id uuid, p_correlation_id text, p_success boolean, p_engine_project_id text,
  p_url text, p_error_code text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid:=p_actor_id; v_site public.website_sites; v_role workspace_role; v_platform platform_role;
BEGIN
  SELECT * INTO v_site FROM public.website_sites WHERE id=p_website_id FOR UPDATE;
  IF v_site.id IS NULL THEN RAISE EXCEPTION 'Website not found'; END IF;
  SELECT role INTO v_role FROM public.workspace_members WHERE workspace_id=v_site.workspace_id AND user_id=v_actor;
  SELECT role INTO v_platform FROM public.platform_users WHERE user_id=v_actor AND is_active=true;
  IF NOT coalesce(v_role IN ('owner','admin','editor'),false) AND NOT coalesce(v_platform IN ('platform_owner','platform_admin'),false) THEN
    RAISE EXCEPTION 'Insufficient website privileges';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id=v_site.workspace_id AND status='active') THEN
    RAISE EXCEPTION 'Workspace is not active';
  END IF;
  INSERT INTO public.website_deployments(website_id,workspace_id,status,correlation_id,engine_project_id,deployment_url,error_code,started_at,completed_at)
  VALUES(v_site.id,v_site.workspace_id,CASE WHEN p_success THEN 'succeeded' ELSE 'failed' END,p_correlation_id,p_engine_project_id,p_url,p_error_code,now(),now());
  UPDATE public.website_sites SET status=CASE WHEN p_success THEN 'ready'::public.website_status ELSE 'failed'::public.website_status END,
    engine_project_id=p_engine_project_id, live_url=p_url, last_compile_correlation_id=p_correlation_id,
    last_error_code=p_error_code, updated_at=now() WHERE id=v_site.id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_website_compile_result(uuid,uuid,text,boolean,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_website_compile_result(uuid,uuid,text,boolean,text,text,text) TO service_role;

CREATE TRIGGER trg_website_sites_updated_at BEFORE UPDATE ON public.website_sites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
