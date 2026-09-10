create extension if not exists pgcrypto;

create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  categories text[] not null default '{}',
  locations text[] not null default '{}',
  keywords text[] not null default '{}',
  min_tender_value numeric,
  max_tender_value numeric,
  annual_turnover numeric,
  certifications text[] not null default '{}',
  experience_keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenders (
  id text primary key,
  reference_number text,
  title text not null,
  buyer text,
  category text,
  location text,
  estimated_value numeric,
  emd_amount numeric,
  published_at timestamptz,
  closing_at timestamptz,
  source text not null,
  source_url text not null,
  document_url text,
  keywords text[] not null default '{}',
  description text,
  raw jsonb not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists tenders_closing_at_idx on public.tenders (closing_at);
create index if not exists tenders_source_idx on public.tenders (source);
create index if not exists tenders_category_idx on public.tenders (category);

create table if not exists public.tender_matches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.business_profiles(id) on delete cascade,
  tender_id text not null references public.tenders(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  recommendation text not null check (recommendation in ('BID','REVIEW','SKIP')),
  reasons jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique(profile_id, tender_id)
);

create table if not exists public.fetch_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  fetched_count integer not null default 0,
  upserted_count integer not null default 0,
  status text not null default 'running',
  error text
);

-- Server-side service role is intended for ingestion. Enable RLS before exposing
-- any table through the browser/Data API and add user-scoped policies.
alter table public.business_profiles enable row level security;
alter table public.tenders enable row level security;
alter table public.tender_matches enable row level security;
alter table public.fetch_runs enable row level security;
