-- Key Performance Indexes (v3.0)
-- Safe / idempotent where possible.

-- Discovery feed (tier-ranked)
create index if not exists idx_orgs_discovery
  on public.organizations (type, current_tier desc, created_at desc)
  where onboarding_complete = true;

-- Unread notifications badge
create index if not exists idx_notifs_unread
  on public.notifications (user_id, created_at desc)
  where read_at is null;

-- Active subscriptions fast lookup
create index if not exists idx_subs_active
  on public.org_subscriptions (org_id)
  where status in ('active', 'trialing', 'past_due');

-- AI matches sorted by score
create index if not exists idx_ai_matches
  on public.ai_match_scores (from_org_id, overall_score desc)
  where disqualified = false;

-- Monthly usage counter lookup
create index if not exists idx_usage_period
  on public.org_feature_usage_counters (org_id, feature_key, period_start desc);

