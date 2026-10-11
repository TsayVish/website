-- tsayvish database setup
-- Paste this whole file into Supabase → SQL Editor → New query, then click Run.
-- It is safe to run again: it only adds what's missing and refreshes the access rules.
--
-- Row-level security (RLS) is on for every table, so each person can only read and
-- change their own rows, even though the browser talks to the database directly.

-- ─────────────────────────────────────────────────────────────
-- Profiles: one row per account, created automatically at sign-up
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text check (full_name is null or char_length(full_name) <= 80),
  goal       text not null default 'build' check (goal in ('build', 'partner')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles: read own" on public.profiles;
create policy "Profiles: read own" on public.profiles
  for select using ((select auth.uid()) = id);

drop policy if exists "Profiles: update own" on public.profiles;
create policy "Profiles: update own" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Copy the name and "what brings you here" answer from the sign-up form into profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, goal)
  values (
    new.id,
    left(new.raw_user_meta_data ->> 'full_name', 80),
    case when new.raw_user_meta_data ->> 'goal' = 'partner' then 'partner' else 'build' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- Projects. Each one is either:
--   'original'    a character the person creates and owns, or
--   'partnership' a request to work with characters from the tsayvish cast.
-- A person can have as many projects of either type as they like.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type         text not null check (type in ('original', 'partnership')),
  name         text not null check (char_length(name) between 1 and 60),

  -- Original projects: the character
  kind         text check (kind in ('Person', 'Creature', 'Robot', 'Food', 'Object', 'Animal')),
  color        text check (color in ('Mint', 'Peach', 'Pink', 'Sky', 'Lilac', 'Butter')),
  personality  text check (personality in ('Anxious', 'Overachiever', 'Dreamy', 'Chatty', 'Homebody', 'Chill')),
  description  text check (description is null or char_length(description) <= 200),

  -- Partnership projects: who, what and which cast members
  company      text check (company is null or char_length(company) between 1 and 120),
  interest     text check (interest in ('Brand partnership', 'Licensing', 'Manufacturing', 'Something else')),
  cast_members text[] not null default '{}',
  message      text check (message is null or char_length(message) <= 2000),
  -- Set by the tsayvish team (Table Editor), never by the person who submitted it.
  status       text check (status in ('submitted', 'in_review', 'approved', 'declined')),

  created_at   timestamptz not null default now(),

  constraint projects_original_fields check (
    type <> 'original' or (kind is not null and color is not null and personality is not null)),
  constraint projects_partnership_fields check (
    type <> 'partnership' or (company is not null and interest is not null
                              and cardinality(cast_members) >= 1 and status is not null))
);

create index if not exists projects_owner_id_idx on public.projects (owner_id, created_at desc);

alter table public.projects enable row level security;

drop policy if exists "Projects: read own" on public.projects;
create policy "Projects: read own" on public.projects
  for select using ((select auth.uid()) = owner_id);

drop policy if exists "Projects: create own" on public.projects;
create policy "Projects: create own" on public.projects
  for insert with check (
    (select auth.uid()) = owner_id
    and ((type = 'original' and status is null) or (type = 'partnership' and status = 'submitted')));

drop policy if exists "Projects: update own" on public.projects;
create policy "Projects: update own" on public.projects
  for update using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

drop policy if exists "Projects: delete own" on public.projects;
create policy "Projects: delete own" on public.projects
  for delete using ((select auth.uid()) = owner_id);

-- People may edit their project's details, but not its owner, type or review status.
revoke update on public.projects from anon, authenticated;
grant update (name, kind, color, personality, description, company, interest, cast_members, message)
  on public.projects to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Infrastructure switched on for a project.
-- People can only set 'off' or 'requested'. Your team marks a service
-- 'active' from the Supabase Table Editor once it's actually set up.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.project_services (
  project_id uuid not null references public.projects (id) on delete cascade,
  service    text not null check (service in (
               'Trademark filing', 'Likeness lock', 'Storefront', 'Payments',
               'Physical goods', 'Audience tools', 'Media budget', 'Live events')),
  status     text not null default 'requested' check (status in ('off', 'requested', 'active')),
  updated_at timestamptz not null default now(),
  primary key (project_id, service)
);

alter table public.project_services enable row level security;

drop policy if exists "Services: read own" on public.project_services;
create policy "Services: read own" on public.project_services
  for select using (exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = (select auth.uid())));

drop policy if exists "Services: request own" on public.project_services;
create policy "Services: request own" on public.project_services
  for insert with check (
    status in ('off', 'requested') and exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = (select auth.uid())));

drop policy if exists "Services: change own unless active" on public.project_services;
create policy "Services: change own unless active" on public.project_services
  for update
  using (status <> 'active' and exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = (select auth.uid())))
  with check (status in ('off', 'requested'));

-- ═════════════════════════════════════════════════════════════
-- Update 2: custom character images, per-service details, the Marketplace.
-- Everything below is safe to run on a database that already has projects.
-- ═════════════════════════════════════════════════════════════

-- Storage for uploaded character pictures. Files live in a folder named after the
-- uploader's user id, and only that person can add, replace or remove them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('character-images', 'character-images', true, 5242880,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Character images: upload own" on storage.objects;
create policy "Character images: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'character-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Character images: change own" on storage.objects;
create policy "Character images: change own" on storage.objects
  for update to authenticated
  using (bucket_id = 'character-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Character images: remove own" on storage.objects;
create policy "Character images: remove own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'character-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Projects: uploaded picture, a 'Custom' kind, and free-form details (partnership deal terms).
alter table public.projects add column if not exists image_url text;
alter table public.projects add column if not exists details jsonb not null default '{}';

alter table public.projects drop constraint if exists projects_kind_check;
alter table public.projects add constraint projects_kind_check
  check (kind in ('Person', 'Creature', 'Robot', 'Food', 'Object', 'Animal', 'Custom'));

alter table public.projects drop constraint if exists projects_image_url_check;
alter table public.projects add constraint projects_image_url_check
  check (image_url is null or (char_length(image_url) <= 500
         and image_url like '%/storage/v1/object/public/character-images/%'));

alter table public.projects drop constraint if exists projects_custom_has_image;
alter table public.projects add constraint projects_custom_has_image
  check (kind is distinct from 'Custom' or image_url is not null);

alter table public.projects drop constraint if exists projects_details_size;
alter table public.projects add constraint projects_details_size
  check (pg_column_size(details) <= 20000);

grant update (name, kind, color, personality, description, image_url, details,
              company, interest, cast_members, message)
  on public.projects to authenticated;

-- Services: the fields filled in on each service tab.
alter table public.project_services add column if not exists details jsonb not null default '{}';

alter table public.project_services drop constraint if exists project_services_details_size;
alter table public.project_services add constraint project_services_details_size
  check (pg_column_size(details) <= 20000);

-- People may add details to any of their services, including active ones,
-- but only the tsayvish team (Table Editor) can make a service active or change an active one.
drop policy if exists "Services: request own" on public.project_services;
drop policy if exists "Services: change own unless active" on public.project_services;

drop policy if exists "Services: add own" on public.project_services;
create policy "Services: add own" on public.project_services
  for insert with check (exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = (select auth.uid())));

drop policy if exists "Services: update own" on public.project_services;
create policy "Services: update own" on public.project_services
  for update
  using (exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = (select auth.uid())))
  with check (exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = (select auth.uid())));

create or replace function public.guard_service_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.status = 'active' then
      raise exception 'Only the tsayvish team can mark a service active';
    end if;
    if tg_op = 'UPDATE' and new.status is distinct from old.status
       and (new.status = 'active' or old.status = 'active') then
      raise exception 'Only the tsayvish team can change an active service';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists guard_service_status on public.project_services;
create trigger guard_service_status
  before insert or update on public.project_services
  for each row execute procedure public.guard_service_status();

-- ─────────────────────────────────────────────────────────────
-- Marketplace listings: characters people offer, and services people sell.
-- Every signed-in member can browse published listings. Only the owner can change theirs.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.listings (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type          text not null check (type in ('character', 'service')),
  title         text not null check (char_length(title) between 1 and 80),
  summary       text check (summary is null or char_length(summary) <= 160),
  description   text check (description is null or char_length(description) <= 3000),
  category      text not null check (category in (
                  'Available to license', 'Open to collaborations', 'Commission me',
                  'Illustration & design', 'Animation & video', 'Voice & music', 'Writing',
                  'Legal & IP', 'Manufacturing', 'Marketing & growth', 'Events', 'Other')),
  price         text check (price is null or char_length(price) <= 60),
  contact_email text check (contact_email is null or (char_length(contact_email) <= 120
                  and contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  seller_name   text check (seller_name is null or char_length(seller_name) <= 80),
  project_id    uuid references public.projects (id) on delete set null,
  -- A copy of the character's look, so other members can see it without access to the project.
  character_info jsonb not null default '{}' check (
                  (character_info ->> 'image_url') is null
                  or (character_info ->> 'image_url') like '%/storage/v1/object/public/character-images/%'),
  status        text not null default 'published' check (status in ('published', 'hidden')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists listings_status_created_idx on public.listings (status, created_at desc);
create index if not exists listings_owner_idx on public.listings (owner_id);

alter table public.listings enable row level security;

drop policy if exists "Listings: members read published, owners read own" on public.listings;
create policy "Listings: members read published, owners read own" on public.listings
  for select to authenticated
  using (status = 'published' or owner_id = (select auth.uid()));

drop policy if exists "Listings: create own" on public.listings;
create policy "Listings: create own" on public.listings
  for insert to authenticated with check ((select auth.uid()) = owner_id);

drop policy if exists "Listings: update own" on public.listings;
create policy "Listings: update own" on public.listings
  for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

drop policy if exists "Listings: delete own" on public.listings;
create policy "Listings: delete own" on public.listings
  for delete to authenticated using ((select auth.uid()) = owner_id);

-- A character listing can only point at the owner's own project.
create or replace function public.guard_listing_project()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is not null and not exists (
    select 1 from public.projects p where p.id = new.project_id and p.owner_id = new.owner_id) then
    raise exception 'You can only list your own characters';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists guard_listing_project on public.listings;
create trigger guard_listing_project
  before insert or update on public.listings
  for each row execute procedure public.guard_listing_project();

-- ═════════════════════════════════════════════════════════════
-- Update 3: profile photo, bio, location and website (Settings page).
-- ═════════════════════════════════════════════════════════════
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists location text;
alter table public.profiles add column if not exists website text;

alter table public.profiles drop constraint if exists profiles_avatar_url_check;
alter table public.profiles add constraint profiles_avatar_url_check
  check (avatar_url is null or (char_length(avatar_url) <= 500
         and avatar_url like '%/storage/v1/object/public/avatars/%'));
alter table public.profiles drop constraint if exists profiles_bio_check;
alter table public.profiles add constraint profiles_bio_check
  check (bio is null or char_length(bio) <= 500);
alter table public.profiles drop constraint if exists profiles_location_check;
alter table public.profiles add constraint profiles_location_check
  check (location is null or char_length(location) <= 80);
alter table public.profiles drop constraint if exists profiles_website_check;
alter table public.profiles add constraint profiles_website_check
  check (website is null or (char_length(website) <= 200 and website ~* '^https?://'));

-- Profile photos: one folder per person, only they can change it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Avatars: upload own" on storage.objects;
create policy "Avatars: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Avatars: change own" on storage.objects;
create policy "Avatars: change own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Avatars: remove own" on storage.objects;
create policy "Avatars: remove own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ═════════════════════════════════════════════════════════════
-- Update 4: listings can have several categories (e.g. license AND collaborate).
-- "category" keeps the first one so older code and filters still work.
-- ═════════════════════════════════════════════════════════════
alter table public.listings add column if not exists categories text[] not null default '{}';

update public.listings set categories = array[category] where cardinality(categories) = 0;

alter table public.listings drop constraint if exists listings_categories_check;
alter table public.listings add constraint listings_categories_check check (
  cardinality(categories) between 1 and 6
  and categories <@ array[
    'Available to license', 'Open to collaborations', 'Commission me',
    'Illustration & design', 'Animation & video', 'Voice & music', 'Writing',
    'Legal & IP', 'Manufacturing', 'Marketing & growth', 'Events', 'Other']::text[]
  and category = categories[1]);

-- ═════════════════════════════════════════════════════════════
-- Update 5: Discover, member profiles and live chat.
-- ═════════════════════════════════════════════════════════════

-- Members can see each other's public profile (name, photo, bio, location, website)
-- unless they've switched off "Show me in Discover". People you're chatting with can
-- always see each other.
alter table public.profiles add column if not exists discoverable boolean not null default true;

-- ── Chat tables ──
create table if not exists public.conversations (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  last_message_at      timestamptz,
  last_message_preview text
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists conversation_members_user_idx on public.conversation_members (user_id);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body            text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at      timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);

-- True when the signed-in person is in that conversation. Security definer so the
-- check itself isn't blocked by the policies that use it.
create or replace function public.is_conversation_member(conv uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = conv and m.user_id = auth.uid());
$$;

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Conversations: members read" on public.conversations;
create policy "Conversations: members read" on public.conversations
  for select to authenticated using (public.is_conversation_member(id));

drop policy if exists "Conversation members: members read" on public.conversation_members;
create policy "Conversation members: members read" on public.conversation_members
  for select to authenticated using (public.is_conversation_member(conversation_id));

drop policy if exists "Conversation members: mark own as read" on public.conversation_members;
create policy "Conversation members: mark own as read" on public.conversation_members
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.conversation_members from anon, authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;

drop policy if exists "Messages: members read" on public.messages;
create policy "Messages: members read" on public.messages
  for select to authenticated using (public.is_conversation_member(conversation_id));

drop policy if exists "Messages: members send" on public.messages;
create policy "Messages: members send" on public.messages
  for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.is_conversation_member(conversation_id));

-- Start (or reopen) a one-to-one chat with another member. Returns the conversation id.
create or replace function public.start_conversation(other uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  conv uuid;
begin
  if me is null then raise exception 'Log in to send messages'; end if;
  if other is null or other = me then raise exception 'Choose someone else to message'; end if;
  if not exists (select 1 from auth.users where id = other) then
    raise exception 'That member no longer has an account';
  end if;

  select a.conversation_id into conv
  from public.conversation_members a
  join public.conversation_members b on b.conversation_id = a.conversation_id and b.user_id = other
  where a.user_id = me
    and (select count(*) from public.conversation_members c where c.conversation_id = a.conversation_id) = 2
  limit 1;

  if conv is null then
    insert into public.conversations default values returning id into conv;
    insert into public.conversation_members (conversation_id, user_id) values (conv, me), (conv, other);
  end if;
  return conv;
end;
$$;
revoke all on function public.start_conversation(uuid) from public, anon;
grant execute on function public.start_conversation(uuid) to authenticated;

-- Keep each conversation's preview fresh, and count your own message as read.
create or replace function public.on_new_message()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.conversations
     set last_message_at = new.created_at, last_message_preview = left(new.body, 140)
   where id = new.conversation_id;
  update public.conversation_members
     set last_read_at = new.created_at
   where conversation_id = new.conversation_id and user_id = new.sender_id;
  return new;
end;
$$;

drop trigger if exists on_new_message on public.messages;
create trigger on_new_message
  after insert on public.messages
  for each row execute procedure public.on_new_message();

-- How many messages from other people you haven't read yet.
create or replace function public.unread_message_count()
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::int
  from public.messages m
  join public.conversation_members cm
    on cm.conversation_id = m.conversation_id and cm.user_id = auth.uid()
  where m.sender_id <> auth.uid() and m.created_at > cm.last_read_at;
$$;
grant execute on function public.unread_message_count() to authenticated;

-- Profiles readable by other members (defined after the chat tables it refers to).
drop policy if exists "Profiles: members read public" on public.profiles;
create policy "Profiles: members read public" on public.profiles
  for select to authenticated
  using (
    discoverable
    or id = (select auth.uid())
    or exists (
      select 1 from public.conversation_members a
      join public.conversation_members b on b.conversation_id = a.conversation_id
      where a.user_id = (select auth.uid()) and b.user_id = profiles.id));

-- Send new messages to open chat windows instantly (Supabase Realtime).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

-- ═════════════════════════════════════════════════════════════
-- Update 6: Creator hub. Follows, posts, reports, blocks and discount codes.
-- ═════════════════════════════════════════════════════════════

-- ── Follows: members follow creators ──
create table if not exists public.follows (
  follower_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  creator_id  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, creator_id),
  check (follower_id <> creator_id)
);
create index if not exists follows_creator_idx on public.follows (creator_id, created_at desc);

alter table public.follows enable row level security;

-- Follower counts are public to members, like on most social platforms.
drop policy if exists "Follows: members read" on public.follows;
create policy "Follows: members read" on public.follows for select to authenticated using (true);
drop policy if exists "Follows: follow as yourself" on public.follows;
create policy "Follows: follow as yourself" on public.follows
  for insert to authenticated with check (follower_id = (select auth.uid()));
drop policy if exists "Follows: unfollow as yourself" on public.follows;
create policy "Follows: unfollow as yourself" on public.follows
  for delete to authenticated using (follower_id = (select auth.uid()));

-- ── Posts: updates creators publish to everyone or to their followers ──
create table if not exists public.posts (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 140),
  body         text not null default '' check (char_length(body) <= 20000),
  visibility   text not null default 'public' check (visibility in ('public', 'followers')),
  status       text not null default 'draft' check (status in ('draft', 'published')),
  project_id   uuid references public.projects (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists posts_owner_idx on public.posts (owner_id, created_at desc);
create index if not exists posts_published_idx on public.posts (status, published_at desc);

alter table public.posts enable row level security;

drop policy if exists "Posts: owner manages" on public.posts;
create policy "Posts: owner manages" on public.posts
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists "Posts: members read published" on public.posts;
create policy "Posts: members read published" on public.posts
  for select to authenticated
  using (status = 'published' and (
    visibility = 'public'
    or exists (select 1 from public.follows f
               where f.creator_id = posts.owner_id and f.follower_id = (select auth.uid()))));

create or replace function public.touch_post()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  if new.status = 'published' and new.published_at is null then new.published_at = now(); end if;
  if new.status = 'draft' then new.published_at = null; end if;
  return new;
end;
$$;
drop trigger if exists touch_post on public.posts;
create trigger touch_post before insert or update on public.posts
  for each row execute procedure public.touch_post();

-- ── Blocks: stop someone from messaging you ──
create table if not exists public.blocks (
  blocker_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.blocks enable row level security;
drop policy if exists "Blocks: own" on public.blocks;
create policy "Blocks: own" on public.blocks
  for all to authenticated
  using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));

-- True when either person has blocked the other.
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (select 1 from public.blocks
                 where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

-- No new chats with someone who has blocked you (or whom you blocked).
create or replace function public.start_conversation(other uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  conv uuid;
begin
  if me is null then raise exception 'Log in to send messages'; end if;
  if other is null or other = me then raise exception 'Choose someone else to message'; end if;
  if not exists (select 1 from auth.users where id = other) then
    raise exception 'That member no longer has an account';
  end if;
  if public.is_blocked_between(me, other) then
    raise exception 'You can’t message this member';
  end if;

  select a.conversation_id into conv
  from public.conversation_members a
  join public.conversation_members b on b.conversation_id = a.conversation_id and b.user_id = other
  where a.user_id = me
    and (select count(*) from public.conversation_members c where c.conversation_id = a.conversation_id) = 2
  limit 1;

  if conv is null then
    insert into public.conversations default values returning id into conv;
    insert into public.conversation_members (conversation_id, user_id) values (conv, me), (conv, other);
  end if;
  return conv;
end;
$$;

-- No new messages in a chat where either side has blocked the other.
drop policy if exists "Messages: members send" on public.messages;
create policy "Messages: members send" on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_conversation_member(conversation_id)
    and not exists (
      select 1 from public.conversation_members o
      where o.conversation_id = messages.conversation_id
        and o.user_id <> (select auth.uid())
        and public.is_blocked_between((select auth.uid()), o.user_id)));

-- ── Reports: flag a profile, listing, post or message for review ──
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target_type  text not null check (target_type in ('profile', 'listing', 'post', 'message')),
  target_id    uuid not null,
  target_owner uuid references auth.users (id) on delete cascade,
  target_label text check (target_label is null or char_length(target_label) <= 200),
  reason       text not null check (reason in ('Spam', 'Harassment', 'Stolen or copied work', 'Inappropriate content', 'Scam or fraud', 'Something else')),
  details      text check (details is null or char_length(details) <= 1000),
  status       text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at   timestamptz not null default now()
);
create index if not exists reports_owner_idx on public.reports (target_owner, created_at desc);

alter table public.reports enable row level security;

-- Reporters see their own reports. Creators see reports about their content only through
-- the two functions below, which never reveal who filed them. The tsayvish team reviews
-- everything in the Table Editor.
drop policy if exists "Reports: file" on public.reports;
create policy "Reports: file" on public.reports
  for insert to authenticated with check (reporter_id = (select auth.uid()) and status = 'open');
drop policy if exists "Reports: read own or about you" on public.reports;
drop policy if exists "Reports: read own" on public.reports;
create policy "Reports: read own" on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()));
drop policy if exists "Reports: creators resolve" on public.reports;
revoke update on public.reports from anon, authenticated;

-- Work out whose content was reported from the item itself (never trust the client).
create or replace function public.set_report_owner()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  new.target_owner := case new.target_type
    when 'profile' then (select u.id from auth.users u where u.id = new.target_id)
    when 'listing' then (select l.owner_id from public.listings l where l.id = new.target_id)
    when 'post'    then (select p.owner_id from public.posts p where p.id = new.target_id)
    when 'message' then (select m.sender_id from public.messages m where m.id = new.target_id
                         and public.is_conversation_member(m.conversation_id))
  end;
  if new.target_owner is null then raise exception 'That item no longer exists'; end if;
  if new.target_owner = new.reporter_id then raise exception 'You can’t report your own content'; end if;
  return new;
end;
$$;
drop trigger if exists set_report_owner on public.reports;
create trigger set_report_owner before insert on public.reports
  for each row execute procedure public.set_report_owner();

create or replace function public.reports_about_me()
returns table (id uuid, target_type text, target_id uuid, target_label text, reason text,
               details text, status text, created_at timestamptz)
language sql
stable
security definer set search_path = ''
as $$
  select r.id, r.target_type, r.target_id, r.target_label, r.reason, r.details, r.status, r.created_at
  from public.reports r
  where r.target_owner = auth.uid()
  order by r.created_at desc
  limit 200;
$$;
revoke all on function public.reports_about_me() from public, anon;
grant execute on function public.reports_about_me() to authenticated;

create or replace function public.set_report_status(report uuid, new_status text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if new_status not in ('open', 'resolved', 'dismissed') then raise exception 'Unknown status'; end if;
  update public.reports set status = new_status
  where id = report and target_owner = auth.uid();
  if not found then raise exception 'Report not found'; end if;
end;
$$;
revoke all on function public.set_report_status(uuid, text) from public, anon;
grant execute on function public.set_report_status(uuid, text) to authenticated;

-- ── Discount codes (saved now, applied once storefront checkout launches) ──
create table if not exists public.promo_codes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  code        text not null check (code ~ '^[A-Z0-9_-]{3,24}$'),
  percent_off integer not null check (percent_off between 1 and 90),
  listing_id  uuid references public.listings (id) on delete cascade,
  max_uses    integer check (max_uses is null or max_uses between 1 and 100000),
  expires_on  date,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (owner_id, code)
);
alter table public.promo_codes enable row level security;
drop policy if exists "Promo codes: own" on public.promo_codes;
create policy "Promo codes: own" on public.promo_codes
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (listing_id is null or exists (
      select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid()))));


-- ═════════════════════════════════════════════════════════════════════════
-- Update 7: photos in chat, and uploading characters that already exist.
-- Safe to run again.
-- ═════════════════════════════════════════════════════════════════════════

-- ── Chat photos: a private bucket, readable only by the people in that conversation ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 8388608, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Files live at <conversation id>/<random name>. Only members of that conversation can add or view them.
drop policy if exists "Chat images: members upload" on storage.objects;
create policy "Chat images: members upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-images'
              and public.is_conversation_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "Chat images: members view" on storage.objects;
create policy "Chat images: members view" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-images'
         and public.is_conversation_member(((storage.foldername(name))[1])::uuid));

alter table public.messages add column if not exists image_path text;
alter table public.messages alter column body set default '';
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages drop constraint if exists messages_content_check;
alter table public.messages add constraint messages_content_check check (
  char_length(body) <= 4000
  and (char_length(btrim(body)) >= 1 or image_path is not null));
alter table public.messages drop constraint if exists messages_image_path_check;
alter table public.messages add constraint messages_image_path_check check (
  image_path is null or (image_path like conversation_id::text || '/%' and char_length(image_path) <= 200));

create or replace function public.on_new_message()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.conversations
     set last_message_at = new.created_at,
         last_message_preview = coalesce(nullif(left(btrim(new.body), 140), ''), 'Sent a photo')
   where id = new.conversation_id;
  update public.conversation_members
     set last_read_at = new.created_at
   where conversation_id = new.conversation_id and user_id = new.sender_id;
  return new;
end;
$$;

-- ── Existing characters: personality is optional for originals ──
-- (Uploaded characters keep their own story in projects.details: links, audience, rights.)
alter table public.projects drop constraint if exists projects_original_fields;
alter table public.projects add constraint projects_original_fields check (
  type <> 'original' or (kind is not null and color is not null));


-- ═════════════════════════════════════════════════════════════════════════
-- Update 8: offers on Marketplace listings, and notifications.
-- Safe to run again.
-- ═════════════════════════════════════════════════════════════════════════

-- ── Offers ──
create table if not exists public.offers (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,
  buyer_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  seller_id    uuid references auth.users (id) on delete cascade,   -- set from the listing, never by the client
  amount       numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  message      text check (message is null or char_length(message) <= 1000),
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz
);
create index if not exists offers_seller_idx on public.offers (seller_id, created_at desc);
create index if not exists offers_buyer_idx on public.offers (buyer_id, created_at desc);
create index if not exists offers_listing_idx on public.offers (listing_id, created_at desc);
-- One open offer per buyer per listing.
create unique index if not exists offers_one_pending on public.offers (listing_id, buyer_id) where status = 'pending';

alter table public.offers enable row level security;
drop policy if exists "Offers: buyer or seller read" on public.offers;
create policy "Offers: buyer or seller read" on public.offers
  for select to authenticated using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()));
drop policy if exists "Offers: make as yourself" on public.offers;
create policy "Offers: make as yourself" on public.offers
  for insert to authenticated with check (buyer_id = (select auth.uid()) and status = 'pending');
-- Status changes only through respond_to_offer / withdraw_offer below.
revoke update, delete on public.offers from anon, authenticated;

create or replace function public.prepare_offer()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare l record;
begin
  select owner_id, status into l from public.listings where id = new.listing_id;
  if l.owner_id is null or l.status <> 'published' then raise exception 'That listing isn’t available'; end if;
  if l.owner_id = new.buyer_id then raise exception 'You can’t make an offer on your own listing'; end if;
  if public.is_blocked_between(l.owner_id, new.buyer_id) then raise exception 'You can’t make an offer on this listing'; end if;
  new.seller_id := l.owner_id;
  new.status := 'pending';
  new.responded_at := null;
  return new;
end;
$$;
drop trigger if exists prepare_offer on public.offers;
create trigger prepare_offer before insert on public.offers
  for each row execute procedure public.prepare_offer();

create or replace function public.respond_to_offer(offer uuid, decision text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if decision not in ('accepted', 'declined') then raise exception 'Unknown decision'; end if;
  update public.offers set status = decision, responded_at = now()
  where id = offer and seller_id = auth.uid() and status = 'pending';
  if not found then raise exception 'That offer is no longer open'; end if;
end;
$$;
revoke all on function public.respond_to_offer(uuid, text) from public, anon;
grant execute on function public.respond_to_offer(uuid, text) to authenticated;

create or replace function public.withdraw_offer(offer uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.offers set status = 'withdrawn', responded_at = now()
  where id = offer and buyer_id = auth.uid() and status = 'pending';
  if not found then raise exception 'That offer is no longer open'; end if;
end;
$$;
revoke all on function public.withdraw_offer(uuid) from public, anon;
grant execute on function public.withdraw_offer(uuid) to authenticated;

-- ── Notifications: written only by the triggers below ──
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  type       text not null check (type in ('offer_received', 'offer_accepted', 'offer_declined', 'offer_withdrawn', 'new_follower')),
  actor_id   uuid references auth.users (id) on delete cascade,
  offer_id   uuid references public.offers (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete cascade,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "Notifications: read own" on public.notifications;
create policy "Notifications: read own" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Notifications: mark own read" on public.notifications;
create policy "Notifications: mark own read" on public.notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "Notifications: clear own" on public.notifications;
create policy "Notifications: clear own" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));
revoke insert, update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function public.notify_offer()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, type, actor_id, offer_id, listing_id)
    values (new.seller_id, 'offer_received', new.buyer_id, new.id, new.listing_id);
  elsif new.status is distinct from old.status then
    if new.status in ('accepted', 'declined') then
      insert into public.notifications (user_id, type, actor_id, offer_id, listing_id)
      values (new.buyer_id, 'offer_' || new.status, new.seller_id, new.id, new.listing_id);
    elsif new.status = 'withdrawn' then
      insert into public.notifications (user_id, type, actor_id, offer_id, listing_id)
      values (new.seller_id, 'offer_withdrawn', new.buyer_id, new.id, new.listing_id);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists notify_offer on public.offers;
create trigger notify_offer after insert or update on public.offers
  for each row execute procedure public.notify_offer();

create or replace function public.notify_follow()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.notifications (user_id, type, actor_id) values (new.creator_id, 'new_follower', new.follower_id);
  return new;
end;
$$;
drop trigger if exists notify_follow on public.follows;
create trigger notify_follow after insert on public.follows
  for each row execute procedure public.notify_follow();

create or replace function public.unread_notification_count()
returns integer
language sql
stable
security definer set search_path = ''
as $$
  select count(*)::int from public.notifications where user_id = auth.uid() and read_at is null;
$$;
revoke all on function public.unread_notification_count() from public, anon;
grant execute on function public.unread_notification_count() to authenticated;

-- Live badge updates.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- People you trade offers with, or who follow you, can be named in your notifications.
drop policy if exists "Profiles: offer parties and followers read" on public.profiles;
create policy "Profiles: offer parties and followers read" on public.profiles
  for select to authenticated using (
    exists (select 1 from public.offers o
            where (o.buyer_id = profiles.id and o.seller_id = (select auth.uid()))
               or (o.seller_id = profiles.id and o.buyer_id = (select auth.uid())))
    or exists (select 1 from public.follows f
               where f.follower_id = profiles.id and f.creator_id = (select auth.uid())));
