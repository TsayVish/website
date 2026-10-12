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

-- Staff only see people who share an org with them, so S puts everyone in one org.
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000005a', true); set local role authenticated;
create temp table test_org on commit drop as select public.create_org('Test studio') as id;
grant select on test_org to authenticated;
do $$ declare o uuid := (select id from test_org); begin
  assert public.org_add_member(o, 'A@test.dev') = 'added', 'adds by email, any case';
  perform public.org_add_member(o, 'b@test.dev');
  perform public.org_add_member(o, 'c@test.dev');
  perform public.org_add_member(o, 'd@test.dev');
end $$;
commit;

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
do $$ begin assert (select count(*) from public.admin_actions where target_type <> 'org') = 3, 'three actions logged'; end $$;
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

-- ── 10. AI Studio: library, scripts, generations, credits ──
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true); set local role authenticated;
select pg_temp.expect_error($q$select public.studio_start_generation('10000000-0000-0000-0000-000000000001', 'image', 'm', 'p', '{}', '[]', 500)$q$, 'not enough credits');
do $$ begin assert public.claim_starter_credits() = 100, 'starter credits'; end $$;
do $$ begin assert public.claim_starter_credits() = 100, 'starter credits only once'; end $$;
commit;
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000005a', true); set local role authenticated;
do $$ begin assert public.admin_adjust_credits('00000000-0000-0000-0000-00000000000b', 1900, 'Test credits') = 2000, 'staff grant'; end $$;
commit;
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
do $$ begin assert public.credit_balance() = 2000 - 53, 'charged cost × 1.5, rounded up'; end $$;
-- a job that failed before reaching the provider is free
select public.studio_start_generation('10000000-0000-0000-0000-000000000001', 'image', 'm', 'p', '{}', '[]', 8);
select public.studio_end_generation((select id from public.studio_generations where status = 'queued'), 'failed', 'Provider down');
do $$ begin assert (select used_cents from public.studio_usage()) = 35, 'unsubmitted failure not charged'; end $$;
do $$ begin assert public.credit_balance() = 2000 - 53, 'failed job refunded'; end $$;
do $$ begin assert (select count(*) from public.credit_ledger where kind = 'refund') = 1, 'one refund'; end $$;
select pg_temp.expect_error($q$select public.studio_start_generation('10000000-0000-0000-0000-000000000001', 'video', 'm', 'p', '{}', '[]', 99000)$q$, 'not enough credits');
select pg_temp.expect_error($q$insert into public.credit_ledger (user_id, kind, amount_cents) values (auth.uid(), 'grant', 100000)$q$, 'permission denied');
select pg_temp.expect_error($q$select public.record_credit_purchase('wrong', 'cs_1', auth.uid(), 5000)$q$, 'not allowed');
select public.studio_start_generation('10000000-0000-0000-0000-000000000001', 'image', 'm', 'p', '{}', '[]', 8);
select pg_temp.expect_error($q$select public.studio_complete_generation((select id from public.studio_generations where status = 'queued'), '[{"path":"other/x.png","kind":"image"}]')$q$, 'stored with the character');
select public.studio_end_generation((select id from public.studio_generations where status = 'queued'), 'canceled');
do $$ begin assert public.credit_balance() = 2000 - 53, 'canceled before submit refunded'; end $$;
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

-- Purchases are recorded once, only with the server's secret
create temp table billing_secret_out as select public.new_billing_secret() as s;
grant select on billing_secret_out to anon, authenticated;
begin;
set local role anon;
do $$ begin assert public.record_credit_purchase((select s from billing_secret_out), 'cs_test_1', '00000000-0000-0000-0000-00000000000b', 1000, '$10 pack'), 'purchase recorded'; end $$;
do $$ begin assert not public.record_credit_purchase((select s from billing_secret_out), 'cs_test_1', '00000000-0000-0000-0000-00000000000b', 1000, '$10 pack'), 'only once'; end $$;
commit;
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true); set local role authenticated;
do $$ begin assert (select count(*) from public.credit_ledger where kind = 'purchase') = 1, 'buyer sees purchase'; end $$;
do $$ begin assert (select count(*) from public.notifications where type = 'credits_added') = 1, 'buyer notified'; end $$;
commit;
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true); set local role authenticated;
do $$ begin assert (select count(*) from public.credit_ledger) = 0, 'stranger sees no one else''s credits'; end $$;
do $$ begin assert public.credit_balance('00000000-0000-0000-0000-00000000000b') = 0, 'stranger can''t read a balance'; end $$;
select pg_temp.expect_error($q$select public.billing_summary()$q$, 'staff only');
select pg_temp.expect_error($q$select public.new_billing_secret()$q$, 'permission denied');
commit;
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000005a', true); set local role authenticated;
do $$ begin assert (select purchased_cents from public.billing_summary()) = 1000, 'summary purchases'; end $$;
commit;

-- Billing off for chosen members
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true); set local role authenticated;
select pg_temp.expect_error($q$select public.admin_set_billing_exempt(auth.uid(), true, 'me')$q$, 'staff only');
commit;
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000005a', true); set local role authenticated;
select public.admin_set_billing_exempt('00000000-0000-0000-0000-00000000000b', true, 'Founder');
commit;
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true); set local role authenticated;
create temp table bal_before as select public.credit_balance() as b;
do $$ begin assert public.is_billing_exempt(), 'exempt'; end $$;
select public.studio_start_generation('10000000-0000-0000-0000-000000000001', 'video', 'm', 'free one', '{}', '[]', 3000);
do $$ begin assert public.credit_balance() = (select b from bal_before), 'no credits used'; end $$;
do $$ begin assert (select price_cents from public.studio_generations where prompt = 'free one') = 0, 'price is zero'; end $$;
do $$ begin assert (select cost_cents from public.studio_generations where prompt = 'free one') = 3000, 'provider cost still recorded'; end $$;
select public.studio_end_generation((select id from public.studio_generations where prompt = 'free one'), 'failed', 'x');
do $$ begin assert public.credit_balance() = (select b from bal_before), 'no refund for a free job'; end $$;
commit;
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000005a', true); set local role authenticated;
select public.admin_set_billing_exempt('00000000-0000-0000-0000-00000000000b', false);
commit;
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true); set local role authenticated;
select pg_temp.expect_error($q$select public.studio_start_generation('10000000-0000-0000-0000-000000000001', 'video', 'm', 'p', '{}', '[]', 3000)$q$, 'not enough credits');
commit;

-- Deleting a finished job removes its files from the library
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true); set local role authenticated;
select pg_temp.expect_error($q$select public.studio_delete_generation((select id from public.studio_generations where status = 'succeeded' limit 1))$q$, 'not found');
commit;
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true); set local role authenticated;
create temp table del_paths as select public.studio_delete_generation((select id from public.studio_generations where status = 'succeeded' limit 1)) as p;
do $$ begin assert (select count(*) from del_paths) = 1 and (select p from del_paths) like '10000000-0000-0000-0000-000000000001/%', 'returns the file paths'; end $$;
do $$ begin assert (select count(*) from public.studio_media where source = 'generated') = 0, 'outputs removed'; end $$;
do $$ begin assert (select count(*) from public.credit_ledger where kind = 'charge') >= 1, 'credit history kept'; end $$;
commit;

-- ── 11. Orgs: staff see only their orgs ──
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000e', 'e@test.dev', '{"full_name":"Eve Outsider"}'),
  ('00000000-0000-0000-0000-00000000005b', 't@test.dev', '{"full_name":"Tia Staff"}');
insert into public.staff (user_id, role) values ('00000000-0000-0000-0000-00000000005b', 'admin');
insert into public.projects (id, owner_id, type, name, kind, color, personality) values ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000e', 'original', 'Eve secret', 'Animal', 'Mint', 'Chill');

begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000005a', true); set local role authenticated;
do $$ begin assert not exists (select 1 from public.projects where owner_id = '00000000-0000-0000-0000-00000000000e'), 'staff cannot see an outsider''s characters'; end $$;
do $$ begin assert exists (select 1 from public.projects where owner_id = '00000000-0000-0000-0000-00000000000a'), 'staff see org members'' characters'; end $$;
do $$ begin assert not exists (select 1 from public.admin_find_users('e@test')), 'outsider not searchable'; end $$;
do $$ begin assert exists (select 1 from public.admin_find_users('a@test')), 'org member searchable'; end $$;
do $$ begin assert not exists (select 1 from public.staff where user_id = '00000000-0000-0000-0000-00000000005b'), 'other admins are hidden'; end $$;
select pg_temp.expect_error($q$select public.admin_ban('00000000-0000-0000-0000-00000000000e', 'x')$q$, 'isn’t in any of your orgs');
select pg_temp.expect_error($q$select public.admin_adjust_credits('00000000-0000-0000-0000-00000000000e', 500, 'gift')$q$, 'isn’t in any of your orgs');
select pg_temp.expect_error($q$select public.admin_set_billing_exempt('00000000-0000-0000-0000-00000000000e', true)$q$, 'isn’t in any of your orgs');
do $$ begin assert public.credit_balance('00000000-0000-0000-0000-00000000000e') = 0, 'outsider balance hidden'; end $$;
commit;

-- the other admin sees none of S's org
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000005b', true); set local role authenticated;
do $$ begin assert (select count(*) from public.projects) = 0, 'a new admin sees nobody''s characters'; end $$;
do $$ begin assert (select count(*) from public.admin_actions) = 0, 'and none of the audit log'; end $$;
do $$ begin assert (select count(*) from public.orgs) = 0, 'or the org'; end $$;
do $$ begin assert not exists (select 1 from public.admin_find_users('a@test')), 'or its members'; end $$;
select pg_temp.expect_error($q$select public.admin_ban('00000000-0000-0000-0000-00000000000a', 'x')$q$, 'isn’t in any of your orgs');
select pg_temp.expect_error($q$select public.org_add_member((select id from public.orgs limit 1), 'x@test.dev')$q$, 'only the org');
commit;

-- members can't create orgs; org mates see each other; owners manage; invites wait for sign-up
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true); set local role authenticated;
select pg_temp.expect_error($q$select public.create_org('Mine')$q$, 'only admins');
do $$ begin assert (select count(*) from public.orgs) = 1, 'member sees their org'; end $$;
do $$ begin assert exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'org mates read each other''s profile'; end $$;
do $$ begin assert (select count(*) from public.org_member_list((select id from public.orgs limit 1)) where email is not null) = 1, 'members only see their own email'; end $$;
select pg_temp.expect_error($q$select public.org_add_member((select id from public.orgs limit 1), 'x@test.dev')$q$, 'only the org');
do $$ begin assert not exists (select 1 from public.projects where id = '10000000-0000-0000-0000-000000000001'), 'org mates still can''t open each other''s characters'; end $$;
commit;

begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000005a', true); set local role authenticated;
select public.org_set_role((select id from public.orgs limit 1), '00000000-0000-0000-0000-00000000000a', 'owner');
do $$ begin assert public.org_add_member((select id from public.orgs limit 1), 'new@test.dev') = 'invited', 'unknown emails get an invite'; end $$;
commit;

begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true); set local role authenticated;
do $$ begin assert (select count(*) from public.org_invites) = 1, 'owners see pending invites'; end $$;
do $$ begin assert (select count(*) from public.org_member_list((select id from public.orgs limit 1)) where email is not null) = 5, 'owners see emails'; end $$;
select public.org_remove_member((select id from public.orgs limit 1), '00000000-0000-0000-0000-00000000000d');
select public.org_set_role((select id from public.orgs limit 1), '00000000-0000-0000-0000-00000000005a', 'member');
select pg_temp.expect_error($q$select public.org_remove_member((select id from public.orgs limit 1), '00000000-0000-0000-0000-00000000000a')$q$, 'at least one owner');
select pg_temp.expect_error($q$select public.org_set_role((select id from public.orgs limit 1), '00000000-0000-0000-0000-00000000000a', 'member')$q$, 'at least one owner');
commit;

begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000005a', true); set local role authenticated;
do $$ begin assert not exists (select 1 from public.projects where owner_id = '00000000-0000-0000-0000-00000000000d'), 'removed members drop out of view'; end $$;
select pg_temp.expect_error($q$select public.admin_ban('00000000-0000-0000-0000-00000000000d', 'x')$q$, 'isn’t in any of your orgs');
-- staff who are plain members can still manage the org
select public.org_set_role((select id from public.orgs limit 1), '00000000-0000-0000-0000-00000000005a', 'owner');
commit;

-- an invited person joins when they sign up and confirm
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000000f', 'New@test.dev', '{"full_name":"Neo New"}');
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', true); set local role authenticated;
do $$ begin assert public.claim_org_invites() = 1, 'invite claimed'; end $$;
do $$ begin assert public.claim_org_invites() = 0, 'only once'; end $$;
do $$ begin assert (select count(*) from public.orgs) = 1, 'now in the org'; end $$;
commit;

-- the outsider can't see the org or its people
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', true); set local role authenticated;
do $$ begin assert (select count(*) from public.orgs) = 0 and (select count(*) from public.org_members) = 0, 'orgs are private'; end $$;
select pg_temp.expect_error($q$select * from public.org_member_list((select org_id from public.org_members limit 1))$q$, 'not found');
commit;

\echo 'All RLS tests passed'
