-- Seed minimal billing plans, capabilities, and plan capabilities.
-- This unblocks org_current_subscription_plan_v1 and capability checks in dev.
-- Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- Capabilities
-- ---------------------------------------------------------------------------
insert into public.capabilities (code, description, category)
values
  ('dataroom.upload', 'Upload documents to startup data room', 'data_room'),
  ('dataroom.view', 'View startup data room documents', 'data_room'),
  ('dataroom.download', 'Download startup data room documents', 'data_room'),
  ('connections.request', 'Send connection requests', 'connections'),
  ('dealroom.access', 'Access existing deal rooms', 'deal_room'),
  ('dealroom.create', 'Create or start new deal rooms', 'deal_room')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Plans (free/pro/elite) for each segment
-- ---------------------------------------------------------------------------
with desired_plans as (
  select * from (
    values
      ('startup'::public.org_type, 'free',  0, true,  true,  true),
      ('startup'::public.org_type, 'pro',   1, false, true,  true),
      ('startup'::public.org_type, 'elite', 2, false, true,  true),
      ('investor'::public.org_type, 'free',  0, true,  true,  true),
      ('investor'::public.org_type, 'pro',   1, false, true,  true),
      ('investor'::public.org_type, 'elite', 2, false, true,  true),
      ('advisor'::public.org_type, 'free',  0, true,  true,  true),
      ('advisor'::public.org_type, 'pro',   1, false, true,  true),
      ('advisor'::public.org_type, 'elite', 2, false, true,  true)
  ) as t(segment, plan_code, plan_tier, is_default, is_active, is_public)
)
insert into public.billing_plan_catalog (
  segment,
  plan_code,
  display_name,
  plan_tier,
  is_default,
  is_active,
  is_public,
  metadata,
  created_at,
  updated_at
)
select
  d.segment,
  d.plan_code,
  initcap(d.plan_code) || ' ' || initcap(d.segment::text) as display_name,
  d.plan_tier,
  d.is_default,
  d.is_active,
  d.is_public,
  '{}'::jsonb,
  timezone('utc', now()),
  timezone('utc', now())
from desired_plans d
on conflict (segment, plan_code) do update
set
  plan_tier = excluded.plan_tier,
  is_default = excluded.is_default,
  is_active = excluded.is_active,
  is_public = excluded.is_public,
  updated_at = timezone('utc', now());

-- ---------------------------------------------------------------------------
-- Plan prices (for demo; Stripe integration can override with stripe_price_id)
-- ---------------------------------------------------------------------------
insert into public.billing_plan_prices (plan_id, billing_interval, amount_cents, currency, created_at, updated_at)
select
  p.id,
  'monthly'::public.billing_interval,
  case
    when p.plan_code = 'free' then 0
    when p.plan_code = 'pro' and p.segment = 'startup' then 24900
    when p.plan_code = 'elite' and p.segment = 'startup' then 79900
    when p.plan_code = 'pro' and p.segment = 'investor' then 20800
    when p.plan_code = 'elite' and p.segment = 'investor' then 100000
    when p.plan_code = 'pro' and p.segment = 'advisor' then 29900
    when p.plan_code = 'elite' and p.segment = 'advisor' then 59900
    else 0
  end,
  'USD',
  timezone('utc', now()),
  timezone('utc', now())
from public.billing_plan_catalog p
where p.is_active = true
on conflict (plan_id, billing_interval) do update
set
  amount_cents = excluded.amount_cents,
  currency = excluded.currency,
  updated_at = timezone('utc', now());

-- ---------------------------------------------------------------------------
-- Plan feature limits (used by StartupsService assertDataRoomDocumentsAvailableForPlan)
-- ---------------------------------------------------------------------------
insert into public.billing_plan_features (
  plan_id,
  feature_key,
  feature_label,
  limit_value,
  is_unlimited,
  sort_order,
  metadata,
  created_at,
  updated_at
)
select
  p.id,
  'data_room_documents_limit',
  'Data room documents limit',
  case
    when p.plan_code = 'free' then 5
    when p.plan_code = 'pro' then 9999
    when p.plan_code = 'elite' then 9999
    else 5
  end,
  case when p.plan_code in ('pro','elite') then true else false end,
  10,
  '{}'::jsonb,
  timezone('utc', now()),
  timezone('utc', now())
from public.billing_plan_catalog p
where p.is_active = true
on conflict (plan_id, feature_key) do update
set
  limit_value = excluded.limit_value,
  is_unlimited = excluded.is_unlimited,
  updated_at = timezone('utc', now());

-- ---------------------------------------------------------------------------
-- Plan capabilities
-- ---------------------------------------------------------------------------
insert into public.plan_capabilities (plan_id, capability_code, is_enabled, created_at)
select
  p.id,
  c.code,
  case
    when c.code = 'dataroom.upload' then (p.plan_code in ('pro','elite') or p.segment = 'startup')
    when c.code = 'dataroom.view' then true
    when c.code = 'dataroom.download' then (p.plan_code in ('pro','elite'))
    when c.code = 'connections.request' then true
    when c.code = 'dealroom.access' then true
    when c.code = 'dealroom.create' then (p.plan_code in ('pro','elite') or p.segment = 'startup')
    else true
  end,
  timezone('utc', now())
from public.billing_plan_catalog p
join public.capabilities c on true
where p.is_active = true
on conflict (plan_id, capability_code) do update
set is_enabled = excluded.is_enabled;

