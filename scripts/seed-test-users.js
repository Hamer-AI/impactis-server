/* eslint-disable no-console */
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const crypto = require('crypto');
const { Pool } = require('pg');
const { betterAuth } = require('better-auth');

const PASSWORD = 'Impactis123!';
const SEED_NS = 'impactis-test-users-v1';

function seedId(name) {
  const hex = crypto.createHash('sha256').update(`${SEED_NS}:${name}`).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

function logoUrl(name) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name.replace(/\s+/g, '+'),
  )}&size=400&background=0D9488&color=fff&bold=true`;
}

const startupAccounts = [
  {
    email: 'startup.alpha@impactis.local',
    name: 'Startup Alpha',
    role: 'startup',
    orgName: 'Atlas AI Labs',
    location: 'Addis Ababa, ET',
    industryTags: ['ai', 'saas', 'enterprise'],
    bio: 'Founder building workflow AI tools for enterprise operations.',
    orgProfile: {
      website_url: 'https://atlas-ai.example.com',
      team_overview: 'Applied AI engineers and enterprise workflow operators.',
      company_stage: 'Pre-seed',
      founding_year: 2025,
      team_size: 6,
      target_market: 'Mid-market operations teams',
      business_model: 'SaaS subscription',
      traction_summary: '3 design partners and 2 paid pilots.',
      elevator_pitch: 'AI copilots for high-volume internal workflows.',
      problem_statement: 'Teams still lose time to repetitive internal process work.',
      unique_advantage: 'Fast deployment with domain-tuned workflow models.',
      primary_industry: 'AI/ML',
    },
    onboarding: {
      legal_name: 'Atlas AI Labs',
      trading_name: 'Atlas AI Labs',
      country_of_incorporation: 'Ethiopia',
      company_stage_band: 'Pre-seed',
      primary_industry: 'AI/ML',
    },
    post: {
      title: 'AI copilots for operations teams',
      summary: 'Reducing manual back-office work with embedded AI agents.',
      stage: 'Pre-seed',
      location: 'Addis Ababa, ET',
      industry_tags: ['ai', 'saas'],
    },
  },
  {
    email: 'startup.beta@impactis.local',
    name: 'Startup Beta',
    role: 'startup',
    orgName: 'GreenGrid Systems',
    location: 'Nairobi, KE',
    industryTags: ['climate', 'energy', 'infra'],
    bio: 'Founder building energy optimization systems for distributed grids.',
    orgProfile: {
      website_url: 'https://greengrid.example.com',
      team_overview: 'Energy systems operators and ML engineers.',
      company_stage: 'Seed',
      founding_year: 2024,
      team_size: 9,
      target_market: 'Microgrid operators and energy-intensive SMEs',
      business_model: 'Hardware-enabled SaaS',
      traction_summary: '5 live pilots and growing commercial pipeline.',
      elevator_pitch: 'AI-assisted optimization for distributed energy assets.',
      problem_statement: 'Distributed energy systems are hard to monitor and optimize.',
      unique_advantage: 'Hybrid control stack with real-time telemetry.',
      primary_industry: 'Climate',
    },
    onboarding: {
      legal_name: 'GreenGrid Systems',
      trading_name: 'GreenGrid Systems',
      country_of_incorporation: 'Kenya',
      company_stage_band: 'Seed',
      primary_industry: 'Climate',
    },
    post: {
      title: 'Energy optimization for distributed grids',
      summary: 'Helping operators reduce waste and improve resilience.',
      stage: 'Seed',
      location: 'Nairobi, KE',
      industry_tags: ['climate', 'energy'],
    },
  },
  {
    email: 'startup.gamma@impactis.local',
    name: 'Startup Gamma',
    role: 'startup',
    orgName: 'CareFlow Health',
    location: 'Austin, TX',
    industryTags: ['health', 'ops', 'care'],
    bio: 'Founder building care coordination systems for clinics and providers.',
    orgProfile: {
      website_url: 'https://careflow.example.com',
      team_overview: 'Healthcare operators, product builders, and data engineers.',
      company_stage: 'Seed',
      founding_year: 2023,
      team_size: 11,
      target_market: 'Independent clinics and care networks',
      business_model: 'SaaS + onboarding services',
      traction_summary: '12 clinics onboarded and positive retention metrics.',
      elevator_pitch: 'Care coordination infrastructure for modern clinics.',
      problem_statement: 'Care handoffs and patient tracking remain fragmented.',
      unique_advantage: 'Ops-first workflows built with clinic teams.',
      primary_industry: 'HealthTech',
    },
    onboarding: {
      legal_name: 'CareFlow Health',
      trading_name: 'CareFlow Health',
      country_of_incorporation: 'United States',
      company_stage_band: 'Seed',
      primary_industry: 'HealthTech',
    },
    post: {
      title: 'Clinic workflow infrastructure',
      summary: 'Improving care coordination, visibility, and patient throughput.',
      stage: 'Seed',
      location: 'Austin, TX',
      industry_tags: ['health', 'saas'],
    },
  },
];

const investorAccounts = [
  {
    email: 'investor.alpha@impactis.local',
    name: 'Investor Alpha',
    role: 'investor',
    orgName: 'Northstar Ventures',
    location: 'London, UK',
    industryTags: ['saas', 'fintech', 'ai'],
    bio: 'Active early-stage investor focused on B2B software and fintech.',
    orgProfile: {
      website_url: 'https://northstar.example.com',
      linkedin_url: 'https://linkedin.com/in/investor-alpha',
      thesis: 'Backing founders building durable B2B infrastructure in emerging and global markets.',
      stage_focus: ['pre-seed', 'seed'],
      sector_tags: ['saas', 'fintech', 'ai'],
      check_size_min_usd: 100000,
      check_size_max_usd: 750000,
      investment_approach: 'hands_on',
      value_add_summary: 'Fundraising support and enterprise introductions.',
    },
    onboarding: {
      entity_name: 'Northstar Ventures',
      primary_contact_name: 'Investor Alpha',
      linkedin_url: 'https://linkedin.com/in/investor-alpha',
      website_url: 'https://northstar.example.com',
      investing_years_band: '3-5 yrs',
      total_investments_made_band: '6-15',
    },
  },
  {
    email: 'investor.beta@impactis.local',
    name: 'Investor Beta',
    role: 'investor',
    orgName: 'Lagoon Capital',
    location: 'Dubai, AE',
    industryTags: ['climate', 'infra', 'mobility'],
    bio: 'Growth-minded investor focused on climate and infrastructure platforms.',
    orgProfile: {
      website_url: 'https://lagoon.example.com',
      linkedin_url: 'https://linkedin.com/in/investor-beta',
      thesis: 'Climate infrastructure and resilient supply systems across frontier and growth markets.',
      stage_focus: ['seed', 'series-a'],
      sector_tags: ['climate', 'infra', 'mobility'],
      check_size_min_usd: 250000,
      check_size_max_usd: 1500000,
      investment_approach: 'strategic',
      value_add_summary: 'Operational scaling and regional expansion.',
    },
    onboarding: {
      entity_name: 'Lagoon Capital',
      primary_contact_name: 'Investor Beta',
      linkedin_url: 'https://linkedin.com/in/investor-beta',
      website_url: 'https://lagoon.example.com',
      investing_years_band: '5-10 yrs',
      total_investments_made_band: '16-30',
    },
  },
  {
    email: 'investor.gamma@impactis.local',
    name: 'Investor Gamma',
    role: 'investor',
    orgName: 'Savannah Growth Partners',
    location: 'Lagos, NG',
    industryTags: ['health', 'fintech', 'enterprise'],
    bio: 'Seed investor focused on scalable software for African growth markets.',
    orgProfile: {
      website_url: 'https://savannah.example.com',
      linkedin_url: 'https://linkedin.com/in/investor-gamma',
      thesis: 'Strong software businesses with regional expansion potential and disciplined execution.',
      stage_focus: ['pre-seed', 'seed'],
      sector_tags: ['health', 'fintech', 'enterprise'],
      check_size_min_usd: 50000,
      check_size_max_usd: 500000,
      investment_approach: 'lead',
      value_add_summary: 'Hiring, GTM, and founder coaching.',
    },
    onboarding: {
      entity_name: 'Savannah Growth Partners',
      primary_contact_name: 'Investor Gamma',
      linkedin_url: 'https://linkedin.com/in/investor-gamma',
      website_url: 'https://savannah.example.com',
      investing_years_band: '1-3 yrs',
      total_investments_made_band: '1-5',
    },
  },
];

const advisorAccounts = [
  {
    email: 'advisor.alpha@impactis.local',
    name: 'Advisor Alpha',
    role: 'advisor',
    orgName: 'Maya Alemu Advisory',
    location: 'Addis Ababa, ET',
    industryTags: ['gtm', 'saas', 'brand'],
    bio: 'Go-to-market advisor helping SaaS teams sharpen positioning and sales motion.',
    orgProfile: {
      website_url: 'https://maya.example.com',
      linkedin_url: 'https://linkedin.com/in/advisor-alpha',
      bio: 'Former growth leader advising B2B SaaS founders on positioning, funnel design, and GTM execution.',
      headline: 'GTM advisor for early-stage SaaS',
      expertise_tags: ['go-to-market', 'positioning', 'sales'],
      years_experience: 12,
      business_type: 'Independent',
    },
    onboarding: {
      professional_title: 'Go-to-market advisor',
      business_type: 'Independent',
      years_in_consulting_band: '10-20 yrs',
      previous_experience_types: ['Former Founder', 'Corporate Executive'],
    },
  },
  {
    email: 'advisor.beta@impactis.local',
    name: 'Advisor Beta',
    role: 'advisor',
    orgName: 'Daniel Okafor Strategy',
    location: 'Lagos, NG',
    industryTags: ['fintech', 'ops', 'regulation'],
    bio: 'Advisor focused on fintech operations, compliance, and scale-up readiness.',
    orgProfile: {
      website_url: 'https://daniel.example.com',
      linkedin_url: 'https://linkedin.com/in/advisor-beta',
      bio: 'Former operator and compliance lead helping fintech founders scale responsibly.',
      headline: 'Fintech strategy and compliance advisor',
      expertise_tags: ['fintech', 'operations', 'compliance'],
      years_experience: 14,
      business_type: 'Independent',
    },
    onboarding: {
      professional_title: 'Fintech strategy advisor',
      business_type: 'Independent',
      years_in_consulting_band: '10-20 yrs',
      previous_experience_types: ['VC/PE', 'Career Consultant'],
    },
  },
  {
    email: 'advisor.gamma@impactis.local',
    name: 'Advisor Gamma',
    role: 'advisor',
    orgName: 'Lena Hart Growth',
    location: 'Berlin, DE',
    industryTags: ['product', 'growth', 'ai'],
    bio: 'Product and growth advisor for AI and SaaS teams moving from pilot to scale.',
    orgProfile: {
      website_url: 'https://lena.example.com',
      linkedin_url: 'https://linkedin.com/in/advisor-gamma',
      bio: 'Advisor helping founders improve product positioning, usage loops, and retention.',
      headline: 'Product growth advisor',
      expertise_tags: ['product', 'growth', 'retention'],
      years_experience: 11,
      business_type: 'Independent',
    },
    onboarding: {
      professional_title: 'Product growth advisor',
      business_type: 'Independent',
      years_in_consulting_band: '10-20 yrs',
      previous_experience_types: ['Former Founder', 'Career Consultant'],
    },
  },
];

const adminAccounts = [
  {
    email: 'admin.alpha@impactis.local',
    name: 'Admin Alpha',
    role: 'advisor',
    adminRole: 'super_admin',
    orgName: 'Admin Alpha Ops',
    location: 'Nairobi, KE',
    industryTags: ['ops', 'platform'],
    bio: 'Platform super admin test account.',
    orgProfile: {
      website_url: 'https://admin-alpha.example.com',
      linkedin_url: 'https://linkedin.com/in/admin-alpha',
      bio: 'Operations and platform administration test account.',
      headline: 'Platform super admin',
      expertise_tags: ['ops', 'support'],
      years_experience: 10,
      business_type: 'Independent',
    },
    onboarding: {
      professional_title: 'Platform super admin',
      business_type: 'Independent',
      years_in_consulting_band: '5-10 yrs',
      previous_experience_types: ['Career Consultant'],
    },
  },
  {
    email: 'admin.beta@impactis.local',
    name: 'Admin Beta',
    role: 'advisor',
    adminRole: 'admin',
    orgName: 'Admin Beta Ops',
    location: 'Kigali, RW',
    industryTags: ['ops', 'support'],
    bio: 'Platform admin test account.',
    orgProfile: {
      website_url: 'https://admin-beta.example.com',
      linkedin_url: 'https://linkedin.com/in/admin-beta',
      bio: 'Platform administration and moderation test account.',
      headline: 'Platform admin',
      expertise_tags: ['ops', 'moderation'],
      years_experience: 8,
      business_type: 'Independent',
    },
    onboarding: {
      professional_title: 'Platform admin',
      business_type: 'Independent',
      years_in_consulting_band: '5-10 yrs',
      previous_experience_types: ['Career Consultant'],
    },
  },
  {
    email: 'admin.gamma@impactis.local',
    name: 'Admin Gamma',
    role: 'advisor',
    adminRole: 'support',
    orgName: 'Admin Gamma Support',
    location: 'Cape Town, ZA',
    industryTags: ['support', 'operations'],
    bio: 'Platform support admin test account.',
    orgProfile: {
      website_url: 'https://admin-gamma.example.com',
      linkedin_url: 'https://linkedin.com/in/admin-gamma',
      bio: 'Support-oriented platform admin for testing tickets and moderation.',
      headline: 'Support admin',
      expertise_tags: ['support', 'operations'],
      years_experience: 7,
      business_type: 'Independent',
    },
    onboarding: {
      professional_title: 'Support admin',
      business_type: 'Independent',
      years_in_consulting_band: '5-10 yrs',
      previous_experience_types: ['Career Consultant'],
    },
  },
];

const allAccounts = [...startupAccounts, ...investorAccounts, ...advisorAccounts, ...adminAccounts];

function buildAuth(pool) {
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL || 'http://127.0.0.1:3000',
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
    },
    emailVerification: {
      sendOnSignUp: false,
      autoSignInAfterVerification: false,
    },
    user: {
      modelName: 'users',
      fields: {
        name: 'name',
        image: 'image',
        emailVerified: 'email_verified',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
      additionalFields: {
        raw_user_meta_data: {
          type: 'string',
          required: false,
        },
      },
    },
    session: { modelName: 'sessions' },
    account: { modelName: 'accounts' },
    database: pool,
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
  });
}

async function ensureUser(auth, pool, account) {
  const result = await auth.api.signUpEmail({
    body: {
      name: account.name,
      email: account.email,
      password: PASSWORD,
    },
  });
  const userId = result?.user?.id;
  if (!userId) {
    throw new Error(`Failed to create auth user for ${account.email}`);
  }

  await pool.query(
    `
    update public.users
    set
      email_verified = true,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || $2::jsonb,
      updated_at = timezone('utc', now())
    where id = $1::uuid
    `,
    [
      userId,
      JSON.stringify({
        role: account.role,
        intended_org_type: account.role,
        seeded: true,
      }),
    ],
  );

  await pool.query(
    `
    insert into public.profiles (
      id, full_name, location, bio, headline, website_url, linkedin_url, avatar_url, created_at, updated_at
    )
    values ($1::uuid, $2, $3, $4, $5, $6, $7, $8, timezone('utc', now()), timezone('utc', now()))
    on conflict (id) do update set
      full_name = excluded.full_name,
      location = excluded.location,
      bio = excluded.bio,
      headline = excluded.headline,
      website_url = excluded.website_url,
      linkedin_url = excluded.linkedin_url,
      avatar_url = excluded.avatar_url,
      updated_at = timezone('utc', now())
    `,
    [
      userId,
      account.name,
      account.location,
      account.bio,
      account.orgProfile.headline || account.orgName,
      account.orgProfile.website_url || null,
      account.orgProfile.linkedin_url || null,
      logoUrl(account.name),
    ],
  );

  return userId;
}

async function ensureOrganization(pool, userId, account) {
  const orgId = seedId(`${account.role}:${account.orgName}`);
  await pool.query(
    `
    delete from public.org_members om
    where om.org_id = $1::uuid
      and not exists (
        select 1 from public.users u where u.id = om.user_id
      )
    `,
    [orgId],
  );
  await pool.query(
    `
    insert into public.organizations (
      id, type, name, location, industry_tags, logo_url, website_url, onboarding_complete, created_at, updated_at
    )
    values ($1::uuid, $2::public.org_type, $3, $4, $5::text[], $6, $7, true, timezone('utc', now()), timezone('utc', now()))
    on conflict (id) do update set
      type = excluded.type,
      name = excluded.name,
      location = excluded.location,
      industry_tags = excluded.industry_tags,
      logo_url = excluded.logo_url,
      website_url = excluded.website_url,
      onboarding_complete = true,
      updated_at = timezone('utc', now())
    `,
    [orgId, account.role, account.orgName, account.location, account.industryTags, logoUrl(account.orgName), account.orgProfile.website_url || null],
  );

  await pool.query(
    `
    insert into public.org_status (org_id, status, created_at, updated_at)
    values ($1::uuid, 'active'::public.org_lifecycle_status, timezone('utc', now()), timezone('utc', now()))
    on conflict (org_id) do update set
      status = 'active'::public.org_lifecycle_status,
      updated_at = timezone('utc', now())
    `,
    [orgId],
  );

  await pool.query(
    `
    insert into public.org_verifications (org_id, status, reviewed_at)
    values ($1::uuid, 'approved'::public.org_verification_status, timezone('utc', now()))
    on conflict (org_id) do update set
      status = 'approved'::public.org_verification_status,
      reviewed_at = timezone('utc', now())
    `,
    [orgId],
  );

  await pool.query(
    `
    insert into public.org_members (org_id, user_id, member_role, status, joined_at, created_at)
    values ($1::uuid, $2::uuid, 'owner'::public.org_member_role, 'active'::public.org_membership_status, timezone('utc', now()), timezone('utc', now()))
    on conflict (org_id, user_id) do update set
      member_role = 'owner'::public.org_member_role,
      status = 'active'::public.org_membership_status,
      joined_at = timezone('utc', now())
    `,
    [orgId, userId],
  );

  if (account.role === 'startup') {
    await pool.query(
      `
      insert into public.startup_profiles (
        startup_org_id, website_url, team_overview, company_stage, founding_year, team_size,
        target_market, business_model, traction_summary, elevator_pitch, problem_statement, unique_advantage, primary_industry,
        updated_by, updated_at, created_at
      )
      values (
        $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::uuid,
        timezone('utc', now()), timezone('utc', now())
      )
      on conflict (startup_org_id) do update set
        website_url = excluded.website_url,
        team_overview = excluded.team_overview,
        company_stage = excluded.company_stage,
        founding_year = excluded.founding_year,
        team_size = excluded.team_size,
        target_market = excluded.target_market,
        business_model = excluded.business_model,
        traction_summary = excluded.traction_summary,
        elevator_pitch = excluded.elevator_pitch,
        problem_statement = excluded.problem_statement,
        unique_advantage = excluded.unique_advantage,
        primary_industry = excluded.primary_industry,
        updated_by = excluded.updated_by,
        updated_at = timezone('utc', now())
      `,
      [
        orgId,
        account.orgProfile.website_url,
        account.orgProfile.team_overview,
        account.orgProfile.company_stage,
        account.orgProfile.founding_year,
        account.orgProfile.team_size,
        account.orgProfile.target_market,
        account.orgProfile.business_model,
        account.orgProfile.traction_summary,
        account.orgProfile.elevator_pitch,
        account.orgProfile.problem_statement,
        account.orgProfile.unique_advantage,
        account.orgProfile.primary_industry,
        userId,
      ],
    );

    await pool.query(
      `
      insert into public.startup_posts (
        startup_org_id, title, summary, stage, location, industry_tags, status, published_at
      )
      values (
        $1::uuid, $2, $3, $4, $5, $6::text[], 'published'::public.startup_post_status, timezone('utc', now())
      )
      on conflict (startup_org_id) do update set
        title = excluded.title,
        summary = excluded.summary,
        stage = excluded.stage,
        location = excluded.location,
        industry_tags = excluded.industry_tags,
        status = excluded.status,
        published_at = excluded.published_at
      `,
      [
        orgId,
        account.post.title,
        account.post.summary,
        account.post.stage,
        account.post.location,
        account.post.industry_tags,
      ],
    );

    await pool.query(
      `
      insert into public.startup_onboarding_answers (
        org_id, legal_name, trading_name, country_of_incorporation, company_stage_band, primary_industry, updated_at
      )
      values ($1::uuid, $2, $3, $4, $5, $6, timezone('utc', now()))
      on conflict (org_id) do update set
        legal_name = excluded.legal_name,
        trading_name = excluded.trading_name,
        country_of_incorporation = excluded.country_of_incorporation,
        company_stage_band = excluded.company_stage_band,
        primary_industry = excluded.primary_industry,
        updated_at = timezone('utc', now())
      `,
      [
        orgId,
        account.onboarding.legal_name,
        account.onboarding.trading_name,
        account.onboarding.country_of_incorporation,
        account.onboarding.company_stage_band,
        account.onboarding.primary_industry,
      ],
    );
  } else if (account.role === 'investor') {
    await pool.query(
      `
      insert into public.investor_profiles (
        investor_org_id, website_url, linkedin_url, thesis, stage_focus, sector_tags,
        check_size_min_usd, check_size_max_usd, investment_approach, value_add_summary, updated_by, updated_at, created_at
      )
      values (
        $1::uuid, $2, $3, $4, $5::text[], $6::text[], $7::bigint, $8::bigint, $9, $10, $11::uuid,
        timezone('utc', now()), timezone('utc', now())
      )
      on conflict (investor_org_id) do update set
        website_url = excluded.website_url,
        linkedin_url = excluded.linkedin_url,
        thesis = excluded.thesis,
        stage_focus = excluded.stage_focus,
        sector_tags = excluded.sector_tags,
        check_size_min_usd = excluded.check_size_min_usd,
        check_size_max_usd = excluded.check_size_max_usd,
        investment_approach = excluded.investment_approach,
        value_add_summary = excluded.value_add_summary,
        updated_by = excluded.updated_by,
        updated_at = timezone('utc', now())
      `,
      [
        orgId,
        account.orgProfile.website_url,
        account.orgProfile.linkedin_url,
        account.orgProfile.thesis,
        account.orgProfile.stage_focus,
        account.orgProfile.sector_tags,
        String(account.orgProfile.check_size_min_usd),
        String(account.orgProfile.check_size_max_usd),
        account.orgProfile.investment_approach,
        account.orgProfile.value_add_summary,
        userId,
      ],
    );

    await pool.query(
      `
      insert into public.investor_onboarding_answers (
        org_id, entity_name, primary_contact_name, linkedin_url,
        investing_years_band, total_investments_made_band, updated_at
      )
      values ($1::uuid, $2, $3, $4, $5, $6, timezone('utc', now()))
      on conflict (org_id) do update set
        entity_name = excluded.entity_name,
        primary_contact_name = excluded.primary_contact_name,
        linkedin_url = excluded.linkedin_url,
        investing_years_band = excluded.investing_years_band,
        total_investments_made_band = excluded.total_investments_made_band,
        updated_at = timezone('utc', now())
      `,
      [
        orgId,
        account.onboarding.entity_name,
        account.onboarding.primary_contact_name,
        account.onboarding.linkedin_url,
        account.onboarding.investing_years_band,
        account.onboarding.total_investments_made_band,
      ],
    );
  } else {
    await pool.query(
      `
      insert into public.advisor_profiles (
        advisor_org_id, website_url, linkedin_url, bio, headline, expertise_tags, years_experience, business_type,
        updated_by, updated_at, created_at
      )
      values (
        $1::uuid, $2, $3, $4, $5, $6::text[], $7, $8, $9::uuid, timezone('utc', now()), timezone('utc', now())
      )
      on conflict (advisor_org_id) do update set
        website_url = excluded.website_url,
        linkedin_url = excluded.linkedin_url,
        bio = excluded.bio,
        headline = excluded.headline,
        expertise_tags = excluded.expertise_tags,
        years_experience = excluded.years_experience,
        business_type = excluded.business_type,
        updated_by = excluded.updated_by,
        updated_at = timezone('utc', now())
      `,
      [
        orgId,
        account.orgProfile.website_url,
        account.orgProfile.linkedin_url,
        account.orgProfile.bio,
        account.orgProfile.headline,
        account.orgProfile.expertise_tags,
        account.orgProfile.years_experience,
        account.orgProfile.business_type,
        userId,
      ],
    );

    await pool.query(
      `
      insert into public.advisor_onboarding_answers (
        org_id, professional_title, business_type, years_in_consulting_band, previous_experience_types, updated_at
      )
      values ($1::uuid, $2, $3, $4, $5::text[], timezone('utc', now()))
      on conflict (org_id) do update set
        professional_title = excluded.professional_title,
        business_type = excluded.business_type,
        years_in_consulting_band = excluded.years_in_consulting_band,
        previous_experience_types = excluded.previous_experience_types,
        updated_at = timezone('utc', now())
      `,
      [
        orgId,
        account.onboarding.professional_title,
        account.onboarding.business_type,
        account.onboarding.years_in_consulting_band,
        account.onboarding.previous_experience_types,
      ],
    );
  }

  await pool.query(
    `
    insert into public.onboarding_progress (
      org_id, step_key, step_number, status, completed_at, updated_at
    )
    values ($1::uuid, 'step1', 1, 'completed'::public.onboarding_step_status, timezone('utc', now()), timezone('utc', now()))
    on conflict (org_id, step_key) do update set
      status = 'completed'::public.onboarding_step_status,
      completed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    `,
    [orgId],
  );

  await pool.query(
    `
    insert into public.org_profile_scores (
      org_id, overall_score, onboarding_score, profile_score, verification_score, activity_score,
      missing_fields, score_details, calculated_at
    )
    values (
      $1::uuid, 100, 100, 100, 100, 100, $2::text[], $3::jsonb, timezone('utc', now())
    )
    on conflict (org_id) do update set
      overall_score = 100,
      onboarding_score = 100,
      profile_score = 100,
      verification_score = 100,
      activity_score = 100,
      missing_fields = $2::text[],
      score_details = $3::jsonb,
      calculated_at = timezone('utc', now())
    `,
    [
      orgId,
      [],
      JSON.stringify({
        seeded: true,
        weights: { onboarding: 0.5, profile: 0.5, verification: 0.0, activity: 0.0 },
      }),
    ],
  );

  if (account.adminRole) {
    await pool.query(
      `
      insert into public.admin_users (user_id, role, is_active, granted_at)
      values ($1::uuid, $2, true, timezone('utc', now()))
      on conflict (user_id) do update set
        role = excluded.role,
        is_active = true,
        revoked_at = null
      `,
      [userId, account.adminRole],
    );
  }

  return orgId;
}

async function main() {
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set.');
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    options: '-c search_path=public',
  });
  const auth = buildAuth(pool);

  const emails = allAccounts.map((account) => account.email.toLowerCase());
  const existingRefs = await pool.query(
    `
    select distinct
      u.id::text as user_id,
      om.org_id::text as org_id
    from public.users u
    left join public.org_members om on om.user_id = u.id
    where lower(coalesce(u.email, '')) = any($1::text[])
    `,
    [emails],
  );
  const existingUserIds = [...new Set(existingRefs.rows.map((row) => row.user_id).filter(Boolean))];
  const existingOrgIds = [...new Set(existingRefs.rows.map((row) => row.org_id).filter(Boolean))];

  if (existingOrgIds.length > 0) {
    await pool.query(`delete from public.notifications where user_id = any($1::uuid[])`, [existingUserIds]);
    await pool.query(`delete from public.payment_transactions where org_id = any($1::uuid[])`, [existingOrgIds]);
    await pool.query(`delete from public.org_subscriptions where org_id = any($1::uuid[])`, [existingOrgIds]);
    await pool.query(`delete from public.org_subscription_accounts where org_id = any($1::uuid[])`, [existingOrgIds]);
    await pool.query(`delete from public.warm_intro_requests where sender_org_id = any($1::uuid[]) or receiver_org_id = any($1::uuid[]) or via_advisor_org_id = any($1::uuid[])`, [existingOrgIds]);
    await pool.query(`delete from public.syndicate_invites where invitee_org_id = any($1::uuid[]) or syndicate_id in (select id from public.syndicates where lead_org_id = any($1::uuid[]) or startup_org_id = any($1::uuid[]))`, [existingOrgIds]);
    await pool.query(`delete from public.syndicate_members where org_id = any($1::uuid[]) or syndicate_id in (select id from public.syndicates where lead_org_id = any($1::uuid[]) or startup_org_id = any($1::uuid[]))`, [existingOrgIds]);
    await pool.query(`delete from public.syndicates where lead_org_id = any($1::uuid[]) or startup_org_id = any($1::uuid[])`, [existingOrgIds]);
    await pool.query(`delete from public.data_room_document_views where viewer_org_id = any($1::uuid[]) or document_id in (select id from public.startup_data_room_documents where startup_org_id = any($1::uuid[]))`, [existingOrgIds]);
    await pool.query(`delete from public.data_room_access_grants where startup_org_id = any($1::uuid[]) or grantee_org_id = any($1::uuid[])`, [existingOrgIds]);
    await pool.query(`delete from public.data_room_access_requests where startup_org_id = any($1::uuid[]) or requester_org_id = any($1::uuid[])`, [existingOrgIds]);
    await pool.query(`delete from public.deal_room_data_room_links where deal_room_id in (select dr.id from public.deal_rooms dr join public.connections c on c.id = dr.connection_id where c.org_a_id = any($1::uuid[]) or c.org_b_id = any($1::uuid[]))`, [existingOrgIds]);
    await pool.query(`delete from public.deal_room_agreements where deal_room_id in (select dr.id from public.deal_rooms dr join public.connections c on c.id = dr.connection_id where c.org_a_id = any($1::uuid[]) or c.org_b_id = any($1::uuid[]))`, [existingOrgIds]);
    await pool.query(`delete from public.deal_room_milestones where deal_room_id in (select dr.id from public.deal_rooms dr join public.connections c on c.id = dr.connection_id where c.org_a_id = any($1::uuid[]) or c.org_b_id = any($1::uuid[]))`, [existingOrgIds]);
    await pool.query(`delete from public.deal_room_commitments where deal_room_id in (select dr.id from public.deal_rooms dr join public.connections c on c.id = dr.connection_id where c.org_a_id = any($1::uuid[]) or c.org_b_id = any($1::uuid[]))`, [existingOrgIds]);
    await pool.query(`delete from public.deal_room_stage_history where deal_room_id in (select dr.id from public.deal_rooms dr join public.connections c on c.id = dr.connection_id where c.org_a_id = any($1::uuid[]) or c.org_b_id = any($1::uuid[]))`, [existingOrgIds]);
    await pool.query(`delete from public.deal_room_messages where sender_user_id = any($1::uuid[]) or deal_room_id in (select dr.id from public.deal_rooms dr join public.connections c on c.id = dr.connection_id where c.org_a_id = any($2::uuid[]) or c.org_b_id = any($2::uuid[]))`, [existingUserIds, existingOrgIds]);
    await pool.query(`delete from public.deal_room_participants where org_id = any($1::uuid[]) or deal_room_id in (select dr.id from public.deal_rooms dr join public.connections c on c.id = dr.connection_id where c.org_a_id = any($1::uuid[]) or c.org_b_id = any($1::uuid[]))`, [existingOrgIds]);
    await pool.query(`delete from public.deal_rooms where connection_id in (select id from public.connections where org_a_id = any($1::uuid[]) or org_b_id = any($1::uuid[]))`, [existingOrgIds]);
    await pool.query(`delete from public.connection_messages where from_org_id = any($1::uuid[]) or connection_id in (select id from public.connections where org_a_id = any($1::uuid[]) or org_b_id = any($1::uuid[]))`, [existingOrgIds]);
    await pool.query(`delete from public.connections where org_a_id = any($1::uuid[]) or org_b_id = any($1::uuid[])`, [existingOrgIds]);
    await pool.query(`delete from public.connection_requests where from_org_id = any($1::uuid[]) or to_org_id = any($1::uuid[])`, [existingOrgIds]);
    await pool.query(`delete from public.startup_data_room_audit_logs where startup_org_id = any($1::uuid[]) or actor_user_id = any($2::uuid[])`, [existingOrgIds, existingUserIds]);
    await pool.query(`delete from public.startup_data_room_documents where startup_org_id = any($1::uuid[])`, [existingOrgIds]);
    await pool.query(`delete from public.startup_data_room_folders where startup_org_id = any($1::uuid[])`, [existingOrgIds]);
    await pool.query(`delete from public.admin_users where user_id = any($1::uuid[])`, [existingUserIds]);
    await pool.query(`delete from public.org_members where user_id = any($1::uuid[]) or org_id = any($2::uuid[])`, [existingUserIds, existingOrgIds]);
  }
  await pool.query(`delete from public.users where lower(coalesce(email, '')) = any($1::text[])`, [emails]);

  const created = [];
  for (const account of allAccounts) {
    const userId = await ensureUser(auth, pool, account);
    const orgId = await ensureOrganization(pool, userId, account);
    created.push({
      role: account.adminRole ? `admin (${account.adminRole})` : account.role,
      email: account.email,
      password: PASSWORD,
      userId,
      orgId,
      orgName: account.orgName,
    });
  }

  console.log('\nSeeded test users:\n');
  console.table(created.map(({ role, email, password, orgName }) => ({ role, email, password, orgName })));
  console.log('\nAdmin emails for client UI:');
  console.log('admin.alpha@impactis.local,admin.beta@impactis.local,admin.gamma@impactis.local');

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
