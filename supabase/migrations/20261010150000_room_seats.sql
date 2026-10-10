-- Lobby support: hosts choose a seat count, and seats are tracked in room_seats until (and after)
-- the host starts the game. Seat credentials are stored only as SHA-256 hashes.

-------------------------------------------------------------------------------
-- rooms.max_seats
-------------------------------------------------------------------------------
-- The temporary default only fills rows that might already exist; new rows must set it.
alter table public.rooms
  add column max_seats int not null default 2 check (max_seats between 1 and 16);
alter table public.rooms alter column max_seats drop default;

grant select (max_seats) on public.rooms to authenticated;

-------------------------------------------------------------------------------
-- room_seats: who sits where. Server-only.
-------------------------------------------------------------------------------
create table public.room_seats (
  room_id text not null references public.rooms (id) on delete cascade,
  seat_index int not null check (seat_index between 0 and 15),
  name text not null check (char_length(name) between 1 and 24),
  user_id uuid references public.profiles (id) on delete cascade, -- set for the host's seat
  credentials_hash text not null,
  joined_at timestamptz not null default now(),
  primary key (room_id, seat_index)
);

alter table public.room_seats enable row level security;
revoke all on public.room_seats from anon, authenticated;
-- no policies: only the server (direct DB connection) can access seats
