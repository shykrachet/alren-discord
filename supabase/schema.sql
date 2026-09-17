create table if not exists public.osu_verification_settings (
  guild_id text primary key,
  role_id text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.osu_verifications (
  guild_id text not null,
  discord_user_id text not null,
  osu_user_id text not null,
  osu_username text not null,
  verified_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id),
  unique (guild_id, osu_user_id)
);

create table if not exists public.osu_verification_requests (
  state text primary key,
  guild_id text not null,
  channel_id text not null,
  discord_user_id text not null,
  osu_user_id text not null,
  expires_at timestamptz not null
);

alter table public.osu_verification_settings enable row level security;
alter table public.osu_verifications enable row level security;
alter table public.osu_verification_requests enable row level security;
