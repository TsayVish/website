-- Row-level security and business-rule tests. Run against a fresh database that has
-- supabase_stub.sql and every migration applied (see scripts/test-db.sh).
-- Each block acts as one user: set the user id, switch to the "authenticated" role, then assert.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

-- helper: expect the statement to fail with a message containing `needle`
create or replace function pg_temp.expect_error(stmt text, needle text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if position(lower(needle) in lower(sqlerrm)) = 0 then
      raise exception 'Expected error containing "%", got "%" for: %', needle, sqlerrm, stmt;
    end if;
    return;
  end;
  raise exception 'Expected an error containing "%" but it succeeded: %', needle, stmt;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated, anon;

-- Users: A (creator), B (buyer/teammate), C (stranger), S (staff), D (unverified)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.dev', '{"full_name":"Ada A"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.dev', '{"full_name":"Ben B"}'),
  ('00000000-0000-0000-0000-00000000000c', 'c@test.dev', '{"full_name":"Cy C"}'),
  ('00000000-0000-0000-0000-00000000005a', 's@test.dev', '{"full_name":"Sam Staff"}');
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000d', 'd@test.dev', '{"full_name":"Dee D"}', null);
insert into public.staff (user_id, role) values ('00000000-0000-0000-0000-00000000005a', 'admin');

-- ── 1. Projects are private to their owner ──
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true); set local role authenticated;
insert into public.projects (id, type, name, kind, color, personality)
  values ('10000000-0000-0000-0000-000000000001', 'original', 'Mango', 'Food', 'Peach', 'Dreamy');
insert into public.project_services (project_id, service, status) values ('10000000-0000-0000-0000-000000000001', 'Trademark filing', 'requested');
select pg_temp.expect_error($q$update public.project_services set status = 'active' where service = 'Trademark filing'$q$, 'only the tsayvish team');
commit;

begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true); set local role authenticated;
do $$ begin assert (select count(*) from public.projects) = 0, 'B must not see A''s project'; end $$;
commit;

-- ── 2. Version history and restore ──
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true); set local role authenticated;
update public.projects set name = 'Mango Supreme' where id = '10000000-0000-0000-0000-000000000001';
do $$ begin assert (select count(*) from public.character_versions) = 1, 'a version is saved on change'; end $$;
select public.restore_character_version((select id from public.character_versions limit 1));
do $$ begin assert (select name from public.projects where id = '10000000-0000-0000-0000-000000000001') = 'Mango', 'restore brings the old name back'; end $$;
commit;

-- ── 3. Workspaces: invite, roles, shared access ──
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true); set local role authenticated;
insert into public.workspaces (id, name) values ('20000000-0000-0000-0000-000000000001', 'Snack Studio');
do $$ begin assert public.workspace_role('20000000-0000-0000-0000-000000000001') = 'owner', 'creator is owner'; end $$;
insert into public.workspace_invites (workspace_id, token, role) values ('20000000-0000-0000-0000-000000000001', 'tok-viewer', 'viewer');
update public.projects set workspace_id = '20000000-0000-0000-0000-000000000001' where id = '10000000-0000-0000-0000-000000000001';
commit;

begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true); set local role authenticated;
do $$ begin assert (select workspace_name from public.invite_preview('tok-viewer')) = 'Snack Studio', 'invite preview'; end $$;
select public.accept_workspace_invite('tok-viewer');
do $$ begin assert (select count(*) from public.projects) = 1, 'viewer sees the shared character'; end $$;
do $$ begin assert (select count(*) from public.project_services) = 1, 'viewer sees its services'; end $$;
update public.projects set name = 'Hacked' where id = '10000000-0000-0000-0000-000000000001';
do $$ begin assert (select name from public.projects where id = '10000000-0000-0000-0000-000000000001') = 'Mango', 'viewer cannot edit'; end $$;
select pg_temp.expect_error($q$select public.accept_workspace_invite('tok-viewer')$q$, 'already been used');
commit;

begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true); set local role authenticated;
update public.workspace_members set role = 'editor' where user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_error($q$delete from public.workspace_members where user_id = '00000000-0000-0000-0000-00000000000a'$q$, 'at least one owner');
commit;

begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true); set local role authenticated;
update public.projects set description = 'Edited by Ben' where id = '10000000-0000-0000-0000-000000000001';
do $$ begin assert (select description from public.projects where id = '10000000-0000-0000-0000-000000000001') = 'Edited by Ben', 'editor can edit'; end $$;
select pg_temp.expect_error($q$update public.projects set workspace_id = null where id = '10000000-0000-0000-0000-000000000001'$q$, 'only the person who created');
commit;

begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true); set local role authenticated;
do $$ begin assert (select count(*) from public.projects) = 0, 'stranger sees nothing'; end $$;
do $$ begin assert (select count(*) from public.workspace_members) = 0, 'stranger sees no members'; end $$;
commit;

-- ── 4. Listings follow the character; search finds them ──
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true); set local role authenticated;
insert into public.listings (id, type, title, summary, category, categories, project_id, character_info, seller_name)
values ('30000000-0000-0000-0000-000000000001', 'character', 'Mango license', 'Sleepy cupcake for brands', 'Available to license',
        '{"Available to license"}', '10000000-0000-0000-0000-000000000001', '{"name":"Mango"}', 'Ada A');
update public.projects set name = 'Mango Deluxe' where id = '10000000-0000-0000-0000-000000000001';
do $$ begin assert (select character_info->>'name' from public.listings where id = '30000000-0000-0000-0000-000000000001') = 'Mango Deluxe', 'listing synced'; end $$;
commit;

begin;
set local role anon;
do $$ begin assert (select count(*) from public.search_listings('cupc')) = 1, 'prefix search works for visitors'; end $$;
do $$ begin assert (select count(*) from public.search_listings('brands lic')) = 1, 'multi-word prefix search'; end $$;
do $$ begin assert (select count(*) from public.search_listings('zzz')) = 0, 'no false matches'; end $$;
do $$ begin assert (select count(*) from public.projects) = 0, 'visitors never see projects'; end $$;
commit;

-- ── 5. Offers → accepted → agreement signed by both ──
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true); set local role authenticated;
insert into public.offers (id, listing_id, amount, message) values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 500, 'Hi');
commit;

begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true); set local role authenticated;
select pg_temp.expect_error($q$select public.propose_agreement('40000000-0000-0000-0000-000000000001', '{}')$q$, 'must be accepted');
select public.respond_to_offer('40000000-0000-0000-0000-000000000001', 'accepted');
select public.propose_agreement('40000000-0000-0000-0000-000000000001', '{"territory":"Worldwide"}');
select public.accept_agreement('40000000-0000-0000-0000-000000000001', 'Ada A', 1);
commit;

begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true); set local role authenticated;
select pg_temp.expect_error($q$select public.propose_agreement('40000000-0000-0000-0000-000000000001', '{}')$q$, 'only the seller');
select pg_temp.expect_error($q$select public.accept_agreement('40000000-0000-0000-0000-000000000001', 'Cy C', 99)$q$, 'terms changed');
select public.accept_agreement('40000000-0000-0000-0000-000000000001', 'Cy C', 1);
do $$ begin assert (select status from public.agreements) = 'signed', 'signed by both'; end $$;
do $$ begin assert (select count(*) from public.notifications where type = 'agreement_proposed') = 1, 'buyer was notified'; end $$;
commit;

begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true); set local role authenticated;
do $$ begin assert (select count(*) from public.agreements) = 0, 'outsiders cannot read the agreement'; end $$;
commit;

-- ── 6. Staff: queue, service activation, bans, audit log ──
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true); set local role authenticated;
select pg_temp.expect_error($q$select public.admin_ban('00000000-0000-0000-0000-00000000000c', 'x')$q$, 'staff only');
do $$ begin assert (select count(*) from public.admin_actions) = 0, 'members cannot read the audit log'; end $$;
commit;

begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000005a', true); set local role authenticated;
do $$ begin assert (select count(*) from public.projects) >= 1, 'staff see all projects'; end $$;
select public.admin_update_service('10000000-0000-0000-0000-000000000001', 'Trademark filing', 'active', '00000000-0000-0000-0000-00000000005a', current_date + 7, 'Filed with USPTO');
select public.admin_post_service_update('10000000-0000-0000-0000-000000000001', 'Trademark filing', 'We filed in class 28.');
select public.admin_ban('00000000-0000-0000-0000-00000000000c', 'Spam');
do $$ begin assert (select count(*) from public.admin_actions) = 3, 'three actions logged'; end $$;
commit;

begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true); set local role authenticated;
do $$ begin assert (select status from public.project_services where service = 'Trademark filing') = 'active', 'service active'; end $$;
do $$ begin assert (select count(*) from public.service_updates) = 1, 'creator sees the update'; end $$;
do $$ begin assert (select count(*) from public.service_tickets) = 0, 'creator cannot see internal tickets'; end $$;
do $$ begin assert (select count(*) from public.notifications where type in ('service_active', 'service_update')) = 2, 'creator notified'; end $$;
commit;

begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true); set local role authenticated;
select pg_temp.expect_error($q$insert into public.posts (title, body) values ('x', 'y')$q$, 'restricted');
commit;

-- ── 7. Verified email required to list, offer and message ──
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true); set local role authenticated;
select pg_temp.expect_error($q$insert into public.listings (type, title, category) values ('service', 'Test', 'Other')$q$, 'confirm your email');
commit;

-- ── 8. Rate limits ──
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true); set local role authenticated;
select pg_temp.expect_error($q$
  do $d$ begin for i in 1..31 loop insert into public.reports (target_type, target_id, reason) values ('profile', '00000000-0000-0000-0000-00000000000b', 'Spam'); end loop; end $d$
$q$, 'too often');
commit;

-- ── 9. Discover ranking and visitor access ──
begin;
set local role anon;
do $$ begin assert (select count(*) from public.discover_listings(null, 10)) = 1, 'discover lists published listings'; end $$;
do $$ begin assert (select count(*) from public.profiles) >= 1, 'visitors see discoverable profiles'; end $$;
commit;

-- ── 10. AI Studio: library, scripts, generations, monthly limit ──
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true); set local role authenticated;
-- an editor uploads into the character's folder
insert into storage.objects (bucket_id, name) values ('studio-media', '10000000-0000-0000-0000-000000000001/ref.png');
insert into public.studio_media (id, project_id, kind, path, mime) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'image', '10000000-0000-0000-0000-000000000001/ref.png', 'image/png');
select pg_temp.expect_error($q$insert into public.studio_media (project_id, kind, path) values ('10000000-0000-0000-0000-000000000001', 'image', 'elsewhere/x.png')$q$, 'row-level security');
select pg_temp.expect_error($q$insert into public.studio_media (project_id, kind, source, path) values ('10000000-0000-0000-0000-000000000001', 'video', 'generated', '10000000-0000-0000-0000-000000000001/fake.mp4')$q$, 'row-level security');
select pg_temp.expect_error($q$insert into public.studio_generations (project_id, tool, model) values ('10000000-0000-0000-0000-000000000001', 'image', 'x')$q$, 'permission denied');
insert into public.studio_scripts (id, project_id, title, scenes) values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Episode 1',
  '[{"id":"s1","shot":"Mango yawns","line":"Five more minutes."},{"id":"s2","shot":"Mango falls asleep","line":""}]');
-- start → submit → complete links the clip into scene s1
select public.studio_start_generation('10000000-0000-0000-0000-000000000001', 'video', 'fal-ai/kling', 'Mango yawns',
  '{"script_id":"40000000-0000-0000-0000-000000000001","scene_id":"s1","scene_role":"clip"}', '[]', 35);
select public.studio_mark_submitted((select id from public.studio_generations limit 1), 'req-1');
select public.studio_complete_generation((select id from public.studio_generations limit 1),
  '[{"path":"10000000-0000-0000-0000-000000000001/gen-1.mp4","kind":"video","mime":"video/mp4","bytes":1000,"duration_ms":5000}]');
do $$ begin assert (select status from public.studio_generations limit 1) = 'succeeded', 'job succeeded'; end $$;
do $$ begin assert (select count(*) from public.studio_media where source = 'generated') = 1, 'output saved to the library'; end $$;
do $$ begin assert (select scenes->0->>'clip_media' from public.studio_scripts) = (select id::text from public.studio_media where source = 'generated'), 'scene linked to clip'; end $$;
do $$ begin assert (select scenes->1->>'clip_media' from public.studio_scripts) is null, 'other scenes untouched'; end $$;
-- completing twice is harmless
select public.studio_complete_generation((select id from public.studio_generations limit 1),
  '[{"path":"10000000-0000-0000-0000-000000000001/gen-1.mp4","kind":"video"}]');
do $$ begin assert (select count(*) from public.studio_media where source = 'generated') = 1, 'no duplicate output'; end $$;
do $$ begin assert (select used_cents from public.studio_usage()) = 35, 'usage counted'; end $$;
-- a job that failed before reaching the provider is free
select public.studio_start_generation('10000000-0000-0000-0000-000000000001', 'image', 'm', 'p', '{}', '[]', 8);
select public.studio_end_generation((select id from public.studio_generations where status = 'queued'), 'failed', 'Provider down');
do $$ begin assert (select used_cents from public.studio_usage()) = 35, 'unsubmitted failure not charged'; end $$;
select pg_temp.expect_error($q$select public.studio_start_generation('10000000-0000-0000-0000-000000000001', 'video', 'm', 'p', '{}', '[]', 990)$q$, 'monthly ai studio limit');
select public.studio_start_generation('10000000-0000-0000-0000-000000000001', 'image', 'm', 'p', '{}', '[]', 8);
select pg_temp.expect_error($q$select public.studio_complete_generation((select id from public.studio_generations where status = 'queued'), '[{"path":"other/x.png","kind":"image"}]')$q$, 'stored with the character');
select public.studio_end_generation((select id from public.studio_generations where status = 'queued'), 'canceled');
commit;

begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true); set local role authenticated;
do $$ begin assert (select count(*) from public.studio_media) = 0, 'stranger sees no media'; end $$;
do $$ begin assert (select count(*) from public.studio_generations) = 0, 'stranger sees no jobs'; end $$;
do $$ begin assert (select count(*) from storage.objects where bucket_id = 'studio-media') = 0, 'stranger cannot read files'; end $$;
select pg_temp.expect_error($q$select public.studio_start_generation('10000000-0000-0000-0000-000000000001', 'image', 'm', 'p', '{}', '[]', 1)$q$, 'characters you can edit');
select pg_temp.expect_error($q$insert into storage.objects (bucket_id, name) values ('studio-media', '10000000-0000-0000-0000-000000000001/x.png')$q$, 'row-level security');
select pg_temp.expect_error($q$select public.admin_set_studio_limit('00000000-0000-0000-0000-00000000000c', 99999)$q$, 'staff only');
commit;

begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000005a', true); set local role authenticated;
select public.admin_set_studio_limit('00000000-0000-0000-0000-00000000000b', 5000);
do $$ begin assert (select limit_cents from public.studio_usage('00000000-0000-0000-0000-00000000000b')) = 5000, 'staff raised the limit'; end $$;
commit;

begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true); set local role authenticated;
select public.studio_start_generation('10000000-0000-0000-0000-000000000001', 'video', 'm', 'p', '{}', '[]', 990);
do $$ begin assert (select count(*) from public.studio_usage('00000000-0000-0000-0000-00000000000a')) = 0, 'cannot read someone else''s usage'; end $$;
commit;

\echo 'All RLS tests passed'
