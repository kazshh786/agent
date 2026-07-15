-- Prompt 10: privacy-first, tenant-isolated unified attribution and launch analytics.

CREATE TYPE public.attribution_channel AS ENUM ('direct','organic','referral','paid','agency','unknown','email','social');
CREATE TYPE public.attribution_consent AS ENUM ('unknown','analytics','marketing','withdrawn');
CREATE TYPE public.attribution_verification AS ENUM ('browser','server_verified','rejected');

CREATE TABLE public.attribution_sessions(
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  website_id uuid NOT NULL REFERENCES public.website_sites(id) ON DELETE CASCADE,
  first_channel public.attribution_channel NOT NULL DEFAULT 'unknown',
  first_source text,
  last_channel public.attribution_channel NOT NULL DEFAULT 'unknown',
  last_source text,
  landing_path text NOT NULL CHECK(length(landing_path) BETWEEN 1 AND 500 AND landing_path LIKE '/%'),
  referrer_host text CHECK(referrer_host IS NULL OR length(referrer_host)<=253),
  utm_source text CHECK(utm_source IS NULL OR length(utm_source)<=100),
  utm_medium text CHECK(utm_medium IS NULL OR length(utm_medium)<=100),
  utm_campaign text CHECK(utm_campaign IS NULL OR length(utm_campaign)<=150),
  utm_content text CHECK(utm_content IS NULL OR length(utm_content)<=150),
  utm_term text CHECK(utm_term IS NULL OR length(utm_term)<=150),
  consent_state public.attribution_consent NOT NULL DEFAULT 'unknown',
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  user_agent_family text CHECK(user_agent_family IS NULL OR length(user_agent_family)<=40),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,website_id,id),
  CHECK(first_seen_at<=last_seen_at)
);
CREATE INDEX attribution_sessions_workspace_time_idx ON public.attribution_sessions(workspace_id,last_seen_at DESC);

CREATE TABLE public.attribution_touchpoints(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  website_id uuid NOT NULL REFERENCES public.website_sites(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  source_event_id text NOT NULL CHECK(length(source_event_id) BETWEEN 8 AND 200),
  event_name text NOT NULL CHECK(event_name IN('page_view','booking_cta_clicked','booking_page_viewed','booking_type_selected','service_selected','slot_selected','booking_started')),
  channel public.attribution_channel NOT NULL,
  source text CHECK(source IS NULL OR length(source)<=100),
  medium text CHECK(medium IS NULL OR length(medium)<=100),
  campaign text CHECK(campaign IS NULL OR length(campaign)<=150),
  content text CHECK(content IS NULL OR length(content)<=150),
  term text CHECK(term IS NULL OR length(term)<=150),
  occurred_at timestamptz NOT NULL,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(safe_metadata)='object' AND octet_length(safe_metadata::text)<=4096),
  received_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(workspace_id,website_id,session_id) REFERENCES public.attribution_sessions(workspace_id,website_id,id) ON DELETE CASCADE,
  UNIQUE(workspace_id,source_event_id),
  CHECK(occurred_at<=received_at+interval '5 minutes')
);
CREATE INDEX attribution_touchpoints_session_time_idx ON public.attribution_touchpoints(workspace_id,session_id,occurred_at);

CREATE TABLE public.attribution_identities(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  website_id uuid NOT NULL REFERENCES public.website_sites(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  customer_reference text CHECK(customer_reference IS NULL OR length(customer_reference)<=200),
  identity_hmac text CHECK(identity_hmac IS NULL OR identity_hmac ~ '^[0-9a-f]{64}$'),
  linked_at timestamptz NOT NULL DEFAULT now(),
  consent_basis public.attribution_consent NOT NULL,
  anonymised_at timestamptz,
  FOREIGN KEY(workspace_id,website_id,session_id) REFERENCES public.attribution_sessions(workspace_id,website_id,id) ON DELETE CASCADE,
  UNIQUE(workspace_id,session_id),
  CHECK(consent_basis IN('analytics','marketing'))
);
CREATE INDEX attribution_identities_workspace_identity_idx ON public.attribution_identities(workspace_id,identity_hmac) WHERE identity_hmac IS NOT NULL;

CREATE TABLE public.booking_attribution_links(
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  website_id uuid NOT NULL REFERENCES public.website_sites(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  booking_reference text NOT NULL CHECK(booking_reference ~ '^[A-Za-z0-9_:-]{8,200}$'),
  linked_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(workspace_id,website_id,session_id) REFERENCES public.attribution_sessions(workspace_id,website_id,id) ON DELETE CASCADE,
  PRIMARY KEY(workspace_id,booking_reference)
);

CREATE TABLE public.attribution_conversions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  website_id uuid REFERENCES public.website_sites(id) ON DELETE SET NULL,
  session_id uuid REFERENCES public.attribution_sessions(id) ON DELETE SET NULL,
  conversion_type text NOT NULL CHECK(conversion_type IN('form_submitted','booking_created','booking_confirmed','booking_cancelled','appointment_completed','payment_succeeded')),
  booking_reference text CHECK(booking_reference IS NULL OR length(booking_reference)<=200),
  booking_type text CHECK(booking_type IS NULL OR booking_type IN('shop','mobile')),
  verification_state public.attribution_verification NOT NULL DEFAULT 'server_verified' CHECK(verification_state='server_verified'),
  occurred_at timestamptz NOT NULL,
  revenue_minor bigint CHECK(revenue_minor IS NULL OR revenue_minor>=0),
  currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  source text NOT NULL CHECK(source IN('ks_os','website_server')),
  source_event_id text NOT NULL CHECK(length(source_event_id) BETWEEN 8 AND 200),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(safe_metadata)='object' AND octet_length(safe_metadata::text)<=4096),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,source,source_event_id),
  CHECK((conversion_type='payment_succeeded' AND revenue_minor IS NOT NULL AND currency IS NOT NULL) OR (conversion_type<>'payment_succeeded' AND revenue_minor IS NULL)),
  CHECK(occurred_at<=received_at+interval '5 minutes')
);
CREATE INDEX attribution_conversions_workspace_time_idx ON public.attribution_conversions(workspace_id,occurred_at DESC);

CREATE OR REPLACE FUNCTION public.enforce_attribution_conversion_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.session_id IS NOT NULL AND (NEW.website_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.attribution_sessions s WHERE s.id=NEW.session_id AND s.workspace_id=NEW.workspace_id AND s.website_id=NEW.website_id
  )) THEN RAISE EXCEPTION 'Cross-workspace conversion session rejected';END IF;
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_attribution_conversion_scope BEFORE INSERT OR UPDATE OF workspace_id,website_id,session_id ON public.attribution_conversions FOR EACH ROW EXECUTE FUNCTION public.enforce_attribution_conversion_scope();

CREATE TABLE public.attribution_models(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversion_id uuid NOT NULL REFERENCES public.attribution_conversions(id) ON DELETE CASCADE,
  model_type text NOT NULL CHECK(model_type IN('first_touch','last_touch')),
  touchpoint_id uuid REFERENCES public.attribution_touchpoints(id) ON DELETE SET NULL,
  channel public.attribution_channel NOT NULL,
  source text,
  medium text,
  campaign text,
  model_version integer NOT NULL DEFAULT 1 CHECK(model_version>0),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  calculation_reason text NOT NULL CHECK(length(calculation_reason) BETWEEN 3 AND 200),
  UNIQUE(conversion_id,model_type,model_version)
);
CREATE INDEX attribution_models_workspace_channel_idx ON public.attribution_models(workspace_id,model_type,channel,calculated_at DESC);

CREATE TABLE public.analytics_daily_rollups(
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  website_id uuid REFERENCES public.website_sites(id) ON DELETE CASCADE,
  channel public.attribution_channel NOT NULL,
  source text NOT NULL DEFAULT '',
  campaign text NOT NULL DEFAULT '',
  rollup_date date NOT NULL,
  sessions integer NOT NULL DEFAULT 0 CHECK(sessions>=0),
  cta_clicks integer NOT NULL DEFAULT 0 CHECK(cta_clicks>=0),
  booking_starts integer NOT NULL DEFAULT 0 CHECK(booking_starts>=0),
  confirmed_bookings integer NOT NULL DEFAULT 0 CHECK(confirmed_bookings>=0),
  shop_bookings integer NOT NULL DEFAULT 0 CHECK(shop_bookings>=0),
  mobile_bookings integer NOT NULL DEFAULT 0 CHECK(mobile_bookings>=0),
  verified_revenue_minor bigint NOT NULL DEFAULT 0 CHECK(verified_revenue_minor>=0),
  currency text NOT NULL DEFAULT '' CHECK(currency='' OR currency ~ '^[A-Z]{3}$'),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  model_version integer NOT NULL DEFAULT 1,
  PRIMARY KEY(workspace_id,website_id,channel,source,campaign,rollup_date,currency)
);

CREATE TABLE public.analytics_retention_settings(
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  retention_days integer NOT NULL DEFAULT 365 CHECK(retention_days BETWEEN 30 AND 730),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.analytics_runtime_health(
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  component text NOT NULL CHECK(component IN('browser_ingestion','trusted_ingestion','ks_os','stripe_webhook','automation_worker')),
  status text NOT NULL CHECK(status IN('healthy','degraded','failed')),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error_code text CHECK(last_error_code IS NULL OR length(last_error_code)<=80),
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id,component)
);

CREATE TABLE public.analytics_export_audit(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  row_count integer NOT NULL CHECK(row_count BETWEEN 0 AND 10000),
  filters jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(filters)='object' AND octet_length(filters::text)<=2048),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.attribution_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attribution_touchpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attribution_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attribution_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_attribution_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attribution_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_daily_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_retention_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_runtime_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_export_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY attribution_sessions_read ON public.attribution_sessions FOR SELECT TO authenticated USING(public.is_workspace_member(workspace_id));
CREATE POLICY attribution_touchpoints_read ON public.attribution_touchpoints FOR SELECT TO authenticated USING(public.is_workspace_member(workspace_id));
CREATE POLICY attribution_identities_read ON public.attribution_identities FOR SELECT TO authenticated USING(public.has_workspace_role(workspace_id,ARRAY['owner','admin']::public.workspace_role[]));
CREATE POLICY attribution_conversions_read ON public.attribution_conversions FOR SELECT TO authenticated USING(public.is_workspace_member(workspace_id));
CREATE POLICY attribution_models_read ON public.attribution_models FOR SELECT TO authenticated USING(public.is_workspace_member(workspace_id));
CREATE POLICY analytics_rollups_read ON public.analytics_daily_rollups FOR SELECT TO authenticated USING(public.is_workspace_member(workspace_id));
CREATE POLICY analytics_retention_read ON public.analytics_retention_settings FOR SELECT TO authenticated USING(public.is_workspace_member(workspace_id));
CREATE POLICY analytics_health_read ON public.analytics_runtime_health FOR SELECT TO authenticated USING(public.is_workspace_member(workspace_id));
CREATE POLICY analytics_export_audit_read ON public.analytics_export_audit FOR SELECT TO authenticated USING(public.has_workspace_role(workspace_id,ARRAY['owner','admin']::public.workspace_role[]));

REVOKE INSERT,UPDATE,DELETE ON public.attribution_sessions,public.attribution_touchpoints,public.attribution_identities,public.attribution_conversions,public.attribution_models,public.analytics_daily_rollups,public.analytics_runtime_health,public.analytics_export_audit FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.booking_attribution_links FROM PUBLIC,anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.analytics_retention_settings FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.record_browser_attribution_event(
  p_workspace_id uuid,p_website_id uuid,p_session_id uuid,p_source_event_id text,p_event_name text,p_occurred_at timestamptz,
  p_path text,p_referrer_host text,p_channel public.attribution_channel,p_source text,p_medium text,p_campaign text,p_content text,p_term text,
  p_consent public.attribution_consent,p_user_agent_family text,p_safe_metadata jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;v_existing public.attribution_sessions;
BEGIN
  IF p_event_name NOT IN('page_view','booking_cta_clicked','booking_page_viewed','booking_type_selected','service_selected','slot_selected','booking_started')
     OR abs(extract(epoch FROM(now()-p_occurred_at)))>86400 OR p_path NOT LIKE '/%' OR p_path LIKE '%?%'
     OR jsonb_typeof(coalesce(p_safe_metadata,'{}'))<>'object' OR octet_length(coalesce(p_safe_metadata,'{}')::text)>4096
     OR (coalesce(p_safe_metadata,'{}')-ARRAY['serviceId','bookingType','paymentMode'])<>'{}'::jsonb THEN RAISE EXCEPTION 'Invalid browser attribution event';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.website_sites s JOIN public.workspaces w ON w.id=s.workspace_id JOIN public.workspace_modules m ON m.workspace_id=w.id AND m.module::text='analytics' AND m.enabled=true WHERE s.id=p_website_id AND s.workspace_id=p_workspace_id AND w.status='active') THEN RAISE EXCEPTION 'Attribution target unavailable';END IF;
  SELECT * INTO v_existing FROM public.attribution_sessions WHERE workspace_id=p_workspace_id AND website_id=p_website_id AND id=p_session_id FOR UPDATE;
  IF v_existing.id IS NULL THEN
    INSERT INTO public.attribution_sessions(id,workspace_id,website_id,first_channel,first_source,last_channel,last_source,landing_path,referrer_host,utm_source,utm_medium,utm_campaign,utm_content,utm_term,consent_state,first_seen_at,last_seen_at,user_agent_family)
    VALUES(p_session_id,p_workspace_id,p_website_id,p_channel,p_source,p_channel,p_source,p_path,p_referrer_host,p_source,p_medium,p_campaign,p_content,p_term,p_consent,p_occurred_at,p_occurred_at,p_user_agent_family);
  ELSE
    UPDATE public.attribution_sessions SET first_seen_at=least(first_seen_at,p_occurred_at),last_seen_at=greatest(last_seen_at,p_occurred_at),
      first_channel=CASE WHEN p_occurred_at<first_seen_at THEN p_channel ELSE first_channel END,first_source=CASE WHEN p_occurred_at<first_seen_at THEN p_source ELSE first_source END,
      landing_path=CASE WHEN p_occurred_at<first_seen_at THEN p_path ELSE landing_path END,utm_source=CASE WHEN p_occurred_at<first_seen_at THEN p_source ELSE utm_source END,
      utm_medium=CASE WHEN p_occurred_at<first_seen_at THEN p_medium ELSE utm_medium END,utm_campaign=CASE WHEN p_occurred_at<first_seen_at THEN p_campaign ELSE utm_campaign END,
      utm_content=CASE WHEN p_occurred_at<first_seen_at THEN p_content ELSE utm_content END,utm_term=CASE WHEN p_occurred_at<first_seen_at THEN p_term ELSE utm_term END,
      consent_state=CASE WHEN consent_state='withdrawn' THEN consent_state ELSE p_consent END,
      last_channel=CASE WHEN p_channel='direct' AND last_channel NOT IN('direct','unknown') THEN last_channel ELSE p_channel END,
      last_source=CASE WHEN p_channel='direct' AND last_channel NOT IN('direct','unknown') THEN last_source ELSE p_source END
    WHERE workspace_id=p_workspace_id AND website_id=p_website_id AND id=p_session_id;
  END IF;
  INSERT INTO public.attribution_touchpoints(workspace_id,website_id,session_id,source_event_id,event_name,channel,source,medium,campaign,content,term,occurred_at,safe_metadata)
  VALUES(p_workspace_id,p_website_id,p_session_id,p_source_event_id,p_event_name,p_channel,p_source,p_medium,p_campaign,p_content,p_term,p_occurred_at,coalesce(p_safe_metadata,'{}'))
  ON CONFLICT(workspace_id,source_event_id)DO NOTHING RETURNING id INTO v_id;
  INSERT INTO public.analytics_runtime_health(workspace_id,component,status,last_success_at,checked_at)VALUES(p_workspace_id,'browser_ingestion','healthy',now(),now())
  ON CONFLICT(workspace_id,component)DO UPDATE SET status='healthy',last_success_at=now(),last_error_code=NULL,checked_at=now();
  RETURN v_id;
END;$$;

CREATE OR REPLACE FUNCTION public.link_attribution_identity(
  p_workspace_id uuid,p_website_id uuid,p_session_id uuid,p_customer_reference text,p_identity_hmac text,p_consent_basis public.attribution_consent
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_identity_hmac !~ '^[0-9a-f]{64}$' OR p_consent_basis NOT IN('analytics','marketing') OR (p_customer_reference IS NOT NULL AND p_customer_reference !~ '^[A-Za-z0-9_:-]{1,200}$') THEN RAISE EXCEPTION 'Invalid identity linkage';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.attribution_sessions WHERE id=p_session_id AND workspace_id=p_workspace_id AND website_id=p_website_id AND consent_state IN('analytics','marketing')) THEN RAISE EXCEPTION 'Session linkage denied';END IF;
  INSERT INTO public.attribution_identities(workspace_id,website_id,session_id,customer_reference,identity_hmac,consent_basis)
  VALUES(p_workspace_id,p_website_id,p_session_id,nullif(left(p_customer_reference,200),''),p_identity_hmac,p_consent_basis)
  ON CONFLICT(workspace_id,session_id)DO UPDATE SET customer_reference=excluded.customer_reference,identity_hmac=excluded.identity_hmac,consent_basis=excluded.consent_basis,linked_at=now(),anonymised_at=NULL
  RETURNING id INTO v_id;RETURN v_id;
END;$$;

CREATE OR REPLACE FUNCTION public.link_booking_attribution(
  p_workspace_id uuid,p_website_id uuid,p_session_id uuid,p_booking_reference text,p_identity_hmac text,p_consent_basis public.attribution_consent
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF p_booking_reference !~ '^[A-Za-z0-9_:-]{8,200}$' OR NOT EXISTS(SELECT 1 FROM public.website_sites WHERE id=p_website_id AND workspace_id=p_workspace_id) THEN RAISE EXCEPTION 'Booking attribution linkage denied';END IF;
  INSERT INTO public.attribution_sessions(id,workspace_id,website_id,first_channel,last_channel,landing_path,consent_state,first_seen_at,last_seen_at,user_agent_family)
  VALUES(p_session_id,p_workspace_id,p_website_id,'unknown','unknown','/book',CASE WHEN p_identity_hmac IS NOT NULL THEN p_consent_basis ELSE 'unknown' END,now(),now(),NULL)
  ON CONFLICT(id)DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.attribution_sessions WHERE id=p_session_id AND workspace_id=p_workspace_id AND website_id=p_website_id) THEN RAISE EXCEPTION 'Booking attribution linkage denied';END IF;
  IF p_identity_hmac IS NOT NULL THEN
    IF p_identity_hmac !~ '^[0-9a-f]{64}$' OR p_consent_basis NOT IN('analytics','marketing') THEN RAISE EXCEPTION 'Booking identity linkage denied';END IF;
    UPDATE public.attribution_sessions SET consent_state=p_consent_basis WHERE id=p_session_id AND workspace_id=p_workspace_id AND website_id=p_website_id AND consent_state<>'withdrawn';
    INSERT INTO public.attribution_identities(workspace_id,website_id,session_id,identity_hmac,consent_basis)VALUES(p_workspace_id,p_website_id,p_session_id,p_identity_hmac,p_consent_basis)
    ON CONFLICT(workspace_id,session_id)DO UPDATE SET identity_hmac=excluded.identity_hmac,consent_basis=excluded.consent_basis,linked_at=now(),anonymised_at=NULL;
  END IF;
  INSERT INTO public.booking_attribution_links(workspace_id,website_id,session_id,booking_reference)VALUES(p_workspace_id,p_website_id,p_session_id,p_booking_reference)
  ON CONFLICT(workspace_id,booking_reference)DO UPDATE SET website_id=excluded.website_id,session_id=excluded.session_id,linked_at=now();RETURN true;
END;$$;

CREATE OR REPLACE FUNCTION public.record_trusted_attribution_conversion(
  p_workspace_id uuid,p_website_id uuid,p_session_id uuid,p_conversion_type text,p_booking_reference text,p_booking_type text,
  p_occurred_at timestamptz,p_revenue_minor bigint,p_currency text,p_source text,p_source_event_id text,p_safe_metadata jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_conversion_type NOT IN('form_submitted','booking_created','booking_confirmed','booking_cancelled','appointment_completed','payment_succeeded')
     OR p_source NOT IN('ks_os','website_server') OR (p_conversion_type='form_submitted' AND p_source<>'website_server')
     OR (p_conversion_type<>'form_submitted' AND p_source<>'ks_os') OR abs(extract(epoch FROM(now()-p_occurred_at)))>86400
     OR (p_booking_type IS NOT NULL AND p_booking_type NOT IN('shop','mobile'))
     OR (p_conversion_type='payment_succeeded')<>(p_revenue_minor IS NOT NULL AND p_revenue_minor>=0 AND p_currency~'^[A-Z]{3}$')
     OR jsonb_typeof(coalesce(p_safe_metadata,'{}'))<>'object' OR octet_length(coalesce(p_safe_metadata,'{}')::text)>4096
     OR (coalesce(p_safe_metadata,'{}')-ARRAY['paymentMode','status','test','serviceCategory'])<>'{}'::jsonb THEN RAISE EXCEPTION 'Invalid trusted conversion';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.workspaces w JOIN public.workspace_modules m ON m.workspace_id=w.id AND m.module::text='analytics' AND m.enabled=true WHERE w.id=p_workspace_id AND w.status='active') THEN RAISE EXCEPTION 'Attribution workspace unavailable';END IF;
  IF p_website_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.website_sites WHERE id=p_website_id AND workspace_id=p_workspace_id) THEN RAISE EXCEPTION 'Cross-workspace website rejected';END IF;
  IF p_session_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.attribution_sessions WHERE id=p_session_id AND workspace_id=p_workspace_id AND (p_website_id IS NULL OR website_id=p_website_id)) THEN RAISE EXCEPTION 'Cross-workspace session rejected';END IF;
  INSERT INTO public.attribution_conversions(workspace_id,website_id,session_id,conversion_type,booking_reference,booking_type,occurred_at,revenue_minor,currency,source,source_event_id,safe_metadata)
  VALUES(p_workspace_id,p_website_id,p_session_id,p_conversion_type,nullif(left(p_booking_reference,200),''),p_booking_type,p_occurred_at,p_revenue_minor,upper(p_currency),p_source,p_source_event_id,coalesce(p_safe_metadata,'{}'))
  ON CONFLICT(workspace_id,source,source_event_id)DO NOTHING RETURNING id INTO v_id;
  INSERT INTO public.analytics_runtime_health(workspace_id,component,status,last_success_at,checked_at)VALUES(p_workspace_id,'trusted_ingestion','healthy',now(),now())
  ON CONFLICT(workspace_id,component)DO UPDATE SET status='healthy',last_success_at=now(),last_error_code=NULL,checked_at=now();
  IF p_conversion_type='payment_succeeded' THEN
    INSERT INTO public.analytics_runtime_health(workspace_id,component,status,last_success_at,checked_at)VALUES(p_workspace_id,'stripe_webhook','healthy',now(),now())
    ON CONFLICT(workspace_id,component)DO UPDATE SET status='healthy',last_success_at=now(),last_error_code=NULL,checked_at=now();
  END IF;
  RETURN v_id;
END;$$;

CREATE OR REPLACE FUNCTION public.recalculate_workspace_attribution(p_workspace_id uuid,p_from date,p_to date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_actor uuid:=auth.uid();v_version integer;v_count integer;
BEGIN
  IF v_actor IS NULL OR NOT public.has_workspace_role(p_workspace_id,ARRAY['owner','admin']::public.workspace_role[]) THEN RAISE EXCEPTION 'Insufficient attribution privileges';END IF;
  IF p_to<p_from OR p_to-p_from>366 THEN RAISE EXCEPTION 'Invalid recalculation range';END IF;
  SELECT coalesce(max(model_version),0)+1 INTO v_version FROM public.attribution_models WHERE workspace_id=p_workspace_id;
  INSERT INTO public.attribution_models(workspace_id,conversion_id,model_type,touchpoint_id,channel,source,medium,campaign,model_version,calculation_reason)
  SELECT c.workspace_id,c.id,'first_touch',t.id,coalesce(t.channel,'unknown'),t.source,t.medium,t.campaign,v_version,'Prompt 10 deterministic first touch'
  FROM public.attribution_conversions c LEFT JOIN LATERAL(SELECT x.* FROM public.attribution_touchpoints x WHERE x.workspace_id=c.workspace_id AND x.session_id=c.session_id AND x.occurred_at<=c.occurred_at ORDER BY x.occurred_at,x.id LIMIT 1)t ON true
  WHERE c.workspace_id=p_workspace_id AND c.occurred_at>=p_from AND c.occurred_at<p_to+1;
  INSERT INTO public.attribution_models(workspace_id,conversion_id,model_type,touchpoint_id,channel,source,medium,campaign,model_version,calculation_reason)
  SELECT c.workspace_id,c.id,'last_touch',t.id,coalesce(t.channel,'unknown'),t.source,t.medium,t.campaign,v_version,'Prompt 10 non-direct last touch'
  FROM public.attribution_conversions c LEFT JOIN LATERAL(SELECT x.* FROM public.attribution_touchpoints x WHERE x.workspace_id=c.workspace_id AND x.session_id=c.session_id AND x.occurred_at<=c.occurred_at ORDER BY CASE WHEN x.channel='direct' THEN 1 ELSE 0 END,x.occurred_at DESC,x.id DESC LIMIT 1)t ON true
  WHERE c.workspace_id=p_workspace_id AND c.occurred_at>=p_from AND c.occurred_at<p_to+1;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  DELETE FROM public.analytics_daily_rollups WHERE workspace_id=p_workspace_id AND rollup_date BETWEEN p_from AND p_to;
  INSERT INTO public.analytics_daily_rollups(workspace_id,website_id,channel,source,campaign,rollup_date,sessions,model_version)
  SELECT workspace_id,website_id,first_channel,coalesce(first_source,''),coalesce(utm_campaign,''),first_seen_at::date,count(*),v_version
  FROM public.attribution_sessions WHERE workspace_id=p_workspace_id AND first_seen_at>=p_from AND first_seen_at<p_to+1
  GROUP BY workspace_id,website_id,first_channel,coalesce(first_source,''),coalesce(utm_campaign,''),first_seen_at::date;
  INSERT INTO public.analytics_daily_rollups(workspace_id,website_id,channel,source,campaign,rollup_date,cta_clicks,booking_starts,model_version)
  SELECT t.workspace_id,t.website_id,t.channel,coalesce(t.source,''),coalesce(t.campaign,''),t.occurred_at::date,
    count(*)FILTER(WHERE t.event_name='booking_cta_clicked'),count(*)FILTER(WHERE t.event_name='booking_started'),v_version
  FROM public.attribution_touchpoints t WHERE t.workspace_id=p_workspace_id AND t.occurred_at>=p_from AND t.occurred_at<p_to+1 AND t.event_name IN('booking_cta_clicked','booking_started')
  GROUP BY t.workspace_id,t.website_id,t.channel,coalesce(t.source,''),coalesce(t.campaign,''),t.occurred_at::date
  ON CONFLICT(workspace_id,website_id,channel,source,campaign,rollup_date,currency)DO UPDATE SET cta_clicks=excluded.cta_clicks,booking_starts=excluded.booking_starts,calculated_at=now(),model_version=v_version;
  INSERT INTO public.analytics_daily_rollups(workspace_id,website_id,channel,source,campaign,rollup_date,confirmed_bookings,shop_bookings,mobile_bookings,model_version)
  SELECT c.workspace_id,c.website_id,m.channel,coalesce(m.source,''),coalesce(m.campaign,''),c.occurred_at::date,count(*),
    count(*)FILTER(WHERE c.booking_type='shop'),count(*)FILTER(WHERE c.booking_type='mobile'),v_version
  FROM public.attribution_conversions c JOIN public.attribution_models m ON m.conversion_id=c.id AND m.model_type='last_touch' AND m.model_version=v_version
  WHERE c.workspace_id=p_workspace_id AND c.conversion_type='booking_confirmed' AND c.website_id IS NOT NULL AND c.occurred_at>=p_from AND c.occurred_at<p_to+1
  GROUP BY c.workspace_id,c.website_id,m.channel,coalesce(m.source,''),coalesce(m.campaign,''),c.occurred_at::date
  ON CONFLICT(workspace_id,website_id,channel,source,campaign,rollup_date,currency)DO UPDATE SET confirmed_bookings=excluded.confirmed_bookings,shop_bookings=excluded.shop_bookings,mobile_bookings=excluded.mobile_bookings,calculated_at=now(),model_version=v_version;
  INSERT INTO public.analytics_daily_rollups(workspace_id,website_id,channel,source,campaign,rollup_date,verified_revenue_minor,currency,model_version)
  SELECT c.workspace_id,c.website_id,m.channel,coalesce(m.source,''),coalesce(m.campaign,''),c.occurred_at::date,sum(c.revenue_minor),c.currency,v_version
  FROM public.attribution_conversions c JOIN public.attribution_models m ON m.conversion_id=c.id AND m.model_type='last_touch' AND m.model_version=v_version
  WHERE c.workspace_id=p_workspace_id AND c.conversion_type='payment_succeeded' AND c.website_id IS NOT NULL AND c.occurred_at>=p_from AND c.occurred_at<p_to+1
  GROUP BY c.workspace_id,c.website_id,m.channel,coalesce(m.source,''),coalesce(m.campaign,''),c.occurred_at::date,c.currency
  ON CONFLICT(workspace_id,website_id,channel,source,campaign,rollup_date,currency)DO UPDATE SET verified_revenue_minor=excluded.verified_revenue_minor,calculated_at=now(),model_version=v_version;
  INSERT INTO public.audit_logs(workspace_id,actor_id,action,entity_type,metadata)VALUES(p_workspace_id,v_actor,'analytics.recalculated','attribution',jsonb_build_object('from',p_from,'to',p_to,'modelVersion',v_version));
  RETURN jsonb_build_object('modelVersion',v_version,'lastTouchRows',v_count);
END;$$;

CREATE OR REPLACE FUNCTION public.anonymise_attribution_session(p_workspace_id uuid,p_session_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_actor uuid:=auth.uid();v_changed integer;
BEGIN
  IF v_actor IS NULL OR NOT public.has_workspace_role(p_workspace_id,ARRAY['owner','admin']::public.workspace_role[]) THEN RAISE EXCEPTION 'Insufficient privacy privileges';END IF;
  UPDATE public.attribution_identities SET customer_reference=NULL,identity_hmac=NULL,anonymised_at=now() WHERE workspace_id=p_workspace_id AND session_id=p_session_id;GET DIAGNOSTICS v_changed=ROW_COUNT;
  UPDATE public.attribution_sessions SET consent_state='withdrawn',referrer_host=NULL,user_agent_family=NULL WHERE workspace_id=p_workspace_id AND id=p_session_id;
  UPDATE public.attribution_touchpoints SET safe_metadata='{}' WHERE workspace_id=p_workspace_id AND session_id=p_session_id;
  DELETE FROM public.booking_attribution_links WHERE workspace_id=p_workspace_id AND session_id=p_session_id;
  UPDATE public.attribution_conversions SET booking_reference=NULL,safe_metadata='{}' WHERE workspace_id=p_workspace_id AND session_id=p_session_id;
  INSERT INTO public.audit_logs(workspace_id,actor_id,action,entity_type,entity_id,metadata)VALUES(p_workspace_id,v_actor,'analytics.session_anonymised','attribution_session',p_session_id,'{}');RETURN v_changed>0;
END;$$;

CREATE OR REPLACE FUNCTION public.apply_analytics_retention(p_workspace_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_days integer;v_count integer;
BEGIN
  SELECT coalesce((SELECT retention_days FROM public.analytics_retention_settings WHERE workspace_id=p_workspace_id),365) INTO v_days;
  DELETE FROM public.attribution_sessions WHERE workspace_id=p_workspace_id AND last_seen_at<now()-make_interval(days=>v_days);GET DIAGNOSTICS v_count=ROW_COUNT;RETURN v_count;
END;$$;

CREATE OR REPLACE FUNCTION public.set_analytics_retention(p_workspace_id uuid,p_retention_days integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_actor uuid:=auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.has_workspace_role(p_workspace_id,ARRAY['owner','admin']::public.workspace_role[]) THEN RAISE EXCEPTION 'Insufficient privacy privileges';END IF;
  IF p_retention_days NOT BETWEEN 30 AND 730 THEN RAISE EXCEPTION 'Invalid retention period';END IF;
  INSERT INTO public.analytics_retention_settings(workspace_id,retention_days,updated_by,updated_at)VALUES(p_workspace_id,p_retention_days,v_actor,now())
  ON CONFLICT(workspace_id)DO UPDATE SET retention_days=excluded.retention_days,updated_by=v_actor,updated_at=now();
  INSERT INTO public.audit_logs(workspace_id,actor_id,action,entity_type,metadata)VALUES(p_workspace_id,v_actor,'analytics.retention_updated','analytics_settings',jsonb_build_object('retentionDays',p_retention_days));
END;$$;

REVOKE ALL ON FUNCTION public.record_browser_attribution_event(uuid,uuid,uuid,text,text,timestamptz,text,text,public.attribution_channel,text,text,text,text,text,public.attribution_consent,text,jsonb),public.link_attribution_identity(uuid,uuid,uuid,text,text,public.attribution_consent),public.link_booking_attribution(uuid,uuid,uuid,text,text,public.attribution_consent),public.record_trusted_attribution_conversion(uuid,uuid,uuid,text,text,text,timestamptz,bigint,text,text,text,jsonb),public.apply_analytics_retention(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_browser_attribution_event(uuid,uuid,uuid,text,text,timestamptz,text,text,public.attribution_channel,text,text,text,text,text,public.attribution_consent,text,jsonb),public.link_attribution_identity(uuid,uuid,uuid,text,text,public.attribution_consent),public.link_booking_attribution(uuid,uuid,uuid,text,text,public.attribution_consent),public.record_trusted_attribution_conversion(uuid,uuid,uuid,text,text,text,timestamptz,bigint,text,text,text,jsonb),public.apply_analytics_retention(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.recalculate_workspace_attribution(uuid,date,date),public.anonymise_attribution_session(uuid,uuid),public.set_analytics_retention(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.recalculate_workspace_attribution(uuid,date,date),public.anonymise_attribution_session(uuid,uuid),public.set_analytics_retention(uuid,integer) TO authenticated;
