-- ═════════════════════════════════════════════════════════════════════════
-- Public pages: visitors who aren't signed in can see published listings,
-- discoverable creators and their public posts. Safe to run again.
-- ═════════════════════════════════════════════════════════════════════════

drop policy if exists "Listings: public read published" on public.listings;
create policy "Listings: public read published" on public.listings for select to anon using (status = 'published');

drop policy if exists "Profiles: public read discoverable" on public.profiles;
create policy "Profiles: public read discoverable" on public.profiles for select to anon using (discoverable);

drop policy if exists "Posts: public read" on public.posts;
create policy "Posts: public read" on public.posts for select to anon using (status = 'published' and visibility = 'public');

-- Follower counts for public pages (no names).
create or replace function public.follower_count(creator uuid)
returns integer language sql stable security definer set search_path = ''
as $$ select count(*)::int from public.follows where creator_id = creator $$;
grant execute on function public.follower_count(uuid) to anon, authenticated;
