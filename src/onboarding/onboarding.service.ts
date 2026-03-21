import { Injectable } from '@nestjs/common';
import { PrismaService, PrismaSqlExecutor } from '../prisma/prisma.service';
import { AiMatchingService } from '../ai/ai-matching.service';
import { UpstashRedisCacheService } from '../cache/upstash-redis-cache.service';
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
    private readonly cache: UpstashRedisCacheService,
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

  private async invalidateWorkspaceCachesForUser(userId: string): Promise<void> {
    try {
      await this.cache.deleteMany([
        this.cache.workspaceIdentityKey(userId),
        this.cache.workspaceBootstrapKey(userId),
        ...this.cache.workspaceSettingsSnapshotKeysForUser(userId),
      ]);
    } catch {
      // Best-effort cache invalidation only.
    }
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

  private hasStep1RequiredFields(role: OnboardingRole, values: Record<string, unknown>): boolean {
    const hasString = (key: string) =>
      typeof values[key] === 'string' && (values[key] as string).trim().length > 0;
    const hasArray = (key: string) => Array.isArray(values[key]) && (values[key] as unknown[]).length > 0;

    if (role === 'startup') {
      const identityOk =
        hasString('legal_name')
        || hasString('trading_name')
        || hasString('company_name')
        || hasString('companyName');
      const contactOk =
        hasString('website')
        || hasString('website_url')
        || hasString('websiteUrl')
        || hasString('company_email')
        || hasString('linkedin_company_url')
        || hasString('country_of_incorporation')
        || hasString('countryOfIncorporation');
      return !!identityOk && !!contactOk;
    }

    if (role === 'investor') {
      const identityOk =
        hasString('entity_name')
        || hasString('full_name')
        || hasString('primary_contact_name')
        || hasString('investing_years_band')
        || hasString('investingYears');
      const contactOk =
        hasString('email')
        || hasString('linkedin_url')
        || hasString('website_url')
        || hasString('total_investments_made_band')
        || hasString('totalStartupInvestments');
      return !!identityOk && !!contactOk;
    }

    const identityOk =
      hasString('professional_title')
      || hasString('full_name')
      || hasString('firm_name')
      || hasString('business_type')
      || hasString('businessType');
    const contactOk =
      hasString('email')
      || hasString('linkedin_url')
      || hasString('website_url')
      || hasString('years_in_consulting_band')
      || hasString('yearsConsulting')
      || hasArray('previous_experience_types')
      || hasArray('previousExperience');
    return !!identityOk && !!contactOk;
  }

  private assertStep1RequiredFields(role: OnboardingRole, values: Record<string, unknown>): void {
    console.log('[DEBUG] assertStep1RequiredFields called', { role, values });
    if (this.hasStep1RequiredFields(role, values)) {
      return;
    }
    console.error('[DEBUG] assertStep1RequiredFields FAILED', { role, values });
    if (role === 'startup') {
      throw new Error(
        'Startup step 1 requires company identity and either a contact/link or country of incorporation.',
      );
    }
    if (role === 'investor') {
      throw new Error(
        'Investor step 1 requires either profile identity fields or the experience fields from the onboarding wizard.',
      );
    }
    throw new Error(
      'Advisor step 1 requires either profile identity fields or the business/experience fields from the onboarding wizard.',
    );
  }

  private async upsertUserOnboardingDetails(
    userId: string,
    organizationType: OnboardingRole,
    details: Record<string, unknown>,
    tx?: SqlExecutor,
  ): Promise<void> {
    const executor = this.getExecutor(tx);
    const hasTable = await this.hasUserOnboardingDetailsTable(executor);
    if (!hasTable) {
      return;
    }
    const payload = JSON.stringify(details ?? {});
    await executor.$queryRaw`
      insert into public.user_onboarding_details (
        user_id,
        organization_type,
        details,
        updated_at
      )
      values (
        ${userId}::uuid,
        ${organizationType},
        ${payload}::jsonb,
        timezone('utc', now())
      )
      on conflict (user_id, organization_type) do update
      set
        details = coalesce(public.user_onboarding_details.details, '{}'::jsonb) || ${payload}::jsonb,
        updated_at = timezone('utc', now())
    `;
  }

  private async hasUserOnboardingDetailsTable(tx?: SqlExecutor): Promise<boolean> {
    const executor = this.getExecutor(tx);
    const rows = await executor.$queryRaw<
      Array<{
        regclass: string | null;
      }>
    >`
      select to_regclass('public.user_onboarding_details')::text as regclass
    `;
    return !!this.normalizeOptionalText(rows[0]?.regclass ?? null);
  }

  private async markStep1Completed(orgId: string, tx?: SqlExecutor): Promise<void> {
    const executor = this.getExecutor(tx);
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
        ${orgId}::uuid,
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
  }

  private async readStep1Completed(
    userId: string,
    membership: MembershipContext,
    tx?: SqlExecutor,
  ): Promise<boolean> {
    const executor = this.getExecutor(tx);
    const rows = await executor.$queryRaw<
      Array<{
        status: string | null;
      }>
    >`
      select p.status::text as status
      from public.onboarding_progress p
      where p.org_id = ${membership.orgId}::uuid
        and p.step_key = 'step1'
      limit 1
    `;
    const status = this.normalizeOptionalText(rows[0]?.status ?? null)?.toLowerCase();
    if (status === 'completed') {
      return true;
    }

    const hasDetailsTable = await this.hasUserOnboardingDetailsTable(executor);
    if (hasDetailsTable) {
      const detailsRows = await executor.$queryRaw<
        Array<{
          details: unknown;
        }>
      >`
        select d.details
        from public.user_onboarding_details d
        where d.user_id = ${userId}::uuid
          and d.organization_type = ${membership.orgType}
        limit 1
      `;
      const details = detailsRows[0]?.details;
      if (details && typeof details === 'object' && !Array.isArray(details)) {
        if (this.hasStep1RequiredFields(membership.orgType, details as Record<string, unknown>)) {
          await this.markStep1Completed(membership.orgId, executor);
          return true;
        }
      }
    }

    if (membership.orgType === 'startup') {
      const startupRows = await executor.$queryRaw<
        Array<{
          legal_name: string | null;
          trading_name: string | null;
          company_email: string | null;
          linkedin_company_url: string | null;
          country_of_incorporation: string | null;
        }>
      >`
        select
          s.legal_name,
          s.trading_name,
          s.company_email,
          s.linkedin_company_url,
          s.country_of_incorporation
        from public.startup_onboarding_answers s
        where s.org_id = ${membership.orgId}::uuid
        limit 1
      `;
      const row = startupRows[0];
      const completed = this.hasStep1RequiredFields(membership.orgType, {
        legal_name: row?.legal_name ?? null,
        trading_name: row?.trading_name ?? null,
        company_email: row?.company_email ?? null,
        linkedin_company_url: row?.linkedin_company_url ?? null,
        country_of_incorporation: row?.country_of_incorporation ?? null,
      });
      if (completed) {
        await this.markStep1Completed(membership.orgId, executor);
      }
      return completed;
    }

    if (membership.orgType === 'investor') {
      const investorRows = await executor.$queryRaw<
        Array<{
          entity_name: string | null;
          primary_contact_name: string | null;
          linkedin_url: string | null;
          investing_years_band: string | null;
          total_investments_made_band: string | null;
        }>
      >`
        select
          i.entity_name,
          i.primary_contact_name,
          i.linkedin_url,
          i.investing_years_band,
          i.total_investments_made_band
        from public.investor_onboarding_answers i
        where i.org_id = ${membership.orgId}::uuid
        limit 1
      `;
      const row = investorRows[0];
      const completed = this.hasStep1RequiredFields(membership.orgType, {
        entity_name: row?.entity_name ?? null,
        primary_contact_name: row?.primary_contact_name ?? null,
        linkedin_url: row?.linkedin_url ?? null,
        investing_years_band: row?.investing_years_band ?? null,
        total_investments_made_band: row?.total_investments_made_band ?? null,
      });
      if (completed) {
        await this.markStep1Completed(membership.orgId, executor);
      }
      return completed;
    }

    const advisorRows = await executor.$queryRaw<
      Array<{
        professional_title: string | null;
        business_type: string | null;
        years_in_consulting_band: string | null;
        previous_experience_types: string[] | null;
      }>
    >`
      select
        a.professional_title,
        a.business_type,
        a.years_in_consulting_band,
        a.previous_experience_types
      from public.advisor_onboarding_answers a
      where a.org_id = ${membership.orgId}::uuid
      limit 1
    `;
    const row = advisorRows[0];
    const completed = this.hasStep1RequiredFields(membership.orgType, {
      professional_title: row?.professional_title ?? null,
      business_type: row?.business_type ?? null,
      years_in_consulting_band: row?.years_in_consulting_band ?? null,
      previous_experience_types: row?.previous_experience_types ?? [],
    });
    if (completed) {
      await this.markStep1Completed(membership.orgId, executor);
    }
    return completed;
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
    const step1Completed = await this.readStep1Completed(userId, membership, executor);
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
      this.readStep1Completed(userId, membership, executor),
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

    // Readiness gating: require only core profile fields for access.
    // `profile.avatar_url` is optional (non-blocking) because users should be able to
    // complete onboarding + use core features without uploading an avatar.
    const profileFieldsAll = [
      { key: 'profile.full_name', ok: this.normalizeOptionalText(profile?.full_name) },
      { key: 'profile.avatar_url', ok: this.normalizeOptionalText(profile?.avatar_url) },
      { key: 'profile.bio', ok: this.normalizeOptionalText(profile?.bio) },
    ];
    const profileFieldsBlocking = profileFieldsAll.filter((f) => f.key !== 'profile.avatar_url');
    const filledProfileCount = profileFieldsBlocking.filter((f) => !!f.ok).length;
    const profileScore = Math.round((filledProfileCount / profileFieldsBlocking.length) * 100);
    for (const f of profileFieldsBlocking) {
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
      profile_fields: profileFieldsAll.map((f) => ({ key: f.key, filled: !!f.ok })),
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
    await this.ensureDbOnboardingFromLegacyMeta(userId, membership);
    return this.computeAndPersistScores(userId, membership);
  }

  async getOnboardingMeForUser(userId: string): Promise<OnboardingMeView> {
    const membership = await this.resolveMembership(userId);
    await this.ensureDbOnboardingFromLegacyMeta(userId, membership);

    const [step1Completed, scores] = await Promise.all([
      this.readStep1Completed(userId, membership),
      this.computeAndPersistScores(userId, membership),
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
    const step1Completed = await this.readStep1Completed(userId, membership);

    try {
      await this.aiMatching.enqueueOrg(membership.orgId);
    } catch {
      // ignore AI enqueue failures
    }

    await this.invalidateWorkspaceCachesForUser(userId);

    return this.buildMeView(userId, membership, step1Completed, scores);
  }

  async saveStep1ForUser(userId: string, input: SaveOnboardingStep1Input): Promise<OnboardingMeView> {
    const membership = await this.resolveMembership(userId);

    if (membership.orgType !== input.role) {
      // Defensive: role should match org type.
      throw new Error('Onboarding role does not match your organization type');
    }

    console.log(
      '[onboarding-step1][api]',
      JSON.stringify({
        userId,
        orgId: membership.orgId,
        orgType: membership.orgType,
        role: input.role,
        values: input.values ?? {},
      }),
    );

    this.assertStep1RequiredFields(input.role, input.values);

    await this.prisma.$transaction(async (tx) => {
      await this.ensureDbOnboardingFromLegacyMeta(userId, membership, tx);
      await this.upsertUserOnboardingDetails(userId, input.role, input.values ?? {}, tx);

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
            legal_name = coalesce(legal_name, (${payload}::jsonb ->> 'legal_name'), (${payload}::jsonb ->> 'company_name'), (${payload}::jsonb ->> 'companyName')),
            trading_name = coalesce(trading_name, (${payload}::jsonb ->> 'trading_name'), (${payload}::jsonb ->> 'company_name'), (${payload}::jsonb ->> 'companyName')),
            company_email = coalesce(company_email, (${payload}::jsonb ->> 'company_email')),
            product_demo_link = coalesce(product_demo_link, (${payload}::jsonb ->> 'product_demo_link')),
            primary_office_location = coalesce(primary_office_location, (${payload}::jsonb ->> 'primary_office_location')),
            country_of_incorporation = coalesce(country_of_incorporation, (${payload}::jsonb ->> 'country_of_incorporation'), (${payload}::jsonb ->> 'countryOfIncorporation')),
            company_stage_band = coalesce(company_stage_band, (${payload}::jsonb ->> 'company_stage_band'), (${payload}::jsonb ->> 'company_stage'), (${payload}::jsonb ->> 'companyStage')),
            primary_industry = coalesce(primary_industry, (${payload}::jsonb ->> 'primary_industry'), (${payload}::jsonb ->> 'industry')),
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
            investing_years_band = coalesce(investing_years_band, (${payload}::jsonb ->> 'investing_years_band'), (${payload}::jsonb ->> 'investingYears')),
            total_investments_made_band = coalesce(total_investments_made_band, (${payload}::jsonb ->> 'total_investments_made_band'), (${payload}::jsonb ->> 'totalStartupInvestments')),
            notable_exits = coalesce(notable_exits, (${payload}::jsonb ->> 'notable_exits'), (${payload}::jsonb ->> 'notableExits')),
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
            business_type = coalesce(business_type, (${payload}::jsonb ->> 'business_type'), (${payload}::jsonb ->> 'businessType')),
            years_in_consulting_band = coalesce(years_in_consulting_band, (${payload}::jsonb ->> 'years_in_consulting_band'), (${payload}::jsonb ->> 'yearsConsulting')),
            headline = coalesce(headline, (${payload}::jsonb ->> 'headline')),
            professional_bio = coalesce(professional_bio, (${payload}::jsonb ->> 'professional_bio')),
            previous_experience_types = case
              when jsonb_typeof(${payload}::jsonb -> 'previous_experience_types') = 'array'
                then array(select jsonb_array_elements_text(${payload}::jsonb -> 'previous_experience_types'))
              when jsonb_typeof(${payload}::jsonb -> 'previousExperience') = 'array'
                then array(select jsonb_array_elements_text(${payload}::jsonb -> 'previousExperience'))
              else previous_experience_types
            end,
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
    const step1Completed = await this.readStep1Completed(userId, membership);

    try {
      await this.aiMatching.enqueueOrg(membership.orgId);
    } catch {
      // ignore AI enqueue failures
    }

    await this.invalidateWorkspaceCachesForUser(userId);

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
      await this.upsertUserOnboardingDetails(userId, input.role, answers, tx);

      if (input.role === 'startup') {
        await tx.$queryRaw`
          insert into public.startup_onboarding_answers (org_id, updated_at)
          values (${membership.orgId}::uuid, timezone('utc', now()))
          on conflict (org_id) do update set updated_at = timezone('utc', now())
        `;
        await tx.$queryRaw`
          update public.startup_onboarding_answers
          set
            legal_name = coalesce(legal_name, (${payload}::jsonb ->> 'legal_name'), (${payload}::jsonb ->> 'company_name'), (${payload}::jsonb ->> 'companyName')),
            trading_name = coalesce(trading_name, (${payload}::jsonb ->> 'trading_name'), (${payload}::jsonb ->> 'company_name'), (${payload}::jsonb ->> 'companyName')),
            country_of_incorporation = coalesce(country_of_incorporation, (${payload}::jsonb ->> 'country_of_incorporation'), (${payload}::jsonb ->> 'countryOfIncorporation')),
            company_stage_band = coalesce(company_stage_band, (${payload}::jsonb ->> 'company_stage_band'), (${payload}::jsonb ->> 'company_stage'), (${payload}::jsonb ->> 'companyStage')),
            primary_industry = coalesce(primary_industry, (${payload}::jsonb ->> 'primary_industry'), (${payload}::jsonb ->> 'industry')),
            problem_statement = coalesce(problem_statement, (${payload}::jsonb ->> 'problem_statement'), (${payload}::jsonb ->> 'problemStatement')),
            solution_statement = coalesce(solution_statement, (${payload}::jsonb ->> 'solution_statement'), (${payload}::jsonb ->> 'solution')),
            unique_advantage = coalesce(unique_advantage, (${payload}::jsonb ->> 'unique_advantage'), (${payload}::jsonb ->> 'uniqueValueProposition')),
            waitlist_count = coalesce(waitlist_count, nullif((${payload}::jsonb ->> 'waitlist_count'), '')::integer, nullif((${payload}::jsonb ->> 'waitlistSize'), '')::integer),
            mrr_usd = coalesce(mrr_usd, nullif((${payload}::jsonb ->> 'mrr_usd'), '')::integer, nullif((${payload}::jsonb ->> 'mrrUsd'), '')::integer),
            revenue_growth_rate_mom_pct = coalesce(revenue_growth_rate_mom_pct, nullif((${payload}::jsonb ->> 'revenue_growth_rate_mom_pct'), '')::integer, nullif((${payload}::jsonb ->> 'momGrowthPercent'), '')::integer),
            cac_usd = coalesce(cac_usd, nullif((${payload}::jsonb ->> 'cac_usd'), '')::integer, nullif((${payload}::jsonb ->> 'cacUsd'), '')::integer),
            ltv_usd = coalesce(ltv_usd, nullif((${payload}::jsonb ->> 'ltv_usd'), '')::integer, nullif((${payload}::jsonb ->> 'ltvUsd'), '')::integer),
            churn_rate_pct = coalesce(churn_rate_pct, nullif((${payload}::jsonb ->> 'churn_rate_pct'), '')::integer, nullif((${payload}::jsonb ->> 'churnRatePercent'), '')::integer),
            total_paying_customers = coalesce(total_paying_customers, nullif((${payload}::jsonb ->> 'total_paying_customers'), '')::integer, nullif((${payload}::jsonb ->> 'totalCustomers'), '')::integer),
            co_founders_count = coalesce(co_founders_count, nullif((${payload}::jsonb ->> 'co_founders_count'), '')::integer, nullif((${payload}::jsonb ->> 'numberOfFounders'), '')::integer),
            round_type = coalesce(round_type, (${payload}::jsonb ->> 'round_type'), (${payload}::jsonb ->> 'fundingRoundType')),
            target_raise_usd = coalesce(target_raise_usd, nullif((${payload}::jsonb ->> 'target_raise_usd'), '')::bigint, nullif((${payload}::jsonb ->> 'amountRaisingUsd'), '')::bigint),
            committed_so_far_usd = coalesce(committed_so_far_usd, nullif((${payload}::jsonb ->> 'committed_so_far_usd'), '')::bigint, nullif((${payload}::jsonb ->> 'amountCommittedUsd'), '')::bigint),
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
            investing_years_band = coalesce(investing_years_band, (${payload}::jsonb ->> 'investing_years_band'), (${payload}::jsonb ->> 'investingYears')),
            total_investments_made_band = coalesce(total_investments_made_band, (${payload}::jsonb ->> 'total_investments_made_band'), (${payload}::jsonb ->> 'totalStartupInvestments')),
            notable_exits = coalesce(notable_exits, (${payload}::jsonb ->> 'notable_exits'), (${payload}::jsonb ->> 'notableExits')),
            check_size_band = coalesce(check_size_band, (${payload}::jsonb ->> 'check_size_band'), (${payload}::jsonb ->> 'typicalCheckSize')),
            total_investable_capital_band = coalesce(total_investable_capital_band, (${payload}::jsonb ->> 'total_investable_capital_band'), (${payload}::jsonb ->> 'investableCapital12mo')),
            new_investments_12mo_band = coalesce(new_investments_12mo_band, (${payload}::jsonb ->> 'new_investments_12mo_band'), (${payload}::jsonb ->> 'investmentsPlanned')),
            investment_structures = case
              when jsonb_typeof(${payload}::jsonb -> 'investment_structures') = 'array'
                then array(select jsonb_array_elements_text(${payload}::jsonb -> 'investment_structures'))
              when jsonb_typeof(${payload}::jsonb -> 'preferredStructure') = 'array'
                then array(select jsonb_array_elements_text(${payload}::jsonb -> 'preferredStructure'))
              else investment_structures
            end,
            geographic_regions = case
              when jsonb_typeof(${payload}::jsonb -> 'geographic_regions') = 'array'
                then array(select jsonb_array_elements_text(${payload}::jsonb -> 'geographic_regions'))
              when jsonb_typeof(${payload}::jsonb -> 'targetRegions') = 'array'
                then array(select jsonb_array_elements_text(${payload}::jsonb -> 'targetRegions'))
              else geographic_regions
            end,
            remote_team_openness = coalesce(remote_team_openness, (${payload}::jsonb ->> 'remote_team_openness'), (${payload}::jsonb ->> 'remoteTeamPreference')),
            investment_approach = coalesce(investment_approach, (${payload}::jsonb ->> 'investment_approach'), (${payload}::jsonb ->> 'investmentStyle')),
            value_add_offerings = case
              when jsonb_typeof(${payload}::jsonb -> 'value_add_offerings') = 'array'
                then array(select jsonb_array_elements_text(${payload}::jsonb -> 'value_add_offerings'))
              when jsonb_typeof(${payload}::jsonb -> 'valueAddBeyondCapital') = 'array'
                then array(select jsonb_array_elements_text(${payload}::jsonb -> 'valueAddBeyondCapital'))
              else value_add_offerings
            end,
            diversity_priority = coalesce(diversity_priority, (${payload}::jsonb ->> 'diversity_priority'), (${payload}::jsonb ->> 'founderDiversityFocus')),
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
            business_type = coalesce(business_type, (${payload}::jsonb ->> 'business_type'), (${payload}::jsonb ->> 'businessType')),
            years_in_consulting_band = coalesce(years_in_consulting_band, (${payload}::jsonb ->> 'years_in_consulting_band'), (${payload}::jsonb ->> 'yearsConsulting')),
            previous_experience_types = case
              when jsonb_typeof(${payload}::jsonb -> 'previous_experience_types') = 'array'
                then array(select jsonb_array_elements_text(${payload}::jsonb -> 'previous_experience_types'))
              when jsonb_typeof(${payload}::jsonb -> 'previousExperience') = 'array'
                then array(select jsonb_array_elements_text(${payload}::jsonb -> 'previousExperience'))
              else previous_experience_types
            end,
            client_types = case
              when jsonb_typeof(${payload}::jsonb -> 'client_types') = 'array'
                then array(select jsonb_array_elements_text(${payload}::jsonb -> 'client_types'))
              when jsonb_typeof(${payload}::jsonb -> 'clientTypesServed') = 'array'
                then array(select jsonb_array_elements_text(${payload}::jsonb -> 'clientTypesServed'))
              else client_types
            end,
            total_clients_served = coalesce(total_clients_served, nullif((${payload}::jsonb ->> 'total_clients_served'), '')::integer, nullif((${payload}::jsonb ->> 'clientsServedCount'), '')::integer),
            revenue_growth_driven_usd = coalesce(revenue_growth_driven_usd, nullif((${payload}::jsonb ->> 'revenue_growth_driven_usd'), '')::bigint, nullif((${payload}::jsonb ->> 'revenueGrowthUsd'), '')::bigint),
            funding_raised_for_clients = coalesce(funding_raised_for_clients, nullif((${payload}::jsonb ->> 'funding_raised_for_clients'), '')::bigint, nullif((${payload}::jsonb ->> 'fundingRaisedUsd'), '')::bigint),
            geographic_pref = case
              when jsonb_typeof(${payload}::jsonb -> 'geographic_pref') = 'array'
                then array(select jsonb_array_elements_text(${payload}::jsonb -> 'geographic_pref'))
              when jsonb_typeof(${payload}::jsonb -> 'preferredGeography') = 'array'
                then array(select jsonb_array_elements_text(${payload}::jsonb -> 'preferredGeography'))
              else geographic_pref
            end,
            engagement_length_pref = coalesce(engagement_length_pref, (${payload}::jsonb ->> 'engagement_length_pref'), (${payload}::jsonb ->> 'engagementLengthPreference')),
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
        
        if (input.completed === true) {
          // Mark organization as onboarded
          await tx.$queryRaw`
            update public.organizations
            set onboarding_complete = true, updated_at = timezone('utc', now())
            where id = ${membership.orgId}::uuid
          `;

          if (input.role === 'startup') {
            // Auto-publish the discovery post for startups
            await tx.$queryRaw`
              insert into public.startup_posts as sp (
                startup_org_id,
                title,
                summary,
                stage,
                status,
                published_at,
                created_by,
                updated_by,
                updated_at
              )
              values (
                ${membership.orgId}::uuid,
                coalesce((${payload}::jsonb ->> 'company_name'), (${payload}::jsonb ->> 'legal_name'), 'New Startup'),
                coalesce((${payload}::jsonb ->> 'elevator_pitch'), 'We are building something exciting.'),
                coalesce((${payload}::jsonb ->> 'company_stage_band'), 'Idea'),
                'published'::public.startup_post_status,
                timezone('utc', now()),
                ${userId}::uuid,
                ${userId}::uuid,
                timezone('utc', now())
              )
              on conflict (startup_org_id) do update
              set
                status = 'published'::public.startup_post_status,
                published_at = coalesce(sp.published_at, timezone('utc', now())),
                updated_by = ${userId}::uuid,
                updated_at = timezone('utc', now())
            `;
          }
        }
      }
    });

    const scores = await this.computeAndPersistScores(userId, membership);
    const step1Completed = await this.readStep1Completed(userId, membership);
    await this.invalidateWorkspaceCachesForUser(userId);
    return this.buildMeView(userId, membership, step1Completed, scores);
  }
}
