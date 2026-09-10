-- Private tender document storage and analysis records.
insert into storage.buckets (id, name, public)
values ('tender-documents', 'tender-documents', false)
on conflict (id) do nothing;

create table if not exists public.tender_document_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tender_id text references public.tenders(id) on delete set null,
  profile_id uuid references public.business_profiles(id) on delete set null,
  storage_path text,
  file_name text not null,
  content_type text not null,
  analysis jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists tender_document_analyses_user_idx on public.tender_document_analyses(user_id, created_at desc);
create index if not exists tender_document_analyses_tender_idx on public.tender_document_analyses(tender_id);

alter table public.tender_document_analyses enable row level security;
drop policy if exists "document_analysis_owner_select" on public.tender_document_analyses;
drop policy if exists "document_analysis_owner_insert" on public.tender_document_analyses;
create policy "document_analysis_owner_select" on public.tender_document_analyses for select to authenticated using ((select auth.uid()) = user_id);
create policy "document_analysis_owner_insert" on public.tender_document_analyses for insert to authenticated with check ((select auth.uid()) = user_id);
revoke all on table public.tender_document_analyses from anon;
grant select, insert on table public.tender_document_analyses to authenticated;

-- Files are private. Users can only access files stored under their auth UID.
drop policy if exists "tender_documents_owner_insert" on storage.objects;
drop policy if exists "tender_documents_owner_select" on storage.objects;
drop policy if exists "tender_documents_owner_delete" on storage.objects;
create policy "tender_documents_owner_insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'tender-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "tender_documents_owner_select" on storage.objects for select to authenticated using (
  bucket_id = 'tender-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "tender_documents_owner_delete" on storage.objects for delete to authenticated using (
  bucket_id = 'tender-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
);
