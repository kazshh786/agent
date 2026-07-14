-- Prompt 9: tenant-isolated, versioned and idempotent automation engine.

ALTER TYPE public.workspace_module ADD VALUE IF NOT EXISTS 'automations';

CREATE TABLE public.automation_definitions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL CHECK(length(name) BETWEEN 2 AND 120),
  description text CHECK(description IS NULL OR length(description)<=500),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','paused','archived')),
  latest_version_id uuid,
  active_version_id uuid,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.automation_versions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automation_definitions(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK(version_number>0),
  trigger_type text NOT NULL CHECK(trigger_type IN('contact.created','website.form_submitted','booking.created','booking.cancelled','appointment.completed','contact.added_to_list')),
  definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object' AND octet_length(definition::text)<=32768),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(automation_id,version_number),UNIQUE(workspace_id,id)
);
ALTER TABLE public.automation_definitions ADD CONSTRAINT automation_latest_version_fk FOREIGN KEY(workspace_id,latest_version_id) REFERENCES public.automation_versions(workspace_id,id) ON DELETE RESTRICT;
ALTER TABLE public.automation_definitions ADD CONSTRAINT automation_active_version_fk FOREIGN KEY(workspace_id,active_version_id) REFERENCES public.automation_versions(workspace_id,id) ON DELETE RESTRICT;

CREATE TABLE public.automation_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_type text NOT NULL,source text NOT NULL CHECK(source IN('website','ks_os','contacts','test')),
  source_event_id text NOT NULL CHECK(length(source_event_id) BETWEEN 8 AND 200),subject_type text NOT NULL CHECK(length(subject_type) BETWEEN 2 AND 50),
  subject_id text NOT NULL CHECK(length(subject_id) BETWEEN 1 AND 200),causation_id uuid,depth integer NOT NULL DEFAULT 0 CHECK(depth BETWEEN 0 AND 3),
  occurred_at timestamptz NOT NULL,safe_payload jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(safe_payload)='object' AND octet_length(safe_payload::text)<=16384),
  received_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,source,source_event_id)
);
CREATE TABLE public.automation_runs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES public.automation_definitions(id) ON DELETE CASCADE,
  automation_version_id uuid NOT NULL REFERENCES public.automation_versions(id) ON DELETE RESTRICT,
  event_id uuid NOT NULL REFERENCES public.automation_events(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','waiting','completed','failed','cancelled')),
  current_step integer NOT NULL DEFAULT 0 CHECK(current_step>=0),attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 100),
  next_run_at timestamptz NOT NULL DEFAULT now(),lease_token uuid,lease_until timestamptz,
  started_at timestamptz,completed_at timestamptz,failure_code text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(automation_version_id,event_id)
);
CREATE INDEX automation_runs_claim_idx ON public.automation_runs(status,next_run_at,lease_until);
CREATE TABLE public.automation_run_steps(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),run_id uuid NOT NULL REFERENCES public.automation_runs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,step_index integer NOT NULL CHECK(step_index BETWEEN 0 AND 24),
  action_type text NOT NULL,status text NOT NULL CHECK(status IN('running','waiting','completed','failed','cancelled')),
  attempt_count integer NOT NULL DEFAULT 1 CHECK(attempt_count BETWEEN 1 AND 3),started_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
  next_retry_at timestamptz,controlled_error_code text,safe_output jsonb NOT NULL DEFAULT '{}' CHECK(octet_length(safe_output::text)<=8192),
  UNIQUE(run_id,step_index,attempt_count)
);
CREATE TABLE public.automation_scheduled_tasks(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.automation_runs(id) ON DELETE CASCADE,execute_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK(status IN('scheduled','claimed','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(run_id,execute_at)
);
CREATE TABLE public.internal_notifications(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  automation_run_id uuid REFERENCES public.automation_runs(id) ON DELETE SET NULL,step_index integer CHECK(step_index BETWEEN 0 AND 24),title text NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
  message text NOT NULL CHECK(length(message) BETWEEN 1 AND 1000),severity text NOT NULL DEFAULT 'info' CHECK(severity IN('info','success','warning','error')),
  read_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(automation_run_id,step_index)
);
CREATE TABLE public.automation_contact_tags(
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,contact_id text NOT NULL,tag text NOT NULL CHECK(length(tag) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,contact_id,tag)
);
CREATE TABLE public.automation_contact_list_members(
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,contact_id text NOT NULL,list_key text NOT NULL CHECK(length(list_key) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,contact_id,list_key)
);

ALTER TABLE public.automation_definitions ENABLE ROW LEVEL SECURITY;ALTER TABLE public.automation_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_events ENABLE ROW LEVEL SECURITY;ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_run_steps ENABLE ROW LEVEL SECURITY;ALTER TABLE public.automation_scheduled_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_notifications ENABLE ROW LEVEL SECURITY;ALTER TABLE public.automation_contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_contact_list_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY automation_definitions_read ON public.automation_definitions FOR SELECT USING(public.is_workspace_member(workspace_id));
CREATE POLICY automation_versions_read ON public.automation_versions FOR SELECT USING(public.is_workspace_member(workspace_id));
CREATE POLICY automation_events_read ON public.automation_events FOR SELECT USING(public.is_workspace_member(workspace_id));
CREATE POLICY automation_runs_read ON public.automation_runs FOR SELECT USING(public.is_workspace_member(workspace_id));
CREATE POLICY automation_run_steps_read ON public.automation_run_steps FOR SELECT USING(public.is_workspace_member(workspace_id));
CREATE POLICY automation_scheduled_tasks_read ON public.automation_scheduled_tasks FOR SELECT USING(public.is_workspace_member(workspace_id));
CREATE POLICY internal_notifications_read ON public.internal_notifications FOR SELECT USING(public.is_workspace_member(workspace_id));
CREATE POLICY automation_contact_tags_read ON public.automation_contact_tags FOR SELECT USING(public.is_workspace_member(workspace_id));
CREATE POLICY automation_contact_lists_read ON public.automation_contact_list_members FOR SELECT USING(public.is_workspace_member(workspace_id));

REVOKE ALL ON public.automation_definitions,public.automation_versions,public.automation_events,public.automation_runs,public.automation_run_steps,public.automation_scheduled_tasks,public.internal_notifications,public.automation_contact_tags,public.automation_contact_list_members FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.automation_definitions,public.automation_versions,public.automation_events,public.automation_runs,public.automation_run_steps,public.automation_scheduled_tasks,public.internal_notifications,public.automation_contact_tags,public.automation_contact_list_members TO authenticated;

CREATE OR REPLACE FUNCTION public.create_automation_draft(p_workspace_id uuid,p_name text,p_description text,p_trigger_type text,p_definition jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;v_version uuid;
BEGIN
  IF NOT public.has_workspace_role(p_workspace_id,ARRAY['owner','admin','editor']::public.workspace_role[]) THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.workspaces WHERE id=p_workspace_id AND status='active') THEN RAISE EXCEPTION 'Workspace is not active'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.workspace_modules WHERE workspace_id=p_workspace_id AND module::text='automations' AND enabled=true) THEN RAISE EXCEPTION 'Automation module is disabled'; END IF;
  IF p_trigger_type NOT IN('contact.created','website.form_submitted','booking.created','booking.cancelled','appointment.completed','contact.added_to_list') OR jsonb_typeof(p_definition->'steps')<>'array' OR jsonb_array_length(p_definition->'steps') NOT BETWEEN 1 AND 25 THEN RAISE EXCEPTION 'Invalid automation definition'; END IF;
  INSERT INTO public.automation_definitions(workspace_id,name,description,created_by)VALUES(p_workspace_id,trim(p_name),nullif(trim(p_description),''),auth.uid())RETURNING id INTO v_id;
  INSERT INTO public.automation_versions(automation_id,workspace_id,version_number,trigger_type,definition,created_by)VALUES(v_id,p_workspace_id,1,p_trigger_type,p_definition,auth.uid())RETURNING id INTO v_version;
  UPDATE public.automation_definitions SET latest_version_id=v_version WHERE id=v_id;
  INSERT INTO public.audit_logs(workspace_id,actor_id,action,entity_type,entity_id,metadata)VALUES(p_workspace_id,auth.uid(),'automation.created','automation',v_id,jsonb_build_object('triggerType',p_trigger_type,'versionId',v_version));RETURN v_id;
END;$$;

CREATE OR REPLACE FUNCTION public.create_automation_version(p_automation_id uuid,p_trigger_type text,p_definition jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_def public.automation_definitions;v_id uuid;v_number integer;
BEGIN
  SELECT * INTO v_def FROM public.automation_definitions WHERE id=p_automation_id FOR UPDATE;
  IF v_def.id IS NULL OR NOT public.has_workspace_role(v_def.workspace_id,ARRAY['owner','admin','editor']::public.workspace_role[]) THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.workspaces WHERE id=v_def.workspace_id AND status='active') OR NOT EXISTS(SELECT 1 FROM public.workspace_modules WHERE workspace_id=v_def.workspace_id AND module::text='automations' AND enabled=true) THEN RAISE EXCEPTION 'Automation workspace unavailable';END IF;
  IF v_def.status='archived' OR p_trigger_type NOT IN('contact.created','website.form_submitted','booking.created','booking.cancelled','appointment.completed','contact.added_to_list') OR jsonb_typeof(p_definition->'steps')<>'array' OR jsonb_array_length(p_definition->'steps') NOT BETWEEN 1 AND 25 THEN RAISE EXCEPTION 'Invalid automation definition'; END IF;
  SELECT coalesce(max(version_number),0)+1 INTO v_number FROM public.automation_versions WHERE automation_id=p_automation_id;
  INSERT INTO public.automation_versions(automation_id,workspace_id,version_number,trigger_type,definition,created_by)VALUES(p_automation_id,v_def.workspace_id,v_number,p_trigger_type,p_definition,auth.uid())RETURNING id INTO v_id;
  UPDATE public.automation_definitions SET latest_version_id=v_id,updated_at=now() WHERE id=p_automation_id;
  INSERT INTO public.audit_logs(workspace_id,actor_id,action,entity_type,entity_id,metadata)VALUES(v_def.workspace_id,auth.uid(),'automation.version_created','automation',p_automation_id,jsonb_build_object('versionId',v_id,'versionNumber',v_number));RETURN v_id;
END;$$;

CREATE OR REPLACE FUNCTION public.set_automation_state(p_automation_id uuid,p_version_id uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_def public.automation_definitions;v_version public.automation_versions;v_step jsonb;v_config jsonb;v_type text;v_match text[];
BEGIN
  SELECT * INTO v_def FROM public.automation_definitions WHERE id=p_automation_id FOR UPDATE;
  IF v_def.id IS NULL OR NOT public.has_workspace_role(v_def.workspace_id,ARRAY['owner','admin']::public.workspace_role[]) THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.workspaces WHERE id=v_def.workspace_id AND status='active') OR NOT EXISTS(SELECT 1 FROM public.workspace_modules WHERE workspace_id=v_def.workspace_id AND module::text='automations' AND enabled=true) THEN RAISE EXCEPTION 'Automation workspace unavailable';END IF;
  IF p_status NOT IN('active','paused','archived') THEN RAISE EXCEPTION 'Invalid automation state'; END IF;
  IF p_status='active' THEN
    SELECT * INTO v_version FROM public.automation_versions WHERE id=p_version_id AND automation_id=p_automation_id;
    IF v_version.id IS NULL THEN RAISE EXCEPTION 'Version not found'; END IF;
    FOR v_step IN SELECT value FROM jsonb_array_elements(v_version.definition->'steps') LOOP
      v_type:=v_step->>'type';
      v_config:=v_step->'config';
      IF jsonb_typeof(v_step)<>'object' OR (v_step-ARRAY['type','config'])<>'{}'::jsonb OR jsonb_typeof(v_config)<>'object' THEN RAISE EXCEPTION 'Invalid action shape';END IF;
      IF v_type NOT IN('contact.add_tag','contact.remove_tag','contact.add_to_list','internal_notification.create','booking_link.create','delay.until') THEN RAISE EXCEPTION 'Action is unavailable for initial launch'; END IF;
      IF v_config::text ~* '(javascript:|data:|<script|https?://|\$\(|`|\mselect\M.+\mfrom\M|\m(drop|alter|insert|update)\M[[:space:]]+\mtable\M)' THEN RAISE EXCEPTION 'Unsafe automation action';END IF;
      IF v_type IN('contact.add_tag','contact.remove_tag') AND ((v_config-ARRAY['tag'])<>'{}'::jsonb OR length(trim(v_config->>'tag')) NOT BETWEEN 1 AND 60) THEN RAISE EXCEPTION 'Invalid tag action';END IF;
      IF v_type='contact.add_to_list' AND ((v_config-ARRAY['listKey'])<>'{}'::jsonb OR length(trim(v_config->>'listKey')) NOT BETWEEN 1 AND 80) THEN RAISE EXCEPTION 'Invalid list action';END IF;
      IF v_type='internal_notification.create' AND ((v_config-ARRAY['title','message','severity'])<>'{}'::jsonb OR length(trim(v_config->>'title')) NOT BETWEEN 1 AND 120 OR length(trim(v_config->>'message')) NOT BETWEEN 1 AND 1000 OR coalesce(v_config->>'severity','info') NOT IN('info','success','warning','error')) THEN RAISE EXCEPTION 'Invalid notification action';END IF;
      IF v_type='booking_link.create' AND ((v_config-ARRAY['title'])<>'{}'::jsonb OR (v_config ? 'title' AND length(trim(v_config->>'title')) NOT BETWEEN 1 AND 120)) THEN RAISE EXCEPTION 'Invalid booking link action';END IF;
      IF v_type='delay.until' AND ((v_config-ARRAY['seconds','at'])<>'{}'::jsonb OR (NOT(v_config ? 'seconds') AND NOT(v_config ? 'at')) OR (v_config ? 'seconds' AND ((v_config->>'seconds') !~ '^[0-9]+$' OR (v_config->>'seconds')::bigint NOT BETWEEN 60 AND 7776000)) OR (v_config ? 'at' AND ((v_config->>'at')::timestamptz<=now() OR (v_config->>'at')::timestamptz>now()+interval '90 days'))) THEN RAISE EXCEPTION 'Invalid delay action';END IF;
      FOR v_match IN SELECT regexp_matches(v_config::text,'\{\{\s*([a-z0-9_.]+)\s*\}\}','gi') LOOP
        IF v_match[1] NOT IN('contact.id','booking.reference','booking.start_time','booking.end_time','booking.channel','workspace.name','website.booking_url') THEN RAISE EXCEPTION 'Unknown automation variable';END IF;
      END LOOP;
    END LOOP;
    UPDATE public.automation_definitions SET status='active',active_version_id=p_version_id,updated_at=now() WHERE id=p_automation_id;
  ELSE UPDATE public.automation_definitions SET status=p_status,active_version_id=CASE WHEN p_status='archived' THEN NULL ELSE active_version_id END,updated_at=now() WHERE id=p_automation_id;END IF;
  INSERT INTO public.audit_logs(workspace_id,actor_id,action,entity_type,entity_id,metadata)VALUES(v_def.workspace_id,auth.uid(),'automation.'||p_status,'automation',p_automation_id,jsonb_build_object('versionId',p_version_id));
END;$$;

CREATE OR REPLACE FUNCTION public.ingest_automation_event(p_workspace_id uuid,p_event_type text,p_source text,p_source_event_id text,p_subject_type text,p_subject_id text,p_occurred_at timestamptz,p_safe_payload jsonb,p_causation_id uuid DEFAULT NULL,p_depth integer DEFAULT 0)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_event uuid;v_def record;
BEGIN
  IF p_event_type NOT IN('contact.created','website.form_submitted','booking.created','booking.cancelled','appointment.completed','contact.added_to_list') OR p_source NOT IN('website','ks_os','contacts','test') OR p_depth NOT BETWEEN 0 AND 3 OR abs(extract(epoch from(now()-p_occurred_at)))>86400 THEN RAISE EXCEPTION 'Invalid automation event'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.workspaces WHERE id=p_workspace_id AND status='active') OR NOT EXISTS(SELECT 1 FROM public.workspace_modules WHERE workspace_id=p_workspace_id AND module::text='automations' AND enabled=true) THEN RAISE EXCEPTION 'Automation workspace unavailable';END IF;
  IF jsonb_typeof(p_safe_payload)<>'object' OR octet_length(p_safe_payload::text)>8192 THEN RAISE EXCEPTION 'Invalid automation payload';END IF;
  INSERT INTO public.automation_events(workspace_id,event_type,source,source_event_id,subject_type,subject_id,occurred_at,safe_payload,causation_id,depth)
  VALUES(p_workspace_id,p_event_type,p_source,p_source_event_id,p_subject_type,p_subject_id,p_occurred_at,coalesce(p_safe_payload,'{}'),p_causation_id,p_depth)
  ON CONFLICT(workspace_id,source,source_event_id)DO NOTHING RETURNING id INTO v_event;
  IF v_event IS NULL THEN SELECT id INTO v_event FROM public.automation_events WHERE workspace_id=p_workspace_id AND source=p_source AND source_event_id=p_source_event_id;RETURN v_event;END IF;
  FOR v_def IN SELECT d.id,d.active_version_id FROM public.automation_definitions d JOIN public.automation_versions v ON v.id=d.active_version_id WHERE d.workspace_id=p_workspace_id AND d.status='active' AND v.trigger_type=p_event_type LOOP
    INSERT INTO public.automation_runs(workspace_id,automation_id,automation_version_id,event_id)VALUES(p_workspace_id,v_def.id,v_def.active_version_id,v_event)ON CONFLICT DO NOTHING;
  END LOOP;RETURN v_event;
END;$$;

CREATE OR REPLACE FUNCTION public.claim_automation_run(p_lease_seconds integer DEFAULT 60)
RETURNS TABLE(run_id uuid,lease_token uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_run uuid;v_token uuid:=gen_random_uuid();
BEGIN
  IF p_lease_seconds NOT BETWEEN 15 AND 300 THEN RAISE EXCEPTION 'Invalid lease';END IF;
  SELECT id INTO v_run FROM public.automation_runs WHERE status IN('queued','waiting') AND next_run_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_run_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF v_run IS NULL THEN RETURN;END IF;
  UPDATE public.automation_runs SET status='running',lease_token=v_token,lease_until=now()+make_interval(secs=>p_lease_seconds),started_at=coalesce(started_at,now()),attempt_count=attempt_count+1,updated_at=now() WHERE id=v_run;
  RETURN QUERY SELECT v_run,v_token;
END;$$;

CREATE OR REPLACE FUNCTION public.cancel_automation_run(p_run_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_workspace uuid;v_changed integer;
BEGIN
  SELECT workspace_id INTO v_workspace FROM public.automation_runs WHERE id=p_run_id;
  IF v_workspace IS NULL OR NOT public.has_workspace_role(v_workspace,ARRAY['owner','admin','editor']::public.workspace_role[]) THEN RAISE EXCEPTION 'Insufficient permissions';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.workspaces WHERE id=v_workspace AND status='active') OR NOT EXISTS(SELECT 1 FROM public.workspace_modules WHERE workspace_id=v_workspace AND module::text='automations' AND enabled=true) THEN RAISE EXCEPTION 'Automation workspace unavailable';END IF;
  UPDATE public.automation_runs SET status='cancelled',completed_at=now(),lease_token=NULL,lease_until=NULL,updated_at=now()
    WHERE id=p_run_id AND status IN('queued','waiting');GET DIAGNOSTICS v_changed=ROW_COUNT;
  IF v_changed=1 THEN UPDATE public.automation_scheduled_tasks SET status='cancelled' WHERE run_id=p_run_id AND status IN('scheduled','claimed');INSERT INTO public.audit_logs(workspace_id,actor_id,action,entity_type,entity_id,metadata)VALUES(v_workspace,auth.uid(),'automation.run_cancelled','automation_run',p_run_id,'{}');END IF;
  RETURN v_changed=1;
END;$$;

REVOKE ALL ON FUNCTION public.create_automation_draft(uuid,text,text,text,jsonb),public.create_automation_version(uuid,text,jsonb),public.set_automation_state(uuid,uuid,text),public.cancel_automation_run(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_automation_draft(uuid,text,text,text,jsonb),public.create_automation_version(uuid,text,jsonb),public.set_automation_state(uuid,uuid,text),public.cancel_automation_run(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.ingest_automation_event(uuid,text,text,text,text,text,timestamptz,jsonb,uuid,integer),public.claim_automation_run(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_automation_event(uuid,text,text,text,text,text,timestamptz,jsonb,uuid,integer),public.claim_automation_run(integer) TO service_role;
