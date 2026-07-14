-- Phase 6: distributed booking gateway abuse protection without raw IP storage.
CREATE TABLE public.booking_rate_limits(
  key_hash text NOT NULL,
  bucket_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK(request_count>=0),
  PRIMARY KEY(key_hash,bucket_start)
);
ALTER TABLE public.booking_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_rate_limits FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.consume_booking_rate_limit(
  p_key_hash text,p_limit integer,p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_bucket timestamptz;v_count integer;
BEGIN
  IF p_key_hash !~ '^[0-9a-f]{64}$' OR p_limit NOT BETWEEN 1 AND 1000 OR p_window_seconds NOT BETWEEN 10 AND 3600 THEN
    RAISE EXCEPTION 'Invalid rate limit input';
  END IF;
  v_bucket:=to_timestamp(floor(extract(epoch from now())/p_window_seconds)*p_window_seconds);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_key_hash||v_bucket::text,0));
  INSERT INTO public.booking_rate_limits(key_hash,bucket_start,request_count) VALUES(p_key_hash,v_bucket,1)
  ON CONFLICT(key_hash,bucket_start) DO UPDATE SET request_count=booking_rate_limits.request_count+1
  RETURNING request_count INTO v_count;
  DELETE FROM public.booking_rate_limits WHERE bucket_start<now()-interval '1 day';
  RETURN v_count<=p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_booking_rate_limit(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_booking_rate_limit(text,integer,integer) TO service_role;
