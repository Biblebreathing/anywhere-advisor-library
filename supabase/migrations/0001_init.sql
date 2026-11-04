-- Anywhere Advisor Library: initial schema
-- Run in Supabase → SQL Editor, or with `supabase db push`.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null,
  full_name      text,
  role           text not null default 'student' check (role in ('student', 'editor', 'owner')),
  ghl_contact_id text,
  welcomed_at    timestamptz,
  created_at     timestamptz not null default now()
);
create unique index profiles_email_idx on public.profiles (lower(email));

-- Staff = editors and owners. SECURITY DEFINER so policies can call it without recursion.
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('editor', 'owner'));
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner');
$$;

-- Create a profile for every new auth user.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', null))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Files (uploaded to Supabase Storage). Students never read this table directly;
-- the server checks entitlements and hands out short-lived signed URLs.
-- ---------------------------------------------------------------------------
create table public.files (
  id               uuid primary key default gen_random_uuid(),
  bucket           text not null,
  path             text not null,
  name             text not null,
  size_bytes       bigint,
  mime_type        text,
  duration_seconds numeric,
  uploaded_by      uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (bucket, path)
);

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
create table public.titles (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title                 text not null,
  subtitle              text,
  series                text,
  description           text,
  status                text not null default 'draft' check (status in ('draft', 'live')),
  cover_path            text,             -- path in the public "covers" bucket, or /covers/... for bundled images
  course_name           text,
  ghl_book_product_id   text,
  ghl_course_product_id text,
  ghl_order_url         text,
  sales_url             text,
  sort_order            int not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table public.chapters (
  id               uuid primary key default gen_random_uuid(),
  title_id         uuid not null references public.titles (id) on delete cascade,
  position         int not null,
  name             text not null,
  audio_file_id    uuid references public.files (id) on delete set null,
  duration_seconds numeric,
  cta              text,
  created_at       timestamptz not null default now()
);
create index chapters_title_idx on public.chapters (title_id, position);

create table public.exercises (
  id         uuid primary key default gen_random_uuid(),
  title_id   uuid not null references public.titles (id) on delete cascade,
  position   int not null,
  name       text not null,
  chapter_id uuid references public.chapters (id) on delete set null,
  questions  text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index exercises_title_idx on public.exercises (title_id, position);

create table public.lessons (
  id               uuid primary key default gen_random_uuid(),
  title_id         uuid not null references public.titles (id) on delete cascade,
  position         int not null,
  name             text not null,
  video_file_id    uuid references public.files (id) on delete set null,
  video_url        text,
  duration_seconds numeric,
  is_bonus         boolean not null default false,
  created_at       timestamptz not null default now()
);
create index lessons_title_idx on public.lessons (title_id, position);

create table public.resources (
  id         uuid primary key default gen_random_uuid(),
  title_id   uuid not null references public.titles (id) on delete cascade,
  position   int not null,
  name       text not null,
  file_id    uuid references public.files (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Ebook PDF and printable workbook, with version history. The current one has is_current = true.
create table public.title_files (
  id         uuid primary key default gen_random_uuid(),
  title_id   uuid not null references public.titles (id) on delete cascade,
  kind       text not null check (kind in ('ebook_pdf', 'ebook_epub', 'workbook_pdf')),
  file_id    uuid not null references public.files (id) on delete cascade,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index title_files_current_idx on public.title_files (title_id, kind) where is_current;

create table public.site_settings (
  id                    int primary key default 1 check (id = 1),
  welcome_video_file_id uuid references public.files (id) on delete set null,
  welcome_video_url     text,
  booking_url           text,
  updated_at            timestamptz not null default now()
);
insert into public.site_settings (id) values (1) on conflict do nothing;

-- Change log shown in admin
create table public.change_log (
  id         bigserial primary key,
  title_id   uuid references public.titles (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,
  summary    text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Access and progress
-- ---------------------------------------------------------------------------
create table public.entitlements (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title_id   uuid not null references public.titles (id) on delete cascade,
  kind       text not null check (kind in ('book', 'course')),
  source     text not null default 'ghl',   -- ghl | admin | unlock
  created_at timestamptz not null default now(),
  primary key (user_id, title_id, kind)
);

create table public.audio_progress (
  user_id          uuid not null references public.profiles (id) on delete cascade,
  title_id         uuid not null references public.titles (id) on delete cascade,
  chapter_id       uuid not null references public.chapters (id) on delete cascade,
  position_seconds numeric not null default 0,
  playback_rate    numeric not null default 1,
  updated_at       timestamptz not null default now(),
  primary key (user_id, title_id)
);

create table public.chapter_completions (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  chapter_id   uuid not null references public.chapters (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, chapter_id)
);

create table public.lesson_completions (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  lesson_id    uuid not null references public.lessons (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table public.exercise_answers (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  exercise_id  uuid not null references public.exercises (id) on delete cascade,
  answers      jsonb not null default '[]',
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

create table public.notes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  chapter_id       uuid not null references public.chapters (id) on delete cascade,
  position_seconds numeric not null default 0,
  body             text not null,
  created_at       timestamptz not null default now()
);
create index notes_user_idx on public.notes (user_id, chapter_id);

-- Student activity. Mirrored to GoHighLevel as tags.
create table public.events (
  id             bigserial primary key,
  user_id        uuid references public.profiles (id) on delete cascade,
  title_id       uuid references public.titles (id) on delete set null,
  name           text not null,
  data           jsonb not null default '{}',
  ghl_tag        text,
  ghl_synced_at  timestamptz,
  created_at     timestamptz not null default now()
);
create index events_user_idx on public.events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.files               enable row level security;
alter table public.titles              enable row level security;
alter table public.chapters            enable row level security;
alter table public.exercises           enable row level security;
alter table public.lessons             enable row level security;
alter table public.resources           enable row level security;
alter table public.title_files         enable row level security;
alter table public.site_settings       enable row level security;
alter table public.change_log          enable row level security;
alter table public.entitlements        enable row level security;
alter table public.audio_progress      enable row level security;
alter table public.chapter_completions enable row level security;
alter table public.lesson_completions  enable row level security;
alter table public.exercise_answers    enable row level security;
alter table public.notes               enable row level security;
alter table public.events              enable row level security;

-- Profiles: read your own (staff read all). Students may only change their name and welcome flag.
create policy "profiles: read own or staff" on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy "profiles: update own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles: owner manages" on public.profiles for all using (public.is_owner()) with check (public.is_owner());
revoke update on public.profiles from authenticated;
grant update (full_name, welcomed_at) on public.profiles to authenticated;

-- Catalog: live titles are public (the welcome page shows them). Staff see drafts and edit everything.
create policy "titles: read live or staff" on public.titles for select using (status = 'live' or public.is_staff());
create policy "titles: staff write" on public.titles for all using (public.is_staff()) with check (public.is_staff());

create policy "chapters: read" on public.chapters for select using (
  public.is_staff() or exists (select 1 from public.titles t where t.id = title_id and t.status = 'live'));
create policy "chapters: staff write" on public.chapters for all using (public.is_staff()) with check (public.is_staff());

create policy "exercises: read" on public.exercises for select using (
  public.is_staff() or exists (select 1 from public.titles t where t.id = title_id and t.status = 'live'));
create policy "exercises: staff write" on public.exercises for all using (public.is_staff()) with check (public.is_staff());

create policy "lessons: read" on public.lessons for select using (
  public.is_staff() or exists (select 1 from public.titles t where t.id = title_id and t.status = 'live'));
create policy "lessons: staff write" on public.lessons for all using (public.is_staff()) with check (public.is_staff());

create policy "resources: read" on public.resources for select using (
  public.is_staff() or exists (select 1 from public.titles t where t.id = title_id and t.status = 'live'));
create policy "resources: staff write" on public.resources for all using (public.is_staff()) with check (public.is_staff());

create policy "files: staff only" on public.files for all using (public.is_staff()) with check (public.is_staff());
create policy "title_files: staff only" on public.title_files for all using (public.is_staff()) with check (public.is_staff());
create policy "change_log: staff only" on public.change_log for all using (public.is_staff()) with check (public.is_staff());

create policy "site_settings: read" on public.site_settings for select using (true);
create policy "site_settings: staff write" on public.site_settings for update using (public.is_staff()) with check (public.is_staff());

-- Entitlements are granted by the server (GHL webhook, one-click unlock) or by staff.
create policy "entitlements: read own or staff" on public.entitlements for select using (user_id = auth.uid() or public.is_staff());
create policy "entitlements: staff write" on public.entitlements for all using (public.is_staff()) with check (public.is_staff());

-- Progress, answers and notes belong to the student.
create policy "audio_progress: own" on public.audio_progress for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "chapter_completions: own" on public.chapter_completions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "lesson_completions: own" on public.lesson_completions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "exercise_answers: own" on public.exercise_answers for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notes: own" on public.notes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "progress: staff read" on public.audio_progress for select using (public.is_staff());
create policy "completions: staff read" on public.chapter_completions for select using (public.is_staff());
create policy "lessons done: staff read" on public.lesson_completions for select using (public.is_staff());
create policy "answers: staff read" on public.exercise_answers for select using (public.is_staff());

create policy "events: insert own" on public.events for insert with check (user_id = auth.uid());
create policy "events: read own or staff" on public.events for select using (user_id = auth.uid() or public.is_staff());

-- ---------------------------------------------------------------------------
-- Storage: "covers" is public; "media" (audio, PDFs, videos, resources) is private.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('covers', 'covers', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('media', 'media', false) on conflict (id) do nothing;

create policy "covers: public read" on storage.objects for select using (bucket_id = 'covers');
create policy "covers: staff write" on storage.objects for insert with check (bucket_id = 'covers' and public.is_staff());
create policy "covers: staff update" on storage.objects for update using (bucket_id = 'covers' and public.is_staff());
create policy "covers: staff delete" on storage.objects for delete using (bucket_id = 'covers' and public.is_staff());
create policy "media: staff read" on storage.objects for select using (bucket_id = 'media' and public.is_staff());
create policy "media: staff write" on storage.objects for insert with check (bucket_id = 'media' and public.is_staff());
create policy "media: staff update" on storage.objects for update using (bucket_id = 'media' and public.is_staff());
create policy "media: staff delete" on storage.objects for delete using (bucket_id = 'media' and public.is_staff());
