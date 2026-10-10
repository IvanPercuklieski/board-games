-- cards: server-only. Neither anon nor logged-in users can read or write them directly.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(5);

insert into public.cards (game_id, external_id, data) values ('testgame', 'c1', '{"x":1}');

select throws_ok(
  $$insert into public.cards (game_id, external_id, data) values ('testgame', 'c1', '{}')$$,
  '23505',
  null,
  'external_id is unique per game'
);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok('select * from public.cards', '42501', null, 'anon cannot read cards');
select throws_ok(
  $$insert into public.cards (game_id, external_id, data) values ('testgame', 'c2', '{}')$$,
  '42501',
  null,
  'anon cannot write cards'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok('select * from public.cards', '42501', null, 'authenticated cannot read cards');
select throws_ok('delete from public.cards', '42501', null, 'authenticated cannot delete cards');

select * from finish();
rollback;
