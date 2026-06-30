
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  wake_time TIME NOT NULL DEFAULT '07:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.briefing_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  include_calendar BOOLEAN NOT NULL DEFAULT true,
  include_whoop BOOLEAN NOT NULL DEFAULT true,
  include_batteries BOOLEAN NOT NULL DEFAULT true,
  include_roca_news BOOLEAN NOT NULL DEFAULT true,
  text_to_speech_enabled BOOLEAN NOT NULL DEFAULT true,
  voice TEXT NOT NULL DEFAULT 'alloy',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.briefing_settings TO authenticated;
GRANT ALL ON public.briefing_settings TO service_role;
ALTER TABLE public.briefing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.briefing_settings FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER briefing_settings_updated_at BEFORE UPDATE ON public.briefing_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.briefing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  briefing_text TEXT NOT NULL,
  audio_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.briefing_logs TO authenticated;
GRANT ALL ON public.briefing_logs TO service_role;
ALTER TABLE public.briefing_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own logs" ON public.briefing_logs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX briefing_logs_user_created_idx ON public.briefing_logs(user_id, created_at DESC);

CREATE TABLE public.integration_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected',
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_tokens TO authenticated;
GRANT ALL ON public.integration_tokens TO service_role;
ALTER TABLE public.integration_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own integrations" ON public.integration_tokens FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER integration_tokens_updated_at BEFORE UPDATE ON public.integration_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.smart_home_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT 'other',
  url TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.smart_home_webhooks TO authenticated;
GRANT ALL ON public.smart_home_webhooks TO service_role;
ALTER TABLE public.smart_home_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own webhooks" ON public.smart_home_webhooks FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.briefing_settings (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
