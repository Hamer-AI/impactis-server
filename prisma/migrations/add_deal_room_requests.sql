-- Deal Room discussion requests (investor -> startup)
create table if not exists public.deal_room_requests (
  id uuid primary key default gen_random_uuid(),
  startup_org_id uuid not null references public.organizations(id) on delete cascade,
  investor_org_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'pending',
  message text,
  created_at timestamptz not null default timezone('utc', now()),
  responded_at timestamptz
);

create unique index if not exists deal_room_requests_unique_pair
  on public.deal_room_requests(startup_org_id, investor_org_id);

create index if not exists deal_room_requests_startup_status_idx
  on public.deal_room_requests(startup_org_id, status, created_at desc);

create index if not exists deal_room_requests_investor_status_idx
  on public.deal_room_requests(investor_org_id, status, created_at desc);

