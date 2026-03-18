-- v3: record Data Room ToS consents (ip/user-agent)
create table if not exists public.data_room_consents (
  id uuid primary key default gen_random_uuid(),
  startup_org_id uuid not null references public.organizations(id) on delete cascade,
  grantee_org_id uuid not null references public.organizations(id) on delete cascade,
  consented_at timestamptz not null default timezone('utc', now()),
  ip_address text null,
  user_agent text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint data_room_consents_unique_pair unique (startup_org_id, grantee_org_id)
);

create index if not exists data_room_consents_startup_idx
  on public.data_room_consents (startup_org_id, consented_at desc);

create index if not exists data_room_consents_grantee_idx
  on public.data_room_consents (grantee_org_id, consented_at desc);

