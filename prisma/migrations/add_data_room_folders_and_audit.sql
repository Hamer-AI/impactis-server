alter table if exists public.startup_data_room_documents
  add column if not exists folder_path text;

create table if not exists public.startup_data_room_audit_logs (
  id uuid primary key default gen_random_uuid(),
  startup_org_id uuid not null references public.organizations(id) on delete cascade,
  action text not null,
  folder_path text,
  document_id uuid,
  document_type public.startup_data_room_document_type,
  title text,
  file_url text,
  storage_bucket text,
  storage_object_path text,
  file_name text,
  file_size_bytes bigint,
  content_type text,
  summary text,
  actor_user_id uuid references public.users(id),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists startup_data_room_audit_logs_org_created_idx
  on public.startup_data_room_audit_logs(startup_org_id, created_at desc);

create index if not exists startup_data_room_audit_logs_org_folder_idx
  on public.startup_data_room_audit_logs(startup_org_id, folder_path);
