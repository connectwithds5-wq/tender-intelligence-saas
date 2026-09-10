create extension if not exists pgcrypto;

create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade,
  business_name text not null, categories text[] not null default '{}', locations text[] not null default '{}',
  keywords text[] not null default '{}', min_tender_value numeric, max_tender_value numeric, annual_turnover numeric,
  certifications text[] not null default '{}', experience_keywords text[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table public.business_profiles add column if not exists user_id uuid references auth.users(id) on delete cascade;

create table if not exists public.tenders (
  id text primary key, reference_number text, title text not null, buyer text, category text, location text,
  estimated_value numeric, emd_amount numeric, published_at timestamptz, closing_at timestamptz,
  source text not null, source_url text not null, document_url text, keywords text[] not null default '{}',
  description text, raw jsonb not null default '{}', first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now()
);
create index if not exists tenders_closing_at_idx on public.tenders (closing_at);
create index if not exists tenders_source_idx on public.tenders (source);
create index if not exists tenders_category_idx on public.tenders (category);

create table if not exists public.tender_matches (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.business_profiles(id) on delete cascade,
  tender_id text not null references public.tenders(id) on delete cascade, score integer not null check (score between 0 and 100),
  recommendation text not null check (recommendation in ('BID','REVIEW','SKIP')), reasons jsonb not null default '[]',
  created_at timestamptz not null default now(), unique(profile_id, tender_id)
);

create table if not exists public.fetch_runs (
  id uuid primary key default gen_random_uuid(), source text not null, started_at timestamptz not null default now(),
  finished_at timestamptz, fetched_count integer not null default 0, upserted_count integer not null default 0,
  status text not null default 'running', error text
);

create table if not exists public.tender_document_analyses (
  id uuid primary key default gen_random_uuid(),
  tender_id text not null references public.tenders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_url text not null,
  status text not null check (status in ('analyzed','failed')),
  extracted_text text not null default '',
  analysis jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tender_id, user_id)
);
create index if not exists tender_document_analyses_user_idx on public.tender_document_analyses (user_id, updated_at desc);

alter table public.business_profiles enable row level security;
alter table public.tenders enable row level security;
alter table public.tender_matches enable row level security;
alter table public.fetch_runs enable row level security;
alter table public.tender_document_analyses enable row level security;

-- Customer data: only the authenticated owner can access their profiles and analyses.
drop policy if exists "profile_owner_select" on public.business_profiles;
drop policy if exists "profile_owner_insert" on public.business_profiles;
drop policy if exists "profile_owner_update" on public.business_profiles;
drop policy if exists "profile_owner_delete" on public.business_profiles;
create policy "profile_owner_select" on public.business_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "profile_owner_insert" on public.business_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "profile_owner_update" on public.business_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "profile_owner_delete" on public.business_profiles for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "match_owner_select" on public.tender_matches;
create policy "match_owner_select" on public.tender_matches for select to authenticated
  using (exists (select 1 from public.business_profiles p where p.id = profile_id and p.user_id = (select auth.uid())));

drop policy if exists "document_analysis_owner_select" on public.tender_document_analyses;
create policy "document_analysis_owner_select" on public.tender_document_analyses for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "document_analysis_owner_delete" on public.tender_document_analyses;
create policy "document_analysis_owner_delete" on public.tender_document_analyses for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Tenders and fetch runs are system-managed and server-only. Service role performs ingestion and analysis writes.
revoke all on table public.tenders from anon, authenticated;
revoke all on table public.fetch_runs from anon, authenticated;
revoke all on table public.business_profiles from anon;
revoke all on table public.tender_matches from anon;
revoke all on table public.tender_document_analyses from anon;
grant select, insert, update, delete on table public.business_profiles to authenticated;
grant select on table public.tender_matches to authenticated;
grant select, delete on table public.tender_document_analyses to authenticated;
