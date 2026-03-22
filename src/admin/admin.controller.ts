import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { BetterAuthJwtGuard } from '../auth-integration/better-auth-jwt.guard';
import { AuthenticatedUser } from '../auth-integration/auth-integration.service';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AdminAuditLogView,
  AdminDealRoomView,
  AdminMeView,
  AdminOrgView,
  AdminPlatformUserView,
  AdminStatsView,
  AdminSubscriptionView,
  AdminTicketView,
  AssignTicketInput,
  ForceOrgTierInput,
  PatchAdminPlatformUserInput,
  UpsertCapabilityOverrideInput,
  UpdateOrgLifecycleInput,
} from './admin.types';

interface RequestWithUser {
  user?: AuthenticatedUser;
}

@Controller({ path: 'admin', version: ['1', VERSION_NEUTRAL] })
@UseGuards(BetterAuthJwtGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('me')
  async me(@Req() req: RequestWithUser): Promise<AdminMeView | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    const me = await this.admin.getAdminMe(user.id);
    if (!me) return { error: 'Unauthorized' };
    return me;
  }

  @Get('stats')
  async stats(): Promise<AdminStatsView> {
    return this.admin.getStats();
  }

  @Get('users')
  async listUsers(
    @Query('q') q?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<AdminPlatformUserView[]> {
    const limit = typeof limitRaw === 'string' ? Number.parseInt(limitRaw, 10) : 100;
    return this.admin.listPlatformUsers({ q: q ?? null, limit: Number.isFinite(limit) ? limit : 100 });
  }

  @Get('users/:userId')
  async userDetail(@Param('userId') userId: string): Promise<AdminPlatformUserView | { error: string }> {
    const u = await this.admin.getPlatformUserDetail(userId);
    if (!u) return { error: 'Not found' };
    return u;
  }

  @Patch('users/:userId')
  async patchUser(
    @Req() req: RequestWithUser,
    @Param('userId') userId: string,
    @Body() input: PatchAdminPlatformUserInput,
  ): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.admin.patchPlatformUser(user.id, userId, input);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to update user' };
    }
  }

  @Post('users/:userId/revoke-sessions')
  async revokeUserSessions(
    @Req() req: RequestWithUser,
    @Param('userId') userId: string,
  ): Promise<{ success: boolean; deleted: number } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.admin.revokeUserSessions(user.id, userId);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to revoke sessions' };
    }
  }

  @Get('orgs')
  async listOrgs(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<AdminOrgView[]> {
    const limit = typeof limitRaw === 'string' ? Number.parseInt(limitRaw, 10) : undefined;
    return this.admin.listOrganizations({ type: type ?? null, status: status ?? null, limit });
  }

  // v3 alias route naming
  @Get('organizations')
  async listOrganizations(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<AdminOrgView[]> {
    const limit = typeof limitRaw === 'string' ? Number.parseInt(limitRaw, 10) : undefined;
    return this.admin.listOrganizations({ type: type ?? null, status: status ?? null, limit });
  }

  @Get('organizations/:orgId')
  async orgDetail(@Param('orgId') orgId: string): Promise<any | { error: string }> {
    const detail = await this.admin.getOrganizationDetail(orgId);
    if (!detail) return { error: 'Not found' };
    return detail;
  }

  @Patch('organizations/:orgId/status')
  async updateOrgStatusAlias(
    @Req() req: RequestWithUser,
    @Param('orgId') orgId: string,
    @Body() input: UpdateOrgLifecycleInput,
  ): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.admin.updateOrgLifecycle(user.id, orgId, input);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to update org status' };
    }
  }

  @Patch('organizations/:orgId/tier')
  async forceTier(
    @Req() req: RequestWithUser,
    @Param('orgId') orgId: string,
    @Body() input: ForceOrgTierInput,
  ): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.admin.forceOrgTier(user.id, orgId, input);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to force tier' };
    }
  }

  @Patch('orgs/:orgId/status')
  async updateOrgStatus(
    @Req() req: RequestWithUser,
    @Param('orgId') orgId: string,
    @Body() input: UpdateOrgLifecycleInput,
  ): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.admin.updateOrgLifecycle(user.id, orgId, input);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to update org status' };
    }
  }

  @Patch('capabilities/override')
  async upsertCapabilityOverride(
    @Req() req: RequestWithUser,
    @Body() input: UpsertCapabilityOverrideInput,
  ): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.admin.upsertCapabilityOverride(user.id, input);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to update capability override' };
    }
  }

  // v3 alias: POST /admin/organizations/:id/capabilities
  @Post('organizations/:orgId/capabilities')
  async overrideCapabilityAlias(
    @Req() req: RequestWithUser,
    @Param('orgId') orgId: string,
    @Body() input: Omit<UpsertCapabilityOverrideInput, 'orgId'> & { capabilityCode: string; isEnabled: boolean; expiresAt?: string | null },
  ): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.admin.upsertCapabilityOverride(user.id, { ...input, orgId });
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to update capability override' };
    }
  }

  @Get('deal-rooms')
  async dealRooms(@Query('limit') limitRaw?: string): Promise<AdminDealRoomView[]> {
    const limit = typeof limitRaw === 'string' ? Number.parseInt(limitRaw, 10) : 200;
    return this.admin.listDealRooms(Number.isFinite(limit) ? limit : 200);
  }

  @Get('subscriptions')
  async subscriptions(@Query('limit') limitRaw?: string): Promise<AdminSubscriptionView[]> {
    const limit = typeof limitRaw === 'string' ? Number.parseInt(limitRaw, 10) : 200;
    return this.admin.listSubscriptions(Number.isFinite(limit) ? limit : 200);
  }

  @Get('tickets')
  async tickets(@Query('limit') limitRaw?: string): Promise<AdminTicketView[]> {
    const limit = typeof limitRaw === 'string' ? Number.parseInt(limitRaw, 10) : 200;
    return this.admin.listTickets(Number.isFinite(limit) ? limit : 200);
  }

  @Patch('tickets/:ticketId/assign')
  async assignTicket(
    @Req() req: RequestWithUser,
    @Param('ticketId') ticketId: string,
    @Body() input: AssignTicketInput,
  ): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.admin.assignTicket(user.id, ticketId, input.assignedTo ?? null);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to assign ticket' };
    }
  }

  @Get('audit')
  async audit(@Query('limit') limitRaw?: string): Promise<AdminAuditLogView[]> {
    const limit = typeof limitRaw === 'string' ? Number.parseInt(limitRaw, 10) : 200;
    return this.admin.listAuditLogs(Number.isFinite(limit) ? limit : 200);
  }

  @Get('analytics/ai-matches')
  async aiMatchAnalytics(): Promise<Array<{ from_org_id: string; to_org_id: string; overall_score: number; match_reasons: string[] }>> {
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ from_org_id: string; to_org_id: string; overall_score: number; match_reasons: string[] | null }>
      >`
        select from_org_id::text as from_org_id, to_org_id::text as to_org_id,
          overall_score::int as overall_score, match_reasons
        from public.ai_match_scores
        where disqualified = false
        order by overall_score desc
        limit 100
      `;
      return (rows ?? []).map((r) => ({
        from_org_id: r.from_org_id,
        to_org_id: r.to_org_id,
        overall_score: Math.max(0, Math.min(100, Number(r.overall_score ?? 0))),
        match_reasons: Array.isArray(r.match_reasons) ? r.match_reasons : [],
      }));
    } catch {
      return [];
    }
  }

  @Get('analytics/discovery-stats')
  async discoveryStats(): Promise<any> {
    try {
      const profileViews = await this.prisma.$queryRaw<Array<{ total_views: number }>>`
        select count(*)::int as total_views from public.discovery_profile_views
      `;
      const connectionRequests = await this.prisma.$queryRaw<Array<{ total_requests: number }>>`
        select count(*)::int as total_requests from public.connection_requests
      `;
      const activeConnections = await this.prisma.$queryRaw<Array<{ total_connections: number }>>`
        select count(*)::int as total_connections from public.connections where status = 'active'
      `;
      return {
        total_profile_views: profileViews[0]?.total_views ?? 0,
        total_connection_requests: connectionRequests[0]?.total_requests ?? 0,
        total_active_connections: activeConnections[0]?.total_connections ?? 0,
      };
    } catch {
      return { total_profile_views: 0, total_connection_requests: 0, total_active_connections: 0 };
    }
  }
}

