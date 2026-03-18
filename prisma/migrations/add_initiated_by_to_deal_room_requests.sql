-- Add initiated_by to deal_room_requests for v3 deal initiation tracking.
alter table public.deal_room_requests
  add column if not exists initiated_by uuid;

create index if not exists deal_room_requests_initiated_by_idx
  on public.deal_room_requests (initiated_by);

