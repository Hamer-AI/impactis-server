-- Create org_current_subscription_plan_v1 view required by capabilities & billing.
-- The view returns exactly one row per org_id, selecting the active subscription plan if present,
-- otherwise selecting the default plan for that org's segment (org_type).
--
-- Run from impactis-server: psql $DATABASE_URL -f prisma/migrations/add_org_current_subscription_plan_view.sql

create or replace view public.org_current_subscription_plan_v1 as
with active_sub as (
  select
    s.org_id,
    s.plan_id,
    s.status,
    s.billing_interval,
    s.current_period_start,
    s.current_period_end,
    s.started_at,
    s.cancel_at_period_end,
    s.canceled_at,
    false as is_fallback_free
  from public.org_subscriptions s
  where s.status in ('trialing', 'active', 'past_due', 'paused')
),
default_plan_per_segment as (
  select
    p.segment,
    p.id as plan_id,
    row_number() over (
      partition by p.segment
      order by
        case when p.is_default then 0 else 1 end,
        p.plan_tier asc,
        p.created_at asc
    ) as rn
  from public.billing_plan_catalog p
  where p.is_active = true
),
fallback_plan as (
  select
    o.id as org_id,
    d.plan_id as plan_id,
    'active'::public.billing_subscription_status as status,
    'monthly'::public.billing_interval as billing_interval,
    null::timestamptz as current_period_start,
    null::timestamptz as current_period_end,
    timezone('utc', now()) as started_at,
    false as cancel_at_period_end,
    null::timestamptz as canceled_at,
    true as is_fallback_free
  from public.organizations o
  join default_plan_per_segment d
    on d.segment = o.type
   and d.rn = 1
)
select
  coalesce(a.org_id, f.org_id) as org_id,
  coalesce(a.plan_id, f.plan_id) as plan_id,
  coalesce(a.status, f.status) as status,
  coalesce(a.billing_interval, f.billing_interval) as billing_interval,
  coalesce(a.current_period_start, f.current_period_start) as current_period_start,
  coalesce(a.current_period_end, f.current_period_end) as current_period_end,
  coalesce(a.started_at, f.started_at) as started_at,
  coalesce(a.cancel_at_period_end, f.cancel_at_period_end) as cancel_at_period_end,
  coalesce(a.canceled_at, f.canceled_at) as canceled_at,
  coalesce(a.is_fallback_free, f.is_fallback_free) as is_fallback_free
from fallback_plan f
left join active_sub a on a.org_id = f.org_id;

