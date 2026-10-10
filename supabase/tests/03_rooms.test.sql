-- rooms: hosts can read their own rooms (without the invite hash); all writes are server-only.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(9);

insert into auth.users (id, email, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local', 'authenticated', 'authenticated');

insert into public.rooms (id, game_id, host_user_id, invite_token_hash)
values
  ('room-alice', 'tictactoe', '11111111-1111-1111-1111-111111111111', 'hash-a'),
  ('room-bob', 'tictactoe', '22222222-2222-2222-2222-222222222222', 'hash-b');

select is(
  (select status from public.rooms where id = 'room-alice'),
  'waiting',
  'new rooms start as waiting'
);
select throws_ok(
  $$insert into public.rooms (id, game_id, host_user_id, invite_token_hash, status)
    values ('bad', 'tictactoe', '11111111-1111-1111-1111-111111111111', 'h', 'nonsense')$$,
  '23514',
  null,
  'status must be waiting or playing'
);

-- act as Alice
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select results_eq(
  'select id from public.rooms',
  array['room-alice'],
  'a host sees only their own rooms'
);
select throws_ok(
  'select invite_token_hash from public.rooms',
  '42501',
  null,
  'hosts cannot read invite token hashes'
);
select throws_ok(
  $$insert into public.rooms (id, game_id, host_user_id, invite_token_hash)
    values ('x', 'tictactoe', '11111111-1111-1111-1111-111111111111', 'h')$$,
  '42501',
  null,
  'users cannot create rooms directly'
);
select throws_ok(
  $$update public.rooms set status = 'playing' where id = 'room-alice'$$,
  '42501',
  null,
  'users cannot update rooms directly'
);
select throws_ok(
  $$delete from public.rooms where id = 'room-alice'$$,
  '42501',
  null,
  'users cannot delete rooms directly'
);

-- act as anon
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok('select id from public.rooms', '42501', null, 'anon cannot read rooms');

reset role;
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*)::int from public.rooms where id = 'room-alice'),
  0,
  'deleting a user deletes their rooms'
);

select * from finish();
rollback;
