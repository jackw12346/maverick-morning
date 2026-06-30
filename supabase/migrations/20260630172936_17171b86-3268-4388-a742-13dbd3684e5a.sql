
ALTER TABLE public.briefing_settings
  ADD COLUMN IF NOT EXISTS include_weather boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS include_traffic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weather_location text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS traffic_origin text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS traffic_destination text NOT NULL DEFAULT '';
