/* eslint-disable no-console */
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const crypto = require('crypto');
const { Pool } = require('pg');

const SEED_NS = 'impactis-test-activity-v1';
const ORIGIN = 'http://127.0.0.1:3000';

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

function plusDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
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

  const seededEmails = [
    'startup.alpha@impactis.local',
    'startup.beta@impactis.local',
    'startup.gamma@impactis.local',
    'investor.alpha@impactis.local',
    'investor.beta@impactis.local',
    'investor.gamma@impactis.local',
    'advisor.alpha@impactis.local',
    'advisor.beta@impactis.local',
    'advisor.gamma@impactis.local',
    'admin.alpha@impactis.local',
    'admin.beta@impactis.local',
    'admin.gamma@impactis.local',
  ];

  const seeded = await pool.query(
    `
    select
      lower(u.email) as email,
      u.id::text as user_id,
      om.org_id::text as org_id,
      o.type::text as org_type,
      o.name as org_name
    from public.users u
    join public.org_members om on om.user_id = u.id and om.status = 'active'
    join public.organizations o on o.id = om.org_id
    where lower(coalesce(u.email, '')) = any($1::text[])
    `,
    [seededEmails],
  );

  if (seeded.rows.length < seededEmails.length) {
    throw new Error(
      'Some seeded test users are missing. Run `npm run db:seed:test-users` first.',
    );
  }

  const byEmail = new Map(seeded.rows.map((row) => [row.email, row]));
  const usersByOrg = new Map(seeded.rows.map((row) => [row.org_id, row.user_id]));
  const seededOrgIds = seeded.rows.map((row) => row.org_id);
  const seededUserIds = seeded.rows.map((row) => row.user_id);

  const startupAlpha = byEmail.get('startup.alpha@impactis.local');
  const startupBeta = byEmail.get('startup.beta@impactis.local');
  const startupGamma = byEmail.get('startup.gamma@impactis.local');
  const investorAlpha = byEmail.get('investor.alpha@impactis.local');
  const investorBeta = byEmail.get('investor.beta@impactis.local');
  const investorGamma = byEmail.get('investor.gamma@impactis.local');
  const advisorAlpha = byEmail.get('advisor.alpha@impactis.local');
  const advisorBeta = byEmail.get('advisor.beta@impactis.local');
  const advisorGamma = byEmail.get('advisor.gamma@impactis.local');

  const plansRes = await pool.query(
    `
    select
      id::text as id,
      segment,
      plan_code,
      monthly_price_usd,
      annual_price_usd
    from public.billing_plan_catalog
    `,
  );
  const plans = new Map(
    plansRes.rows.map((row) => [`${row.segment}:${row.plan_code}`, row]),
  );

  const consentTableExists =
    (
      await pool.query(`select to_regclass('public.data_room_consents') as table_name`)
    ).rows[0]?.table_name !== null;

  await pool.query(
    `
    delete from public.org_members om
    where om.org_id = any($1::uuid[])
      and not exists (
        select 1 from public.users u where u.id = om.user_id
      )
    `,
    [seededOrgIds],
  );

  await pool.query(`delete from public.notifications where user_id = any($1::uuid[])`, [seededUserIds]);
  await pool.query(
    `delete from public.payment_transactions where org_id = any($1::uuid[])`,
    [seededOrgIds],
  );
  await pool.query(
    `delete from public.org_subscriptions where org_id = any($1::uuid[])`,
    [seededOrgIds],
  );
  await pool.query(
    `delete from public.org_subscription_accounts where org_id = any($1::uuid[])`,
    [seededOrgIds],
  );
  await pool.query(
    `delete from public.warm_intro_requests where sender_org_id = any($1::uuid[]) or receiver_org_id = any($1::uuid[]) or via_advisor_org_id = any($1::uuid[])`,
    [seededOrgIds],
  );
  await pool.query(
    `delete from public.syndicate_invites where invitee_org_id = any($1::uuid[]) or syndicate_id in (select id from public.syndicates where lead_org_id = any($1::uuid[]) or startup_org_id = any($1::uuid[]))`,
    [seededOrgIds],
  );
  await pool.query(
    `delete from public.syndicate_members where org_id = any($1::uuid[]) or syndicate_id in (select id from public.syndicates where lead_org_id = any($1::uuid[]) or startup_org_id = any($1::uuid[]))`,
    [seededOrgIds],
  );
  await pool.query(
    `delete from public.syndicates where lead_org_id = any($1::uuid[]) or startup_org_id = any($1::uuid[])`,
    [seededOrgIds],
  );
  await pool.query(
    `delete from public.data_room_document_views where viewer_org_id = any($1::uuid[]) or document_id in (select id from public.startup_data_room_documents where startup_org_id = any($1::uuid[]))`,
    [seededOrgIds],
  );
  if (consentTableExists) {
    await pool.query(
      `delete from public.data_room_consents where startup_org_id = any($1::uuid[]) or grantee_org_id = any($1::uuid[])`,
      [seededOrgIds],
    );
  }
  await pool.query(
    `delete from public.data_room_access_grants where startup_org_id = any($1::uuid[]) or grantee_org_id = any($1::uuid[])`,
    [seededOrgIds],
  );
  await pool.query(
    `delete from public.data_room_access_requests where startup_org_id = any($1::uuid[]) or requester_org_id = any($1::uuid[])`,
    [seededOrgIds],
  );
  await pool.query(
    `delete from public.deal_room_data_room_links where deal_room_id in (
      select dr.id
      from public.deal_rooms dr
      join public.connections c on c.id = dr.connection_id
      where c.org_a_id = any($1::uuid[]) or c.org_b_id = any($1::uuid[])
    )`,
    [seededOrgIds],
  );
  await pool.query(
    `delete from public.deal_room_agreements where deal_room_id in (
      select dr.id
      from public.deal_rooms dr
      join public.connections c on c.id = dr.connection_id
      where c.org_a_id = any($1::uuid[]) or c.org_b_id = any($1::uuid[])
    )`,
    [seededOrgIds],
  );
  await pool.query(
    `delete from public.deal_room_milestones where deal_room_id in (
      select dr.id
      from public.deal_rooms dr
      join public.connections c on c.id = dr.connection_id
      where c.org_a_id = any($1::uuid[]) or c.org_b_id = any($1::uuid[])
    )`,
    [seededOrgIds],
  );
  await pool.query(
    `delete from public.deal_room_commitments where deal_room_id in (
      select dr.id
      from public.deal_rooms dr
      join public.connections c on c.id = dr.connection_id
      where c.org_a_id = any($1::uuid[]) or c.org_b_id = any($1::uuid[])
    )`,
    [seededOrgIds],
  );
  await pool.query(
    `delete from public.deal_room_stage_history where deal_room_id in (
      select dr.id
      from public.deal_rooms dr
      join public.connections c on c.id = dr.connection_id
      where c.org_a_id = any($1::uuid[]) or c.org_b_id = any($1::uuid[])
    )`,
    [seededOrgIds],
  );
  await pool.query(
    `delete from public.deal_room_messages where deal_room_id in (
      select dr.id
      from public.deal_rooms dr
      join public.connections c on c.id = dr.connection_id
      where c.org_a_id = any($1::uuid[]) or c.org_b_id = any($1::uuid[])
    )`,
    [seededOrgIds],
  );
  await pool.query(
    `delete from public.deal_room_participants where deal_room_id in (
      select dr.id
      from public.deal_rooms dr
      join public.connections c on c.id = dr.connection_id
      where c.org_a_id = any($1::uuid[]) or c.org_b_id = any($1::uuid[])
    )`,
    [seededOrgIds],
  );
  await pool.query(
    `delete from public.deal_rooms where connection_id in (
      select id from public.connections where org_a_id = any($1::uuid[]) or org_b_id = any($1::uuid[])
    )`,
    [seededOrgIds],
  );
  await pool.query(
    `delete from public.connection_messages where connection_id in (
      select id from public.connections where org_a_id = any($1::uuid[]) or org_b_id = any($1::uuid[])
    )`,
    [seededOrgIds],
  );
  await pool.query(
    `delete from public.connections where org_a_id = any($1::uuid[]) or org_b_id = any($1::uuid[])`,
    [seededOrgIds],
  );
  await pool.query(
    `delete from public.connection_requests where from_org_id = any($1::uuid[]) or to_org_id = any($1::uuid[])`,
    [seededOrgIds],
  );
  await pool.query(
    `delete from public.startup_data_room_audit_logs where startup_org_id = any($1::uuid[])`,
    [seededOrgIds],
  );
  await pool.query(
    `delete from public.startup_data_room_documents where startup_org_id = any($1::uuid[])`,
    [seededOrgIds],
  );
  await pool.query(
    `delete from public.startup_data_room_folders where startup_org_id = any($1::uuid[])`,
    [seededOrgIds],
  );

  async function notifyOrg(orgId, params) {
    const rows = await pool.query(
      `
      select om.user_id::text as user_id
      from public.org_members om
      join public.users u on u.id = om.user_id
      where om.org_id = $1::uuid and om.status = 'active'
      `,
      [orgId],
    );
    for (const row of rows.rows) {
      await pool.query(
        `
        insert into public.notifications (id, user_id, type, title, body, link, action_id, read_at, created_at)
        values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::timestamptz, timezone('utc', now()))
        `,
        [
          seedId(`notification:${params.seedKey}:${row.user_id}`),
          row.user_id,
          params.type,
          params.title,
          params.body || null,
          params.link || null,
          params.actionId || null,
          params.readAt || null,
        ],
      );
    }
  }

  async function insertSubscription(org, planCode, interval = 'monthly') {
    const plan = plans.get(`${org.org_type}:${planCode}`);
    if (!plan) {
      throw new Error(`Missing plan for ${org.org_type}:${planCode}`);
    }

    const priceUsd =
      interval === 'annual'
        ? Number(plan.annual_price_usd ?? 0)
        : Number(plan.monthly_price_usd ?? 0);
    const periodEnd = plusDays(interval === 'annual' ? 365 : 30);

    await pool.query(
      `
      insert into public.org_subscription_accounts (org_id, billing_email, provider_customer_ref, metadata)
      values ($1::uuid, $2, $3, $4::jsonb)
      `,
      [
        org.org_id,
        org.email,
        `cus_${seedId(`customer:${org.org_id}`).replace(/-/g, '').slice(0, 18)}`,
        JSON.stringify({ seeded: true }),
      ],
    );

    await pool.query(
      `
      insert into public.org_subscriptions (
        id, org_id, plan_id, status, billing_interval, started_at,
        current_period_start, current_period_end, cancel_at_period_end,
        source, external_subscription_ref, metadata, trial_ends_at, created_at, updated_at
      )
      values (
        $1::uuid, $2::uuid, $3::uuid, 'active'::public.billing_subscription_status, $4::public.billing_interval,
        timezone('utc', now()) - interval '7 days',
        timezone('utc', now()) - interval '7 days',
        $5::timestamptz,
        false,
        'seed',
        $6,
        $7::jsonb,
        null,
        timezone('utc', now()),
        timezone('utc', now())
      )
      `,
      [
        seedId(`subscription:${org.org_id}`),
        org.org_id,
        plan.id,
        interval,
        periodEnd,
        `sub_${seedId(`subscription-ref:${org.org_id}`).replace(/-/g, '').slice(0, 18)}`,
        JSON.stringify({ seeded: true, plan_code: planCode }),
      ],
    );

    if (priceUsd > 0) {
      await pool.query(
        `
        insert into public.payment_transactions (
          id, org_id, transaction_type, amount_cents, currency, status, provider,
          provider_payment_id, provider_invoice_id, description, metadata, created_at, updated_at
        )
        values (
          $1::uuid, $2::uuid, 'subscription', $3::bigint, 'USD',
          'completed'::public.payment_transaction_status, 'stripe',
          $4, $5, $6, $7::jsonb, timezone('utc', now()) - interval '3 days', timezone('utc', now()) - interval '3 days'
        )
        `,
        [
          seedId(`payment:${org.org_id}`),
          org.org_id,
          String(priceUsd * 100),
          `pi_${seedId(`payment-intent:${org.org_id}`).replace(/-/g, '').slice(0, 20)}`,
          `in_${seedId(`invoice:${org.org_id}`).replace(/-/g, '').slice(0, 20)}`,
          `${planCode.toUpperCase()} ${org.org_type} subscription`,
          JSON.stringify({ seeded: true, billing_interval: interval }),
        ],
      );
    }
  }

  const subscriptionMatrix = [
    [startupAlpha, 'free'],
    [startupBeta, 'pro'],
    [startupGamma, 'elite'],
    [investorAlpha, 'free'],
    [investorBeta, 'pro'],
    [investorGamma, 'elite'],
    [advisorAlpha, 'free'],
    [advisorBeta, 'pro'],
    [advisorGamma, 'elite'],
  ];
  for (const [org, planCode] of subscriptionMatrix) {
    await insertSubscription(org, planCode, 'monthly');
  }

  const startupDocs = [
    {
      startup: startupAlpha,
      folders: ['Overview', 'Financials', 'Legal'],
      docs: [
        ['pitch_deck', 'Founder Pitch Deck', 'Overview'],
        ['financial_model', 'Revenue Model FY26', 'Financials'],
        ['legal_doc', 'Corporate Legal Summary', 'Legal'],
      ],
    },
    {
      startup: startupBeta,
      folders: ['Overview', 'Financials', 'Product'],
      docs: [
        ['pitch_deck', 'GreenGrid Investor Deck', 'Overview'],
        ['traction_metrics', 'Pilot Performance Metrics', 'Financials'],
        ['product_roadmap', 'Product Roadmap H2', 'Product'],
      ],
    },
    {
      startup: startupGamma,
      folders: ['Overview', 'Financials', 'Contracts'],
      docs: [
        ['pitch_deck', 'CareFlow Company Deck', 'Overview'],
        ['financial_doc', 'Clinic Revenue Summary', 'Financials'],
        ['customer_contracts_summaries', 'Customer Contract Summaries', 'Contracts'],
      ],
    },
  ];

  for (const item of startupDocs) {
    const folderIds = new Map();
    for (let index = 0; index < item.folders.length; index += 1) {
      const folderName = item.folders[index];
      const folderId = seedId(`folder:${item.startup.org_id}:${folderName}`);
      folderIds.set(folderName, folderId);
      await pool.query(
        `
        insert into public.startup_data_room_folders (
          id, startup_org_id, name, parent_id, sort_order, created_at, updated_at
        )
        values ($1::uuid, $2::uuid, $3, null, $4, timezone('utc', now()), timezone('utc', now()))
        `,
        [folderId, item.startup.org_id, folderName, index],
      );
    }

    for (const [docType, title, folderName] of item.docs) {
      const documentId = seedId(`document:${item.startup.org_id}:${docType}`);
      await pool.query(
        `
        insert into public.startup_data_room_documents (
          id, startup_org_id, folder_id, folder_path, document_type, title, file_url,
          file_name, file_size_bytes, content_type, summary, is_confidential, watermark_enabled,
          download_enabled, uploaded_by, created_at, updated_at
        )
        values (
          $1::uuid, $2::uuid, $3::uuid, $4, $5::public.startup_data_room_document_type, $6, $7,
          $8, $9::bigint, 'application/pdf', $10, true, true,
          false, $11::uuid, timezone('utc', now()), timezone('utc', now())
        )
        `,
        [
          documentId,
          item.startup.org_id,
          folderIds.get(folderName),
          folderName,
          docType,
          title,
          `https://example.com/data-room/${documentId}.pdf`,
          `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
          '245000',
          `${title} prepared for demo data room testing.`,
          item.startup.user_id,
        ],
      );

      await pool.query(
        `
        insert into public.startup_data_room_audit_logs (
          id, startup_org_id, action, folder_path, document_id, document_type, title, file_url,
          file_name, file_size_bytes, content_type, summary, actor_user_id, metadata, created_at
        )
        values (
          $1::uuid, $2::uuid, 'document_upserted', $3, $4::uuid, $5::public.startup_data_room_document_type, $6, $7,
          $8, $9::bigint, 'application/pdf', $10, $11::uuid, $12::jsonb, timezone('utc', now())
        )
        `,
        [
          seedId(`audit:${documentId}`),
          item.startup.org_id,
          folderName,
          documentId,
          docType,
          title,
          `https://example.com/data-room/${documentId}.pdf`,
          `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
          '245000',
          `${title} prepared for demo data room testing.`,
          item.startup.user_id,
          JSON.stringify({ seeded: true }),
        ],
      );
    }
  }

  const pendingInvestorToStartup = seedId('connection-request:investor-beta:startup-alpha');
  await pool.query(
    `
    insert into public.connection_requests (
      id, from_org_id, to_org_id, status, message, created_at, responded_at
    )
    values (
      $1::uuid, $2::uuid, $3::uuid, 'pending'::public.connection_request_status, $4,
      timezone('utc', now()) - interval '2 days', null
    )
    `,
    [
      pendingInvestorToStartup,
      investorBeta.org_id,
      startupAlpha.org_id,
      'We like the traction and want to learn more about your GTM plan.',
    ],
  );
  await notifyOrg(startupAlpha.org_id, {
    seedKey: 'conn-pending-investor-beta-startup-alpha',
    type: 'connection_request_received',
    title: `${investorBeta.org_name} wants to connect`,
    body: `You have a new connection request from ${investorBeta.org_name}. Accept or decline in Connections.`,
    link: `${ORIGIN}/workspace/connections`,
    actionId: pendingInvestorToStartup,
  });

  const pendingStartupToAdvisor = seedId('connection-request:startup-alpha:advisor-beta');
  await pool.query(
    `
    insert into public.connection_requests (
      id, from_org_id, to_org_id, status, message, created_at, responded_at
    )
    values (
      $1::uuid, $2::uuid, $3::uuid, 'pending'::public.connection_request_status, $4,
      timezone('utc', now()) - interval '1 day', null
    )
    `,
    [
      pendingStartupToAdvisor,
      startupAlpha.org_id,
      advisorBeta.org_id,
      'Looking for help tightening our investor narrative before fundraising.',
    ],
  );
  await notifyOrg(advisorBeta.org_id, {
    seedKey: 'conn-pending-startup-alpha-advisor-beta',
    type: 'connection_request_received',
    title: `${startupAlpha.org_name} wants to connect`,
    body: `You have a new connection request from ${startupAlpha.org_name}. Accept or decline in Connections.`,
    link: `${ORIGIN}/workspace/connections`,
    actionId: pendingStartupToAdvisor,
  });

  const acceptedRequest = seedId('connection-request:investor-gamma:startup-beta');
  await pool.query(
    `
    insert into public.connection_requests (
      id, from_org_id, to_org_id, status, message, created_at, responded_at
    )
    values (
      $1::uuid, $2::uuid, $3::uuid, 'accepted'::public.connection_request_status, $4,
      timezone('utc', now()) - interval '6 days',
      timezone('utc', now()) - interval '5 days'
    )
    `,
    [
      acceptedRequest,
      investorGamma.org_id,
      startupBeta.org_id,
      'Interested in diligence around your pilot pipeline and energy economics.',
    ],
  );

  const [orgA, orgB] =
    investorGamma.org_id < startupBeta.org_id
      ? [investorGamma.org_id, startupBeta.org_id]
      : [startupBeta.org_id, investorGamma.org_id];
  const connectionId = seedId('connection:investor-gamma:startup-beta');
  await pool.query(
    `
    insert into public.connections (id, org_a_id, org_b_id, created_at)
    values ($1::uuid, $2::uuid, $3::uuid, timezone('utc', now()) - interval '5 days')
    `,
    [connectionId, orgA, orgB],
  );

  await notifyOrg(investorGamma.org_id, {
    seedKey: 'conn-accepted-investor-gamma-startup-beta',
    type: 'connection_request_accepted',
    title: `${startupBeta.org_name} accepted your connection request`,
    body: 'You are now connected. You can message from Deal Room.',
    link: `${ORIGIN}/workspace/connections`,
    actionId: acceptedRequest,
  });

  const dealRoomId = seedId('deal-room:investor-gamma:startup-beta');
  await pool.query(
    `
    insert into public.deal_rooms (
      id, connection_id, name, stage, description, target_amount, committed_total,
      terms_accepted, created_at, updated_at
    )
    values (
      $1::uuid, $2::uuid, $3, 'due_diligence'::public.deal_room_stage, $4, $5::bigint, $6::bigint,
      true, timezone('utc', now()) - interval '5 days', timezone('utc', now()) - interval '1 day'
    )
    `,
    [
      dealRoomId,
      connectionId,
      'GreenGrid Series Seed Discussion',
      'Diligence and investment discussion for GreenGrid Systems.',
      '600000',
      '250000',
    ],
  );

  const participants = [
    [startupBeta.org_id, 'startup_founder'],
    [investorGamma.org_id, 'lead_investor'],
    [investorBeta.org_id, 'co_investor'],
    [advisorGamma.org_id, 'advisor'],
  ];
  for (const [orgId, role] of participants) {
    await pool.query(
      `
      insert into public.deal_room_participants (
        id, deal_room_id, org_id, role, invited_at, accepted_at
      )
      values (
        $1::uuid, $2::uuid, $3::uuid, $4::public.deal_room_participant_role,
        timezone('utc', now()) - interval '5 days',
        timezone('utc', now()) - interval '5 days'
      )
      `,
      [seedId(`deal-room-participant:${dealRoomId}:${orgId}`), dealRoomId, orgId, role],
    );
  }

  await pool.query(
    `
    insert into public.deal_room_stage_history (
      id, deal_room_id, from_stage, to_stage, changed_by, note, created_at
    )
    values
      ($1::uuid, $2::uuid, null, 'interest'::public.deal_room_stage, $3::uuid, 'Deal room opened after accepted connection.', timezone('utc', now()) - interval '5 days'),
      ($4::uuid, $2::uuid, 'interest'::public.deal_room_stage, 'due_diligence'::public.deal_room_stage, $3::uuid, 'Founder shared diligence materials and investor questions.', timezone('utc', now()) - interval '4 days')
    `,
    [
      seedId(`deal-stage-initial:${dealRoomId}`),
      dealRoomId,
      startupBeta.user_id,
      seedId(`deal-stage-dd:${dealRoomId}`),
    ],
  );

  const dealMessages = [
    [startupBeta.user_id, 'Thanks for the interest. We uploaded our latest pilot and roadmap materials.'],
    [investorGamma.user_id, 'Reviewing now. We want to understand customer retention and deployment margin.'],
    [advisorGamma.user_id, 'I added a short note on the rollout assumptions and the enterprise sales cycle.'],
    [startupBeta.user_id, 'Happy to walk through the pipeline live this week.'],
    [investorGamma.user_id, 'Initial review looks strong. We are preparing a soft commitment pending final diligence.'],
  ];
  for (let i = 0; i < dealMessages.length; i += 1) {
    const [senderUserId, body] = dealMessages[i];
    await pool.query(
      `
      insert into public.deal_room_messages (
        id, deal_room_id, sender_user_id, body, is_ai_summary, created_at
      )
      values (
        $1::uuid, $2::uuid, $3::uuid, $4, false,
        timezone('utc', now()) - (($5::int || ' days')::interval)
      )
      `,
      [seedId(`deal-message:${dealRoomId}:${i}`), dealRoomId, senderUserId, body, 4 - i],
    );
  }
  await pool.query(
    `
    insert into public.deal_room_messages (
      id, deal_room_id, sender_user_id, body, is_ai_summary, created_at
    )
    values (
      $1::uuid, $2::uuid, $3::uuid, $4, true, timezone('utc', now()) - interval '12 hours'
    )
    `,
    [
      seedId(`deal-message-ai:${dealRoomId}`),
      dealRoomId,
      startupBeta.user_id,
      'AI summary: diligence is progressing well, investor focus remains pilot conversion, deployment margin, and readiness for a $600k seed raise.',
    ],
  );

  await pool.query(
    `
    insert into public.deal_room_commitments (
      id, deal_room_id, investor_org_id, amount_usd, conditions, notes, status, committed_at, updated_at
    )
    values
      ($1::uuid, $2::uuid, $3::uuid, $4::bigint, $5, $6, 'soft', timezone('utc', now()) - interval '1 day', timezone('utc', now()) - interval '1 day'),
      ($7::uuid, $2::uuid, $8::uuid, $9::bigint, $10, $11, 'soft', timezone('utc', now()) - interval '8 hours', timezone('utc', now()) - interval '8 hours')
    `,
    [
      seedId(`commitment:${dealRoomId}:lead`),
      dealRoomId,
      investorGamma.org_id,
      '200000',
      'Final diligence on pilot economics and customer references.',
      'Lead investor soft circle.',
      seedId(`commitment:${dealRoomId}:co`),
      investorBeta.org_id,
      '50000',
      'Joining if lead finalizes terms.',
      'Potential co-investor participation.',
    ],
  );

  const milestones = [
    ['Upload latest pilot metrics', 'Completed and shared in data room.', true, 0],
    ['Management diligence call', 'Discuss customer funnel and rollout assumptions.', false, 1],
    ['Issue draft term sheet', 'Prepare standard term sheet once diligence is complete.', false, 2],
  ];
  for (const [title, description, completed, sortOrder] of milestones) {
    await pool.query(
      `
      insert into public.deal_room_milestones (
        id, deal_room_id, title, description, due_date, completed_at, sort_order, created_at
      )
      values (
        $1::uuid, $2::uuid, $3, $4, current_date + ($5::int), $6::timestamptz, $7,
        timezone('utc', now()) - interval '2 days'
      )
      `,
      [
        seedId(`milestone:${dealRoomId}:${sortOrder}`),
        dealRoomId,
        title,
        description,
        sortOrder + 2,
        completed ? plusDays(-1) : null,
        sortOrder,
      ],
    );
  }

  await pool.query(
    `
    insert into public.deal_room_agreements (
      id, deal_room_id, title, template_key, content_text, status, signed_by, created_at, updated_at
    )
    values (
      $1::uuid, $2::uuid, 'Standard Seed Term Sheet', 'standard_term_sheet', $3,
      'review'::public.deal_room_agreement_status, $4::jsonb,
      timezone('utc', now()) - interval '6 hours', timezone('utc', now()) - interval '6 hours'
    )
    `,
    [
      seedId(`agreement:${dealRoomId}`),
      dealRoomId,
      'Draft seed term sheet covering target raise, governance, and diligence conditions.',
      JSON.stringify([]),
    ],
  );

  await pool.query(
    `
    insert into public.deal_room_data_room_links (
      id, deal_room_id, startup_org_id, terms_accepted_at, created_at
    )
    values (
      $1::uuid, $2::uuid, $3::uuid, timezone('utc', now()) - interval '3 days',
      timezone('utc', now()) - interval '3 days'
    )
    `,
    [seedId(`dr-link:${dealRoomId}`), dealRoomId, startupBeta.org_id],
  );

  await notifyOrg(startupBeta.org_id, {
    seedKey: 'deal-room-created-startup-beta',
    type: 'deal_room_created',
    title: 'Deal Room created',
    body: 'A Deal Room is now available for this connection. Open it from Connections.',
    link: `${ORIGIN}/workspace/connections`,
  });
  await notifyOrg(investorGamma.org_id, {
    seedKey: 'deal-room-created-investor-gamma',
    type: 'deal_room_created',
    title: 'Deal Room created',
    body: 'A Deal Room is now available for this connection. Open it from Connections.',
    link: `${ORIGIN}/workspace/connections`,
  });

  const requestApproved = seedId('data-room-request:startup-beta:investor-gamma');
  await pool.query(
    `
    insert into public.data_room_access_requests (
      id, startup_org_id, requester_org_id, message, status, reviewed_at, review_note, created_at
    )
    values (
      $1::uuid, $2::uuid, $3::uuid, $4,
      'approved'::public.data_room_access_status,
      timezone('utc', now()) - interval '2 days',
      'Approved for diligence.',
      timezone('utc', now()) - interval '3 days'
    )
    `,
    [
      requestApproved,
      startupBeta.org_id,
      investorGamma.org_id,
      'Requesting diligence access for pilot metrics, roadmap, and legal docs.',
    ],
  );
  await pool.query(
    `
    insert into public.data_room_access_grants (
      id, startup_org_id, grantee_org_id, permission_level, terms_accepted_at, granted_at, revoked_at, expires_at
    )
    values (
      $1::uuid, $2::uuid, $3::uuid, 'view'::public.data_room_permission_level,
      timezone('utc', now()) - interval '2 days',
      timezone('utc', now()) - interval '2 days',
      null,
      timezone('utc', now()) + interval '30 days'
    )
    `,
    [seedId('data-room-grant:startup-beta:investor-gamma'), startupBeta.org_id, investorGamma.org_id],
  );
  if (consentTableExists) {
    await pool.query(
      `
      insert into public.data_room_consents (
        id, startup_org_id, grantee_org_id, consented_at, ip_address, user_agent, created_at, updated_at
      )
      values (
        $1::uuid, $2::uuid, $3::uuid, timezone('utc', now()) - interval '2 days',
        '127.0.0.1', 'Seed script', timezone('utc', now()) - interval '2 days', timezone('utc', now()) - interval '2 days'
      )
      `,
      [seedId('data-room-consent:startup-beta:investor-gamma'), startupBeta.org_id, investorGamma.org_id],
    );
  }
  await notifyOrg(investorGamma.org_id, {
    seedKey: 'data-room-approved-investor-gamma',
    type: 'data_room_access_granted',
    title: `${startupBeta.org_name} granted data room access`,
    body: 'Your diligence access is active. Open the Data Room to review documents.',
    link: `${ORIGIN}/workspace/data-room`,
    actionId: requestApproved,
  });

  const requestPending = seedId('data-room-request:startup-alpha:investor-beta');
  await pool.query(
    `
    insert into public.data_room_access_requests (
      id, startup_org_id, requester_org_id, message, status, reviewed_at, review_note, created_at
    )
    values (
      $1::uuid, $2::uuid, $3::uuid, $4,
      'pending'::public.data_room_access_status,
      null,
      null,
      timezone('utc', now()) - interval '18 hours'
    )
    `,
    [
      requestPending,
      startupAlpha.org_id,
      investorBeta.org_id,
      'Would like access to your deck and financial assumptions before a deeper diligence call.',
    ],
  );
  await notifyOrg(startupAlpha.org_id, {
    seedKey: 'data-room-pending-startup-alpha',
    type: 'data_room_access_request',
    title: `${investorBeta.org_name} requested data room access`,
    body: 'Review the request and approve or decline from Data Room.',
    link: `${ORIGIN}/workspace/data-room`,
    actionId: requestPending,
  });

  const betaDocs = await pool.query(
    `
    select id::text as id
    from public.startup_data_room_documents
    where startup_org_id = $1::uuid
    order by created_at asc
    `,
    [startupBeta.org_id],
  );
  for (let i = 0; i < betaDocs.rows.length; i += 1) {
    await pool.query(
      `
      insert into public.data_room_document_views (
        id, document_id, viewer_org_id, view_count, total_seconds, last_viewed_at, created_at
      )
      values (
        $1::uuid, $2::uuid, $3::uuid, $4, $5,
        timezone('utc', now()) - interval '10 hours',
        timezone('utc', now()) - interval '2 days'
      )
      `,
      [
        seedId(`doc-view:${betaDocs.rows[i].id}:${investorGamma.org_id}`),
        betaDocs.rows[i].id,
        investorGamma.org_id,
        1 + i,
        90 + i * 45,
      ],
    );
  }

  const warmIntroPending = seedId('warm-intro:startup-alpha:investor-beta:advisor-alpha');
  await pool.query(
    `
    insert into public.warm_intro_requests (
      id, sender_org_id, receiver_org_id, via_advisor_org_id, message, status, response_note, expires_at, created_at, responded_at
    )
    values (
      $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, 'pending', null,
      timezone('utc', now()) + interval '10 days',
      timezone('utc', now()) - interval '10 hours',
      null
    )
    `,
    [
      warmIntroPending,
      startupAlpha.org_id,
      investorBeta.org_id,
      advisorAlpha.org_id,
      'We would appreciate a warm introduction based on advisor fit and climate-tech interest.',
    ],
  );
  await notifyOrg(investorBeta.org_id, {
    seedKey: 'warm-intro-pending-investor-beta',
    type: 'warm_intro_request',
    title: `${startupAlpha.org_name} requested a warm introduction`,
    body: `Advisor: ${advisorAlpha.org_name}. Review the introduction request from Warm Intros.`,
    link: `${ORIGIN}/workspace/discovery`,
    actionId: warmIntroPending,
  });

  const warmIntroAccepted = seedId('warm-intro:advisor-beta:investor-gamma');
  await pool.query(
    `
    insert into public.warm_intro_requests (
      id, sender_org_id, receiver_org_id, via_advisor_org_id, message, status, response_note, expires_at, created_at, responded_at
    )
    values (
      $1::uuid, $2::uuid, $3::uuid, null, $4, 'accepted', $5,
      timezone('utc', now()) + interval '5 days',
      timezone('utc', now()) - interval '4 days',
      timezone('utc', now()) - interval '3 days'
    )
    `,
    [
      warmIntroAccepted,
      advisorBeta.org_id,
      investorGamma.org_id,
      'Open to introducing two fintech operators this month.',
      'Accepted and available for follow-up.',
    ],
  );

  const syndicateId = seedId('syndicate:investor-gamma:startup-beta');
  await pool.query(
    `
    insert into public.syndicates (
      id, lead_org_id, startup_org_id, name, description, target_amount, minimum_check,
      status, visibility, created_at, updated_at
    )
    values (
      $1::uuid, $2::uuid, $3::uuid, $4, $5, $6::bigint, $7::bigint,
      'active'::public.syndicate_status, 'private',
      timezone('utc', now()) - interval '2 days',
      timezone('utc', now()) - interval '4 hours'
    )
    `,
    [
      syndicateId,
      investorGamma.org_id,
      startupBeta.org_id,
      'GreenGrid Co-Invest Syndicate',
      'Small investor group supporting the GreenGrid seed round.',
      '300000',
      '25000',
    ],
  );
  const syndicateMembers = [
    [investorGamma.org_id, '200000', 'confirmed', true],
    [investorBeta.org_id, '50000', 'confirmed', true],
  ];
  for (const [orgId, committedUsd, status, joined] of syndicateMembers) {
    await pool.query(
      `
      insert into public.syndicate_members (
        id, syndicate_id, org_id, committed_usd, status, joined_at, created_at
      )
      values (
        $1::uuid, $2::uuid, $3::uuid, $4::bigint, $5::public.syndicate_member_status,
        $6::timestamptz, timezone('utc', now()) - interval '2 days'
      )
      `,
      [
        seedId(`syndicate-member:${syndicateId}:${orgId}`),
        syndicateId,
        orgId,
        committedUsd,
        status,
        joined ? plusDays(-1) : null,
      ],
    );
  }
  await pool.query(
    `
    insert into public.syndicate_invites (
      id, syndicate_id, invitee_org_id, message, status, expires_at, created_at, responded_at
    )
    values (
      $1::uuid, $2::uuid, $3::uuid, $4, 'pending',
      timezone('utc', now()) + interval '7 days',
      timezone('utc', now()) - interval '5 hours',
      null
    )
    `,
    [
      seedId(`syndicate-invite:${syndicateId}:${investorAlpha.org_id}`),
      syndicateId,
      investorAlpha.org_id,
      'We are opening a small syndicate allocation for GreenGrid. Let us know if you want in.',
    ],
  );
  await notifyOrg(investorAlpha.org_id, {
    seedKey: 'syndicate-invite-investor-alpha',
    type: 'syndicate_invite',
    title: `${investorGamma.org_name} invited you to a syndicate`,
    body: 'Review the invite from the GreenGrid Co-Invest Syndicate.',
    link: `${ORIGIN}/workspace/deal-room/syndicate`,
  });

  console.log('\nSeeded activity summary:\n');
  console.table([
    { area: 'subscriptions', count: subscriptionMatrix.length },
    { area: 'connection_requests', count: 3 },
    { area: 'connections', count: 1 },
    { area: 'deal_rooms', count: 1 },
    { area: 'deal_room_messages', count: 6 },
    { area: 'data_room_requests', count: 2 },
    { area: 'data_room_grants', count: 1 },
    { area: 'warm_intros', count: 2 },
    { area: 'syndicates', count: 1 },
    { area: 'notifications', count: 8 },
  ]);

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
