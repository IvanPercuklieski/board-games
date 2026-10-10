-- Schema-wide security checks: RLS everywhere, bgio schema private.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(9);

select has_table('public', 'profiles', 'public.profiles exists');
select has_table('public', 'rooms', 'public.rooms exists');
select has_table('public', 'cards', 'public.cards exists');
select has_table('bgio', 'matches', 'bgio.matches exists');

select is(
  (select count(*)::int from pg_tables
    where schemaname in ('public', 'bgio') and not rowsecurity),
  0,
  'RLS is enabled on every table in public and bgio'
);

select ok(not has_schema_privilege('anon', 'bgio', 'usage'), 'anon cannot use the bgio schema');
select ok(
  not has_schema_privilege('authenticated', 'bgio', 'usage'),
  'authenticated cannot use the bgio schema'
);

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'cards'
      and grantee in ('anon', 'authenticated')),
  0,
  'anon/authenticated have no privileges on cards'
);

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'),
  0,
  'anon has no table privileges in public'
);

select * from finish();
rollback;
