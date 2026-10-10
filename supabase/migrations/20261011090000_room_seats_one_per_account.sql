-- Signed-in users who join through the invite link are seated with their account, so they can
-- take over as host. An account holds at most one seat per room; guests without an account
-- (user_id null) are not limited.
create unique index room_seats_one_seat_per_account
  on public.room_seats (room_id, user_id)
  where user_id is not null;

comment on column public.room_seats.user_id is
  'Account of the seated player (host, or a signed-in user who joined through the link); null for guests';
