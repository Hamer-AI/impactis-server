# IMPACTIS PLATFORM — COMPLETE SYSTEM DESIGN v3.0
> Master Reference Document — Updated with Resolved Conflicts
>
> **Decisions Applied:**
> 1. Data Room = Elite tier only, view-only (no download), no exceptions
> 2. Free tier connection limit = 2 per month (monthly cap, resets)
> 3. Backend = NestJS (separate folder/repo) | Frontend = Next.js (separate folder/repo)
> 4. Free tier = permanent limited tier (not a trial)
> 5. Deal Room = both startup AND investor can initiate
>
> Tech Stack: NestJS + Next.js + Prisma + PostgreSQL + Better Auth + Cloudflare R2 + Stripe + Telebirr + M-Pesa + Cloudflare Turnstile (CAPTCHA)

---

## TABLE OF CONTENTS

1. [System Architecture](#1-system-architecture)
2. [Tech Stack & Infrastructure](#2-tech-stack--infrastructure)
3. [Monorepo / Folder Structure](#3-monorepo--folder-structure)
4. [Full Database Schema (Prisma)](#4-full-database-schema-prisma)
5. [Enums & Type Constants](#5-enums--type-constants)
6. [Pricing Tiers — All Segments](#6-pricing-tiers--all-segments)
7. [Capability & Permission Engine](#7-capability--permission-engine)
8. [Interaction Rules Engine](#8-interaction-rules-engine)
9. [Visibility Rules — Who Sees What](#9-visibility-rules--who-sees-what)
10. [Onboarding Flows — All Segments](#10-onboarding-flows--all-segments)
11. [Discovery System](#11-discovery-system)
12. [Deal Room System](#12-deal-room-system)
13. [Data Room System](#13-data-room-system)
14. [Syndicate System](#14-syndicate-system)
15. [AI Matching & Intelligence](#15-ai-matching--intelligence)
16. [Notifications System](#16-notifications-system)
17. [Payments & Billing](#17-payments--billing)
18. [Security & Auth](#18-security--auth)
19. [Admin Dashboard](#19-admin-dashboard)
20. [NestJS API Contract](#20-nestjs-api-contract)
21. [Next.js Frontend Spec](#21-nextjs-frontend-spec)
22. [Anti-Gaming Rules](#22-anti-gaming-rules)
23. [Seeding & Migration Notes](#23-seeding--migration-notes)

---

## 1. SYSTEM ARCHITECTURE

### 1.1 Platform Overview

Impactis is a three-sided marketplace:

| Role | Purpose |
|---|---|
| **Startup** | Raises capital, hires consultants, manages data room |
| **Investor** | Deploys capital, creates syndicates, manages portfolio |
| **Advisor** (Consultant) | Provides expertise, earns platform fees, co-invests (Elite) |

### 1.2 Resolved Design Decisions

| # | Decision | Rule |
|---|---|---|
| 1 | Data Room access | **Elite only** — view-only, no download, no exceptions |
| 2 | Free connection limit | **2 per month** — resets on 1st of each month |
| 3 | Backend | **NestJS** in `/apps/server` — separate from frontend |
| 4 | Free tier | **Permanent** limited tier — never expires |
| 5 | Deal Room initiation | **Both sides** can click "Start Deal Discussion" |

### 1.3 Core Data Flow

```
USER REGISTRATION
  users → profiles → organizations (type: startup|investor|advisor)
  → org_members (role: owner)
  → org_subscriptions (free, permanent)
  → onboarding_progress (step 1 required → score calc)

DISCOVERY → CONNECTION
  Discovery feed browsed
  → User clicks profile card → detail view
  → Sends connection request (gated by monthly limit)
  → success_fee_record created (12-month lock)
  → Target accepts → connections record created
  → connection_messages unlocked (5 for free, unlimited Pro/Elite)

CONNECTION → DEAL ROOM
  Either side clicks "Start Deal Discussion"
  → deal_room_requests created
  → Other side accepts
  → deal_rooms created (stage = interest)
  → Participants invited, roles assigned

DEAL ROOM → DATA ROOM
  Deal advances to due_diligence stage
  → Investor requests data room access
  → data_room_access_requests created
  → Startup approves
  → Investor reads ToS → data_room_consents recorded
  → data_room_access_grants activated (ELITE view-only)
  → Locked button + upgrade prompt shown to non-Elite

DEAL CLOSES
  → deal_rooms.stage → 'closed'
  → success_fee_records updated
  → payment_transactions created
  → Admin notified
  → Notifications sent
```

### 1.4 Tier Philosophy

```
FREE   = Permanent limited access. Can explore but cannot act at scale.
         Exists to convert, not to block entirely.
PRO    = Full operational access. Removes monthly caps. Adds tools.
ELITE  = White-glove + exclusive features.
         Data Room, Syndicates, Account Manager are ELITE-gated hard locks.
```

---

## 2. TECH STACK & INFRASTRUCTURE

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 14+ App Router | `/apps/client` |
| Backend | NestJS 10+ | `/apps/server` |
| ORM | Prisma 5+ | Shared schema, imported by server |
| Database | PostgreSQL | Supabase or self-hosted |
| Auth | Better Auth | Configured in NestJS, JWT to Next.js |
| File Storage | Cloudflare R2 | Presigned URLs served by NestJS |
| CAPTCHA | Cloudflare Turnstile | On register + sensitive forms |
| Payments | Stripe + Telebirr + M-Pesa (Safaricom) | All in NestJS |
| AI | OpenAI GPT-4o + text-embedding-3-large | Match scoring, doc summaries |
| Vector Search | pgvector (migration path) | Start as TEXT, migrate later |
| Email | Resend or Postmark | Triggered from NestJS |
| Telegram | Telegram Bot API | Optional notification channel |
| Background Jobs | Inngest or BullMQ (Redis) | In NestJS |
| Monitoring | Sentry + PostHog | Both apps |
| CDN | Cloudflare | R2 + Turnstile |

### 2.1 Environment Variables

```bash
# Shared
DATABASE_URL=postgresql://...

# NestJS Server (/apps/server/.env)
PORT=3001
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3001
OPENAI_API_KEY=
CLOUDFLARE_R2_ACCOUNT_ID=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET_NAME=
CLOUDFLARE_TURNSTILE_SECRET_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
TELEBIRR_API_KEY=
TELEBIRR_APP_ID=
TELEBIRR_APP_SECRET=
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_SHORTCODE=
TELEGRAM_BOT_TOKEN=
RESEND_API_KEY=
REDIS_URL=                          # For BullMQ jobs

# Next.js Client (/apps/client/.env.local)
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

---

## 3. MONOREPO / FOLDER STRUCTURE

```
impactis/
├── apps/
│   ├── server/                          ← NestJS Backend
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── prisma/
│   │   │   │   ├── prisma.module.ts
│   │   │   │   └── prisma.service.ts
│   │   │   ├── auth/
│   │   │   │   ├── auth.module.ts
│   │   │   │   ├── auth.controller.ts   ← Better Auth handler
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── jwt.guard.ts
│   │   │   │   └── roles.guard.ts
│   │   │   ├── users/
│   │   │   │   ├── users.module.ts
│   │   │   │   ├── users.controller.ts
│   │   │   │   └── users.service.ts
│   │   │   ├── organizations/
│   │   │   │   ├── organizations.module.ts
│   │   │   │   ├── organizations.controller.ts
│   │   │   │   └── organizations.service.ts
│   │   │   ├── onboarding/
│   │   │   │   ├── onboarding.module.ts
│   │   │   │   ├── onboarding.controller.ts
│   │   │   │   └── onboarding.service.ts
│   │   │   ├── discovery/
│   │   │   │   ├── discovery.module.ts
│   │   │   │   ├── discovery.controller.ts
│   │   │   │   └── discovery.service.ts
│   │   │   ├── connections/
│   │   │   │   ├── connections.module.ts
│   │   │   │   ├── connections.controller.ts
│   │   │   │   └── connections.service.ts
│   │   │   ├── deal-rooms/
│   │   │   │   ├── deal-rooms.module.ts
│   │   │   │   ├── deal-rooms.controller.ts
│   │   │   │   └── deal-rooms.service.ts
│   │   │   ├── data-room/
│   │   │   │   ├── data-room.module.ts
│   │   │   │   ├── data-room.controller.ts  ← View-only, Elite only
│   │   │   │   └── data-room.service.ts
│   │   │   ├── syndicates/
│   │   │   │   ├── syndicates.module.ts
│   │   │   │   ├── syndicates.controller.ts  ← Elite only
│   │   │   │   └── syndicates.service.ts
│   │   │   ├── capabilities/
│   │   │   │   ├── capabilities.module.ts
│   │   │   │   └── capabilities.service.ts  ← orgCan() + usage checks
│   │   │   ├── notifications/
│   │   │   │   ├── notifications.module.ts
│   │   │   │   ├── notifications.controller.ts
│   │   │   │   └── notifications.service.ts
│   │   │   ├── billing/
│   │   │   │   ├── billing.module.ts
│   │   │   │   ├── billing.controller.ts
│   │   │   │   ├── billing.service.ts
│   │   │   │   └── webhooks/
│   │   │   │       ├── stripe.webhook.ts
│   │   │   │       ├── telebirr.webhook.ts
│   │   │   │       └── mpesa.webhook.ts
│   │   │   ├── ai/
│   │   │   │   ├── ai.module.ts
│   │   │   │   ├── matching.service.ts
│   │   │   │   ├── embedding.service.ts
│   │   │   │   └── support-bot.service.ts
│   │   │   ├── admin/
│   │   │   │   ├── admin.module.ts
│   │   │   │   ├── admin.controller.ts
│   │   │   │   └── admin.service.ts
│   │   │   └── common/
│   │   │       ├── guards/
│   │   │       │   ├── tier.guard.ts       ← @RequiresTier('elite')
│   │   │       │   └── capability.guard.ts ← @RequiresCapability(...)
│   │   │       ├── decorators/
│   │   │       │   ├── current-org.decorator.ts
│   │   │       │   └── require-tier.decorator.ts
│   │   │       ├── interceptors/
│   │   │       │   └── usage-counter.interceptor.ts
│   │   │       └── pipes/
│   │   │           └── turnstile-validation.pipe.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma            ← Single source of truth
│   │   │   └── seed.ts
│   │   ├── package.json
│   │   └── nest-cli.json
│   │
│   └── client/                          ← Next.js Frontend
│       ├── app/
│       │   ├── (auth)/
│       │   │   ├── login/page.tsx
│       │   │   ├── register/page.tsx
│       │   │   └── verify/page.tsx
│       │   ├── (marketing)/
│       │   │   ├── page.tsx             ← Landing
│       │   │   └── pricing/page.tsx
│       │   ├── (app)/
│       │   │   ├── layout.tsx           ← App shell + sidebar nav
│       │   │   ├── overview/page.tsx
│       │   │   ├── profile/page.tsx
│       │   │   ├── organization/
│       │   │   │   ├── identity/page.tsx
│       │   │   │   └── subscription/page.tsx
│       │   │   ├── discovery/page.tsx
│       │   │   ├── deal-room/
│       │   │   │   └── [id]/page.tsx
│       │   │   ├── data-room/page.tsx
│       │   │   ├── syndicates/
│       │   │   │   └── [id]/page.tsx
│       │   │   ├── notifications/page.tsx
│       │   │   └── settings/
│       │   │       ├── security/page.tsx
│       │   │       ├── appearance/page.tsx
│       │   │       └── notifications/page.tsx
│       │   └── (admin)/
│       │       ├── layout.tsx
│       │       └── dashboard/page.tsx
│       ├── components/
│       │   ├── upgrade-gate.tsx         ← Blur + upgrade CTA
│       │   ├── tier-badge.tsx
│       │   ├── profile-score-ring.tsx
│       │   ├── discovery/
│       │   ├── deal-room/
│       │   ├── data-room/
│       │   └── ui/                      ← shadcn/ui
│       ├── lib/
│       │   ├── api/                     ← Typed API client calling NestJS
│       │   │   ├── client.ts
│       │   │   ├── connections.ts
│       │   │   ├── deal-rooms.ts
│       │   │   └── data-room.ts
│       │   └── constants/
│       │       └── tiers.ts
│       └── package.json
│
├── packages/
│   └── shared/                          ← Shared types (DTOs, enums)
│       ├── src/
│       │   ├── types/
│       │   │   ├── tier.types.ts
│       │   │   ├── org.types.ts
│       │   │   └── deal-room.types.ts
│       │   └── index.ts
│       └── package.json
│
├── package.json                         ← Monorepo root (pnpm workspaces)
└── pnpm-workspace.yaml
```

---

## 4. FULL DATABASE SCHEMA (PRISMA)

> Located at: `/apps/server/prisma/schema.prisma`
> Single source of truth. Consumed only by NestJS server.

```prisma
// =============================================================================
// IMPACTIS — PRISMA SCHEMA v3.0
// Decisions applied:
//   - Data Room: Elite only, view-only enforced at service layer
//   - Free tier: permanent (no expiry)
//   - Deal Room: both sides can initiate
//   - NestJS backend: schema consumed by server only
// =============================================================================

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["partialIndexes"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["public"]
}

// =============================================================================
// §1 — AUTH & SESSION (Better Auth managed)
// =============================================================================

model users {
  id                 String    @id @db.Uuid
  name               String?
  email              String?   @unique
  emailVerified      Boolean?  @default(false) @map("email_verified")
  image              String?
  createdAt          DateTime? @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime? @default(now()) @map("updated_at") @db.Timestamptz(6)
  raw_user_meta_data Json?     @map("raw_user_meta_data")

  accounts           accounts[]
  sessions           sessions[]
  profiles           profiles?
  advisor_profiles   advisor_profiles[]
  investor_profiles  investor_profiles[]
  startup_profiles   startup_profiles[]

  startup_data_room_documents  startup_data_room_documents[]
  startup_data_room_audit_logs startup_data_room_audit_logs[]

  startup_posts_created startup_posts[] @relation("startup_posts_created_byTousers")
  startup_posts_updated startup_posts[] @relation("startup_posts_updated_byTousers")

  org_invites_accepted  org_invites[] @relation("org_invites_accepted_byTousers")
  org_invites_invited   org_invites[] @relation("org_invites_invited_byTousers")
  org_members_invited   org_members[] @relation("org_members_invited_byTousers")
  org_member            org_members?  @relation("org_members_user_idTousers")
  org_status            org_status[]
  org_verifications     org_verifications[]

  notifications              notifications[]
  two_factor_settings        user_two_factor_settings[]
  security_events            user_security_events[]
  user_devices               user_devices[]
  support_tickets            support_tickets[]
  support_messages           support_messages[]
  ai_chat_sessions           ai_chat_sessions[]
  deal_room_messages         deal_room_messages[]
  admin_users                admin_users[]
  appearance_settings        user_appearance_settings?
  notification_preferences   user_notification_preferences?

  @@schema("public")
}

model accounts {
  id                    String    @id
  accountId             String
  providerId            String
  userId                String    @db.Uuid
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime? @db.Timestamptz(6)
  refreshTokenExpiresAt DateTime? @db.Timestamptz(6)
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now()) @db.Timestamptz(6)
  updatedAt             DateTime  @db.Timestamptz(6)
  users                 users     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@schema("public")
}

model sessions {
  id        String   @id
  expiresAt DateTime @db.Timestamptz(6)
  token     String   @unique
  createdAt DateTime @default(now()) @db.Timestamptz(6)
  updatedAt DateTime @db.Timestamptz(6)
  ipAddress String?
  userAgent String?
  userId    String   @db.Uuid
  users     users    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@schema("public")
}

model jwks {
  id        String    @id
  publicKey  String
  privateKey String
  createdAt  DateTime  @db.Timestamptz(6)
  expiresAt  DateTime? @db.Timestamptz(6)

  @@schema("public")
}

model verification {
  id         String   @id
  identifier String
  value      String
  expiresAt  DateTime @db.Timestamptz(6)
  createdAt  DateTime @default(now()) @db.Timestamptz(6)
  updatedAt  DateTime @default(now()) @db.Timestamptz(6)

  @@index([identifier])
  @@schema("public")
}

// =============================================================================
// §2 — USER PROFILES & SETTINGS
// =============================================================================

model profiles {
  id                          String    @id @db.Uuid
  full_name                   String?
  location                    String?
  bio                         String?
  avatar_url                  String?
  avatar_r2_key               String?
  phone                       String?
  headline                    String?
  website_url                 String?
  linkedin_url                String?
  twitter_url                 String?
  crunchbase_url              String?
  angellist_url               String?
  timezone_name               String?
  preferred_contact_method    String?
  profile_completeness_percent Int?    @db.SmallInt
  created_at                  DateTime? @default(now()) @db.Timestamptz(6)
  updated_at                  DateTime? @default(now()) @db.Timestamptz(6)
  users                       users     @relation(fields: [id], references: [id], onDelete: Cascade)

  @@schema("public")
}

model user_appearance_settings {
  user_id           String     @id @db.Uuid
  theme             app_theme  @default(system)
  sidebar_collapsed Boolean    @default(false)
  density           ui_density @default(comfortable)
  language          String     @default("en")
  created_at        DateTime   @default(now()) @db.Timestamptz(6)
  updated_at        DateTime   @default(now()) @db.Timestamptz(6)
  users             users      @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@schema("public")
}

// type_overrides JSON: { "connection_request": { email: true, telegram: false } }
model user_notification_preferences {
  user_id          String   @id @db.Uuid
  in_app_enabled   Boolean  @default(true)
  email_enabled    Boolean  @default(true)
  telegram_enabled Boolean  @default(false)
  telegram_chat_id String?
  type_overrides   Json     @default("{}")
  created_at       DateTime @default(now()) @db.Timestamptz(6)
  updated_at       DateTime @default(now()) @db.Timestamptz(6)
  users            users    @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@schema("public")
}

// =============================================================================
// §3 — ORGANIZATIONS
// =============================================================================

model organizations {
  id                  String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  type                org_type
  name                String
  location            String?
  country             String?
  industry_tags       String[]        @default([])
  logo_url            String?
  logo_r2_key         String?
  website_url         String?
  finance_status      String?
  onboarding_complete Boolean         @default(false)
  // Denormalized — synced on every subscription change
  current_tier        plan_tier_level @default(free)
  created_at          DateTime        @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at          DateTime        @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)

  advisor_profiles   advisor_profiles?
  investor_profiles  investor_profiles?
  startup_profiles   startup_profiles?
  startup_posts      startup_posts?

  startup_data_room_documents  startup_data_room_documents[]
  startup_data_room_audit_logs startup_data_room_audit_logs[]
  startup_data_room_folders    startup_data_room_folders[]

  org_capabilities_overrides org_capabilities_overrides[]
  org_feature_usage_counters org_feature_usage_counters[]
  org_invites                org_invites[]
  org_members                org_members[]
  org_status                 org_status?
  org_subscription_accounts  org_subscription_accounts?
  org_subscriptions          org_subscriptions[]
  org_verifications          org_verifications?

  onboarding_progress         onboarding_progress[]
  investor_onboarding_answers investor_onboarding_answers?
  startup_onboarding_answers  startup_onboarding_answers?
  advisor_onboarding_answers  advisor_onboarding_answers?
  org_profile_scores          org_profile_scores?

  discovery_views_given    discovery_profile_views[] @relation("discovery_views_given")
  discovery_views_received discovery_profile_views[] @relation("discovery_views_received")
  ai_match_scores_from     ai_match_scores[]         @relation("ai_match_from")
  ai_match_scores_to       ai_match_scores[]         @relation("ai_match_to")
  ai_match_feedback_from   ai_match_feedback[]       @relation("ai_match_feedback_from")
  warm_intros_sent         warm_intro_requests[]     @relation("warm_intro_sender")
  warm_intros_received     warm_intro_requests[]     @relation("warm_intro_receiver")
  warm_intros_via          warm_intro_requests[]     @relation("warm_intro_via_advisor")

  connection_requests_from connection_requests[] @relation("connection_requests_from_org")
  connection_requests_to   connection_requests[] @relation("connection_requests_to_org")
  connections_org_a        connections[]         @relation("connections_org_a")
  connections_org_b        connections[]         @relation("connections_org_b")
  connection_messages      connection_messages[]

  // Deal room — BOTH sides can initiate
  deal_room_requests_startup  deal_room_requests[] @relation("deal_room_requests_startup")
  deal_room_requests_investor deal_room_requests[] @relation("deal_room_requests_investor")
  deal_room_participants      deal_room_participants[]

  // Data room — Elite access only (enforced in service layer)
  data_room_access_requests_requester data_room_access_requests[] @relation("dr_access_requester")
  data_room_access_requests_owner     data_room_access_requests[] @relation("dr_access_owner")
  data_room_access_grants             data_room_access_grants[]
  data_room_document_views            data_room_document_views[]
  data_room_consents                  data_room_consents[]

  syndicates_lead   syndicates[]       // Elite only to create
  syndicate_members syndicate_members[]

  payment_transactions payment_transactions[]
  success_fee_records  success_fee_records[]
  support_tickets      support_tickets[]

  @@index([type, created_at(sort: Desc)])
  @@index([type, current_tier])
  @@schema("public")
}

model org_members {
  org_id                String                @db.Uuid
  user_id               String                @unique @db.Uuid
  member_role           org_member_role       @default(member)
  status                org_membership_status @default(active)
  invited_by            String?               @db.Uuid
  joined_at             DateTime              @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  created_at            DateTime              @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  users_invited_by      users?                @relation("org_members_invited_byTousers", fields: [invited_by], references: [id])
  organizations         organizations         @relation(fields: [org_id], references: [id], onDelete: Cascade)
  users                 users                 @relation("org_members_user_idTousers", fields: [user_id], references: [id], onDelete: Cascade)

  @@id([org_id, user_id])
  @@index([org_id, status])
  @@schema("public")
}

model org_invites {
  id                String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  org_id            String            @db.Uuid
  invited_email     String
  member_role       org_member_role   @default(member)
  status            org_invite_status @default(pending)
  invited_by        String            @db.Uuid
  accepted_by       String?           @db.Uuid
  token_hash        String            @unique
  expires_at        DateTime          @db.Timestamptz(6)
  notes             String?
  created_at        DateTime          @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  responded_at      DateTime?         @db.Timestamptz(6)
  users_accepted_by users?            @relation("org_invites_accepted_byTousers", fields: [accepted_by], references: [id])
  users_invited_by  users             @relation("org_invites_invited_byTousers", fields: [invited_by], references: [id], onDelete: Cascade)
  organizations     organizations     @relation(fields: [org_id], references: [id], onDelete: Cascade)

  @@index([org_id, status, created_at(sort: Desc)])
  @@schema("public")
}

model org_status {
  org_id        String               @id @db.Uuid
  status        org_lifecycle_status @default(active)
  updated_by    String?              @db.Uuid
  reason        String?
  created_at    DateTime             @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at    DateTime             @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  organizations organizations        @relation(fields: [org_id], references: [id], onDelete: Cascade)
  users         users?               @relation(fields: [updated_by], references: [id])

  @@schema("public")
}

model org_verifications {
  org_id        String                  @id @db.Uuid
  status        org_verification_status @default(unverified)
  reviewed_by   String?                 @db.Uuid
  reviewed_at   DateTime?               @db.Timestamptz(6)
  notes         String?
  documents     Json                    @default("[]")
  created_at    DateTime                @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at    DateTime                @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  organizations organizations           @relation(fields: [org_id], references: [id], onDelete: Cascade)
  users         users?                  @relation(fields: [reviewed_by], references: [id])

  @@schema("public")
}

// =============================================================================
// §4 — ROLE-SPECIFIC PROFILES
// =============================================================================

model investor_profiles {
  investor_org_id       String        @id @db.Uuid
  profile_type          String?
  website_url           String?
  linkedin_url          String?
  thesis                String?
  stage_focus           String[]      @default([])
  sector_tags           String[]      @default([])
  geographic_regions    String[]      @default([])
  check_size_min_usd    BigInt?
  check_size_max_usd    BigInt?
  investment_approach   String?
  value_add_summary     String?
  deal_breakers         String[]      @default([])
  profile_visibility    String?       @default("public")
  is_actively_investing Boolean       @default(true)
  avg_decision_weeks    Int?
  created_at            DateTime      @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at            DateTime      @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_by            String?       @db.Uuid
  organizations         organizations @relation(fields: [investor_org_id], references: [id], onDelete: Cascade)
  users                 users?        @relation(fields: [updated_by], references: [id])

  @@schema("public")
}

model startup_profiles {
  startup_org_id          String        @id @db.Uuid
  website_url             String?
  company_stage           String?
  founding_year           Int?
  team_size               Int?
  target_market           String?
  business_model          String?
  traction_summary        String?
  financial_summary       String?
  mrr_usd                 Int?
  arr_usd                 Int?
  currently_fundraising   Boolean       @default(false)
  target_raise_usd        BigInt?
  round_type              String?
  pre_money_valuation_usd BigInt?
  elevator_pitch          String?
  problem_statement       String?
  unique_advantage        String?
  primary_industry        String?
  product_status          String?
  pitch_video_url         String?
  pitch_deck_r2_key       String?
  readiness_score         Int?          @db.SmallInt
  updated_at              DateTime      @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_by              String?       @db.Uuid
  created_at              DateTime      @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  organizations           organizations @relation(fields: [startup_org_id], references: [id], onDelete: Cascade)
  users                   users?        @relation(fields: [updated_by], references: [id])

  @@schema("public")
}

model advisor_profiles {
  advisor_org_id         String                @id @db.Uuid
  website_url            String?
  linkedin_url           String?
  bio                    String?
  headline               String?
  expertise_tags         String[]              @default([])
  industry_tags          String[]              @default([])
  years_experience       Int?
  business_type          String?
  current_capacity       String?
  hourly_rate_usd        Int?
  is_open_to_equity      Boolean               @default(false)
  geographic_pref        String[]              @default([])
  stage_pref             String[]              @default([])
  profile_visibility     String?               @default("public")
  response_time_badge    advisor_response_badge @default(none)
  video_intro_url        String?
  total_raised_for_clients BigInt?             @default(0)
  created_at             DateTime              @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at             DateTime              @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_by             String?               @db.Uuid
  organizations          organizations         @relation(fields: [advisor_org_id], references: [id], onDelete: Cascade)
  users                  users?                @relation(fields: [updated_by], references: [id])

  @@schema("public")
}

// =============================================================================
// §5 — ONBOARDING
// =============================================================================

// Score weights:
//   overall = onboarding_score(40) + profile_score(30) + org_score(30)
//   onboarding: step1=16pts(required), steps2-5 each=6pts
//   profile:    full_name=10, avatar=10, bio=10
//   org:        name=6, country=6, logo=6, industry_tags≥1=6, finance_status=6
//   NOTE: verification_score + activity_score = admin analytics only, NOT in overall
model org_profile_scores {
  org_id             String        @id @db.Uuid
  overall_score      Int           @default(0) @db.SmallInt
  onboarding_score   Int           @default(0) @db.SmallInt
  profile_score      Int           @default(0) @db.SmallInt
  org_score          Int           @default(0) @db.SmallInt
  verification_score Int           @default(0) @db.SmallInt
  activity_score     Int           @default(0) @db.SmallInt
  missing_fields     String[]      @default([])
  score_details      Json          @default("{}")
  calculated_at      DateTime      @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  organizations      organizations @relation(fields: [org_id], references: [id], onDelete: Cascade)

  @@schema("public")
}

model onboarding_progress {
  id           String                 @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  org_id       String                 @db.Uuid
  step_key     String
  step_number  Int
  status       onboarding_step_status @default(not_started)
  skipped_at   DateTime?              @db.Timestamptz(6)
  completed_at DateTime?              @db.Timestamptz(6)
  created_at   DateTime               @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at   DateTime               @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  organizations organizations         @relation(fields: [org_id], references: [id], onDelete: Cascade)

  @@unique([org_id, step_key])
  @@index([org_id, step_number])
  @@schema("public")
}

// ── Investor onboarding answers ──────────────────────────────────────────────
model investor_onboarding_answers {
  org_id                      String  @id @db.Uuid
  // Step 1 — Identity (required)
  profile_type                String?  // angel | vc | family_office | corporate | accelerator
  entity_name                 String?
  primary_contact_name        String?
  title_role                  String?
  linkedin_url                String?
  crunchbase_url              String?
  angellist_url               String?
  twitter_url                 String?
  investing_years_band        String?
  total_investments_made_band String?
  notable_exits               String?
  // Step 2 — Capacity
  check_size_band             String?
  check_size_min_usd          BigInt?
  check_size_max_usd          BigInt?
  total_investable_capital_band String?
  new_investments_12mo_band   String?
  investment_structures       String[] @default([])
  round_participation         String?
  follow_on_capacity          String?
  board_seat_expectation      String?
  // Step 3 — Thesis
  stage_preferences           Json     @default("[]")
  startup_maturity_preference String[] @default([])
  industry_preferences        Json     @default("[]")
  industry_expertise_summary  String?
  geographic_regions          String[] @default([])
  specific_cities             String?
  remote_team_openness        String?
  business_model_preferences  String[] @default([])
  revenue_requirement_band    String?
  investment_approach         String?
  investment_thesis_bio       String?
  // Step 4 — Value Add
  value_add_offerings         String[] @default([])
  specific_expertise          String?
  notable_doors               String?
  founder_preferences         Json     @default("[]")
  team_composition_preference String?
  diversity_priority          String?
  due_diligence_timeframe     String?
  deal_flow_volume_preference String?
  pitch_format_preferences    String[] @default([])
  must_haves                  String[] @default([])
  deal_breakers               String[] @default([])
  // Step 5 — Platform preferences
  consultant_engagement       String?
  consultant_services_needed  String[] @default([])
  consultant_budget_band      String?
  activity_level              String?
  response_time_commitment    String?
  quarterly_investment_target String?
  discovery_preference        String?
  profile_visibility          String?
  match_algorithm_weights     Json     @default("[]")
  notification_threshold      String?
  notification_frequency      String?

  created_at    DateTime      @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at    DateTime      @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  organizations organizations @relation(fields: [org_id], references: [id], onDelete: Cascade)

  @@schema("public")
}

// ── Startup onboarding answers ───────────────────────────────────────────────
model startup_onboarding_answers {
  org_id String @id @db.Uuid

  // Step 1 — Company basics (required)
  legal_name                  String?
  trading_name                String?
  company_email               String?
  founded_date                DateTime? @db.Date
  country_of_incorporation    String?
  primary_office_location     String?
  linkedin_company_url        String?
  crunchbase_url              String?
  angellist_url               String?
  twitter_url                 String?
  product_demo_link           String?
  app_store_link              String?
  play_store_link             String?

  // Step 2 — Product & Market
  company_stage_band          String?
  product_status              String?
  time_in_business_band       String?
  problem_statement           String?
  target_customer_description String?
  current_alternatives        String?
  solution_statement          String?
  unique_advantage            String?
  elevator_pitch              String?
  primary_industry            String?
  sub_sector                  String?
  tam_band                    String?
  sam_band                    String?

  // Step 3 — Business Model & Traction
  revenue_model               String?
  pricing_model_description   String?
  avg_monthly_price_usd       Int?
  avg_annual_price_usd        Int?
  target_customer_type        String?
  sales_motion                String?
  ltv_usd                     Int?
  cac_usd                     Int?
  current_revenue_status      String?
  mrr_usd                     Int?
  arr_usd                     Int?
  revenue_growth_rate_mom_pct Int?
  runway_months               Int?
  monthly_burn_usd            Int?
  gross_margin_pct            Int?
  cash_in_bank_usd            Int?
  profitability_status        String?
  total_paying_customers      Int?
  total_users                 Int?
  mau                         Int?
  waitlist_count              Int?
  churn_rate_pct              Int?
  nrr_pct                     Int?
  avg_customer_lifetime_months Int?
  key_traction_highlights     String?

  // Step 4 — Team
  co_founders_count           Int?
  founders_data               Json     @default("[]")
  team_strengths              String?
  diversity_indicators        String[] @default([])
  total_team_size             Int?
  team_breakdown              Json     @default("{}")
  key_hires_in_place          String[] @default([])
  advisors_data               Json     @default("[]")
  advisory_compensation       String?

  // Step 5 — Fundraising
  total_capital_raised_usd    BigInt?
  funding_rounds              Json     @default("[]")
  bootstrapped_status         String?
  notable_investors           String?
  currently_fundraising       Boolean  @default(false)
  fundraising_timeline        String?
  round_type                  String?
  target_raise_usd            BigInt?
  minimum_raise_usd           BigInt?
  committed_so_far_usd        BigInt?
  round_structure             String?
  use_of_funds                String?
  pre_money_valuation_usd     BigInt?
  post_money_valuation_usd    BigInt?
  valuation_cap_usd           BigInt?
  min_check_size_usd          Int?
  max_check_size_usd          Int?
  pro_rata_rights             Boolean?
  board_seat_allocation       String?
  target_close_date           DateTime? @db.Date
  data_room_status            String?
  ideal_investor_types        String[] @default([])
  investor_involvement_pref   String?
  value_add_priorities        Json     @default("[]")
  specific_expertise_needed   String?
  geography_pref_for_investors String?
  investor_deal_breakers      String[] @default([])

  // Step 6 — Media & Preferences
  currently_seeking_consultants Boolean @default(false)
  consultant_needs              Json    @default("[]")
  engagement_model_pref         String?
  consulting_budget_band        String?
  consulting_timeline           String?
  discovery_preference          String?
  profile_visibility            String?
  match_algorithm_weights       Json    @default("[]")
  notification_threshold        String?
  smart_notification_triggers   String[] @default([])
  executive_summary_url         String?
  product_demo_video_url        String?
  video_pitch_url               String?
  one_pager_url                 String?
  ip_types                      String[] @default([])
  tech_stack_summary            String?
  product_roadmap_highlights    String?

  created_at    DateTime      @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at    DateTime      @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  organizations organizations @relation(fields: [org_id], references: [id], onDelete: Cascade)

  @@schema("public")
}

// ── Advisor/Consultant onboarding answers ────────────────────────────────────
model advisor_onboarding_answers {
  org_id String @id @db.Uuid

  // Step 1 — Identity (required)
  professional_title          String?
  business_type               String?
  years_in_consulting_band    String?
  previous_experience_types   String[] @default([])
  legal_structure             String?
  tax_id                      String?
  headline                    String?
  professional_bio            String?

  // Step 2 — Expertise
  primary_expertise_areas     Json     @default("[]")
  specific_skills             String?
  industry_expertise          Json     @default("[]")
  industry_agnostic           Boolean  @default(false)
  service_delivery_models     Json     @default("[]")
  engagement_length_pref      String?
  typical_deliverables        String?
  certifications              String[] @default([])
  consulting_philosophy       String?
  differentiators             String?

  // Step 3 — Track Record
  career_highlights           String[] @default([])
  previous_roles              Json     @default("[]")
  education                   Json     @default("[]")
  total_clients_served        Int?
  client_types                String[] @default([])
  notable_clients             Json     @default("[]")
  revenue_growth_driven_usd   BigInt?
  funding_raised_for_clients  BigInt?
  cost_savings_usd            BigInt?
  client_retention_pct        Int?
  avg_engagement_months       Int?
  published_work              Json     @default("[]")
  speaking_engagements        Json     @default("{}")
  media_mentions              String[] @default([])
  linkedin_followers          Int?
  awards                      String?
  case_studies                Json     @default("[]")
  testimonials                Json     @default("[]")
  professional_references     Json     @default("[]")

  // Step 4 — Client Preferences
  stage_preferences           Json     @default("[]")
  traction_requirement        String?
  funding_status_pref         String?
  team_size_pref              String?
  geographic_pref             String[] @default([])
  work_location_pref          String?
  project_scope_pref          String?
  deal_breakers               String[] @default([])

  // Step 5 — Pricing & Capacity
  budget_min_usd              Int?
  budget_sweet_spot_min       Int?
  budget_sweet_spot_max       Int?
  payment_structure_pref      String[] @default([])
  equity_consideration        String?
  project_urgency             String?
  current_capacity            String?
  hours_per_week_available    Int?
  preferred_working_hours     String?
  rate_card                   Json     @default("[]")
  payment_terms               String?
  cancellation_policy         String?
  standard_agreement          String?

  // Step 6 — Platform Activity
  activity_level              String?
  content_contributions       String[] @default([])
  lead_generation_goal        String?
  target_quarterly_revenue    String?
  investor_collaboration      String?
  investor_services           String[] @default([])
  investor_engagement_model   String?
  notable_investor_relations  String?
  discovery_settings          Json     @default("{}")
  inbound_inquiry_pref        String?
  response_time_commitment    String?
  match_algorithm_weights     Json     @default("[]")
  notification_threshold      String?
  notification_frequency      String?

  created_at    DateTime      @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at    DateTime      @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  organizations organizations @relation(fields: [org_id], references: [id], onDelete: Cascade)

  @@schema("public")
}

// =============================================================================
// §6 — BILLING & SUBSCRIPTIONS
// =============================================================================

model billing_plan_catalog {
  id                String                  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  segment           org_type
  plan_code         String                  // free | pro | elite
  display_name      String
  plan_tier         Int                     // 0=free | 1=pro | 2=elite
  monthly_price_usd Int                     @default(0)
  annual_price_usd  Int                     @default(0)
  success_fee_pct   String?
  platform_fee_pct  String?
  is_default        Boolean                 @default(false)
  is_active         Boolean                 @default(true)
  is_public         Boolean                 @default(true)
  metadata          Json                    @default("{}")
  created_at        DateTime                @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at        DateTime                @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)

  billing_plan_features billing_plan_features[]
  billing_plan_prices   billing_plan_prices[]
  org_subscriptions     org_subscriptions[]
  plan_capabilities     plan_capabilities[]

  @@unique([segment, plan_code])
  @@unique([segment, plan_tier])
  @@index([segment, is_active, is_public, plan_tier])
  @@schema("public")
}

model billing_plan_features {
  id                   String               @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  plan_id              String               @db.Uuid
  feature_key          String
  feature_label        String
  feature_value_text   String?
  limit_value          Int?
  is_unlimited         Boolean              @default(false)
  sort_order           Int                  @default(0)
  metadata             Json                 @default("{}")
  created_at           DateTime             @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at           DateTime             @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  billing_plan_catalog billing_plan_catalog @relation(fields: [plan_id], references: [id], onDelete: Cascade)

  @@unique([plan_id, feature_key])
  @@index([plan_id, sort_order])
  @@schema("public")
}

model billing_plan_prices {
  id               String               @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  plan_id          String               @db.Uuid
  billing_interval billing_interval
  amount_cents     Int
  currency         String               @default("USD")
  stripe_price_id  String?
  telebirr_plan_id String?
  mpesa_plan_id    String?
  created_at       DateTime             @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at       DateTime             @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  billing_plan_catalog billing_plan_catalog @relation(fields: [plan_id], references: [id], onDelete: Cascade)

  @@unique([plan_id, billing_interval])
  @@schema("public")
}

model billing_webhook_events {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  provider     String   @default("stripe")   // stripe | telebirr | mpesa
  event_id     String
  event_type   String
  livemode     Boolean  @default(false)
  payload      Json     @default("{}")
  processed_at DateTime @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  created_at   DateTime @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at   DateTime @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)

  @@unique([provider, event_id])
  @@index([provider, processed_at(sort: Desc)])
  @@schema("public")
}

model capabilities {
  code                       String                       @id
  description                String
  category                   String
  created_at                 DateTime                     @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  org_capabilities_overrides org_capabilities_overrides[]
  plan_capabilities          plan_capabilities[]

  @@unique([category, code])
  @@schema("public")
}

model plan_capabilities {
  plan_id              String               @db.Uuid
  capability_code      String
  is_enabled           Boolean              @default(true)
  created_at           DateTime             @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  capabilities         capabilities         @relation(fields: [capability_code], references: [code], onDelete: Cascade)
  billing_plan_catalog billing_plan_catalog @relation(fields: [plan_id], references: [id], onDelete: Cascade)

  @@id([plan_id, capability_code])
  @@schema("public")
}

model org_capabilities_overrides {
  org_id          String        @db.Uuid
  capability_code String
  is_enabled      Boolean
  source          String        @default("manual")   // manual | promotion
  expires_at      DateTime?     @db.Timestamptz(6)
  created_at      DateTime      @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at      DateTime      @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  capabilities    capabilities  @relation(fields: [capability_code], references: [code], onDelete: Cascade)
  organizations   organizations @relation(fields: [org_id], references: [id], onDelete: Cascade)

  @@id([org_id, capability_code])
  @@schema("public")
}

// Monthly usage counters
// Feature keys tracked:
//   connect_requests_sent | warm_intros_sent | data_room_access_requests
//   deal_room_messages | profile_views_made | proposals_sent
//   investor_applications_sent | consultant_requests_sent
model org_feature_usage_counters {
  id           String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  org_id       String        @db.Uuid
  feature_key  String
  period_start DateTime      @db.Date
  period_end   DateTime      @db.Date
  usage_count  BigInt        @default(0)
  metadata     Json          @default("{}")
  created_at   DateTime      @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at   DateTime      @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  organizations organizations @relation(fields: [org_id], references: [id], onDelete: Cascade)

  @@unique([org_id, feature_key, period_start, period_end])
  @@index([org_id, period_start(sort: Desc)])
  @@schema("public")
}

model org_subscription_accounts {
  org_id                String        @id @db.Uuid
  billing_email         String?
  provider_customer_ref String?
  metadata              Json          @default("{}")
  created_at            DateTime      @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at            DateTime      @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  organizations         organizations @relation(fields: [org_id], references: [id], onDelete: Cascade)

  @@schema("public")
}

// Only ONE active subscription per org at a time (partial unique index)
// FREE tier = permanent, never expires, always exists as a row
model org_subscriptions {
  id                        String                      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  org_id                    String                      @db.Uuid
  plan_id                   String                      @db.Uuid
  status                    billing_subscription_status @default(active)
  billing_interval          billing_interval            @default(monthly)
  started_at                DateTime                    @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  current_period_start      DateTime?                   @db.Timestamptz(6)
  current_period_end        DateTime?                   @db.Timestamptz(6)
  cancel_at_period_end      Boolean                     @default(false)
  canceled_at               DateTime?                   @db.Timestamptz(6)
  source                    String                      @default("auto")  // auto | stripe | telebirr | mpesa | manual
  external_subscription_ref String?
  trial_ends_at             DateTime?                   @db.Timestamptz(6)
  metadata                  Json                        @default("{}")
  created_at                DateTime                    @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at                DateTime                    @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  organizations             organizations               @relation(fields: [org_id], references: [id], onDelete: Cascade)
  billing_plan_catalog      billing_plan_catalog        @relation(fields: [plan_id], references: [id])

  @@unique([org_id], where: "status IN ('trialing','active','past_due','paused')")
  @@index([org_id, created_at(sort: Desc)])
  @@schema("public")
}

// =============================================================================
// §7 — DISCOVERY & AI MATCHING
// =============================================================================

model discovery_profile_views {
  id             String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  viewer_org_id  String            @db.Uuid
  target_org_id  String            @db.Uuid
  view_kind      profile_view_kind @default(discovery)
  view_count     Int               @default(1)
  last_viewed_at DateTime          @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  total_seconds  Int               @default(0)
  created_at     DateTime          @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  viewer_org     organizations     @relation("discovery_views_given", fields: [viewer_org_id], references: [id], onDelete: Cascade)
  target_org     organizations     @relation("discovery_views_received", fields: [target_org_id], references: [id], onDelete: Cascade)

  @@unique([viewer_org_id, target_org_id, view_kind])
  @@index([target_org_id, last_viewed_at(sort: Desc)])
  @@index([viewer_org_id, last_viewed_at(sort: Desc)])
  @@schema("public")
}

model ai_match_scores {
  id                String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  from_org_id       String        @db.Uuid
  to_org_id         String        @db.Uuid
  overall_score     Int           @db.SmallInt
  score_breakdown   Json          @default("{}")
  match_reasons     String[]      @default([])
  disqualified      Boolean       @default(false)
  disqualify_reason String?
  ai_reasoning_text String?       // GPT-4o explanation shown to user
  calculated_at     DateTime      @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  from_org          organizations @relation("ai_match_from", fields: [from_org_id], references: [id], onDelete: Cascade)
  to_org            organizations @relation("ai_match_to", fields: [to_org_id], references: [id], onDelete: Cascade)

  @@unique([from_org_id, to_org_id])
  @@index([from_org_id, overall_score(sort: Desc)])
  @@index([to_org_id, overall_score(sort: Desc)])
  @@schema("public")
}

model ai_match_feedback {
  id            String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  from_org_id   String              @db.Uuid
  target_org_id String              @db.Uuid
  feedback_type match_feedback_type
  decline_reason String?
  created_at    DateTime            @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  from_org      organizations       @relation("ai_match_feedback_from", fields: [from_org_id], references: [id], onDelete: Cascade)

  @@unique([from_org_id, target_org_id])
  @@index([from_org_id, created_at(sort: Desc)])
  @@schema("public")
}

// pgvector migration path: embedding_vector TEXT → vector(1536)
model org_ai_embeddings {
  org_id                      String    @id @db.Uuid
  embedding_text              String?   @db.Text
  embedding_vector            String?   @db.Text   // base64; migrate to vector(1536) with pgvector
  model_used                  String    @default("text-embedding-3-large")
  fundraising_readiness_score Float?
  last_embedded_at            DateTime  @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  created_at                  DateTime  @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)

  @@schema("public")
}

model warm_intro_requests {
  id                 String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  sender_org_id      String            @db.Uuid
  receiver_org_id    String            @db.Uuid
  via_advisor_org_id String?           @db.Uuid
  message            String?
  status             warm_intro_status @default(pending)
  response_note      String?
  created_at         DateTime          @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  responded_at       DateTime?         @db.Timestamptz(6)
  expires_at         DateTime?         @db.Timestamptz(6)
  sender_org         organizations     @relation("warm_intro_sender", fields: [sender_org_id], references: [id], onDelete: Cascade)
  receiver_org       organizations     @relation("warm_intro_receiver", fields: [receiver_org_id], references: [id], onDelete: Cascade)
  via_advisor_org    organizations?    @relation("warm_intro_via_advisor", fields: [via_advisor_org_id], references: [id])

  @@index([sender_org_id, status])
  @@index([receiver_org_id, status, created_at(sort: Desc)])
  @@schema("public")
}

// =============================================================================
// §8 — CONNECTIONS & MESSAGING
// =============================================================================

// Free tier: 2 connection requests per month (tracked in org_feature_usage_counters)
// Accepted connection → success_fee_record created (12-month lock-in)
model connection_requests {
  id           String                    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  from_org_id  String                    @db.Uuid
  to_org_id    String                    @db.Uuid
  status       connection_request_status @default(pending)
  message      String?
  ai_score     Int?                      @db.SmallInt
  created_at   DateTime                  @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  responded_at DateTime?                 @db.Timestamptz(6)
  expires_at   DateTime?                 @db.Timestamptz(6)
  from_org     organizations             @relation("connection_requests_from_org", fields: [from_org_id], references: [id], onDelete: Cascade)
  to_org       organizations             @relation("connection_requests_to_org", fields: [to_org_id], references: [id], onDelete: Cascade)
  success_fee_record success_fee_records?

  @@unique([from_org_id, to_org_id])
  @@index([to_org_id, status])
  @@index([from_org_id, status])
  @@schema("public")
}

model connections {
  id         String                @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  org_a_id   String                @db.Uuid
  org_b_id   String                @db.Uuid
  created_at DateTime              @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  org_a      organizations         @relation("connections_org_a", fields: [org_a_id], references: [id], onDelete: Cascade)
  org_b      organizations         @relation("connections_org_b", fields: [org_b_id], references: [id], onDelete: Cascade)
  messages   connection_messages[]
  deal_room  deal_rooms?

  @@unique([org_a_id, org_b_id])
  @@index([org_a_id])
  @@index([org_b_id])
  @@schema("public")
}

// FREE: max 5 messages per connection | PRO/ELITE: unlimited
model connection_messages {
  id            String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  connection_id String        @db.Uuid
  from_org_id   String        @db.Uuid
  body          String
  is_read       Boolean       @default(false)
  created_at    DateTime      @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  connection    connections   @relation(fields: [connection_id], references: [id], onDelete: Cascade)
  from_org      organizations @relation(fields: [from_org_id], references: [id], onDelete: Cascade)

  @@index([connection_id, created_at(sort: Asc)])
  @@schema("public")
}

// =============================================================================
// §9 — DEAL ROOM
// BOTH SIDES CAN INITIATE — startup or investor clicks "Start Deal Discussion"
// =============================================================================

// Initiator can be startup_org OR investor_org — stored by actual role
model deal_room_requests {
  id              String                   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  startup_org_id  String                   @db.Uuid
  investor_org_id String                   @db.Uuid
  initiated_by    String                   @db.Uuid  // which org_id actually clicked first
  status          deal_room_request_status @default(pending)
  message         String?
  created_at      DateTime                 @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  responded_at    DateTime?                @db.Timestamptz(6)
  startup_org     organizations            @relation("deal_room_requests_startup", fields: [startup_org_id], references: [id], onDelete: Cascade)
  investor_org    organizations            @relation("deal_room_requests_investor", fields: [investor_org_id], references: [id], onDelete: Cascade)

  @@unique([startup_org_id, investor_org_id])
  @@index([startup_org_id, status])
  @@index([investor_org_id, status])
  @@schema("public")
}

// Stages: interest → due_diligence → negotiation → commitment → closing → closed
model deal_rooms {
  id                    String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  connection_id         String          @unique @db.Uuid
  name                  String?
  stage                 deal_room_stage @default(interest)
  description           String?
  investment_amount_usd BigInt?
  equity_offered_pct    Decimal?        @db.Decimal(5, 4)
  valuation_usd         BigInt?
  deal_timeline         String?
  deal_conditions       String?
  target_amount         BigInt?
  committed_total       BigInt?         @default(0)
  terms_accepted        Boolean         @default(false)
  ai_summary            String?         @db.Text
  ai_risk_flags         String?         @db.Text
  ai_last_analyzed_at   DateTime?       @db.Timestamptz(6)
  is_physical_close     Boolean         @default(false)
  closed_at             DateTime?       @db.Timestamptz(6)
  created_at            DateTime        @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at            DateTime        @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)

  connection        connections               @relation(fields: [connection_id], references: [id], onDelete: Cascade)
  participants      deal_room_participants[]
  messages          deal_room_messages[]
  stage_history     deal_room_stage_history[]
  commitments       deal_room_commitments[]
  milestones        deal_room_milestones[]
  agreements        deal_room_agreements[]
  data_room_links   deal_room_data_room_links[]
  syndicates        syndicates[]

  @@index([stage])
  @@schema("public")
}

model deal_room_participants {
  id           String                    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  deal_room_id String                    @db.Uuid
  org_id       String                    @db.Uuid
  role         deal_room_participant_role
  invited_at   DateTime                  @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  accepted_at  DateTime?                 @db.Timestamptz(6)
  left_at      DateTime?                 @db.Timestamptz(6)
  deal_room    deal_rooms                @relation(fields: [deal_room_id], references: [id], onDelete: Cascade)
  organizations organizations            @relation(fields: [org_id], references: [id], onDelete: Cascade)

  @@unique([deal_room_id, org_id])
  @@index([deal_room_id, role])
  @@schema("public")
}

// Slack-like chat with threading + pinning
model deal_room_messages {
  id                String               @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  deal_room_id      String               @db.Uuid
  sender_user_id    String               @db.Uuid
  body              String
  attachment_url    String?
  attachment_name   String?
  attachment_r2_key String?
  reply_to_id       String?              @db.Uuid
  is_pinned         Boolean              @default(false)
  pinned_at         DateTime?            @db.Timestamptz(6)
  is_ai_summary     Boolean              @default(false)
  created_at        DateTime             @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  deal_room         deal_rooms           @relation(fields: [deal_room_id], references: [id], onDelete: Cascade)
  sender            users                @relation(fields: [sender_user_id], references: [id], onDelete: Cascade)
  reply_to          deal_room_messages?  @relation("MessageThread", fields: [reply_to_id], references: [id])
  replies           deal_room_messages[] @relation("MessageThread")

  @@index([deal_room_id, created_at(sort: Asc)])
  @@index([deal_room_id, is_pinned])
  @@schema("public")
}

model deal_room_stage_history {
  id           String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  deal_room_id String           @db.Uuid
  from_stage   deal_room_stage?
  to_stage     deal_room_stage
  changed_by   String?          @db.Uuid
  note         String?
  created_at   DateTime         @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  deal_room    deal_rooms       @relation(fields: [deal_room_id], references: [id], onDelete: Cascade)

  @@index([deal_room_id, created_at(sort: Desc)])
  @@schema("public")
}

model deal_room_commitments {
  id              String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  deal_room_id    String           @db.Uuid
  investor_org_id String           @db.Uuid
  amount_usd      BigInt
  conditions      String?
  notes           String?
  status          commitment_status @default(soft)
  committed_at    DateTime         @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at      DateTime         @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  deal_room       deal_rooms       @relation(fields: [deal_room_id], references: [id], onDelete: Cascade)

  @@index([deal_room_id, status])
  @@schema("public")
}

// AI can generate milestones (ai_generated = true)
model deal_room_milestones {
  id                 String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  deal_room_id       String           @db.Uuid
  title              String
  description        String?
  due_date           DateTime?        @db.Date
  completed_at       DateTime?        @db.Timestamptz(6)
  sort_order         Int              @default(0)
  status             milestone_status @default(pending)
  assigned_to_org_id String?          @db.Uuid
  created_by_org_id  String?          @db.Uuid
  ai_generated       Boolean          @default(false)
  created_at         DateTime         @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at         DateTime         @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  deal_room          deal_rooms       @relation(fields: [deal_room_id], references: [id], onDelete: Cascade)

  @@index([deal_room_id, sort_order])
  @@index([deal_room_id, status])
  @@schema("public")
}

// Standard template (nda | term_sheet | sha | custom)
// Admin is notified when status → 'signed'
model deal_room_agreements {
  id                String                     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  deal_room_id      String                     @db.Uuid
  title             String
  template_key      String?
  content_text      String?
  file_url          String?
  file_r2_key       String?
  status            deal_room_agreement_status @default(draft)
  signed_by         Json                       @default("[]")
  admin_notified_at DateTime?                  @db.Timestamptz(6)
  created_at        DateTime                   @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at        DateTime                   @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  deal_room         deal_rooms                 @relation(fields: [deal_room_id], references: [id], onDelete: Cascade)

  @@index([deal_room_id, status])
  @@schema("public")
}

model deal_room_data_room_links {
  id                String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  deal_room_id      String     @db.Uuid
  startup_org_id    String     @db.Uuid
  terms_accepted_at DateTime?  @db.Timestamptz(6)
  terms_accepted_ip String?
  created_at        DateTime   @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  deal_room         deal_rooms @relation(fields: [deal_room_id], references: [id], onDelete: Cascade)

  @@unique([deal_room_id, startup_org_id])
  @@schema("public")
}

// =============================================================================
// §10 — DATA ROOM
// ELITE ONLY — view-only, no download, enforced at service + guard level
// =============================================================================

model startup_data_room_folders {
  id             String                        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  startup_org_id String                        @db.Uuid
  name           String
  parent_id      String?                       @db.Uuid
  sort_order     Int                           @default(0)
  created_at     DateTime                      @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at     DateTime                      @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  organizations  organizations                 @relation(fields: [startup_org_id], references: [id], onDelete: Cascade)
  parent         startup_data_room_folders?    @relation("folder_children", fields: [parent_id], references: [id])
  children       startup_data_room_folders[]   @relation("folder_children")
  documents      startup_data_room_documents[]

  @@index([startup_org_id, parent_id])
  @@schema("public")
}

// download_enabled = ALWAYS false (view-only rule)
// watermark_enabled = ALWAYS true
model startup_data_room_documents {
  id                  String                          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  startup_org_id      String                          @db.Uuid
  folder_id           String?                         @db.Uuid
  folder_path         String?
  document_type       startup_data_room_document_type
  title               String
  file_url            String?
  storage_bucket      String?
  storage_object_path String?
  r2_key              String?
  file_name           String?
  file_size_bytes     BigInt?
  content_type        String?
  summary             String?
  ai_summary          String?    // GPT-4o document summary
  is_confidential     Boolean    @default(true)
  watermark_enabled   Boolean    @default(true)   // always true — rule enforced in service
  download_enabled    Boolean    @default(false)  // always false — Elite view-only rule
  shareable_token     String?    @unique
  share_token_expires DateTime?  @db.Timestamptz(6)
  uploaded_by         String?    @db.Uuid
  created_at          DateTime   @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at          DateTime   @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  organizations       organizations                   @relation(fields: [startup_org_id], references: [id], onDelete: Cascade)
  users               users?                          @relation(fields: [uploaded_by], references: [id])
  folder              startup_data_room_folders?      @relation(fields: [folder_id], references: [id])
  document_views      data_room_document_views[]

  @@index([startup_org_id, updated_at(sort: Desc)])
  @@schema("public")
}

model startup_data_room_audit_logs {
  id                  String                           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  startup_org_id      String                           @db.Uuid
  action              String                           // upload | view | delete | share | revoke_access
  folder_path         String?
  document_id         String?                          @db.Uuid
  document_type       startup_data_room_document_type?
  title               String?
  file_name           String?
  file_size_bytes     BigInt?
  actor_user_id       String?                          @db.Uuid
  metadata            Json                             @default("{}")
  created_at          DateTime                         @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  organizations       organizations                    @relation(fields: [startup_org_id], references: [id], onDelete: Cascade)
  users               users?                           @relation(fields: [actor_user_id], references: [id])

  @@index([startup_org_id, created_at(sort: Desc)])
  @@schema("public")
}

// Access flow: request → consent → grant (all Elite only)
model data_room_access_requests {
  id               String                  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  startup_org_id   String                  @db.Uuid
  requester_org_id String                  @db.Uuid
  message          String?
  status           data_room_access_status @default(pending)
  reviewed_at      DateTime?               @db.Timestamptz(6)
  review_note      String?
  created_at       DateTime                @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  startup_org      organizations           @relation("dr_access_owner", fields: [startup_org_id], references: [id], onDelete: Cascade)
  requester_org    organizations           @relation("dr_access_requester", fields: [requester_org_id], references: [id], onDelete: Cascade)

  @@unique([startup_org_id, requester_org_id])
  @@index([startup_org_id, status])
  @@schema("public")
}

// Grant activated ONLY after data_room_consents row exists
// permission_level = view ONLY (download never granted — Elite view-only rule)
model data_room_access_grants {
  id               String                     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  startup_org_id   String                     @db.Uuid
  grantee_org_id   String                     @db.Uuid
  permission_level data_room_permission_level @default(view)  // always 'view', download blocked
  terms_accepted_at DateTime?                 @db.Timestamptz(6)
  granted_at       DateTime                   @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  revoked_at       DateTime?                  @db.Timestamptz(6)
  expires_at       DateTime?                  @db.Timestamptz(6)
  organizations    organizations              @relation(fields: [startup_org_id], references: [id], onDelete: Cascade)

  @@unique([startup_org_id, grantee_org_id])
  @@index([grantee_org_id, revoked_at])
  @@schema("public")
}

// ToS consent recorded before grant activates
// security_event logged: data_room_consent
model data_room_consents {
  id             String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  startup_org_id String        @db.Uuid
  grantee_org_id String        @db.Uuid
  ip_address     String?
  user_agent     String?
  consented_at   DateTime      @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  organizations  organizations @relation(fields: [startup_org_id], references: [id], onDelete: Cascade)

  @@unique([startup_org_id, grantee_org_id])
  @@index([startup_org_id])
  @@schema("public")
}

// DocSend-style page analytics — who viewed what for how long
model data_room_document_views {
  id               String                      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  document_id      String                      @db.Uuid
  viewer_org_id    String                      @db.Uuid
  view_count       Int                         @default(1)
  total_seconds    Int                         @default(0)
  most_viewed_page Int?
  last_viewed_at   DateTime                    @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  created_at       DateTime                    @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  document         startup_data_room_documents @relation(fields: [document_id], references: [id], onDelete: Cascade)
  viewer_org       organizations               @relation(fields: [viewer_org_id], references: [id], onDelete: Cascade)

  @@unique([document_id, viewer_org_id])
  @@index([document_id, last_viewed_at(sort: Desc)])
  @@schema("public")
}

// =============================================================================
// §11 — SYNDICATES (ELITE ONLY)
// =============================================================================

model syndicates {
  id              String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  lead_org_id     String           @db.Uuid
  startup_org_id  String?          @db.Uuid
  deal_room_id    String?          @db.Uuid
  name            String
  description     String?
  target_amount   BigInt?
  minimum_check   BigInt?
  total_committed BigInt           @default(0)
  status          syndicate_status @default(forming)
  visibility      String           @default("private")
  is_featured     Boolean          @default(false)
  closed_at       DateTime?        @db.Timestamptz(6)
  created_at      DateTime         @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at      DateTime         @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  lead_org        organizations    @relation(fields: [lead_org_id], references: [id], onDelete: Cascade)
  deal_room       deal_rooms?      @relation(fields: [deal_room_id], references: [id])
  members         syndicate_members[]
  invites         syndicate_invites[]

  @@index([lead_org_id, status])
  @@schema("public")
}

model syndicate_members {
  id            String                  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  syndicate_id  String                  @db.Uuid
  org_id        String                  @db.Uuid
  committed_usd BigInt?
  status        syndicate_member_status @default(invited)
  joined_at     DateTime?               @db.Timestamptz(6)
  created_at    DateTime                @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  syndicate     syndicates              @relation(fields: [syndicate_id], references: [id], onDelete: Cascade)
  organizations organizations           @relation(fields: [org_id], references: [id], onDelete: Cascade)

  @@unique([syndicate_id, org_id])
  @@index([org_id, status])
  @@schema("public")
}

model syndicate_invites {
  id             String                  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  syndicate_id   String                  @db.Uuid
  invitee_org_id String                  @db.Uuid
  message        String?
  status         syndicate_invite_status @default(pending)
  expires_at     DateTime?               @db.Timestamptz(6)
  created_at     DateTime                @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  responded_at   DateTime?               @db.Timestamptz(6)
  syndicate      syndicates              @relation(fields: [syndicate_id], references: [id], onDelete: Cascade)

  @@unique([syndicate_id, invitee_org_id])
  @@index([invitee_org_id, status])
  @@schema("public")
}

// =============================================================================
// §12 — PAYMENTS & SUCCESS FEES
// =============================================================================

model payment_transactions {
  id                  String                     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  org_id              String                     @db.Uuid
  transaction_type    String                     // subscription | success_fee | refund
  amount_cents        BigInt
  currency            String                     @default("USD")
  status              payment_transaction_status @default(pending)
  provider            String                     @default("stripe")  // stripe | telebirr | mpesa
  provider_payment_id String?
  provider_invoice_id String?
  telebirr_ref        String?
  mpesa_ref           String?
  description         String?
  metadata            Json                       @default("{}")
  failed_reason       String?
  created_at          DateTime                   @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at          DateTime                   @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  organizations       organizations              @relation(fields: [org_id], references: [id], onDelete: Cascade)

  @@index([org_id, created_at(sort: Desc)])
  @@schema("public")
}

// Created on EVERY connection_request — 12-month fee lock-in
model success_fee_records {
  id                    String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  payer_org_id          String              @db.Uuid
  deal_room_id          String?             @db.Uuid
  connection_request_id String?             @db.Uuid @unique
  intro_date            DateTime            @db.Date
  fee_trigger           String              // capital_raised | consulting_contract | syndicate_carry
  gross_amount_usd      BigInt
  fee_rate_pct_x100     Int                 // rate × 100 (e.g. 350 = 3.5%)
  fee_amount_usd        BigInt
  fee_cap_usd           BigInt?
  status                String              @default("pending")  // pending | invoiced | paid | waived
  due_date              DateTime?           @db.Date
  paid_at               DateTime?           @db.Timestamptz(6)
  notes                 String?
  metadata              Json                @default("{}")
  created_at            DateTime            @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at            DateTime            @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  organizations         organizations       @relation(fields: [payer_org_id], references: [id], onDelete: Cascade)
  connection_request    connection_requests? @relation(fields: [connection_request_id], references: [id])

  @@index([payer_org_id, status])
  @@schema("public")
}

// =============================================================================
// §13 — NOTIFICATIONS
// =============================================================================

model notifications {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id       String    @db.Uuid
  type          String    // see notification type map in §16
  title         String
  body          String?
  link          String?
  action_id     String?
  read_at       DateTime? @db.Timestamptz(6)
  email_sent    Boolean   @default(false)
  telegram_sent Boolean   @default(false)
  created_at    DateTime  @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  users         users     @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@index([user_id, read_at])
  @@index([user_id, created_at(sort: Desc)])
  @@schema("public")
}

// =============================================================================
// §14 — SECURITY
// =============================================================================

model user_two_factor_settings {
  id           String                 @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id      String                 @db.Uuid
  method       user_two_factor_method
  is_enabled   Boolean                @default(false)
  secret_hash  String?
  phone_number String?
  backup_codes String[]               @default([])
  verified_at  DateTime?              @db.Timestamptz(6)
  created_at   DateTime               @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at   DateTime               @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  users        users                  @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@unique([user_id, method])
  @@schema("public")
}

model user_security_events {
  id         String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id    String              @db.Uuid
  event_type security_event_type
  ip_address String?
  user_agent String?
  country    String?
  city       String?
  device_id  String?             @db.Uuid
  metadata   Json                @default("{}")
  created_at DateTime            @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  users      users               @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@index([user_id, created_at(sort: Desc)])
  @@schema("public")
}

model user_devices {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id       String    @db.Uuid
  device_name   String?
  device_type   String?
  user_agent    String?
  ip_address    String?
  country       String?
  is_trusted    Boolean   @default(false)
  session_token String?
  last_seen_at  DateTime  @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  created_at    DateTime  @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  revoked_at    DateTime? @db.Timestamptz(6)
  users         users     @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@index([user_id, last_seen_at(sort: Desc)])
  @@schema("public")
}

// =============================================================================
// §15 — SUPPORT & AI CHAT
// =============================================================================

model support_tickets {
  id              String                  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  org_id          String?                 @db.Uuid
  user_id         String                  @db.Uuid
  subject         String
  category        String?
  status          support_ticket_status   @default(open)
  priority        support_ticket_priority @default(medium)
  assigned_to     String?
  ai_resolved     Boolean                 @default(false)
  resolution_note String?
  created_at      DateTime                @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at      DateTime                @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  resolved_at     DateTime?               @db.Timestamptz(6)
  users           users                   @relation(fields: [user_id], references: [id], onDelete: Cascade)
  organizations   organizations?          @relation(fields: [org_id], references: [id])
  messages        support_messages[]

  @@index([status, priority, created_at(sort: Desc)])
  @@schema("public")
}

model support_messages {
  id         String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ticket_id  String          @db.Uuid
  sender_id  String          @db.Uuid
  is_staff   Boolean         @default(false)
  is_ai      Boolean         @default(false)
  body       String
  created_at DateTime        @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  ticket     support_tickets @relation(fields: [ticket_id], references: [id], onDelete: Cascade)
  users      users           @relation(fields: [sender_id], references: [id], onDelete: Cascade)

  @@index([ticket_id, created_at(sort: Asc)])
  @@schema("public")
}

model ai_chat_sessions {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id      String    @db.Uuid
  context      String?   // help | deal_room | data_room | matching
  messages     Json      @default("[]")
  escalated    Boolean   @default(false)
  escalated_at DateTime? @db.Timestamptz(6)
  ticket_id    String?   @db.Uuid
  created_at   DateTime  @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at   DateTime  @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  users        users     @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@index([user_id, created_at(sort: Desc)])
  @@schema("public")
}

// =============================================================================
// §16 — ADMIN
// =============================================================================

model admin_users {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id    String    @db.Uuid
  role       String    @default("support")  // super_admin | admin | support | analyst
  is_active  Boolean   @default(true)
  granted_at DateTime  @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  revoked_at DateTime? @db.Timestamptz(6)
  users      users     @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@unique([user_id])
  @@schema("public")
}

model admin_audit_logs {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  admin_id    String   @db.Uuid
  action      String
  target_type String?
  target_id   String?
  payload     Json     @default("{}")
  ip_address  String?
  created_at  DateTime @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)

  @@index([admin_id, created_at(sort: Desc)])
  @@index([target_type, target_id, created_at(sort: Desc)])
  @@schema("public")
}

// =============================================================================
// §17 — DISCOVERY FEED (STARTUP POSTS)
// =============================================================================

model startup_posts {
  id             String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  startup_org_id String              @unique @db.Uuid
  title          String
  summary        String
  stage          String?
  location       String?
  industry_tags  String[]            @default([])
  status         startup_post_status @default(draft)
  published_at   DateTime?           @db.Timestamptz(6)
  need_advisor   Boolean             @default(false)
  created_by     String?             @db.Uuid
  updated_by     String?             @db.Uuid
  created_at     DateTime            @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  updated_at     DateTime            @default(dbgenerated("timezone('utc'::text, now())")) @db.Timestamptz(6)
  users_created  users?              @relation("startup_posts_created_byTousers", fields: [created_by], references: [id])
  organizations  organizations       @relation(fields: [startup_org_id], references: [id], onDelete: Cascade)
  users_updated  users?              @relation("startup_posts_updated_byTousers", fields: [updated_by], references: [id])

  @@index([industry_tags], type: Gin)
  @@index([status, published_at(sort: Desc)])
  @@index([need_advisor, status], where: "need_advisor = true AND status = 'published'")
  @@schema("public")
}

// =============================================================================
// ENUMS
// =============================================================================

enum billing_interval         { monthly; annual;   @@schema("public") }
enum billing_subscription_status { trialing; active; past_due; paused; canceled; incomplete; @@schema("public") }
enum org_invite_status        { pending; accepted; expired; cancelled; revoked; @@schema("public") }
enum org_lifecycle_status     { active; suspended; deleted; @@schema("public") }
enum org_member_role          { owner; admin; member; @@schema("public") }
enum org_membership_status    { pending; active; left; removed; expired; cancelled; @@schema("public") }
enum org_type                 { startup; investor; advisor; @@schema("public") }
enum org_verification_status  { unverified; pending; approved; rejected; @@schema("public") }
enum startup_post_status      { draft; published; @@schema("public") }
enum connection_request_status { pending; accepted; rejected; @@schema("public") }
enum onboarding_step_status   { not_started; in_progress; completed; skipped; @@schema("public") }
enum deal_room_stage          { interest; due_diligence; negotiation; commitment; closing; closed; @@schema("public") }
enum deal_room_participant_role { startup_founder; lead_investor; co_investor; advisor; observer; @@schema("public") }
enum deal_room_agreement_status { draft; review; signed; executed; @@schema("public") }
enum deal_room_request_status  { pending; accepted; declined; expired; @@schema("public") }
enum data_room_access_status  { pending; approved; rejected; revoked; @@schema("public") }
enum data_room_permission_level { view; @@schema("public") } // download removed — view-only rule
enum syndicate_status         { forming; active; closed; cancelled; @@schema("public") }
enum syndicate_member_status  { invited; confirmed; declined; withdrew; @@schema("public") }
enum syndicate_invite_status  { pending; accepted; declined; expired; @@schema("public") }
enum support_ticket_status    { open; in_progress; resolved; closed; @@schema("public") }
enum support_ticket_priority  { low; medium; high; urgent; @@schema("public") }
enum payment_transaction_status { pending; processing; completed; failed; refunded; disputed; @@schema("public") }
enum match_feedback_type      { interested; not_interested; saved; passed; @@schema("public") }
enum profile_view_kind        { discovery; detail; data_room; @@schema("public") }
enum user_two_factor_method   { totp; sms; email; @@schema("public") }
enum security_event_type      { login; logout; password_change; two_factor_enabled; two_factor_disabled; suspicious_activity; data_room_consent; deal_room_entry; device_revoked; @@schema("public") }
enum app_theme                { light; dark; system; @@schema("public") }
enum ui_density               { comfortable; compact; @@schema("public") }
enum plan_tier_level          { free; pro; elite; @@schema("public") }
enum warm_intro_status        { pending; accepted; declined; expired; @@schema("public") }
enum commitment_status        { soft; confirmed; withdrawn; @@schema("public") }
enum milestone_status         { pending; in_progress; completed; blocked; @@schema("public") }
enum advisor_response_badge   { none; within_48h; within_24h; @@schema("public") }

enum startup_data_room_document_type {
  pitch_deck; financial_model; cap_table; traction_metrics;
  legal_company_docs; incorporation_docs; customer_contracts_summaries;
  term_sheet_drafts; financial_doc; legal_doc; executive_summary;
  product_roadmap; market_research; team_bios; nda_template; other;
  @@schema("public")
}
```

---

## 5. ENUMS & TYPE CONSTANTS

```ts
// packages/shared/src/types/tier.types.ts

export const PLAN_TIERS = { free: 0, pro: 1, elite: 2 } as const
export type PlanTierLevel = 'free' | 'pro' | 'elite'
export type OrgType = 'startup' | 'investor' | 'advisor'

// ── Startup pricing ──────────────────────────────────────────────────────────
export const STARTUP_PRICING = {
  free:  { monthly: 0,   annual: 0     },
  pro:   { monthly: 249, annual: 2490  },
  elite: { monthly: 799, annual: 7990  },
}

// ── Investor pricing (annual only) ──────────────────────────────────────────
export const INVESTOR_PRICING = {
  free:  { annual: 0      },
  pro:   { annual: 2500   },
  elite: { annual: 12000  },
}

// ── Consultant/Advisor pricing ───────────────────────────────────────────────
export const CONSULTANT_PRICING = {
  free:  { monthly: 0,   annual: 0     },
  pro:   { monthly: 299, annual: 2990  },
  elite: { monthly: 599, annual: 5990  },
}

// ── Success fee rates: startup pays on capital raised ───────────────────────
export const STARTUP_SUCCESS_FEE_CAP_USD = 50_000 // per round, all tiers

export const STARTUP_SUCCESS_FEE = {
  free:  [
    { band: 'Up to $200K', rate: 5.0 }, { band: '$200K–$1M', rate: 4.5 },
    { band: '$1M–$5M', rate: 4.0 }, { band: '$5M–$10M', rate: 3.0 }, { band: '$10M+', rate: 2.5 },
  ],
  pro:   [
    { band: 'Up to $200K', rate: 4.0 }, { band: '$200K–$1M', rate: 3.5 },
    { band: '$1M–$5M', rate: 3.0 }, { band: '$5M–$10M', rate: 2.5 }, { band: '$10M+', rate: 2.0 },
  ],
  elite: [
    { band: 'Up to $200K', rate: 3.0 }, { band: '$200K–$1M', rate: 2.5 },
    { band: '$1M–$5M', rate: 2.0 }, { band: '$5M–$10M', rate: 1.5 }, { band: '$10M+', rate: 1.0 },
  ],
}

// ── Consultant platform fee on contracts ─────────────────────────────────────
export const CONSULTANT_PLATFORM_FEE = {
  free:  [{ band: '≤$20K', rate: 20 }, { band: '$20K–$100K', rate: 20 }, { band: '$100K–$500K', rate: 18 }, { band: '$500K+', rate: 15 }],
  pro:   [{ band: '≤$20K', rate: 12 }, { band: '$20K–$100K', rate: 12 }, { band: '$100K–$500K', rate: 10 }, { band: '$500K+', rate: 8  }],
  elite: [{ band: '≤$20K', rate: 8  }, { band: '$20K–$100K', rate: 8  }, { band: '$100K–$500K', rate: 6  }, { band: '$500K+', rate: 5  }],
}

export const CONSULTANT_SUCCESS_FEE_SHARE = { free: 15, pro: 10, elite: 8 }
export const INVESTOR_SYNDICATE_CARRY     = { free: 3,  pro: 2,  elite: 1 }

// ── Monthly limits (resets on 1st of month) ──────────────────────────────────
export const MONTHLY_LIMITS = {
  connect_requests_sent:       { free: 2, pro: Infinity, elite: Infinity },
  warm_intros_sent:            { startup_free: 0, startup_pro: 5, startup_elite: Infinity },
  consultant_requests_sent:    { startup_free: 1, startup_pro: 5, startup_elite: Infinity },
  investor_applications_sent:  { startup_free: 2, startup_pro: Infinity, startup_elite: Infinity },
  proposals_sent:              { advisor_free: 2, advisor_pro: 10, advisor_elite: Infinity },
  profile_views_made:          { investor_free: 10, investor_pro: Infinity, investor_elite: Infinity },
  connection_messages_per_conn: { free: 5, pro: Infinity, elite: Infinity },
}
```

---

## 6. PRICING TIERS — ALL SEGMENTS

### 6.1 Startup Tiers

| Feature | FREE | PRO ($249/mo) | ELITE ($799/mo) |
|---|---|---|---|
| Profile visibility | Basic | Featured | Top + gold badge |
| Connect requests/month | **2** | Unlimited | Unlimited |
| Messages per connection | 5 max | Unlimited | Unlimited |
| Warm investor intros/month | 0 | 5 | Unlimited |
| AI match recommendations | ✗ | Weekly | Daily + priority |
| Direct investor messaging | ✗ | ✓ | ✓ |
| Data Room access | ✗ — **locked** | ✗ — **locked** | ✓ View-only |
| Syndicate creation | ✗ — **locked** | ✗ — **locked** | ✓ |
| Consultant requests/month | 1 | 5 | Unlimited |
| Fundraising CRM | ✗ | ✓ | ✓ |
| Data room storage | 5 docs | Unlimited | Unlimited + white-label |
| Dedicated account manager | ✗ | ✗ | ✓ |
| Support SLA | 72h | 24h | 4h |

> **Data Room note:** The "Data Room" button in deal rooms is always visible but locked with an upgrade CTA for Free and Pro users. Only Elite users can click through.

### 6.2 Investor Tiers

| Feature | FREE | PRO ($2,500/yr) | ELITE ($12,000/yr) |
|---|---|---|---|
| Connect requests/month | **2** | Unlimited | Unlimited |
| Full profile views/month | 10 | Unlimited | Unlimited |
| AI deal matching | ✗ | ✓ | ✓ + human curation |
| Early deal access | ✗ | 24h | 48h exclusive |
| **Data Room access** | ✗ — **locked** | ✗ — **locked** | ✓ View-only |
| **Syndicate creation** | ✗ — **locked** | ✗ — **locked** (Pro: max 10) | ✓ Unlimited |
| Portfolio dashboard | ✗ | Basic | Advanced |
| Consultant discount | 0% | 10% | 20% |
| Account manager | ✗ | ✗ | ✓ |

### 6.3 Consultant Tiers

| Feature | FREE | PRO ($299/mo) | ELITE ($599/mo) |
|---|---|---|---|
| Proposals/month | 2 | 10 | Unlimited |
| Connect requests/month | **2** | Unlimited | Unlimited |
| **Data Room access** | ✗ — **locked** | ✗ — **locked** | ✓ View-only (if engaged) |
| Escrow protection | ✗ | ✓ | ✓ |
| Client CRM | ✗ | ✓ | ✓ Advanced |
| Co-investment | ✗ | ✗ | ✓ |
| Team management | ✗ | ✗ | ✓ |
| Account manager | ✗ | ✗ | ✓ |

---

## 7. CAPABILITY & PERMISSION ENGINE

### 7.1 NestJS Guards

```ts
// apps/server/src/common/guards/tier.guard.ts

import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PLAN_TIERS } from '@impactis/shared'

@Injectable()
export class TierGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredTier = this.reflector.get<string>('requiredTier', context.getHandler())
    if (!requiredTier) return true

    const request = context.switchToHttp().getRequest()
    const orgTier = request.currentOrg?.current_tier ?? 'free'

    if (PLAN_TIERS[orgTier] < PLAN_TIERS[requiredTier]) {
      throw new ForbiddenException({
        code: 'UPGRADE_REQUIRED',
        requiredTier,
        currentTier: orgTier,
        message: `This feature requires ${requiredTier} tier or above.`,
      })
    }
    return true
  }
}

// Decorator
export const RequiresTier = (tier: 'pro' | 'elite') =>
  SetMetadata('requiredTier', tier)
```

```ts
// Usage in controller
@Get('data-room/:orgId')
@RequiresTier('elite')          // ← hard lock — 403 for Free and Pro
@UseGuards(JwtGuard, TierGuard)
async getDataRoom(@Param('orgId') orgId: string) { ... }

@Post('syndicates')
@RequiresTier('elite')          // ← Elite only
@UseGuards(JwtGuard, TierGuard)
async createSyndicate(@Body() dto: CreateSyndicateDto) { ... }
```

### 7.2 Capability Service

```ts
// apps/server/src/capabilities/capabilities.service.ts

@Injectable()
export class CapabilitiesService {
  constructor(private prisma: PrismaService) {}

  async orgCan(orgId: string, capabilityCode: string): Promise<boolean> {
    // 1. Admin override (check first — highest priority)
    const override = await this.prisma.org_capabilities_overrides.findUnique({
      where: { org_id_capability_code: { org_id: orgId, capability_code: capabilityCode } },
    })
    if (override) {
      if (override.expires_at && override.expires_at < new Date()) return false
      return override.is_enabled
    }

    // 2. Plan capability
    const org = await this.prisma.organizations.findUnique({
      where: { id: orgId }, select: { current_tier: true },
    })
    const plan = await this.prisma.billing_plan_catalog.findFirst({
      where: { plan_code: org.current_tier, is_active: true },
      include: { plan_capabilities: { where: { capability_code: capabilityCode } } },
    })
    return plan?.plan_capabilities?.[0]?.is_enabled ?? false
  }

  async checkMonthlyLimit(
    orgId: string, featureKey: string, limit: number
  ): Promise<{ allowed: boolean; current: number; limit: number }> {
    const now = new Date()
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const periodEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    const counter = await this.prisma.org_feature_usage_counters.findUnique({
      where: { org_id_feature_key_period_start_period_end: { org_id: orgId, feature_key: featureKey, period_start: periodStart, period_end: periodEnd } },
    })
    const current = Number(counter?.usage_count ?? 0)
    return { allowed: limit === Infinity || current < limit, current, limit }
  }

  async incrementUsage(orgId: string, featureKey: string): Promise<void> {
    const now = new Date()
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const periodEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    await this.prisma.org_feature_usage_counters.upsert({
      where: { org_id_feature_key_period_start_period_end: { org_id: orgId, feature_key: featureKey, period_start: periodStart, period_end: periodEnd } },
      update: { usage_count: { increment: 1 } },
      create: { org_id: orgId, feature_key: featureKey, period_start: periodStart, period_end: periodEnd, usage_count: 1 },
    })
  }
}
```

---

## 8. INTERACTION RULES ENGINE

### 8.1 Discovery — Who Sees Who

```
Startup  → sees: investors + advisors  (NOT other startups)
Investor → sees: startups + advisors   (NOT other investors)
Advisor  → sees: startups + investors  (NOT other advisors)
```

```ts
// apps/server/src/discovery/discovery.service.ts

async getDiscoveryFeed(viewerOrgId: string, viewerType: OrgType, filters: DiscoveryFiltersDto) {
  const targetTypes: OrgType[] = viewerType === 'startup'
    ? ['investor', 'advisor']
    : viewerType === 'investor'
      ? ['startup', 'advisor']
      : ['startup', 'investor']   // advisor sees startups + investors

  return this.prisma.organizations.findMany({
    where: {
      type: { in: targetTypes },
      onboarding_complete: true,
      org_status: { status: 'active' },
      ...filters,
    },
    orderBy: [
      { current_tier: 'desc' },   // Elite shown first
      { created_at: 'desc' },
    ],
    include: {
      startup_profiles: true,
      investor_profiles: true,
      advisor_profiles: true,
      org_profile_scores: { select: { overall_score: true } },
    },
  })
}
```

### 8.2 Connection Request Flow

```
FREE:  2 per month (tracked in org_feature_usage_counters.connect_requests_sent)
PRO:   Unlimited
ELITE: Unlimited

On creation:
  1. Check monthly limit (FREE only)
  2. Create connection_request
  3. Create success_fee_record (12-month fee lock-in)
  4. Send notification to target org
  5. Increment usage counter

On accept:
  1. connection_requests.status → 'accepted'
  2. Create connections record
  3. Notify sender

FREE: max 5 messages per connection (checked at message creation)
PRO/ELITE: unlimited
```

### 8.3 Deal Room Initiation — Both Sides

```ts
// apps/server/src/deal-rooms/deal-rooms.service.ts

async requestDealRoom(initiatorOrgId: string, targetOrgId: string, message: string) {
  // Determine startup_org_id and investor_org_id regardless of who initiated
  const [initiator, target] = await Promise.all([
    this.prisma.organizations.findUnique({ where: { id: initiatorOrgId } }),
    this.prisma.organizations.findUnique({ where: { id: targetOrgId } }),
  ])

  const startupOrgId  = initiator.type === 'startup'  ? initiatorOrgId : targetOrgId
  const investorOrgId = initiator.type === 'investor' ? initiatorOrgId : targetOrgId

  // Verify connection exists between the two orgs
  const connection = await this.prisma.connections.findFirst({
    where: {
      OR: [
        { org_a_id: initiatorOrgId, org_b_id: targetOrgId },
        { org_a_id: targetOrgId, org_b_id: initiatorOrgId },
      ],
    },
  })
  if (!connection) throw new ForbiddenException('Must be connected first')

  return this.prisma.deal_room_requests.create({
    data: {
      startup_org_id:  startupOrgId,
      investor_org_id: investorOrgId,
      initiated_by:    initiatorOrgId,   // tracks who clicked first
      message,
      status: 'pending',
    },
  })
}

async acceptDealRoom(dealRoomRequestId: string, acceptorOrgId: string) {
  const req = await this.prisma.deal_room_requests.update({
    where: { id: dealRoomRequestId },
    data: { status: 'accepted', responded_at: new Date() },
  })

  // Find the connection between the two orgs
  const connection = await this.prisma.connections.findFirst({
    where: {
      OR: [
        { org_a_id: req.startup_org_id, org_b_id: req.investor_org_id },
        { org_a_id: req.investor_org_id, org_b_id: req.startup_org_id },
      ],
    },
  })

  // Create deal room
  const dealRoom = await this.prisma.deal_rooms.create({
    data: { connection_id: connection.id, stage: 'interest' },
  })

  // Add both orgs as participants
  await this.prisma.deal_room_participants.createMany({
    data: [
      { deal_room_id: dealRoom.id, org_id: req.startup_org_id,  role: 'startup_founder' },
      { deal_room_id: dealRoom.id, org_id: req.investor_org_id, role: 'lead_investor'   },
    ],
  })

  return dealRoom
}
```

### 8.4 Data Room Access — Elite Only, View-Only

```ts
// apps/server/src/data-room/data-room.service.ts

async requestAccess(requesterOrgId: string, startupOrgId: string) {
  // Guard: requester must be Elite
  const requester = await this.prisma.organizations.findUnique({
    where: { id: requesterOrgId },
  })
  if (requester.current_tier !== 'elite') {
    throw new ForbiddenException({
      code: 'ELITE_REQUIRED',
      message: 'Data Room access requires Elite subscription.',
      upgradeUrl: '/organization/subscription',
    })
  }
  return this.prisma.data_room_access_requests.create({
    data: { startup_org_id: startupOrgId, requester_org_id: requesterOrgId, status: 'pending' },
  })
}

async activateGrant(startupOrgId: string, granteeOrgId: string, ip: string, userAgent: string) {
  // 1. Check consent exists
  const consent = await this.prisma.data_room_consents.findUnique({
    where: { startup_org_id_grantee_org_id: { startup_org_id: startupOrgId, grantee_org_id: granteeOrgId } },
  })
  if (!consent) throw new ForbiddenException('ToS consent required before access can be granted')

  // 2. Create grant — view only, never download
  return this.prisma.data_room_access_grants.create({
    data: {
      startup_org_id:   startupOrgId,
      grantee_org_id:   granteeOrgId,
      permission_level: 'view',          // always view — download is blocked at service level
      terms_accepted_at: consent.consented_at,
      granted_at: new Date(),
    },
  })
}

async serveDocument(documentId: string, requesterOrgId: string): Promise<string> {
  // Verify active grant
  const grant = await this.prisma.data_room_access_grants.findUnique({
    where: { startup_org_id_grantee_org_id: { startup_org_id: '...', grantee_org_id: requesterOrgId } },
  })
  if (!grant || grant.revoked_at) throw new ForbiddenException('No active data room access')

  // Generate presigned URL for view-only (Content-Disposition: inline, NOT attachment)
  const presignedUrl = await this.r2.getSignedUrl({
    key: document.r2_key,
    expiresIn: 3600,
    responseContentDisposition: 'inline',           // view only
    responseContentType: document.content_type,
    // Note: download is blocked by never returning Content-Disposition: attachment
  })

  // Record view analytics
  await this.prisma.data_room_document_views.upsert({ ... })

  return presignedUrl
}
```

---

## 9. VISIBILITY RULES — WHO SEES WHAT

### 9.1 Profile Card on Discovery Feed

| Viewer \ Card | Startup Card | Investor Card | Advisor Card |
|---|---|---|---|
| Free | Basic info, blurred details, "Connect" (2/mo) | Basic info, thesis summary | Basic info, 3 case studies |
| Pro | Full profile, traction summary | Full profile, check size range | Full profile, all case studies |
| Elite | Full + badge + priority signal | Full + response rate + AI score | Full + track record + authority badge |

### 9.2 Data Room Access Matrix

| Viewer Tier | Access | Download | Analytics (viewer side) |
|---|---|---|---|
| Free | ✗ — locked + upgrade CTA | ✗ | ✗ |
| Pro | ✗ — locked + upgrade CTA | ✗ | ✗ |
| Elite | ✓ View-only (inline only) | ✗ — never | ✓ |

### 9.3 Deal Room Sections by Role

| Section | Startup Founder | Lead Investor | Co-Investor | Advisor | Observer |
|---|---|---|---|---|---|
| 💬 Discussion (chat) | ✓ | ✓ | ✓ | ✓ | Read-only |
| 📊 Deal Details | ✓ Edit | ✓ Edit | View | View | View |
| 📂 Data Room Link | ✓ Manage | ✓ (Elite) | ✓ (Elite) | ✓ (Elite) | ✗ |
| 👥 Syndicate Panel | View | ✓ Manage | ✓ Commit | View | View |
| 📋 Milestones | ✓ | ✓ | View | ✓ Edit | View |
| 📝 Agreements | ✓ Sign | ✓ Sign | View | View | View |

### 9.4 Syndicate Panel Visibility

```
FREE users:   Syndicate nav item visible but entire feature is blurred/disabled
              Clicking shows: "This feature requires Elite subscription" + upgrade CTA
PRO users:    Same as Free — locked
ELITE users:  Full access — create syndicates, invite members, manage
```

---

## 10. ONBOARDING FLOWS — ALL SEGMENTS

### 10.1 Score Formula

```
overall_score (0–100) = onboarding_score + profile_score + org_score

onboarding_score (max 40):
  step 1 required = 16 pts
  steps 2–5 each  =  6 pts (max 24)

profile_score (max 30):
  full_name   = 10
  avatar_url  = 10
  bio         = 10

org_score (max 30):
  name          = 6
  country       = 6
  logo_url      = 6
  industry_tags ≥ 1 = 6
  finance_status = 6

Platform blockers (shown until resolved):
  - Score < 40%: "Complete your profile to unlock connections"
  - Score < 60%: "Complete your profile to appear in discovery"
```

### 10.2 Step Tables

**Startup steps:**

| # | key | title | pts | Required fields |
|---|---|---|---|---|
| 1 | company_basics | Company Basics | 16 (req) | legal_name, company_email, country_of_incorporation |
| 2 | product_market | Product & Market | 6 | company_stage_band, problem_statement, primary_industry |
| 3 | business_traction | Business & Traction | 6 | revenue_model, current_revenue_status |
| 4 | team | Team | 6 | co_founders_count, total_team_size |
| 5 | fundraising | Fundraising | 6 | currently_fundraising |
| 6 | media_prefs | Media & Preferences | 0 | optional |

**Investor steps:**

| # | key | title | pts | Required fields |
|---|---|---|---|---|
| 1 | investor_identity | Investor Identity | 16 (req) | profile_type, primary_contact_name, investing_years_band |
| 2 | capacity | Investment Capacity | 6 | check_size_band, investment_structures |
| 3 | thesis | Investment Thesis | 6 | stage_preferences, industry_preferences |
| 4 | value_add | Value Add | 6 | optional |
| 5 | platform_prefs | Platform Preferences | 6 | optional |

**Advisor steps:**

| # | key | title | pts | Required fields |
|---|---|---|---|---|
| 1 | professional_identity | Professional Identity | 16 (req) | professional_title, years_in_consulting_band, headline |
| 2 | expertise | Expertise & Services | 6 | primary_expertise_areas, service_delivery_models |
| 3 | track_record | Track Record | 6 | optional |
| 4 | client_prefs | Client Preferences | 6 | optional |
| 5 | pricing_capacity | Pricing & Capacity | 6 | current_capacity |
| 6 | platform_activity | Platform Activity | 0 | optional |

---

## 11. DISCOVERY SYSTEM

### 11.1 Overview Page

```
Nav: Overview
Shows: role-appropriate cards from the platform
  Startup user sees:  Investor cards + Advisor cards (curated, AI-ranked)
  Investor user sees: Startup cards + Advisor cards
  Advisor user sees:  Startup cards + Investor cards

Card components:
  - ProfileCard: mini version (name, logo, headline, tier badge, AI match %)
  - Featured cards: Elite orgs placed at top of feed
  - Quick actions: "Connect" button (gated by monthly limit)

Sidebar Discovery section = full browse with filters
```

### 11.2 Profile Detail Page

```
Clicked from discovery card → full profile page

Sections revealed based on viewer tier:
  FREE viewer:   summary, basic info, public fields
  PRO viewer:    full profile, traction data, check sizes
  ELITE viewer:  full + AI signals + interest scoring

Always visible (all tiers):
  - Name, logo, headline, location, industry, stage
  - "Connect" button (with monthly limit counter for FREE)
  - Tier badge

Gated (PRO/ELITE):
  - Detailed financial info
  - Full pitch deck preview
  - Contact information

Elite-only:
  - Data Room tab (button always visible, locked for non-Elite)
```

---

## 12. DEAL ROOM SYSTEM

### 12.1 Layout — Four Sections

```
┌─────────────────────────────────────────────────────────────┐
│  Deal Room: [Name]                    Stage: [●●●○○] Interest │
├──────────────┬──────────────────────────────────────────────┤
│  💬 Chat     │  📊 Deal Details          👥 Syndicate Panel  │
│  ─────────── │  ─────────────────────────────────────────── │
│  [messages]  │  Investment: $___         Lead: [Org]         │
│  [thread]    │  Equity: ___%            + Co-Investor 1      │
│  [pinned]    │  Valuation: $___          + Co-Investor 2      │
│              │  Timeline: ___           Total: $___/$___     │
│  [AI summary]│  Conditions: ___         [Invite Investor]    │
│              │                                               │
│              │  📂 Data Room Link (Elite only button)         │
│              │  📋 Milestones  |  📝 Agreements               │
└──────────────┴───────────────────────────────────────────────┘
```

### 12.2 Stage Transitions

```
interest
  Unlocks: chat, deal details, milestone creation, AI summary
  ↓
due_diligence
  Unlocks: data room link request (Elite), document review
  ↓
negotiation
  Unlocks: agreement creation, term sheet template
  ↓
commitment
  Unlocks: commitment recording, syndicate formation
  ↓
closing
  Unlocks: physical close option ("Closing session at Impactis office")
  ↓
closed
  Triggers: success_fee_record update, admin notification, payment
```

### 12.3 AI Features in Deal Room

```ts
// AI is involved in:
// 1. deal_rooms.ai_summary — GPT-4o summarizes chat + documents
// 2. deal_rooms.ai_risk_flags — identifies potential red flags
// 3. deal_room_milestones (ai_generated=true) — AI suggests milestones per stage
// 4. deal_room_messages (is_ai_summary=true) — periodic summary messages

// Trigger AI analysis when:
//   - Stage changes
//   - New document uploaded to linked data room
//   - User clicks "Analyze this deal" button (Pro/Elite)
//   - Every 48 hours if deal is active
```

### 12.4 Agreement Templates

```
Standard templates (template_key):
  - nda        → Non-Disclosure Agreement
  - term_sheet → Term Sheet
  - sha        → Shareholders Agreement
  - custom     → Blank (Elite only)

Flow:
  1. Either party creates agreement from template
  2. Both parties review content_text
  3. Both click "Sign" → signed_by[] array updated
  4. When all required parties sign → status = 'executed'
  5. admin_notified_at set → admin gets notification
```

---

## 13. DATA ROOM SYSTEM

### 13.1 Access Flow (Elite only)

```
STEP 1 — Request
  Non-Elite investor clicks locked "Data Room" button
  → Shown upgrade CTA: "Upgrade to Elite to access data rooms"

STEP 2 — Elite investor clicks "Request Access"
  → data_room_access_requests created (status: pending)
  → Startup founder notified

STEP 3 — Startup approves
  → data_room_access_requests.status → approved

STEP 4 — ToS Consent Modal shown to investor
  → "I understand this information is confidential..."
  → "The platform is not responsible for misuse"
  → User clicks "I Agree"
  → data_room_consents created (ip_address, user_agent recorded)
  → security_event_type.data_room_consent logged

STEP 5 — Grant activated
  → data_room_access_grants created (permission_level: view)
  → Investor can now view documents inline (no download button shown)
```

### 13.2 Document Sections

```
Data Room Layout (clean Google Drive style):
  📁 Company Overview
      → Pitch deck, Product demo, Vision document
  📁 Financials
      → Revenue report, Projections, Burn rate
  📁 Legal
      → Company registration, Shareholder structure, Cap table
  📁 Product
      → Roadmap, Technology overview
  📁 Team
      → Team bios, Founder profiles

Startup sees (as owner):
  + Upload documents
  + Organize folders
  + Approve/revoke access
  + View analytics: who viewed what, how long, which page
  + AI summary per document

Investor sees (Elite, after grant):
  + View documents inline (no download)
  + Watermark overlaid with their org name + date
  + Cannot take screenshots (frontend: CSS user-select:none + context menu disabled)
    Note: platform ToS covers liability for photos taken of screen
  + "Ask founder about this document" button
  + AI summary shown
```

### 13.3 Watermark Config

```ts
interface WatermarkConfig {
  viewerOrgName:    string
  viewerEmail:      string
  accessDate:       string    // ISO date
  documentTitle:    string
  text:             'CONFIDENTIAL — Impactis Platform'
  platform:         'Impactis'
}
// Applied at serve time as PDF/image overlay
// Never stored — generated on each request
```

---

## 14. SYNDICATE SYSTEM (ELITE ONLY)

### 14.1 Access Control

```
FREE/PRO users:
  - Syndicate nav item is visible
  - All content is blurred (CSS: filter: blur(4px))
  - Overlay shows: "Syndicates require Elite subscription"
  - CTA button: "Upgrade to Elite"

ELITE users:
  - Create syndicates from deal room → deal_rooms panel
  - Invite co-investors (unlimited)
  - Platform promotes featured syndicates
```

### 14.2 Formation Flow

```
Lead investor (Elite) in deal room:
  → Clicks "Form Syndicate"
  → Enters: name, target_amount, minimum_check, description
  → Syndicate created (status: forming, deal_room_id linked)
  → Invites co-investors from investor network
  → Co-investors receive syndicate_invite notification
  → On accept → syndicate_members (status: confirmed)
  → "Commit Investment" → deal_room_commitments created
  → total_committed tracks progress toward target_amount
  → When target met → status: active
```

---

## 15. AI MATCHING & INTELLIGENCE

### 15.1 Match Pipeline

```
1. Onboarding saved → job queued
2. Serialize profile → embedding_text
3. OpenAI text-embedding-3-large → vector
4. Store in org_ai_embeddings.embedding_vector
5. Compute cosine similarity against opposite-type orgs
6. Store in ai_match_scores (overall_score 0–100, score_breakdown JSON)
7. Generate ai_reasoning_text with GPT-4o
8. Deliver based on tier:
   Free investor:    no matches
   Pro investor:     weekly batch
   Elite investor:   daily + instant
```

### 15.2 Deal Room AI

```ts
interface DealRoomAIAnalysis {
  summary:    string    // 3–5 sentence deal summary
  risks:      string[]  // flagged red flags
  milestones: Array<{   // suggested milestones for current stage
    title: string
    description: string
    due_date: string    // ISO
  }>
  investor_fit_score: number  // 0–100
}
```

### 15.3 Help Bot

```
Context: 'help'
Flow:
  User types question in Help & Support chat
  → AI bot (GPT-4o, system prompt = platform knowledge base)
  → If AI confidence < 80% or user says "talk to human"
    → ai_chat_sessions.escalated = true
    → support_ticket created automatically
    → admin/support team notified
    → User shown: "A support agent will respond within [SLA based on tier]"
```

---

## 16. NOTIFICATIONS SYSTEM

### 16.1 Notification Type Map

| Type | Trigger | Channels |
|---|---|---|
| connection_request | Request received | in-app + email |
| connection_accepted | Request accepted | in-app + email |
| connection_declined | Request declined | in-app |
| deal_room_created | Deal room opened | in-app + email |
| deal_room_message | New message | in-app + email (digest) |
| deal_room_stage_changed | Stage advances | in-app + email |
| deal_room_agreement_signed | Agreement signed | in-app + email + **admin** |
| milestone_completed | Done | in-app |
| data_room_access_requested | Access request | in-app + email |
| data_room_access_granted | Access approved | in-app + email |
| syndicate_invite | Invited | in-app + email |
| syndicate_committed | Commitment added | in-app + email |
| subscription_activated | Payment processed | in-app + email |
| payment_failed | Failed | in-app + email (urgent) |
| new_ai_match | Match above threshold | in-app + email |
| warm_intro_requested | Warm intro received | in-app + email |
| profile_completeness_reminder | Score < 60% | in-app + email (7 days after reg) |
| support_ticket_update | Ticket status change | in-app + email |

### 16.2 Notification Preferences

```
Controlled by user_notification_preferences:
  in_app_enabled    (default: true)
  email_enabled     (default: true)
  telegram_enabled  (default: false, optional)
  telegram_chat_id  (set when user connects Telegram)
  type_overrides    (JSON per notification type)
```

---

## 17. PAYMENTS & BILLING

### 17.1 Upgrade Flow

```
User clicks upgrade (from locked feature CTA or /organization/subscription)
  → Subscription page shows 3 cards: Free | Pro | Elite
    Free card: current if free, "Current Plan" label
    Pro card: "what Free has" + "what Pro adds"
    Elite card: "what Pro has" + "what Elite adds" (data room, syndicate, etc.)
  → User clicks "Upgrade to Pro" or "Upgrade to Elite"
  → Choose payment method: Stripe | Telebirr | M-Pesa
  → Payment processed
  → billing_webhook_events created
  → org_subscriptions updated
  → organizations.current_tier synced
  → payment_transactions created
  → notifications sent (subscription_activated)
```

### 17.2 Subscription Sync

```ts
// apps/server/src/billing/billing.service.ts
async syncOrgTier(orgId: string): Promise<void> {
  const activeSub = await this.prisma.org_subscriptions.findFirst({
    where: { org_id: orgId, status: { in: ['active', 'trialing', 'past_due'] } },
    include: { billing_plan_catalog: true },
    orderBy: { created_at: 'desc' },
  })
  const tier = (activeSub?.billing_plan_catalog?.plan_code ?? 'free') as PlanTierLevel
  await this.prisma.organizations.update({ where: { id: orgId }, data: { current_tier: tier } })
}
```

---

## 18. SECURITY & AUTH

### 18.1 Auth Flow (Better Auth + NestJS)

```
Register:
  POST /api/auth/register
  → Cloudflare Turnstile validation (CAPTCHA)
  → Better Auth creates users record
  → Trigger: create profiles, organizations (type from registration form),
             org_members (owner), org_subscriptions (free), onboarding_progress

Login:
  POST /api/auth/login
  → Better Auth validates credentials
  → JWT returned (short-lived access token + refresh token)
  → user_security_events.login logged
  → user_devices upserted

All API calls:
  Authorization: Bearer <jwt>
  → JwtGuard extracts userId
  → CurrentOrg decorator resolves org via org_members
  → TierGuard/CapabilityGuard run per-route
```

### 18.2 Security Section (Settings)

```
/settings/security shows:
  1. Change Password form
  2. 2FA settings:
     - TOTP (Authenticator app) — enable/disable
     - SMS — add phone number, enable/disable
     - Email OTP — enable/disable
  3. Active Sessions / Devices list
     - user_devices table displayed
     - "Revoke" button → revoked_at set + security event logged
  4. Login activity log
     - user_security_events listed (last 30 events)
```

---

## 19. ADMIN DASHBOARD

```
Admin has their own route group (/admin) protected by admin_users.role check

Sections:
  Overview:
    - Total orgs by type + tier (real-time)
    - Revenue this month
    - Active deal rooms
    - Recent agreements signed
    - Flagged accounts

  Organizations:
    - List all orgs with filter/search
    - View full profile
    - Override capabilities (org_capabilities_overrides)
    - Change tier manually
    - Suspend/delete org (org_status)

  Deal Rooms:
    - See all active deal rooms
    - Notified when agreements signed (admin_notified_at)
    - View stage history

  Subscriptions:
    - All active subscriptions
    - Revenue by provider (Stripe / Telebirr / M-Pesa)
    - Payment failures

  Support:
    - All support tickets
    - Assign to team member
    - View AI chat escalations

  AI Monitoring:
    - Match score distributions
    - Embedding job status
    - AI cost tracking

  Audit:
    - admin_audit_logs (every admin action logged)
```

---

## 20. NESTJS API CONTRACT

### 20.1 Auth Module

```
POST   /api/auth/register           Register (Turnstile required)
POST   /api/auth/login              Login → JWT
POST   /api/auth/refresh            Refresh token
POST   /api/auth/logout             Logout
POST   /api/auth/verify-email       Email verification
POST   /api/auth/forgot-password    Send reset email
POST   /api/auth/reset-password     Reset with token
POST   /api/auth/2fa/enable         Enable 2FA
POST   /api/auth/2fa/verify         Verify 2FA code
POST   /api/auth/2fa/disable        Disable 2FA
```

### 20.2 Onboarding Module

```
GET    /api/onboarding/:orgId/progress           Get all steps + statuses
POST   /api/onboarding/:orgId/step               Save a step
PATCH  /api/onboarding/:orgId/step/:stepKey/skip Mark step as skipped
GET    /api/onboarding/:orgId/score              Get org_profile_scores
```

### 20.3 Organizations Module

```
GET    /api/organizations/me                     My org
PATCH  /api/organizations/me                     Update org
GET    /api/organizations/:id                    Public profile (visibility gated)
GET    /api/organizations/:id/identity           Org identity (own only)
```

### 20.4 Discovery Module

```
GET    /api/discovery/feed                       Paginated feed (role-filtered)
GET    /api/discovery/feed/:orgId                Full profile detail (tier-gated fields)
POST   /api/discovery/feedback                   AI match feedback (interested/passed)
GET    /api/discovery/matches                    AI matches for current org
```

### 20.5 Connections Module

```
POST   /api/connections/request                  Send request (usage gated)
GET    /api/connections/requests/received        Incoming requests
GET    /api/connections/requests/sent            Sent requests
PATCH  /api/connections/request/:id/accept       Accept
PATCH  /api/connections/request/:id/reject       Reject
GET    /api/connections                          List active connections
GET    /api/connections/:id                      Connection detail
POST   /api/connections/:id/messages             Send message (5-msg limit enforced)
GET    /api/connections/:id/messages             Get messages
```

### 20.6 Deal Rooms Module

```
POST   /api/deal-rooms/request                   Initiate deal room (either side)
GET    /api/deal-rooms/requests/received         Incoming deal room requests
PATCH  /api/deal-rooms/request/:id/accept        Accept → creates deal room
PATCH  /api/deal-rooms/request/:id/decline       Decline
GET    /api/deal-rooms                           List my deal rooms
GET    /api/deal-rooms/:id                       Deal room detail
PATCH  /api/deal-rooms/:id/stage                 Advance stage
POST   /api/deal-rooms/:id/messages              Send message
GET    /api/deal-rooms/:id/messages              Get messages (with thread)
POST   /api/deal-rooms/:id/milestones            Create milestone
PATCH  /api/deal-rooms/:id/milestones/:mId       Update milestone
POST   /api/deal-rooms/:id/commitments           Record commitment
POST   /api/deal-rooms/:id/agreements            Create agreement
PATCH  /api/deal-rooms/:id/agreements/:aId/sign  Sign agreement
POST   /api/deal-rooms/:id/data-room-link        Link data room to deal
POST   /api/deal-rooms/:id/ai-analyze            Trigger AI analysis
POST   /api/deal-rooms/:id/participants/invite   Invite participant
```

### 20.7 Data Room Module (Elite Only)

```
GET    /api/data-room/:startupOrgId              List folders + documents (own only)
POST   /api/data-room/:startupOrgId/upload       Upload document (own only)
DELETE /api/data-room/:startupOrgId/doc/:docId   Delete document (own only)
POST   /api/data-room/:startupOrgId/folders      Create folder

POST   /api/data-room/:startupOrgId/access/request     Request access (Elite only)
GET    /api/data-room/:startupOrgId/access/requests    Pending requests (startup only)
PATCH  /api/data-room/:startupOrgId/access/:reqId/approve  Approve access
PATCH  /api/data-room/:startupOrgId/access/:reqId/reject   Reject access
POST   /api/data-room/:startupOrgId/consent              Record ToS consent (Elite only)

GET    /api/data-room/serve/:docId               Serve document (presigned R2 URL, view-only)
GET    /api/data-room/:startupOrgId/analytics    Document view analytics (startup owner only)
```

### 20.8 Syndicates Module (Elite Only)

```
POST   /api/syndicates                           Create syndicate (Elite)
GET    /api/syndicates                           List my syndicates
GET    /api/syndicates/:id                       Syndicate detail
PATCH  /api/syndicates/:id                       Update syndicate
POST   /api/syndicates/:id/invite                Invite co-investor
PATCH  /api/syndicates/:id/invite/:invId/accept  Accept invite
PATCH  /api/syndicates/:id/invite/:invId/decline Decline invite
POST   /api/syndicates/:id/commit                Commit investment amount
```

### 20.9 Billing Module

```
GET    /api/billing/plans                        All plans for segment
POST   /api/billing/checkout/stripe              Create Stripe checkout session
POST   /api/billing/checkout/telebirr            Create Telebirr payment
POST   /api/billing/checkout/mpesa               Create M-Pesa STK push
POST   /api/billing/webhook/stripe               Stripe webhook (raw body)
POST   /api/billing/webhook/telebirr             Telebirr webhook
POST   /api/billing/webhook/mpesa                M-Pesa callback
GET    /api/billing/subscription                 My current subscription
GET    /api/billing/transactions                 Payment history
```

### 20.10 Notifications Module

```
GET    /api/notifications                        List (paginated, unread first)
GET    /api/notifications/unread-count           Badge count
PATCH  /api/notifications/:id/read              Mark read
PATCH  /api/notifications/read-all              Mark all read
PATCH  /api/notifications/preferences           Update channel preferences
```

### 20.11 Admin Module (admin role required)

```
GET    /api/admin/stats                          Platform overview stats
GET    /api/admin/organizations                  List all orgs
GET    /api/admin/organizations/:id              Org detail
PATCH  /api/admin/organizations/:id/tier         Force tier change
PATCH  /api/admin/organizations/:id/status       Suspend/activate
POST   /api/admin/organizations/:id/capabilities Override capability
GET    /api/admin/deal-rooms                     All deal rooms
GET    /api/admin/subscriptions                  All subscriptions
GET    /api/admin/tickets                        All support tickets
PATCH  /api/admin/tickets/:id/assign             Assign ticket
GET    /api/admin/audit                          Audit logs
```

---

## 21. NEXT.JS FRONTEND SPEC

### 21.1 Sidebar Navigation

```tsx
// All items always visible in sidebar
// Locked items shown with lock icon + tooltip: "Requires Elite"

const NAV_ITEMS = [
  { label: 'Overview',      href: '/overview',          icon: 'LayoutDashboard', locked: false },
  { label: 'Profile',       href: '/profile',           icon: 'User',            locked: false },
  {
    label: 'Organization',  icon: 'Building2', locked: false,
    children: [
      { label: 'Identity',          href: '/organization/identity' },
      { label: 'Subscription & Billing', href: '/organization/subscription' },
    ],
  },
  { label: 'Discovery',     href: '/discovery',         icon: 'Compass',         locked: false },
  { label: 'Deal Room',     href: '/deal-room',         icon: 'Handshake',       locked: false },
  { label: 'Data Room',     href: '/data-room',         icon: 'FolderLock',      locked: false },
  { label: 'Notifications', href: '/notifications',     icon: 'Bell',            locked: false },
  {
    label: 'Syndicate',     href: '/syndicates',        icon: 'Users',
    locked: tier !== 'elite',  // blurred + lock icon for non-Elite
    lockedLabel: 'Requires Elite',
  },
  {
    label: 'Settings',      icon: 'Settings', locked: false,
    children: [
      { label: 'Security',     href: '/settings/security' },
      { label: 'Notifications', href: '/settings/notifications' },
      { label: 'Appearance',   href: '/settings/appearance' },
    ],
  },
  { label: 'Help & Support', href: '/help',             icon: 'HelpCircle',      locked: false },
]
```

### 21.2 Upgrade Gate Component

```tsx
// apps/client/components/upgrade-gate.tsx
'use client'

export function UpgradeGate({
  feature, requiredTier, currentTier, children
}: {
  feature: string
  requiredTier: 'pro' | 'elite'
  currentTier: PlanTierLevel
  children: React.ReactNode
}) {
  const router = useRouter()
  const allowed = PLAN_TIERS[currentTier] >= PLAN_TIERS[requiredTier]
  if (allowed) return <>{children}</>

  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-sm opacity-30 filter">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center
                      bg-background/85 backdrop-blur-sm rounded-xl border border-dashed
                      border-muted-foreground/30 gap-3 p-6 text-center">
        <div className="p-3 rounded-full bg-muted">
          <LockIcon className="w-6 h-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-semibold text-foreground">{feature}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Requires {requiredTier === 'pro' ? 'Pro' : 'Elite'} subscription
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => router.push('/organization/subscription')}
          className="mt-1"
        >
          Upgrade to {requiredTier === 'pro' ? 'Pro' : 'Elite'}
        </Button>
      </div>
    </div>
  )
}
```

### 21.3 Typed API Client

```ts
// apps/client/lib/api/client.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL

async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (res.status === 403) {
    const body = await res.json()
    if (body.code === 'UPGRADE_REQUIRED') {
      // Redirect to subscription page with context
      window.location.href = `/organization/subscription?feature=${body.requiredTier}`
      return
    }
    if (body.code === 'ELITE_REQUIRED') {
      window.location.href = `/organization/subscription?highlight=elite`
      return
    }
  }

  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// Typed clients per module
export const api = {
  connections: {
    sendRequest:  (dto: SendConnectionRequestDto) => apiFetch('/api/connections/request', { method: 'POST', body: JSON.stringify(dto) }),
    getMessages:  (id: string) => apiFetch<ConnectionMessage[]>(`/api/connections/${id}/messages`),
    sendMessage:  (id: string, body: string) => apiFetch(`/api/connections/${id}/messages`, { method: 'POST', body: JSON.stringify({ body }) }),
  },
  dealRooms: {
    request:      (dto: DealRoomRequestDto) => apiFetch('/api/deal-rooms/request', { method: 'POST', body: JSON.stringify(dto) }),
    getById:      (id: string) => apiFetch<DealRoom>(`/api/deal-rooms/${id}`),
    advanceStage: (id: string, stage: DealRoomStage) => apiFetch(`/api/deal-rooms/${id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage }) }),
  },
  dataRoom: {
    requestAccess: (startupOrgId: string) => apiFetch(`/api/data-room/${startupOrgId}/access/request`, { method: 'POST' }),
    recordConsent: (startupOrgId: string) => apiFetch(`/api/data-room/${startupOrgId}/consent`, { method: 'POST' }),
    serveDocument: (docId: string) => apiFetch<{ url: string }>(`/api/data-room/serve/${docId}`),
  },
  billing: {
    getPlans:     (segment: OrgType) => apiFetch<BillingPlan[]>(`/api/billing/plans?segment=${segment}`),
    checkoutStripe: (planId: string) => apiFetch<{ url: string }>('/api/billing/checkout/stripe', { method: 'POST', body: JSON.stringify({ planId }) }),
  },
}
```

---

## 22. ANTI-GAMING RULES

### 22.1 Introduction Lock-In

```
On EVERY connection_request created:
  → success_fee_record created (intro_date = now, fee_rate_pct_x100 = tier rate)
  → Fees apply for 12 months even if parties go off-platform
  → ToS accepted at connection creation

Detection:
  → Monitor Crunchbase / public announcements
  → Cross-reference with intro records
  → Repeat offenders banned from platform
```

### 22.2 Rate Limits

```
Connection requests: 2/month for FREE (resets 1st of month)
Profile views:       10 full views/month for FREE investors
Messages:            5 per connection for FREE (hard stop)
API rate limit:      100 req/min per user (NestJS throttler)
CAPTCHA:             Cloudflare Turnstile on register + payment forms
Suspicious activity: Auto-flag if >20 profile views in 1 hour
```

### 22.3 Data Room Protection

```
Confidentiality measures:
  1. View-only (no download button, Content-Disposition: inline)
  2. Watermark overlay on every document
  3. CSS: user-select: none + context menu disabled (frontend layer)
  4. ToS consent before access (platform liability disclaimer)
  5. Document view analytics logged for startup owner
  6. Access can be revoked anytime (revoked_at set)
  7. Screenshots: platform not liable per ToS — user accepted this
```

---

## 23. SEEDING & MIGRATION NOTES

### 23.1 Seed Plans (9 records)

```ts
// apps/server/prisma/seed.ts

const PLANS = [
  // Startups
  { segment: 'startup', plan_code: 'free',  plan_tier: 0, display_name: 'Starter',        monthly: 0,   annual: 0     },
  { segment: 'startup', plan_code: 'pro',   plan_tier: 1, display_name: 'Pro',             monthly: 249, annual: 2490  },
  { segment: 'startup', plan_code: 'elite', plan_tier: 2, display_name: 'Elite',           monthly: 799, annual: 7990  },
  // Investors (annual only)
  { segment: 'investor', plan_code: 'free',  plan_tier: 0, display_name: 'Starter',        monthly: 0, annual: 0      },
  { segment: 'investor', plan_code: 'pro',   plan_tier: 1, display_name: 'Pro Investor',   monthly: 0, annual: 2500   },
  { segment: 'investor', plan_code: 'elite', plan_tier: 2, display_name: 'Elite Investor', monthly: 0, annual: 12000  },
  // Advisors
  { segment: 'advisor', plan_code: 'free',  plan_tier: 0, display_name: 'Starter',         monthly: 0,   annual: 0    },
  { segment: 'advisor', plan_code: 'pro',   plan_tier: 1, display_name: 'Pro Consultant',  monthly: 299, annual: 2990 },
  { segment: 'advisor', plan_code: 'elite', plan_tier: 2, display_name: 'Elite Consultant',monthly: 599, annual: 5990 },
]

// On new org created → auto-create free subscription:
await prisma.org_subscriptions.create({
  data: {
    org_id: orgId,
    plan_id: freePlanId,   // resolved for org's segment
    status: 'active',
    billing_interval: 'monthly',
    source: 'auto',
  },
})
```

### 23.2 Key Performance Indexes

```sql
-- Discovery feed (tier-ranked)
CREATE INDEX idx_orgs_discovery ON organizations (type, current_tier DESC, created_at DESC)
  WHERE onboarding_complete = true;

-- Unread notifications badge
CREATE INDEX idx_notifs_unread ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

-- Active subscriptions fast lookup
CREATE INDEX idx_subs_active ON org_subscriptions (org_id)
  WHERE status IN ('active', 'trialing', 'past_due');

-- AI matches sorted by score
CREATE INDEX idx_ai_matches ON ai_match_scores (from_org_id, overall_score DESC)
  WHERE disqualified = false;

-- Monthly usage counter lookup
CREATE INDEX idx_usage_period ON org_feature_usage_counters (org_id, feature_key, period_start DESC);
```

### 23.3 pgvector Migration Path

```sql
-- When pgvector is ready:
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.org_ai_embeddings
  ALTER COLUMN embedding_vector
  TYPE vector(1536)
  USING embedding_vector::vector(1536);

CREATE INDEX ON public.org_ai_embeddings
  USING ivfflat (embedding_vector vector_cosine_ops)
  WITH (lists = 100);
```

### 23.4 data_room_permission_level Enum Note

```
The enum data_room_permission_level has been reduced to one value: 'view'
The 'view_download' value from v2.0 has been REMOVED per the Elite view-only rule.
If you are migrating from v2.0, run:
  UPDATE data_room_access_grants SET permission_level = 'view';
  ALTER TYPE data_room_permission_level RENAME VALUE 'view_download' TO 'view_legacy';
  -- Then drop view_download from the enum after data migration
```

---

*End of Impactis Platform System Design — v3.0*
*Conflicts resolved: Data Room = Elite view-only | Free connections = 2/month | NestJS backend | Free tier permanent | Deal Room both sides*
*Source: TIER_COMPARISON_MATRIX.pdf + INTERACTION_MODEL.pdf + user requirements update*
