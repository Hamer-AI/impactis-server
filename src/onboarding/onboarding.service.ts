import { Injectable } from '@nestjs/common';
import { PrismaService, PrismaSqlExecutor } from '../prisma/prisma.service';
import { AiMatchingService } from '../ai/ai-matching.service';
import type {
  OnboardingMeView,
  OnboardingRole,
  OnboardingProgressStepView,
  OrgScoreSnapshot,
  SaveOnboardingProgressInput,
  SaveOnboardingStep1Input,
  UpsertOnboardingAnswersInput,
} from './onboarding.types';

type SqlExecutor = PrismaSqlExecutor;

type MembershipContext = {
  orgId: string;
  orgType: OnboardingRole;
  memberRole: 'owner' | 'admin' | 'member';
};

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiMatching: AiMatchingService,
  ) {}

  private normalizeOptionalText(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeOrgType(value: string | null | undefined): OnboardingRole | null {
    const normalized = this.normalizeOptionalText(value)?.toLowerCase() ?? null;
    if (normalized === 'startup' || normalized === 'investor' || normalized === 'advisor') {
      return normalized;
    }
    return null;
  }

  private normalizeMemberRole(value: string | null | undefined): MembershipContext['memberRole'] | null {
    const normalized = this.normalizeOptionalText(value)?.toLowerCase() ?? null;
    if (normalized === 'owner' || normalized === 'admin' || normalized === 'member') {
      return normalized;
    }
    return null;
  }

  private getExecutor(tx?: SqlExecutor): SqlExecutor {
    return tx ?? this.prisma;
  }

  private async resolveMembership(userId: string, tx?: SqlExecutor): Promise<MembershipContext> {
    const executor = this.getExecutor(tx);
    const rows = await executor.$queryRaw<
      Array<{
        org_id: string;
        org_type: string | null;
        member_role: string | null;
      }>
    >`
      select
        om.org_id,
        o.type::text as org_type,
        om.member_role::text as member_role
      from public.org_members om
      join public.organizations o on o.id = om.org_id
      left join public.org_status s on s.org_id = o.id
      where om.user_id = ${userId}::uuid
        and om.status = 'active'
        and coalesce(s.status::text, 'active') = 'active'
      order by om.created_at asc
      limit 1
    `;

    const row = rows[0];
    const orgType = this.normalizeOrgType(row?.org_type ?? null);
    const memberRole = this.normalizeMemberRole(row?.member_role ?? null);
    if (!row?.org_id || !orgType || !memberRole) {
      throw new Error('Organization membership is required');
    }

    return {
      orgId: row.org_id,
      orgType,
      memberRole,
    };
  }

  private assertStep1RequiredFields(role: OnboardingRole, values: Record<string, unknown>): void {
    const hasString = (key: string) =>
      typeof values[key] === 'string' && (values[key] as string).trim().length > 0;

    // Keep this permissive: require at least one strong identity field + one contact/link field.
    if (role === 'startup') {
      const identityOk = hasString('legal_name') || hasString('trading_name') || hasString('company_name');
      const contactOk =
        hasString('website') || hasString('website_url') || hasString('company_email') || hasString('linkedin_company_url');
      if (!identityOk || !contactOk) {
        throw new Error(
          'Startup step 1 requires company identity (legal_name/trading_name) and a contact/link (website_url/company_email/linkedin_company_url).',
        );
      }
      return;
    }

    if (role === 'investor') {
      const identityOk = hasString('entity_name') || hasString('full_name') || hasString('primary_contact_name');
      const contactOk = hasString('email') || hasString('linkedin_url') || hasString('website_url');
      if (!identityOk || !contactOk) {
        throw new Error(
          'Investor step 1 requires identity (entity_name/full_name) and a contact/link (email/linkedin_url/website_url).',
        );
      }
      return;
    }

    const identityOk = hasString('professional_title') || hasString('full_name') || hasString('firm_name');
    const contactOk = hasString('email') || hasString('linkedin_url') || hasString('website_url');
    if (!identityOk || !contactOk) {
      throw new Error(
        'Advisor step 1 requires identity (professional_title/full_name/firm_name) and a contact/link (email/linkedin_url/website_url).',
      );
    }
  }

  private async readStep1Completed(orgId: string, tx?: SqlExecutor): Promise<boolean> {
    const executor = this.getExecutor(tx);
    const rows = await executor.$queryRaw<
      Array<{
        status: string | null;
      }>
    >`
      select p.status::text as status
      from public.onboarding_progress p
      where p.org_id = ${orgId}::uuid
        and p.step_key = 'step1'
      limit 1
    `;
    const status = this.normalizeOptionalText(rows[0]?.status ?? null)?.toLowerCase();
    return status === 'completed';
  }

  private async readRawUserMetaOnboarding(userId: string, tx?: SqlExecutor): Promise<Record<string, unknown> | null> {
    const executor = this.getExecutor(tx);
    const rows = await executor.$queryRaw<
      Array<{
        raw_user_meta_data: unknown;
      }>
    >`
      select u.raw_user_meta_data
      from public.users u
      where u.id = ${userId}::uuid
      limit 1
    `;
    const raw = rows[0]?.raw_user_meta_data;
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    return raw as Record<string, unknown>;
  }

  private async ensureDbOnboardingFromLegacyMeta(
    userId: string,
    membership: MembershipContext,
    tx?: SqlExecutor,
  ): Promise<void> {
    const executor = this.getExecutor(tx);
    const step1Completed = await this.readStep1Completed(membership.orgId, executor);
    if (step1Completed) {
      return;
    }

    const meta = await this.readRawUserMetaOnboarding(userId, executor);
    if (!meta) {
      return;
    }

    const legacyCompleted = meta['onboardingCompleted'];
    const legacySkipped = meta['onboardingSkipped'];
    const legacyStep = meta['onboardingStep'];
    const legacyQuestionnaire = meta['onboarding_questionnaire'];

    const completed =
      legacyCompleted === true
      || legacySkipped === true
      || (typeof legacyStep === 'number' && legacyStep >= 2);

    let answers: Record<string, unknown> | null = null;
    if (legacyQuestionnaire && typeof legacyQuestionnaire === 'object') {
      const q = legacyQuestionnaire as Record<string, unknown>;
      if (q.answers && typeof q.answers === 'object' && q.answers !== null) {
        answers = q.answers as Record<string, unknown>;
      }
    }

    if (!completed && (!answers || Object.keys(answers).length < 1)) {
      return;
    }

    const answersPayload = answers ? JSON.stringify(answers) : null;

    // Mark step1 as completed to prevent locking out previously onboarded users.
    await executor.$queryRaw`
      insert into public.onboarding_progress (
        org_id,
        step_key,
        step_number,
        status,
        completed_at,
        updated_at
      )
      values (
        ${membership.orgId}::uuid,
        'step1',
        1,
        'completed'::public.onboarding_step_status,
        timezone('utc', now()),
        timezone('utc', now())
      )
      on conflict (org_id, step_key) do update
      set
        status = excluded.status,
        completed_at = excluded.completed_at,
        updated_at = excluded.updated_at
    `;

    // Best-effort: migrate legacy questionnaire answers into DB tables so future logic can use them.
    if (answersPayload) {
      if (membership.orgType === 'startup') {
        await executor.$queryRaw`
          insert into public.startup_onboarding_answers (org_id, updated_at)
          values (${membership.orgId}::uuid, timezone('utc', now()))
          on conflict (org_id) do update set updated_at = timezone('utc', now())
        `;
        await executor.$queryRaw`
          update public.startup_onboarding_answers
          set
            elevator_pitch = coalesce(elevator_pitch, (${answersPayload}::jsonb ->> 'elevator_pitch')),
            problem_statement = coalesce(problem_statement, (${answersPayload}::jsonb ->> 'problem_statement')),
            unique_advantage = coalesce(unique_advantage, (${answersPayload}::jsonb ->> 'unique_advantage')),
            primary_industry = coalesce(primary_industry, (${answersPayload}::jsonb ->> 'primary_industry')),
            updated_at = timezone('utc', now())
          where org_id = ${membership.orgId}::uuid
        `;
      } else if (membership.orgType === 'investor') {
        await executor.$queryRaw`
          insert into public.investor_onboarding_answers (org_id, updated_at)
          values (${membership.orgId}::uuid, timezone('utc', now()))
          on conflict (org_id) do update set updated_at = timezone('utc', now())
        `;
        await executor.$queryRaw`
          update public.investor_onboarding_answers
          set
            investment_thesis_bio = coalesce(investment_thesis_bio, (${answersPayload}::jsonb ->> 'investment_thesis_bio')),
            updated_at = timezone('utc', now())
          where org_id = ${membership.orgId}::uuid
        `;
      } else {
        await executor.$queryRaw`
          insert into public.advisor_onboarding_answers (org_id, updated_at)
          values (${membership.orgId}::uuid, timezone('utc', now()))
          on conflict (org_id) do update set updated_at = timezone('utc', now())
        `;
        await executor.$queryRaw`
          update public.advisor_onboarding_answers
          set
            headline = coalesce(headline, (${answersPayload}::jsonb ->> 'headline')),
            professional_bio = coalesce(professional_bio, (${answersPayload}::jsonb ->> 'professional_bio')),
            updated_at = timezone('utc', now())
          where org_id = ${membership.orgId}::uuid
        `;
      }
    }
  }

  private async computeAndPersistScores(
    userId: string,
    membership: MembershipContext,
    tx?: SqlExecutor,
  ): Promise<OrgScoreSnapshot> {
    const executor = this.getExecutor(tx);

    const [step1Completed, profileRow, verificationRow] = await Promise.all([
      this.readStep1Completed(membership.orgId, executor),
      executor.$queryRaw<
        Array<{
          full_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          linkedin_url: string | null;
        }>
      >`
        select
          p.full_name,
          p.avatar_url,
          p.bio,
          p.linkedin_url
        from public.profiles p
        where p.id = ${userId}::uuid
        limit 1
      `,
      executor.$queryRaw<
        Array<{
          status: string | null;
        }>
      >`
        select ov.status::text as status
        from public.org_verifications ov
        where ov.org_id = ${membership.orgId}::uuid
        limit 1
      `,
    ]);

    const profile = profileRow[0] ?? null;
    const verificationStatus = this.normalizeOptionalText(verificationRow[0]?.status ?? null)?.toLowerCase() ?? 'unverified';

    // Blocking vs non-blocking missing fields.
    const missingBlocking: string[] = [];
    const missingNonBlocking: string[] = [];

    const onboardingScore = step1Completed ? 100 : 0;
    if (!step1Completed) missingBlocking.push('onboarding.step1');

    const profileFields = [
      { key: 'profile.full_name', ok: this.normalizeOptionalText(profile?.full_name) },
      { key: 'profile.avatar_url', ok: this.normalizeOptionalText(profile?.avatar_url) },
      { key: 'profile.bio', ok: this.normalizeOptionalText(profile?.bio) },
    ];
    const filledProfileCount = profileFields.filter((f) => !!f.ok).length;
    const profileScore = Math.round((filledProfileCount / profileFields.length) * 100);
    for (const f of profileFields) {
      if (!f.ok) missingBlocking.push(f.key);
    }

    // Verification + activity are tracked, but NON-blocking for now.
    const verificationScore = verificationStatus === 'approved' ? 100 : 0;
    if (verificationStatus !== 'approved') {
      missingNonBlocking.push('verification.status');
    }

    const activityScore = 0;
    missingNonBlocking.push('activity');

    // Overall score: normalize using only onboarding + profile so 100% == \"ready\".
    const overall = Math.round(
      onboardingScore * 0.5
        + profileScore * 0.5,
    );

    const scoreDetails: Record<string, unknown> = {
      weights: { onboarding: 0.5, profile: 0.5, verification: 0.0, activity: 0.0 },
      verification_status: verificationStatus,
      profile_fields: profileFields.map((f) => ({ key: f.key, filled: !!f.ok })),
      non_blocking_missing: missingNonBlocking,
    };

    const rows = await executor.$queryRaw<
      Array<{
        calculated_at: string | Date | null;
      }>
    >`
      insert into public.org_profile_scores (
        org_id,
        overall_score,
        onboarding_score,
        profile_score,
        verification_score,
        activity_score,
        missing_fields,
        score_details,
        calculated_at
      )
      values (
        ${membership.orgId}::uuid,
        ${overall}::smallint,
        ${onboardingScore}::smallint,
        ${profileScore}::smallint,
        ${verificationScore}::smallint,
        ${activityScore}::smallint,
        ${missingBlocking}::text[],
        ${JSON.stringify(scoreDetails)}::jsonb,
        timezone('utc', now())
      )
      on conflict (org_id) do update
      set
        overall_score = excluded.overall_score,
        onboarding_score = excluded.onboarding_score,
        profile_score = excluded.profile_score,
        verification_score = excluded.verification_score,
        activity_score = excluded.activity_score,
        missing_fields = excluded.missing_fields,
        score_details = excluded.score_details,
        calculated_at = excluded.calculated_at
      returning calculated_at
    `;

    const calculatedAt = rows[0]?.calculated_at;
    const calculatedIso =
      calculatedAt instanceof Date ? calculatedAt.toISOString() : this.normalizeOptionalText(calculatedAt ?? null);

    return {
      overall_score: overall,
      onboarding_score: onboardingScore,
      profile_score: profileScore,
      verification_score: verificationScore,
      activity_score: activityScore,
      missing_fields: missingBlocking,
      score_details: scoreDetails,
      calculated_at: calculatedIso,
    };
  }

  private buildMeView(
    userId: string,
    membership: MembershipContext,
    step1Completed: boolean,
    scores: OrgScoreSnapshot | null,
  ): OnboardingMeView {
    const missing = Array.isArray(scores?.missing_fields) ? scores!.missing_fields : [];
    const blocked = !step1Completed || (typeof scores?.overall_score === 'number' && scores.overall_score < 100);
    return {
      user_id: userId,
      org_id: membership.orgId,
      org_type: membership.orgType,
      onboarding: {
        step1_completed: step1Completed,
        onboarding_completed: step1Completed,
        blocked,
        missing,
      },
      scores,
    };
  }

  async getScoreForUser(userId: string): Promise<OrgScoreSnapshot | null> {
    const membership = await this.resolveMembership(userId);
    const rows = await this.prisma.$queryRaw<
      Array<{
        overall_score: number | string | null;
        onboarding_score: number | string | null;
        profile_score: number | string | null;
        verification_score: number | string | null;
        activity_score: number | string | null;
        missing_fields: string[] | null;
        score_details: Record<string, unknown> | null;
        calculated_at: string | Date | null;
      }>
    >`
      select
        overall_score,
        onboarding_score,
        profile_score,
        verification_score,
        activity_score,
        missing_fields,
        score_details,
        calculated_at
      from public.org_profile_scores
      where org_id = ${membership.orgId}::uuid
      limit 1
    `;

    const row = rows[0];
    if (!row) {
      return null;
    }

    const toInt = (v: number | string | null | undefined) => {
      if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
      if (typeof v === 'string') {
        const parsed = Number.parseInt(v, 10);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return 0;
    };

    const calculatedAt = row.calculated_at;
    const calculatedIso =
      calculatedAt instanceof Date ? calculatedAt.toISOString() : this.normalizeOptionalText(calculatedAt ?? null);

    return {
      overall_score: Math.max(0, Math.min(100, toInt(row.overall_score))),
      onboarding_score: Math.max(0, Math.min(100, toInt(row.onboarding_score))),
      profile_score: Math.max(0, Math.min(100, toInt(row.profile_score))),
      verification_score: Math.max(0, Math.min(100, toInt(row.verification_score))),
      activity_score: Math.max(0, Math.min(100, toInt(row.activity_score))),
      missing_fields: Array.isArray(row.missing_fields) ? row.missing_fields : [],
      score_details: row.score_details ?? {},
      calculated_at: calculatedIso,
    };
  }

  async getOnboardingMeForUser(userId: string): Promise<OnboardingMeView> {
    const membership = await this.resolveMembership(userId);
    await this.ensureDbOnboardingFromLegacyMeta(userId, membership);

    const [step1Completed, scores] = await Promise.all([
      this.readStep1Completed(membership.orgId),
      this.getScoreForUser(userId),
    ]);

    return this.buildMeView(userId, membership, step1Completed, scores);
  }

  async listProgressForOrg(userId: string, orgId: string): Promise<OnboardingProgressStepView[]> {
    const membership = await this.resolveMembership(userId);
    if (membership.orgId !== orgId) {
      throw new Error('Organization membership is required');
    }

    const rows = await this.prisma.$queryRaw<
      Array<{
        step_key: string;
        step_number: number | string | null;
        status: string | null;
        skipped_at: Date | null;
        completed_at: Date | null;
        updated_at: Date | null;
      }>
    >`
      select
        p.step_key,
        p.step_number,
        p.status::text as status,
        p.skipped_at,
        p.completed_at,
        p.updated_at
      from public.onboarding_progress p
      where p.org_id = ${orgId}::uuid
      order by p.step_number asc, p.step_key asc
    `;

    const toInt = (value: unknown): number => {
      if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
      if (typeof value === 'string') {
        const parsed = Number.parseInt(value.trim(), 10);
        if (Number.isFinite(parsed)) return parsed;
      }
      return 0;
    };
    const toIso = (value: Date | null | undefined): string | null => (value ? value.toISOString() : null);

    return rows
      .map((row): OnboardingProgressStepView | null => {
        const stepKey = this.normalizeOptionalText(row.step_key);
        const status = this.normalizeOptionalText(row.status)?.toLowerCase() as any;
        if (!stepKey || !status) {
          return null;
        }

        return {
          step_key: stepKey,
          step_number: Math.max(0, toInt(row.step_number)),
          status,
          skipped_at: toIso(row.skipped_at),
          completed_at: toIso(row.completed_at),
          updated_at: toIso(row.updated_at),
        };
      })
      .filter((row): row is OnboardingProgressStepView => !!row);
  }

  async saveProgressForOrg(
    userId: string,
    orgId: string,
    input: SaveOnboardingProgressInput,
  ): Promise<OnboardingMeView> {
    const membership = await this.resolveMembership(userId);
    if (membership.orgId !== orgId) {
      throw new Error('Organization membership is required');
    }
    return this.saveProgressForUser(userId, input);
  }

  async skipStepForOrg(userId: string, orgId: string, stepKey: string): Promise<OnboardingMeView> {
    return this.saveProgressForOrg(userId, orgId, {
      stepKey,
      status: 'skipped',
      stepNumber: undefined,
      skipped: true,
    });
  }

  async getScoreForOrg(userId: string, orgId: string): Promise<OrgScoreSnapshot | null> {
    const membership = await this.resolveMembership(userId);
    if (membership.orgId !== orgId) {
      throw new Error('Organization membership is required');
    }
    return this.getScoreForUser(userId);
  }

  async saveProgressForUser(
    userId: string,
    input: SaveOnboardingProgressInput,
  ): Promise<OnboardingMeView> {
    const membership = await this.resolveMembership(userId);

    const stepKey = this.normalizeOptionalText(input.stepKey);
    if (!stepKey) {
      throw new Error('stepKey is required');
    }

    const status = this.normalizeOptionalText(input.status)?.toLowerCase();
    if (!status) {
      throw new Error('status is required');
    }

    await this.prisma.$queryRaw`
      insert into public.onboarding_progress (
        org_id,
        step_key,
        step_number,
        status,
        skipped_at,
        completed_at,
        created_at,
        updated_at
      )
      values (
        ${membership.orgId}::uuid,
        ${stepKey},
        ${input.stepNumber ?? 1}::int,
        ${status}::public.onboarding_step_status,
        case when ${status} = 'skipped' then timezone('utc', now()) else null end,
        case when ${status} = 'completed' then timezone('utc', now()) else null end,
        timezone('utc', now()),
        timezone('utc', now())
      )
      on conflict (org_id, step_key) do update
      set
        step_number = excluded.step_number,
        status = excluded.status,
        skipped_at = excluded.skipped_at,
        completed_at = excluded.completed_at,
        updated_at = excluded.updated_at
    `;

    const scores = await this.computeAndPersistScores(userId, membership);
    const step1Completed = await this.readStep1Completed(membership.orgId);

    try {
      await this.aiMatching.enqueueOrg(membership.orgId);
    } catch {
      // ignore AI enqueue failures
    }

    return this.buildMeView(userId, membership, step1Completed, scores);
  }

  async saveStep1ForUser(userId: string, input: SaveOnboardingStep1Input): Promise<OnboardingMeView> {
    const membership = await this.resolveMembership(userId);

    if (membership.orgType !== input.role) {
      // Defensive: role should match org type.
      throw new Error('Onboarding role does not match your organization type');
    }

    this.assertStep1RequiredFields(input.role, input.values);

    await this.prisma.$transaction(async (tx) => {
      await this.ensureDbOnboardingFromLegacyMeta(userId, membership, tx);

      // Write step1 values into the role-specific onboarding table (upsert).
      const payload = JSON.stringify(input.values ?? {});
      if (input.role === 'startup') {
        await tx.$queryRaw`
          insert into public.startup_onboarding_answers (org_id, updated_at)
          values (${membership.orgId}::uuid, timezone('utc', now()))
          on conflict (org_id) do update set updated_at = timezone('utc', now())
        `;
        await tx.$queryRaw`
          update public.startup_onboarding_answers
          set
            elevator_pitch = coalesce(elevator_pitch, (${payload}::jsonb ->> 'elevator_pitch')),
            legal_name = coalesce(legal_name, (${payload}::jsonb ->> 'legal_name')),
            trading_name = coalesce(trading_name, (${payload}::jsonb ->> 'trading_name')),
            company_email = coalesce(company_email, (${payload}::jsonb ->> 'company_email')),
            product_demo_link = coalesce(product_demo_link, (${payload}::jsonb ->> 'product_demo_link')),
            primary_office_location = coalesce(primary_office_location, (${payload}::jsonb ->> 'primary_office_location')),
            country_of_incorporation = coalesce(country_of_incorporation, (${payload}::jsonb ->> 'country_of_incorporation')),
            updated_at = timezone('utc', now())
          where org_id = ${membership.orgId}::uuid
        `;
      } else if (input.role === 'investor') {
        await tx.$queryRaw`
          insert into public.investor_onboarding_answers (org_id, updated_at)
          values (${membership.orgId}::uuid, timezone('utc', now()))
          on conflict (org_id) do update set updated_at = timezone('utc', now())
        `;
        await tx.$queryRaw`
          update public.investor_onboarding_answers
          set
            entity_name = coalesce(entity_name, (${payload}::jsonb ->> 'entity_name')),
            primary_contact_name = coalesce(primary_contact_name, (${payload}::jsonb ->> 'primary_contact_name')),
            title_role = coalesce(title_role, (${payload}::jsonb ->> 'title_role')),
            linkedin_url = coalesce(linkedin_url, (${payload}::jsonb ->> 'linkedin_url')),
            website_url = coalesce(website_url, (${payload}::jsonb ->> 'website_url')),
            updated_at = timezone('utc', now())
          where org_id = ${membership.orgId}::uuid
        `;
      } else {
        await tx.$queryRaw`
          insert into public.advisor_onboarding_answers (org_id, updated_at)
          values (${membership.orgId}::uuid, timezone('utc', now()))
          on conflict (org_id) do update set updated_at = timezone('utc', now())
        `;
        await tx.$queryRaw`
          update public.advisor_onboarding_answers
          set
            professional_title = coalesce(professional_title, (${payload}::jsonb ->> 'professional_title')),
            headline = coalesce(headline, (${payload}::jsonb ->> 'headline')),
            professional_bio = coalesce(professional_bio, (${payload}::jsonb ->> 'professional_bio')),
            updated_at = timezone('utc', now())
          where org_id = ${membership.orgId}::uuid
        `;
      }

      await tx.$queryRaw`
        insert into public.onboarding_progress (
          org_id,
          step_key,
          step_number,
          status,
          completed_at,
          updated_at
        )
        values (
          ${membership.orgId}::uuid,
          'step1',
          1,
          'completed'::public.onboarding_step_status,
          timezone('utc', now()),
          timezone('utc', now())
        )
        on conflict (org_id, step_key) do update
        set
          status = excluded.status,
          completed_at = excluded.completed_at,
          updated_at = excluded.updated_at
      `;
    });

    const scores = await this.computeAndPersistScores(userId, membership);
    const step1Completed = await this.readStep1Completed(membership.orgId);

    try {
      await this.aiMatching.enqueueOrg(membership.orgId);
    } catch {
      // ignore AI enqueue failures
    }

    return this.buildMeView(userId, membership, step1Completed, scores);
  }

  async upsertAnswersForUser(userId: string, input: UpsertOnboardingAnswersInput): Promise<OnboardingMeView> {
    const membership = await this.resolveMembership(userId);
    if (membership.orgType !== input.role) {
      throw new Error('Onboarding role does not match your organization type');
    }

    const answers = input.answers ?? {};
    const payload = JSON.stringify(answers);

    await this.prisma.$transaction(async (tx) => {
      await this.ensureDbOnboardingFromLegacyMeta(userId, membership, tx);

      if (input.role === 'startup') {
        await tx.$queryRaw`
          insert into public.startup_onboarding_answers (org_id, updated_at)
          values (${membership.orgId}::uuid, timezone('utc', now()))
          on conflict (org_id) do update set updated_at = timezone('utc', now())
        `;
        await tx.$queryRaw`
          update public.startup_onboarding_answers
          set
            founders_data = coalesce(founders_data, '[]'::jsonb) || coalesce(${payload}::jsonb -> 'founders_data', '[]'::jsonb),
            advisors_data = coalesce(advisors_data, '[]'::jsonb) || coalesce(${payload}::jsonb -> 'advisors_data', '[]'::jsonb),
            match_algorithm_weights = coalesce(${payload}::jsonb -> 'match_algorithm_weights', match_algorithm_weights),
            notification_threshold = coalesce(${payload}::jsonb ->> 'notification_threshold', notification_threshold),
            updated_at = timezone('utc', now())
          where org_id = ${membership.orgId}::uuid
        `;
      } else if (input.role === 'investor') {
        await tx.$queryRaw`
          insert into public.investor_onboarding_answers (org_id, updated_at)
          values (${membership.orgId}::uuid, timezone('utc', now()))
          on conflict (org_id) do update set updated_at = timezone('utc', now())
        `;
        await tx.$queryRaw`
          update public.investor_onboarding_answers
          set
            stage_preferences = coalesce(${payload}::jsonb -> 'stage_preferences', stage_preferences),
            industry_preferences = coalesce(${payload}::jsonb -> 'industry_preferences', industry_preferences),
            match_algorithm_weights = coalesce(${payload}::jsonb -> 'match_algorithm_weights', match_algorithm_weights),
            notification_threshold = coalesce(${payload}::jsonb ->> 'notification_threshold', notification_threshold),
            notification_frequency = coalesce(${payload}::jsonb ->> 'notification_frequency', notification_frequency),
            updated_at = timezone('utc', now())
          where org_id = ${membership.orgId}::uuid
        `;
      } else {
        await tx.$queryRaw`
          insert into public.advisor_onboarding_answers (org_id, updated_at)
          values (${membership.orgId}::uuid, timezone('utc', now()))
          on conflict (org_id) do update set updated_at = timezone('utc', now())
        `;
        await tx.$queryRaw`
          update public.advisor_onboarding_answers
          set
            primary_expertise_areas = coalesce(${payload}::jsonb -> 'primary_expertise_areas', primary_expertise_areas),
            industry_expertise = coalesce(${payload}::jsonb -> 'industry_expertise', industry_expertise),
            case_studies = coalesce(${payload}::jsonb -> 'case_studies', case_studies),
            updated_at = timezone('utc', now())
          where org_id = ${membership.orgId}::uuid
        `;
      }

      if (input.completed === true || input.skipped === true) {
        await tx.$queryRaw`
          insert into public.onboarding_progress (
            org_id,
            step_key,
            step_number,
            status,
            skipped_at,
            completed_at,
            updated_at
          )
          values (
            ${membership.orgId}::uuid,
            'questionnaire',
            2,
            ${input.skipped === true ? 'skipped' : 'completed'}::public.onboarding_step_status,
            case when ${input.skipped === true} then timezone('utc', now()) else null end,
            timezone('utc', now()),
            timezone('utc', now())
          )
          on conflict (org_id, step_key) do update
          set
            status = excluded.status,
            skipped_at = excluded.skipped_at,
            completed_at = excluded.completed_at,
            updated_at = excluded.updated_at
        `;
      }
    });

    const scores = await this.computeAndPersistScores(userId, membership);
    const step1Completed = await this.readStep1Completed(membership.orgId);
    return this.buildMeView(userId, membership, step1Completed, scores);
  }
}

