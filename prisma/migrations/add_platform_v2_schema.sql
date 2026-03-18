-- =============================================================================
-- IMPACTIS PLATFORM v2 — COMPREHENSIVE MIGRATION
-- =============================================================================
-- Run this after all previous migrations have been applied.
-- Safe to run multiple times (uses IF NOT EXISTS / DO ... END patterns).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- NEW ENUMS
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.onboarding_step_status as enum (
    'not_started', 'in_progress', 'completed', 'skipped'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.deal_room_stage as enum (
    'interest', 'due_diligence', 'negotiation', 'commitment', 'closing', 'closed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.deal_room_participant_role as enum (
    'startup_founder', 'lead_investor', 'co_investor', 'advisor', 'observer'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.deal_room_agreement_status as enum (
    'draft', 'review', 'signed', 'executed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.data_room_access_status as enum (
    'pending', 'approved', 'rejected', 'revoked'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.data_room_permission_level as enum (
    'view', 'view_download'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.syndicate_status as enum (
    'forming', 'active', 'closed', 'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.syndicate_member_status as enum (
    'invited', 'confirmed', 'declined', 'withdrew'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.support_ticket_status as enum (
    'open', 'in_progress', 'resolved', 'closed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.support_ticket_priority as enum (
    'low', 'medium', 'high', 'urgent'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_transaction_status as enum (
    'pending', 'processing', 'completed', 'failed', 'refunded', 'disputed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.match_feedback_type as enum (
    'interested', 'not_interested', 'saved', 'passed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.profile_view_kind as enum (
    'discovery', 'detail', 'data_room'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.user_two_factor_method as enum (
    'totp', 'sms', 'email'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.security_event_type as enum (
    'login', 'logout', 'password_change',
    'two_factor_enabled', 'two_factor_disabled', 'suspicious_activity'
  );
exception when duplicate_object then null;
end $$;

-- Add new values to existing startup_data_room_document_type enum
do $$ begin
  alter type public.startup_data_room_document_type add value if not exists 'executive_summary';
exception when others then null;
end $$;
do $$ begin
  alter type public.startup_data_room_document_type add value if not exists 'product_roadmap';
exception when others then null;
end $$;
do $$ begin
  alter type public.startup_data_room_document_type add value if not exists 'market_research';
exception when others then null;
end $$;
do $$ begin
  alter type public.startup_data_room_document_type add value if not exists 'team_bios';
exception when others then null;
end $$;
do $$ begin
  alter type public.startup_data_room_document_type add value if not exists 'nda_template';
exception when others then null;
end $$;
do $$ begin
  alter type public.startup_data_room_document_type add value if not exists 'other';
exception when others then null;
end $$;

-- ---------------------------------------------------------------------------
-- EXTEND EXISTING TABLES
-- ---------------------------------------------------------------------------

-- organizations: add new columns
alter table if exists public.organizations
  add column if not exists country              text,
  add column if not exists website_url          text,
  add column if not exists finance_status       text,
  add column if not exists onboarding_complete  boolean not null default false;

-- profiles: add social links
alter table if exists public.profiles
  add column if not exists twitter_url         text,
  add column if not exists crunchbase_url      text,
  add column if not exists angellist_url       text;

-- billing_plan_catalog: add pricing columns
alter table if exists public.billing_plan_catalog
  add column if not exists monthly_price_usd  integer not null default 0,
  add column if not exists annual_price_usd   integer not null default 0,
  add column if not exists success_fee_pct    text,
  add column if not exists platform_fee_pct   text;

-- billing_plan_prices: add Stripe price ID
alter table if exists public.billing_plan_prices
  add column if not exists stripe_price_id text;

-- org_subscriptions: add trial support
alter table if exists public.org_subscriptions
  add column if not exists trial_ends_at timestamptz;

-- org_verifications: add documents column
alter table if exists public.org_verifications
  add column if not exists documents jsonb not null default '[]'::jsonb;

-- deal_rooms: add stage + extra fields
alter table if exists public.deal_rooms
  add column if not exists stage           public.deal_room_stage not null default 'interest',
  add column if not exists description     text,
  add column if not exists target_amount   bigint,
  add column if not exists committed_total bigint not null default 0,
  add column if not exists terms_accepted  boolean not null default false,
  add column if not exists closed_at       timestamptz,
  add column if not exists updated_at      timestamptz not null default timezone('utc', now());

-- startup_data_room_documents: add confidentiality flags
-- (folder_id FK is added after startup_data_room_folders table is created below)
alter table if exists public.startup_data_room_documents
  add column if not exists is_confidential    boolean not null default true,
  add column if not exists watermark_enabled  boolean not null default true,
  add column if not exists download_enabled   boolean not null default false;

-- investor_profiles: new columns
alter table if exists public.investor_profiles
  add column if not exists profile_type          text,
  add column if not exists linkedin_url          text,
  add column if not exists geographic_regions    text[]  not null default '{}',
  add column if not exists investment_approach   text,
  add column if not exists value_add_summary     text,
  add column if not exists deal_breakers         text[]  not null default '{}',
  add column if not exists profile_visibility    text    not null default 'public',
  add column if not exists is_actively_investing boolean not null default true;

-- advisor_profiles: new columns
alter table if exists public.advisor_profiles
  add column if not exists headline           text,
  add column if not exists industry_tags      text[]  not null default '{}',
  add column if not exists business_type      text,
  add column if not exists current_capacity   text,
  add column if not exists hourly_rate_usd    integer,
  add column if not exists is_open_to_equity  boolean not null default false,
  add column if not exists geographic_pref    text[]  not null default '{}',
  add column if not exists stage_pref         text[]  not null default '{}',
  add column if not exists profile_visibility text    not null default 'public';

-- startup_profiles: new columns
alter table if exists public.startup_profiles
  add column if not exists mrr_usd                  integer,
  add column if not exists arr_usd                  integer,
  add column if not exists currently_fundraising    boolean not null default false,
  add column if not exists target_raise_usd         bigint,
  add column if not exists round_type               text,
  add column if not exists pre_money_valuation_usd  bigint,
  add column if not exists elevator_pitch           text,
  add column if not exists problem_statement        text,
  add column if not exists unique_advantage         text,
  add column if not exists primary_industry         text,
  add column if not exists product_status           text;

-- ---------------------------------------------------------------------------
-- §4 — ONBOARDING
-- ---------------------------------------------------------------------------

create table if not exists public.onboarding_progress (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references public.organizations(id) on delete cascade,
  step_key      text        not null,
  step_number   integer     not null,
  status        public.onboarding_step_status not null default 'not_started',
  skipped_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now()),
  constraint onboarding_progress_org_step_key_unique unique (org_id, step_key)
);

create index if not exists onboarding_progress_org_step_idx
  on public.onboarding_progress(org_id, step_number);

-- Investor onboarding answers
create table if not exists public.investor_onboarding_answers (
  org_id                         uuid primary key references public.organizations(id) on delete cascade,
  profile_type                   text,
  entity_name                    text,
  primary_contact_name           text,
  title_role                     text,
  linkedin_url                   text,
  crunchbase_url                 text,
  angellist_url                  text,
  twitter_url                    text,
  investing_years_band           text,
  total_investments_made_band    text,
  notable_exits                  text,
  check_size_band                text,
  check_size_min_usd             bigint,
  check_size_max_usd             bigint,
  total_investable_capital_band  text,
  new_investments_12mo_band      text,
  investment_structures          text[]  not null default '{}',
  stage_preferences              jsonb   not null default '[]',
  startup_maturity_preference    text[]  not null default '{}',
  industry_preferences           jsonb   not null default '[]',
  industry_expertise_summary     text,
  geographic_regions             text[]  not null default '{}',
  specific_cities                text,
  remote_team_openness           text,
  business_model_preferences     text[]  not null default '{}',
  revenue_requirement_band       text,
  investment_approach            text,
  value_add_offerings            text[]  not null default '{}',
  specific_expertise             text,
  notable_doors                  text,
  founder_preferences            jsonb   not null default '[]',
  team_composition_preference    text,
  diversity_priority             text,
  round_participation            text,
  due_diligence_timeframe        text,
  board_seat_expectation         text,
  follow_on_capacity             text,
  discovery_preference           text,
  deal_flow_volume_preference    text,
  pitch_format_preferences       text[]  not null default '{}',
  must_haves                     text[]  not null default '{}',
  deal_breakers                  text[]  not null default '{}',
  consultant_engagement          text,
  consultant_services_needed     text[]  not null default '{}',
  consultant_budget_band         text,
  activity_level                 text,
  response_time_commitment       text,
  quarterly_investment_target    text,
  profile_visibility             text,
  investment_thesis_bio          text,
  match_algorithm_weights        jsonb   not null default '[]',
  notification_threshold         text,
  notification_frequency         text,
  created_at                     timestamptz not null default timezone('utc', now()),
  updated_at                     timestamptz not null default timezone('utc', now())
);

-- Startup onboarding answers
create table if not exists public.startup_onboarding_answers (
  org_id                          uuid primary key references public.organizations(id) on delete cascade,
  legal_name                      text,
  trading_name                    text,
  company_email                   text,
  founded_date                    date,
  country_of_incorporation        text,
  primary_office_location         text,
  linkedin_company_url            text,
  crunchbase_url                  text,
  angellist_url                   text,
  twitter_url                     text,
  product_demo_link               text,
  app_store_link                  text,
  play_store_link                 text,
  company_stage_band              text,
  product_status                  text,
  time_in_business_band           text,
  problem_statement               text,
  target_customer_description     text,
  current_alternatives            text,
  solution_statement              text,
  unique_advantage                text,
  elevator_pitch                  text,
  primary_industry                text,
  sub_sector                      text,
  tam_band                        text,
  sam_band                        text,
  revenue_model                   text,
  pricing_model_description       text,
  avg_monthly_price_usd           integer,
  avg_annual_price_usd            integer,
  target_customer_type            text,
  sales_motion                    text,
  ltv_usd                         integer,
  cac_usd                         integer,
  current_revenue_status          text,
  mrr_usd                         integer,
  arr_usd                         integer,
  revenue_growth_rate_mom_pct     integer,
  runway_months                   integer,
  monthly_burn_usd                integer,
  gross_margin_pct                integer,
  cash_in_bank_usd                integer,
  profitability_status            text,
  total_paying_customers          integer,
  total_users                     integer,
  mau                             integer,
  waitlist_count                  integer,
  churn_rate_pct                  integer,
  nrr_pct                         integer,
  avg_customer_lifetime_months    integer,
  key_traction_highlights         text,
  co_founders_count               integer,
  founders_data                   jsonb   not null default '[]',
  team_strengths                  text,
  diversity_indicators            text[]  not null default '{}',
  total_team_size                 integer,
  team_breakdown                  jsonb   not null default '{}',
  key_hires_in_place              text[]  not null default '{}',
  advisors_data                   jsonb   not null default '[]',
  advisory_compensation           text,
  total_capital_raised_usd        bigint,
  funding_rounds                  jsonb   not null default '[]',
  bootstrapped_status             text,
  notable_investors               text,
  currently_fundraising           boolean not null default false,
  fundraising_timeline            text,
  round_type                      text,
  target_raise_usd                bigint,
  minimum_raise_usd               bigint,
  committed_so_far_usd            bigint,
  round_structure                 text,
  use_of_funds                    text,
  pre_money_valuation_usd         bigint,
  post_money_valuation_usd        bigint,
  valuation_cap_usd               bigint,
  min_check_size_usd              integer,
  max_check_size_usd              integer,
  pro_rata_rights                 boolean,
  board_seat_allocation           text,
  target_close_date               date,
  data_room_status                text,
  ideal_investor_types            text[]  not null default '{}',
  investor_involvement_pref       text,
  value_add_priorities            jsonb   not null default '[]',
  specific_expertise_needed       text,
  geography_pref_for_investors    text,
  investor_deal_breakers          text[]  not null default '{}',
  currently_seeking_consultants   boolean not null default false,
  consultant_needs                jsonb   not null default '[]',
  engagement_model_pref           text,
  consulting_budget_band          text,
  consulting_timeline             text,
  discovery_preference            text,
  profile_visibility              text,
  match_algorithm_weights         jsonb   not null default '[]',
  notification_threshold          text,
  smart_notification_triggers     text[]  not null default '{}',
  executive_summary_url           text,
  product_demo_video_url          text,
  video_pitch_url                 text,
  one_pager_url                   text,
  ip_types                        text[]  not null default '{}',
  tech_stack_summary              text,
  product_roadmap_highlights      text,
  created_at                      timestamptz not null default timezone('utc', now()),
  updated_at                      timestamptz not null default timezone('utc', now())
);

-- Advisor/consultant onboarding answers
create table if not exists public.advisor_onboarding_answers (
  org_id                          uuid primary key references public.organizations(id) on delete cascade,
  professional_title              text,
  business_type                   text,
  years_in_consulting_band        text,
  previous_experience_types       text[]  not null default '{}',
  primary_expertise_areas         jsonb   not null default '[]',
  specific_skills                 text,
  industry_expertise              jsonb   not null default '[]',
  industry_agnostic               boolean not null default false,
  service_delivery_models         jsonb   not null default '[]',
  engagement_length_pref          text,
  typical_deliverables            text,
  career_highlights               text[]  not null default '{}',
  previous_roles                  jsonb   not null default '[]',
  education                       jsonb   not null default '[]',
  certifications                  text[]  not null default '{}',
  total_clients_served            integer,
  client_types                    text[]  not null default '{}',
  notable_clients                 jsonb   not null default '[]',
  revenue_growth_driven_usd       bigint,
  funding_raised_for_clients      bigint,
  cost_savings_usd                bigint,
  client_retention_pct            integer,
  avg_engagement_months           integer,
  published_work                  jsonb   not null default '[]',
  speaking_engagements            jsonb   not null default '{}',
  media_mentions                  text[]  not null default '{}',
  linkedin_followers              integer,
  awards                          text,
  stage_preferences               jsonb   not null default '[]',
  traction_requirement            text,
  funding_status_pref             text,
  team_size_pref                  text,
  geographic_pref                 text[]  not null default '{}',
  work_location_pref              text,
  project_scope_pref              text,
  budget_min_usd                  integer,
  budget_sweet_spot_min           integer,
  budget_sweet_spot_max           integer,
  payment_structure_pref          text[]  not null default '{}',
  equity_consideration            text,
  project_urgency                 text,
  current_capacity                text,
  deal_breakers                   text[]  not null default '{}',
  investor_collaboration          text,
  investor_services               text[]  not null default '{}',
  investor_engagement_model       text,
  notable_investor_relations      text,
  discovery_settings              jsonb   not null default '{}',
  inbound_inquiry_pref            text,
  response_time_commitment        text,
  match_algorithm_weights         jsonb   not null default '[]',
  notification_threshold          text,
  notification_frequency          text,
  headline                        text,
  professional_bio                text,
  consulting_philosophy           text,
  differentiators                 text,
  case_studies                    jsonb   not null default '[]',
  testimonials                    jsonb   not null default '[]',
  professional_references         jsonb   not null default '[]',
  legal_structure                 text,
  tax_id                          text,
  standard_agreement              text,
  hours_per_week_available        integer,
  preferred_working_hours         text,
  rate_card                       jsonb   not null default '[]',
  payment_terms                   text,
  cancellation_policy             text,
  activity_level                  text,
  content_contributions           text[]  not null default '{}',
  lead_generation_goal            text,
  target_quarterly_revenue        text,
  created_at                      timestamptz not null default timezone('utc', now()),
  updated_at                      timestamptz not null default timezone('utc', now())
);

-- Organization profile scores
create table if not exists public.org_profile_scores (
  org_id              uuid       primary key references public.organizations(id) on delete cascade,
  overall_score       smallint   not null default 0,
  onboarding_score    smallint   not null default 0,
  profile_score       smallint   not null default 0,
  verification_score  smallint   not null default 0,
  activity_score      smallint   not null default 0,
  missing_fields      text[]     not null default '{}',
  score_details       jsonb      not null default '{}',
  calculated_at       timestamptz not null default timezone('utc', now())
);

-- ---------------------------------------------------------------------------
-- §6 — DISCOVERY & AI MATCHING
-- ---------------------------------------------------------------------------

create table if not exists public.discovery_profile_views (
  id              uuid        primary key default gen_random_uuid(),
  viewer_org_id   uuid        not null references public.organizations(id) on delete cascade,
  target_org_id   uuid        not null references public.organizations(id) on delete cascade,
  view_kind       public.profile_view_kind not null default 'discovery',
  view_count      integer     not null default 1,
  last_viewed_at  timestamptz not null default timezone('utc', now()),
  total_seconds   integer     not null default 0,
  created_at      timestamptz not null default timezone('utc', now()),
  constraint discovery_profile_views_unique unique (viewer_org_id, target_org_id, view_kind)
);

create index if not exists discovery_views_target_idx
  on public.discovery_profile_views(target_org_id, last_viewed_at desc);

create index if not exists discovery_views_viewer_idx
  on public.discovery_profile_views(viewer_org_id, last_viewed_at desc);

create table if not exists public.ai_match_scores (
  id               uuid        primary key default gen_random_uuid(),
  from_org_id      uuid        not null references public.organizations(id) on delete cascade,
  to_org_id        uuid        not null references public.organizations(id) on delete cascade,
  overall_score    smallint    not null,
  score_breakdown  jsonb       not null default '{}',
  match_reasons    text[]      not null default '{}',
  disqualified     boolean     not null default false,
  disqualify_reason text,
  calculated_at    timestamptz not null default timezone('utc', now()),
  constraint ai_match_scores_unique unique (from_org_id, to_org_id)
);

create index if not exists ai_match_scores_from_score_idx
  on public.ai_match_scores(from_org_id, overall_score desc);

create index if not exists ai_match_scores_to_score_idx
  on public.ai_match_scores(to_org_id, overall_score desc);

create table if not exists public.ai_match_feedback (
  id              uuid        primary key default gen_random_uuid(),
  from_org_id     uuid        not null references public.organizations(id) on delete cascade,
  target_org_id   uuid        not null,
  feedback_type   public.match_feedback_type not null,
  decline_reason  text,
  created_at      timestamptz not null default timezone('utc', now()),
  constraint ai_match_feedback_unique unique (from_org_id, target_org_id)
);

create index if not exists ai_match_feedback_from_idx
  on public.ai_match_feedback(from_org_id, created_at desc);

create table if not exists public.warm_intro_requests (
  id                  uuid        primary key default gen_random_uuid(),
  sender_org_id       uuid        not null references public.organizations(id) on delete cascade,
  receiver_org_id     uuid        not null references public.organizations(id) on delete cascade,
  via_advisor_org_id  uuid        references public.organizations(id) on update no action,
  message             text,
  status              text        not null default 'pending',
  response_note       text,
  expires_at          timestamptz,
  created_at          timestamptz not null default timezone('utc', now()),
  responded_at        timestamptz
);

create index if not exists warm_intro_sender_status_idx
  on public.warm_intro_requests(sender_org_id, status);

create index if not exists warm_intro_receiver_status_idx
  on public.warm_intro_requests(receiver_org_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- §8 — DEAL ROOM (extended)
-- ---------------------------------------------------------------------------

create table if not exists public.deal_room_participants (
  id            uuid        primary key default gen_random_uuid(),
  deal_room_id  uuid        not null references public.deal_rooms(id) on delete cascade,
  org_id        uuid        not null references public.organizations(id) on delete cascade,
  role          public.deal_room_participant_role not null,
  invited_at    timestamptz not null default timezone('utc', now()),
  accepted_at   timestamptz,
  left_at       timestamptz,
  constraint deal_room_participants_unique unique (deal_room_id, org_id)
);

create index if not exists deal_room_participants_room_role_idx
  on public.deal_room_participants(deal_room_id, role);

create table if not exists public.deal_room_messages (
  id               uuid        primary key default gen_random_uuid(),
  deal_room_id     uuid        not null references public.deal_rooms(id) on delete cascade,
  sender_user_id   uuid        not null references public.users(id) on delete cascade,
  body             text        not null,
  attachment_url   text,
  attachment_name  text,
  is_ai_summary    boolean     not null default false,
  created_at       timestamptz not null default timezone('utc', now())
);

create index if not exists deal_room_messages_room_created_idx
  on public.deal_room_messages(deal_room_id, created_at asc);

create table if not exists public.deal_room_stage_history (
  id            uuid        primary key default gen_random_uuid(),
  deal_room_id  uuid        not null references public.deal_rooms(id) on delete cascade,
  from_stage    public.deal_room_stage,
  to_stage      public.deal_room_stage not null,
  changed_by    uuid,
  note          text,
  created_at    timestamptz not null default timezone('utc', now())
);

create index if not exists deal_room_stage_history_idx
  on public.deal_room_stage_history(deal_room_id, created_at desc);

create table if not exists public.deal_room_commitments (
  id               uuid        primary key default gen_random_uuid(),
  deal_room_id     uuid        not null references public.deal_rooms(id) on delete cascade,
  investor_org_id  uuid        not null,
  amount_usd       bigint      not null,
  conditions       text,
  notes            text,
  status           text        not null default 'soft',
  committed_at     timestamptz not null default timezone('utc', now()),
  updated_at       timestamptz not null default timezone('utc', now())
);

create index if not exists deal_room_commitments_room_status_idx
  on public.deal_room_commitments(deal_room_id, status);

create table if not exists public.deal_room_milestones (
  id            uuid        primary key default gen_random_uuid(),
  deal_room_id  uuid        not null references public.deal_rooms(id) on delete cascade,
  title         text        not null,
  description   text,
  due_date      date,
  completed_at  timestamptz,
  sort_order    integer     not null default 0,
  created_at    timestamptz not null default timezone('utc', now())
);

create index if not exists deal_room_milestones_room_order_idx
  on public.deal_room_milestones(deal_room_id, sort_order);

create table if not exists public.deal_room_agreements (
  id            uuid        primary key default gen_random_uuid(),
  deal_room_id  uuid        not null references public.deal_rooms(id) on delete cascade,
  title         text        not null,
  template_key  text,
  content_text  text,
  file_url      text,
  status        public.deal_room_agreement_status not null default 'draft',
  signed_by     jsonb       not null default '[]',
  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now())
);

create index if not exists deal_room_agreements_room_status_idx
  on public.deal_room_agreements(deal_room_id, status);

create table if not exists public.deal_room_data_room_links (
  id                 uuid        primary key default gen_random_uuid(),
  deal_room_id       uuid        not null references public.deal_rooms(id) on delete cascade,
  startup_org_id     uuid        not null,
  terms_accepted_at  timestamptz,
  created_at         timestamptz not null default timezone('utc', now()),
  constraint deal_room_data_room_links_unique unique (deal_room_id, startup_org_id)
);

-- ---------------------------------------------------------------------------
-- §9 — DATA ROOM (access control + analytics)
-- ---------------------------------------------------------------------------

create table if not exists public.startup_data_room_folders (
  id             uuid        primary key default gen_random_uuid(),
  startup_org_id uuid        not null references public.organizations(id) on delete cascade,
  name           text        not null,
  parent_id      uuid        references public.startup_data_room_folders(id) on update no action,
  sort_order     integer     not null default 0,
  created_at     timestamptz not null default timezone('utc', now()),
  updated_at     timestamptz not null default timezone('utc', now())
);

create index if not exists startup_dr_folders_org_parent_idx
  on public.startup_data_room_folders(startup_org_id, parent_id);

-- Now add the folder_id FK to startup_data_room_documents (table now exists)
alter table if exists public.startup_data_room_documents
  add column if not exists folder_id uuid references public.startup_data_room_folders(id) on update no action;

create table if not exists public.data_room_access_requests (
  id                uuid        primary key default gen_random_uuid(),
  startup_org_id    uuid        not null references public.organizations(id) on delete cascade,
  requester_org_id  uuid        not null references public.organizations(id) on delete cascade,
  message           text,
  status            public.data_room_access_status not null default 'pending',
  reviewed_at       timestamptz,
  review_note       text,
  created_at        timestamptz not null default timezone('utc', now()),
  constraint data_room_access_requests_unique unique (startup_org_id, requester_org_id)
);

create index if not exists data_room_access_requests_startup_status_idx
  on public.data_room_access_requests(startup_org_id, status);

create table if not exists public.data_room_access_grants (
  id                uuid        primary key default gen_random_uuid(),
  startup_org_id    uuid        not null references public.organizations(id) on delete cascade,
  grantee_org_id    uuid        not null,
  permission_level  public.data_room_permission_level not null default 'view',
  terms_accepted_at timestamptz,
  granted_at        timestamptz not null default timezone('utc', now()),
  revoked_at        timestamptz,
  expires_at        timestamptz,
  constraint data_room_access_grants_unique unique (startup_org_id, grantee_org_id)
);

create index if not exists data_room_access_grants_grantee_idx
  on public.data_room_access_grants(grantee_org_id, revoked_at);

create table if not exists public.data_room_document_views (
  id              uuid        primary key default gen_random_uuid(),
  document_id     uuid        not null references public.startup_data_room_documents(id) on delete cascade,
  viewer_org_id   uuid        not null references public.organizations(id) on delete cascade,
  view_count      integer     not null default 1,
  total_seconds   integer     not null default 0,
  last_viewed_at  timestamptz not null default timezone('utc', now()),
  created_at      timestamptz not null default timezone('utc', now()),
  constraint data_room_document_views_unique unique (document_id, viewer_org_id)
);

create index if not exists data_room_document_views_doc_idx
  on public.data_room_document_views(document_id, last_viewed_at desc);

-- startup_data_room_audit_logs (already exists but check for metadata column)
alter table if exists public.startup_data_room_audit_logs
  add column if not exists metadata jsonb not null default '{}';

-- ---------------------------------------------------------------------------
-- §10 — SYNDICATES
-- ---------------------------------------------------------------------------

create table if not exists public.syndicates (
  id               uuid        primary key default gen_random_uuid(),
  lead_org_id      uuid        not null references public.organizations(id) on delete cascade,
  startup_org_id   uuid,
  name             text        not null,
  description      text,
  target_amount    bigint,
  minimum_check    bigint,
  status           public.syndicate_status not null default 'forming',
  visibility       text        not null default 'private',
  closed_at        timestamptz,
  created_at       timestamptz not null default timezone('utc', now()),
  updated_at       timestamptz not null default timezone('utc', now())
);

create index if not exists syndicates_lead_status_idx
  on public.syndicates(lead_org_id, status);

create index if not exists syndicates_startup_idx
  on public.syndicates(startup_org_id);

create table if not exists public.syndicate_members (
  id            uuid        primary key default gen_random_uuid(),
  syndicate_id  uuid        not null references public.syndicates(id) on delete cascade,
  org_id        uuid        not null references public.organizations(id) on delete cascade,
  committed_usd bigint,
  status        public.syndicate_member_status not null default 'invited',
  joined_at     timestamptz,
  created_at    timestamptz not null default timezone('utc', now()),
  constraint syndicate_members_unique unique (syndicate_id, org_id)
);

create index if not exists syndicate_members_org_status_idx
  on public.syndicate_members(org_id, status);

create table if not exists public.syndicate_invites (
  id              uuid        primary key default gen_random_uuid(),
  syndicate_id    uuid        not null references public.syndicates(id) on delete cascade,
  invitee_org_id  uuid        not null,
  message         text,
  status          text        not null default 'pending',
  expires_at      timestamptz,
  created_at      timestamptz not null default timezone('utc', now()),
  responded_at    timestamptz,
  constraint syndicate_invites_unique unique (syndicate_id, invitee_org_id)
);

create index if not exists syndicate_invites_invitee_idx
  on public.syndicate_invites(invitee_org_id, status);

-- ---------------------------------------------------------------------------
-- §11 — PAYMENTS & FEES
-- ---------------------------------------------------------------------------

create table if not exists public.payment_transactions (
  id                    uuid        primary key default gen_random_uuid(),
  org_id                uuid        not null references public.organizations(id) on delete cascade,
  transaction_type      text        not null,
  amount_cents          bigint      not null,
  currency              text        not null default 'USD',
  status                public.payment_transaction_status not null default 'pending',
  provider              text        not null default 'stripe',
  provider_payment_id   text,
  provider_invoice_id   text,
  description           text,
  metadata              jsonb       not null default '{}',
  failed_reason         text,
  created_at            timestamptz not null default timezone('utc', now()),
  updated_at            timestamptz not null default timezone('utc', now())
);

create index if not exists payment_transactions_org_created_idx
  on public.payment_transactions(org_id, created_at desc);

create index if not exists payment_transactions_provider_id_idx
  on public.payment_transactions(provider, provider_payment_id);

create table if not exists public.success_fee_records (
  id                  uuid        primary key default gen_random_uuid(),
  payer_org_id        uuid        not null references public.organizations(id) on delete cascade,
  deal_room_id        uuid,
  intro_date          date        not null,
  fee_trigger         text        not null,
  gross_amount_usd    bigint      not null,
  fee_rate_pct_x100   integer     not null,
  fee_amount_usd      bigint      not null,
  status              text        not null default 'pending',
  due_date            date,
  paid_at             timestamptz,
  notes               text,
  metadata            jsonb       not null default '{}',
  created_at          timestamptz not null default timezone('utc', now()),
  updated_at          timestamptz not null default timezone('utc', now())
);

create index if not exists success_fee_records_payer_status_idx
  on public.success_fee_records(payer_org_id, status);

-- ---------------------------------------------------------------------------
-- §13 — SECURITY
-- ---------------------------------------------------------------------------

create table if not exists public.user_two_factor_settings (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references public.users(id) on delete cascade,
  method        public.user_two_factor_method not null,
  is_enabled    boolean     not null default false,
  secret_hash   text,
  phone_number  text,
  backup_codes  text[]      not null default '{}',
  verified_at   timestamptz,
  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now()),
  constraint user_two_factor_settings_unique unique (user_id, method)
);

create table if not exists public.user_security_events (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.users(id) on delete cascade,
  event_type  public.security_event_type not null,
  ip_address  text,
  user_agent  text,
  country     text,
  city        text,
  device_id   uuid,
  metadata    jsonb       not null default '{}',
  created_at  timestamptz not null default timezone('utc', now())
);

create index if not exists user_security_events_user_created_idx
  on public.user_security_events(user_id, created_at desc);

create table if not exists public.user_devices (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references public.users(id) on delete cascade,
  device_name   text,
  device_type   text,
  user_agent    text,
  ip_address    text,
  country       text,
  is_trusted    boolean     not null default false,
  last_seen_at  timestamptz not null default timezone('utc', now()),
  created_at    timestamptz not null default timezone('utc', now()),
  revoked_at    timestamptz
);

create index if not exists user_devices_user_idx
  on public.user_devices(user_id, last_seen_at desc);

-- ---------------------------------------------------------------------------
-- §14 — SUPPORT
-- ---------------------------------------------------------------------------

create table if not exists public.support_tickets (
  id               uuid        primary key default gen_random_uuid(),
  org_id           uuid        references public.organizations(id) on update no action,
  user_id          uuid        not null references public.users(id) on delete cascade,
  subject          text        not null,
  category         text,
  status           public.support_ticket_status not null default 'open',
  priority         public.support_ticket_priority not null default 'medium',
  assigned_to      text,
  ai_resolved      boolean     not null default false,
  resolution_note  text,
  created_at       timestamptz not null default timezone('utc', now()),
  updated_at       timestamptz not null default timezone('utc', now()),
  resolved_at      timestamptz
);

create index if not exists support_tickets_status_priority_idx
  on public.support_tickets(status, priority, created_at desc);

create index if not exists support_tickets_user_status_idx
  on public.support_tickets(user_id, status);

create table if not exists public.support_messages (
  id          uuid        primary key default gen_random_uuid(),
  ticket_id   uuid        not null references public.support_tickets(id) on delete cascade,
  sender_id   uuid        not null references public.users(id) on delete cascade,
  is_staff    boolean     not null default false,
  is_ai       boolean     not null default false,
  body        text        not null,
  created_at  timestamptz not null default timezone('utc', now())
);

create index if not exists support_messages_ticket_created_idx
  on public.support_messages(ticket_id, created_at asc);

create table if not exists public.ai_chat_sessions (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.users(id) on delete cascade,
  context      text,
  messages     jsonb       not null default '[]',
  escalated    boolean     not null default false,
  escalated_at timestamptz,
  ticket_id    uuid,
  created_at   timestamptz not null default timezone('utc', now()),
  updated_at   timestamptz not null default timezone('utc', now())
);

create index if not exists ai_chat_sessions_user_created_idx
  on public.ai_chat_sessions(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- §15 — ADMIN
-- ---------------------------------------------------------------------------

create table if not exists public.admin_users (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.users(id) on delete cascade,
  role        text        not null default 'support',
  is_active   boolean     not null default true,
  granted_at  timestamptz not null default timezone('utc', now()),
  revoked_at  timestamptz,
  constraint admin_users_user_unique unique (user_id)
);

create table if not exists public.admin_audit_logs (
  id           uuid        primary key default gen_random_uuid(),
  admin_id     uuid        not null,
  action       text        not null,
  target_type  text,
  target_id    text,
  payload      jsonb       not null default '{}',
  ip_address   text,
  created_at   timestamptz not null default timezone('utc', now())
);

create index if not exists admin_audit_logs_admin_idx
  on public.admin_audit_logs(admin_id, created_at desc);

create index if not exists admin_audit_logs_target_idx
  on public.admin_audit_logs(target_type, target_id, created_at desc);

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS: add action_id column for quick-action support
-- ---------------------------------------------------------------------------

alter table if exists public.notifications
  add column if not exists action_id text;

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
