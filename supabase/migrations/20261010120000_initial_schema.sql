-- Initial schema: profiles, rooms, cards, and the private bgio schema for boardgame.io state.
-- Security model: RLS on every table, default deny. The browser (anon/authenticated) only gets
-- what is explicitly granted below; everything else goes through the server.

-- New tables in public must not be readable by anon/authenticated unless granted explicitly.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-------------------------------------------------------------------------------
-- profiles: one row per admin-created user
-------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy "users read own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "users update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Create a profile automatically when the admin creates a user.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1), 'player'), 40)
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-------------------------------------------------------------------------------
-- rooms: one row per live room, deleted when the game finishes or goes stale
-------------------------------------------------------------------------------
create table public.rooms (
  id text primary key, -- boardgame.io matchID
  game_id text not null,
  host_user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'playing')),
  invite_token_hash text not null,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create index rooms_host_user_id_idx on public.rooms (host_user_id);
create index rooms_last_activity_at_idx on public.rooms (last_activity_at);

alter table public.rooms enable row level security;
revoke all on public.rooms from anon, authenticated;
-- Hosts may list their rooms, but never see the invite token hash. All writes go through the server.
grant select (id, game_id, host_user_id, status, created_at, last_activity_at)
  on public.rooms to authenticated;

create policy "hosts read own rooms" on public.rooms
  for select to authenticated
  using (host_user_id = (select auth.uid()));

-------------------------------------------------------------------------------
-- cards: card data imported from the local, gitignored data/ folder. Server-only.
-------------------------------------------------------------------------------
create table public.cards (
  game_id text not null,
  external_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (game_id, external_id)
);

alter table public.cards enable row level security;
revoke all on public.cards from anon, authenticated;
-- no policies: only the server (service role / direct connection) can access cards

-------------------------------------------------------------------------------
-- bgio: boardgame.io match storage. Separate schema, not exposed through the Data API.
-------------------------------------------------------------------------------
create schema bgio;
revoke all on schema bgio from public, anon, authenticated;

create table bgio.matches (
  match_id text primary key,
  game_name text not null,
  state jsonb,
  initial_state jsonb,
  metadata jsonb not null,
  log jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table bgio.matches enable row level security;
revoke all on bgio.matches from public, anon, authenticated;
