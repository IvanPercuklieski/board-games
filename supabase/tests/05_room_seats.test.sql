-- room_seats: server-only seat list for a room; deleted with the room.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(14);

select has_table('public', 'room_seats', 'public.room_seats exists');
select col_is_pk('public', 'room_seats', array['room_id', 'seat_index'], 'PK is (room_id, seat_index)');

insert into auth.users (id, email, aud, role)
values ('11111111-1111-1111-1111-111111111111', 'alice@test.local', 'authenticated', 'authenticated');

insert into public.rooms (id, game_id, host_user_id, invite_token_hash, max_seats)
values ('room-a', 'tictactoe', '11111111-1111-1111-1111-111111111111', 'hash-a', 2);

insert into public.room_seats (room_id, seat_index, name, user_id, credentials_hash)
values ('room-a', 0, 'Alice', '11111111-1111-1111-1111-111111111111', 'cred-hash-0');

select is(
  (select joined_at is not null from public.room_seats where room_id = 'room-a' and seat_index = 0),
  true,
  'joined_at defaults to now'
);

select throws_ok(
  $$insert into public.room_seats (room_id, seat_index, name, credentials_hash)
    values ('room-a', 0, 'Mallory', 'x')$$,
  '23505',
  null,
  'a seat can only be taken once'
);
select throws_ok(
  $$insert into public.room_seats (room_id, seat_index, name, credentials_hash)
    values ('room-a', -1, 'Bob', 'x')$$,
  '23514',
  null,
  'seat_index cannot be negative'
);
select throws_ok(
  $$insert into public.room_seats (room_id, seat_index, name, credentials_hash)
    values ('room-a', 1, '', 'x')$$,
  '23514',
  null,
  'name cannot be empty'
);
select throws_ok(
  $$insert into public.room_seats (room_id, seat_index, name, credentials_hash)
    values ('room-a', 1, repeat('x', 25), 'x')$$,
  '23514',
  null,
  'name is at most 24 characters'
);
select throws_ok(
  $$insert into public.room_seats (room_id, seat_index, name, credentials_hash)
    values ('no-such-room', 1, 'Bob', 'x')$$,
  '23503',
  null,
  'seats must belong to an existing room'
);

select throws_ok(
  $$insert into public.room_seats (room_id, seat_index, name, user_id, credentials_hash)
    values ('room-a', 3, 'Alice again', '11111111-1111-1111-1111-111111111111', 'x')$$,
  '23505',
  null,
  'an account can hold only one seat per room'
);
insert into public.room_seats (room_id, seat_index, name, credentials_hash)
values ('room-a', 1, 'Guest one', 'g1');
select lives_ok(
  $$insert into public.room_seats (room_id, seat_index, name, credentials_hash)
    values ('room-a', 2, 'Guest two', 'g2')$$,
  'any number of guests without an account can sit in a room'
);

-- browser roles get nothing
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok('select * from public.room_seats', '42501', null, 'even the host cannot read seats directly');
select throws_ok(
  $$insert into public.room_seats (room_id, seat_index, name, credentials_hash)
    values ('room-a', 1, 'Bob', 'x')$$,
  '42501',
  null,
  'users cannot take seats directly'
);
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok('select * from public.room_seats', '42501', null, 'anon cannot read seats');

reset role;
delete from public.rooms where id = 'room-a';
select is(
  (select count(*)::int from public.room_seats where room_id = 'room-a'),
  0,
  'deleting a room deletes its seats'
);

select * from finish();
rollback;
