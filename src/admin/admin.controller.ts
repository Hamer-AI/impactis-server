import { Body, Controller, Get, Patch, Post, Query, Req, UseGuards, VERSION_NEUTRAL, Param } from '@nestjs/common';
import { BetterAuthJwtGuard } from '../auth-integration/better-auth-jwt.guard';
import { AuthenticatedUser } from '../auth-integration/auth-integration.service';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminService } from './admin.service';
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
  constructor(private readonly admin: AdminService) {}

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
}

