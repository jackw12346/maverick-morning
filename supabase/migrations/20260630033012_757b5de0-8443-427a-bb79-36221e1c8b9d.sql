
-- 1. oauth_states: short-lived state tokens for OAuth handshakes
CREATE TABLE public.oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  redirect_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);
GRANT ALL ON public.oauth_states TO service_role;
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
-- No public policies: only service_role (server) touches this table.

-- 2. device_batteries: per-user device battery snapshots
CREATE TABLE public.device_batteries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_name text NOT NULL,
  level int NOT NULL CHECK (level >= 0 AND level <= 100),
  is_charging boolean,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_batteries TO authenticated;
GRANT ALL ON public.device_batteries TO service_role;
ALTER TABLE public.device_batteries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own batteries" ON public.device_batteries
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. ingest_token on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ingest_token uuid NOT NULL DEFAULT gen_random_uuid();
-- backfill any existing rows (DEFAULT handles new; existing already have via NOT NULL DEFAULT)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_ingest_token_idx ON public.profiles(ingest_token);

-- 4. scope column on integration_tokens
ALTER TABLE public.integration_tokens
  ADD COLUMN IF NOT EXISTS scope text;

-- 5. update handle_new_user to ensure ingest_token is set
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.briefing_settings (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;
