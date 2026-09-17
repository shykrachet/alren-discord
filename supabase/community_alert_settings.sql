-- Run this in Supabase SQL Editor before using /community-alert-settings.
-- One row is stored for each Discord server that enables community alerts.
CREATE TABLE IF NOT EXISTS public.community_alert_settings (
  guild_id text PRIMARY KEY,
  channel_id text NOT NULL,
  bn_mode_filter text NOT NULL DEFAULT 'all'
    CHECK (bn_mode_filter IN ('all', 'osu', 'taiko', 'catch', 'mania')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_alert_settings ENABLE ROW LEVEL SECURITY;
