alter table if exists public.osu_verification_settings
  add column if not exists channel_id text;
