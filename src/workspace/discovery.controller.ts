import { Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { BetterAuthJwtGuard } from '../auth-integration/better-auth-jwt.guard';
import { AuthenticatedUser } from '../auth-integration/auth-integration.service';
import { ReadinessGuard } from '../onboarding/readiness.guard';
import { BillingService } from '../billing/billing.service';
import type { WorkspaceUnifiedDiscoveryCard } from './workspace.types';
import { WorkspaceService } from './workspace.service';
import { PrismaService } from '../prisma/prisma.service';

interface RequestWithUser {
  user?: AuthenticatedUser;
}

@Controller({ path: 'discovery', version: ['1', VERSION_NEUTRAL] })
@UseGuards(BetterAuthJwtGuard)
export class DiscoveryController {
  constructor(
    private readonly workspace: WorkspaceService,
    private readonly billing: BillingService,
    private readonly prisma: PrismaService,
  ) {}

  private applyTierGating(cards: WorkspaceUnifiedDiscoveryCard[], planCode: string): WorkspaceUnifiedDiscoveryCard[] {
    const tier = (planCode || 'free').toLowerCase();
    if (tier !== 'free') {
      return cards;
    }

    // Free tier: keep shape but reduce sensitive detail density.
    return cards.map((card) => ({
      ...card,
      description: '',
      industry_or_expertise: Array.isArray(card.industry_or_expertise)
        ? card.industry_or_expertise.slice(0, 3)
        : [],
    }));
  }

  // v3 alias: GET /api/discovery/feed
  @Get('feed')
  @UseGuards(ReadinessGuard)
  async getFeed(@Req() req: RequestWithUser): Promise<WorkspaceUnifiedDiscoveryCard[]> {
    const user = req.user;
    if (!user) return [];

    const [cards, me] = await Promise.all([
      this.workspace.getUnifiedDiscoveryFeedForUser(user.id),
      this.billing.getBillingMeForUser(user.id),
    ]);

    const planCode = me?.plan.code ?? 'free';
    return this.applyTierGating(cards, planCode);
  }

  // v3 alias: GET /api/discovery/feed/:orgId
  @Get('feed/:orgId')
  @UseGuards(ReadinessGuard)
  async getFeedCard(
    @Req() req: RequestWithUser,
    @Param('orgId') orgId: string,
  ): Promise<WorkspaceUnifiedDiscoveryCard | null> {
    const user = req.user;
    if (!user) return null;

    const [card, me] = await Promise.all([
      this.workspace.getUnifiedDiscoveryCardForUser(user.id, orgId),
      this.billing.getBillingMeForUser(user.id),
    ]);
    if (!card) return null;

    const planCode = me?.plan.code ?? 'free';
    const viewerOrgId = me?.org_id ?? null;
    const viewerOrgType = me?.org_type ?? null;

    if (viewerOrgId) {
      await this.recordProfileView({
        userId: user.id,
        viewerOrgId,
        targetOrgId: orgId,
        viewKind: 'detail',
        planCode,
        orgType: viewerOrgType,
      });
    }

    const gated = this.applyTierGating([card], planCode);
    return gated[0] ?? null;
  }

  private async recordProfileView(params: {
    userId: string;
    viewerOrgId: string;
    targetOrgId: string;
    viewKind: 'detail' | 'discovery';
    planCode: string;
    orgType: string | null;
  }): Promise<void> {
    const plan = (params.planCode || 'free').toLowerCase();
    const orgType = (params.orgType || '').toLowerCase();

    if (plan === 'free' && orgType === 'investor' && params.viewKind === 'detail') {
      const rows = await this.prisma.$queryRaw<Array<{ n: number }>>`
        select count(*)::int as n
        from public.discovery_profile_views
        where viewer_org_id = ${params.viewerOrgId}::uuid
          and view_kind = 'detail'::public.profile_view_kind
          and date_trunc('month', last_viewed_at) = date_trunc('month', timezone('utc', now()))
      `;
      const count = rows[0]?.n ?? 0;
      if (count >= 10) {
        throw new ForbiddenException({
          code: 'USAGE_LIMIT_REACHED',
          feature: 'profile_views_full',
          limit: 10,
          message: 'Free investors can view 10 full profiles per month. Upgrade to unlock more.',
        });
      }
    }

    await this.prisma.$queryRaw`
      insert into public.discovery_profile_views (viewer_org_id, target_org_id, view_kind, view_count, last_viewed_at)
      values (${params.viewerOrgId}::uuid, ${params.targetOrgId}::uuid, ${params.viewKind}::public.profile_view_kind, 1, timezone('utc', now()))
      on conflict (viewer_org_id, target_org_id, view_kind) do update
      set view_count = discovery_profile_views.view_count + 1,
          last_viewed_at = timezone('utc', now())
    `;

    const suspiciousRows = await this.prisma.$queryRaw<Array<{ n: number }>>`
      select coalesce(sum(view_count), 0)::int as n
      from public.discovery_profile_views
      where viewer_org_id = ${params.viewerOrgId}::uuid
        and last_viewed_at > (timezone('utc', now()) - interval '1 hour')
    `;
    const lastHour = suspiciousRows[0]?.n ?? 0;
    if (lastHour > 20) {
      await this.prisma.$queryRaw`
        insert into public.user_security_events (user_id, event_type, metadata)
        values (
          ${params.userId}::uuid,
          'suspicious_activity'::public.security_event_type,
          jsonb_build_object('reason','profile_views_spike','count_last_hour',${lastHour})
        )
      `;
    }
  }

  // v3: store match feedback (interested/passed/etc)
  @Post('feedback')
  @UseGuards(ReadinessGuard)
  async feedback(
    @Req() req: RequestWithUser,
    @Body() input: { targetOrgId: string; feedbackType: string; declineReason?: string | null },
  ): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      const me = await this.workspace.getWorkspaceIdentityForUser(user.id);
      const orgId = me?.membership?.org_id;
      if (!orgId) return { error: 'Organization membership is required' };
      const targetOrgId = String(input.targetOrgId || '').trim();
      const feedbackType = String(input.feedbackType || '').trim();
      if (!targetOrgId) return { error: 'targetOrgId is required' };
      if (!feedbackType) return { error: 'feedbackType is required' };

      await this.prisma.$queryRaw`
        insert into public.ai_match_feedback (from_org_id, target_org_id, feedback_type, decline_reason)
        values (${orgId}::uuid, ${targetOrgId}::uuid, ${feedbackType}::public.match_feedback_type, ${input.declineReason ?? null})
        on conflict (from_org_id, target_org_id) do update
        set feedback_type = excluded.feedback_type, decline_reason = excluded.decline_reason
      `;
      return { success: true };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to save feedback' };
    }
  }

  // v3: list AI matches (demo: uses existing ai_match_scores table; free returns empty)
  @Get('matches')
  @UseGuards(ReadinessGuard)
  async matches(@Req() req: RequestWithUser): Promise<Array<{ to_org_id: string; overall_score: number; reasons: string[] }>> {
    const user = req.user;
    if (!user) return [];
    try {
      const me = await this.billing.getBillingMeForUser(user.id);
      const planCode = (me?.plan.code ?? 'free').toLowerCase();
      if (planCode === 'free') return [];

      const identity = await this.workspace.getWorkspaceIdentityForUser(user.id);
      const orgId = identity?.membership?.org_id;
      if (!orgId) return [];

      const rows = await this.prisma.$queryRaw<
        Array<{ to_org_id: string; overall_score: number; match_reasons: string[] | null }>
      >`
        select to_org_id::text as to_org_id, overall_score::int as overall_score, match_reasons
        from public.ai_match_scores
        where from_org_id = ${orgId}::uuid and disqualified = false
        order by overall_score desc
        limit 50
      `;
      return (rows ?? []).map((r) => ({
        to_org_id: r.to_org_id,
        overall_score: Math.max(0, Math.min(100, Number(r.overall_score ?? 0))),
        reasons: Array.isArray(r.match_reasons) ? r.match_reasons : [],
      }));
    } catch {
      return [];
    }
  }
}

