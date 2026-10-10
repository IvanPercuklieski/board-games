-- profiles: auto-created for new users; each user sees/edits only their own row, never is_admin.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(8);

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local', '{"display_name":"Alice"}', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local', '{}', 'authenticated', 'authenticated');

select is(
  (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Alice',
  'profile is created with display_name from user metadata'
);
select is(
  (select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'bob',
  'display_name falls back to the email prefix'
);
select is(
  (select is_admin from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  false,
  'new profiles are not admin'
);

-- act as Alice
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select results_eq(
  'select display_name from public.profiles',
  array['Alice'],
  'a user sees only their own profile'
);

update public.profiles set display_name = 'Alice B'
  where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select display_name from public.profiles),
  'Alice B',
  'a user can change their own display_name'
);

-- silently affects 0 rows because of RLS; checked below as superuser
update public.profiles set display_name = 'hacked'
  where id = '22222222-2222-2222-2222-222222222222';

select throws_ok(
  $$update public.profiles set is_admin = true where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  null,
  'a user cannot make themselves admin'
);

-- act as anon
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok('select * from public.profiles', '42501', null, 'anon cannot read profiles');

reset role;
select is(
  (select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'bob',
  'a user cannot change someone else''s profile'
);

select * from finish();
rollback;
