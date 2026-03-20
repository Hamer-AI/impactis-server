import { Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { BetterAuthJwtGuard } from '../auth-integration/better-auth-jwt.guard';
import { AuthenticatedUser } from '../auth-integration/auth-integration.service';
import { ReadinessGuard } from '../onboarding/readiness.guard';
import { RequiresTier } from '../common/decorators/requires-tier.decorator';
import { TierGuard } from '../common/guards/tier.guard';
import { DataRoomService } from './data-room.service';
import {
  AcceptDataRoomTermsInput,
  CreateDataRoomAccessRequestInput,
  RecordDocumentViewInput,
  RejectDataRoomAccessRequestInput,
  ReviewDataRoomAccessRequestInput,
  RevokeDataRoomAccessGrantInput,
} from './data-room.types';
import type {
  DataRoomAccessGrantView,
  DataRoomAccessRequestView,
  DataRoomContentsView,
} from './data-room.types';

interface RequestWithUser {
  user?: AuthenticatedUser;
}

@Controller({ path: 'data-room', version: ['1', VERSION_NEUTRAL] })
@UseGuards(BetterAuthJwtGuard)
export class DataRoomController {
  constructor(private readonly dataRoom: DataRoomService) {}

  private rethrowForbidden(e: unknown): void {
    if (e instanceof ForbiddenException) {
      throw e;
    }
  }

  // Investor/Advisor: request access
  @Post('access-requests')
  @UseGuards(ReadinessGuard)
  @RequiresTier('elite')
  @UseGuards(TierGuard)
  async createAccessRequest(
    @Req() req: RequestWithUser,
    @Body() input: CreateDataRoomAccessRequestInput,
  ): Promise<DataRoomAccessRequestView | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dataRoom.createAccessRequest({
        userId: user.id,
        startupOrgId: input.startupOrgId,
        message: input.message ?? null,
      });
    } catch (e) {
      this.rethrowForbidden(e);
      return { error: e instanceof Error ? e.message : 'Failed to create access request' };
    }
  }

  @Get('access-requests/mine')
  async listMine(@Req() req: RequestWithUser): Promise<DataRoomAccessRequestView[]> {
    const user = req.user;
    if (!user) return [];
    try {
      return await this.dataRoom.listMyAccessRequests(user.id);
    } catch {
      return [];
    }
  }

  // Startup: incoming requests
  @Get('access-requests/incoming')
  async listIncoming(@Req() req: RequestWithUser): Promise<DataRoomAccessRequestView[]> {
    const user = req.user;
    if (!user) return [];
    try {
      return await this.dataRoom.listIncomingAccessRequests(user.id);
    } catch {
      return [];
    }
  }

  @Post('access-requests/:requestId/approve')
  @UseGuards(ReadinessGuard)
  async approve(
    @Req() req: RequestWithUser,
    @Param('requestId') requestId: string,
    @Body() input: ReviewDataRoomAccessRequestInput,
  ): Promise<DataRoomAccessGrantView | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dataRoom.approveAccessRequest({
        userId: user.id,
        requestId,
        permissionLevel: input.permissionLevel,
        expiresAt: input.expiresAt ?? null,
        note: input.note ?? null,
      });
    } catch (e) {
      this.rethrowForbidden(e);
      return { error: e instanceof Error ? e.message : 'Failed to approve request' };
    }
  }

  @Post('access-requests/:requestId/reject')
  @UseGuards(ReadinessGuard)
  async reject(
    @Req() req: RequestWithUser,
    @Param('requestId') requestId: string,
    @Body() input: RejectDataRoomAccessRequestInput,
  ): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      await this.dataRoom.rejectAccessRequest({
        userId: user.id,
        requestId,
        note: input.note ?? null,
      });
      return { success: true };
    } catch (e) {
      this.rethrowForbidden(e);
      return { error: e instanceof Error ? e.message : 'Failed to reject request' };
    }
  }

  @Post('access-grants/:grantId/revoke')
  @UseGuards(ReadinessGuard)
  async revoke(
    @Req() req: RequestWithUser,
    @Param('grantId') grantId: string,
    @Body() input: RevokeDataRoomAccessGrantInput,
  ): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      await this.dataRoom.revokeGrant({
        userId: user.id,
        grantId,
        note: input.note ?? null,
      });
      return { success: true };
    } catch (e) {
      this.rethrowForbidden(e);
      return { error: e instanceof Error ? e.message : 'Failed to revoke grant' };
    }
  }

  // Granted contents
  @Get('startups/:startupOrgId/contents')
  @UseGuards(ReadinessGuard)
  @RequiresTier('elite')
  @UseGuards(TierGuard)
  async contents(
    @Req() req: RequestWithUser,
    @Param('startupOrgId') startupOrgId: string,
  ): Promise<DataRoomContentsView | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dataRoom.getStartupContents({ userId: user.id, startupOrgId });
    } catch (e) {
      this.rethrowForbidden(e);
      return { error: e instanceof Error ? e.message : 'Failed to load contents' };
    }
  }

  @Post('startups/:startupOrgId/terms/accept')
  @UseGuards(ReadinessGuard)
  @RequiresTier('elite')
  @UseGuards(TierGuard)
  async acceptTerms(
    @Req() req: RequestWithUser,
    @Param('startupOrgId') startupOrgId: string,
    @Body() _input: AcceptDataRoomTermsInput,
  ): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dataRoom.acceptTerms({ userId: user.id, startupOrgId });
    } catch (e) {
      this.rethrowForbidden(e);
      return { error: e instanceof Error ? e.message : 'Failed to accept terms' };
    }
  }

  @Post('documents/:documentId/view')
  @UseGuards(ReadinessGuard)
  @RequiresTier('elite')
  @UseGuards(TierGuard)
  async recordView(
    @Req() req: RequestWithUser,
    @Param('documentId') documentId: string,
    @Body() input: RecordDocumentViewInput,
  ): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dataRoom.recordDocumentView({
        userId: user.id,
        documentId,
        seconds: typeof input.seconds === 'number' ? input.seconds : undefined,
      });
    } catch (e) {
      this.rethrowForbidden(e);
      return { error: e instanceof Error ? e.message : 'Failed to record view' };
    }
  }

  // v3: view-only inline URL (no download)
  @Get('serve/:documentId')
  @UseGuards(ReadinessGuard)
  @RequiresTier('elite')
  @UseGuards(TierGuard)
  async serveInline(
    @Req() req: RequestWithUser,
    @Param('documentId') documentId: string,
  ): Promise<{ url: string } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dataRoom.serveDocumentInline({ userId: user.id, documentId });
    } catch (e) {
      this.rethrowForbidden(e);
      return { error: e instanceof Error ? e.message : 'Failed to serve document' };
    }
  }

  // v3: document view analytics (startup owner/admin only)
  @Get('startups/:startupOrgId/analytics')
  @UseGuards(ReadinessGuard)
  async analytics(
    @Req() req: RequestWithUser,
    @Param('startupOrgId') startupOrgId: string,
  ): Promise<any[] | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dataRoom.getStartupAnalytics({ userId: user.id, startupOrgId });
    } catch (e) {
      this.rethrowForbidden(e);
      return { error: e instanceof Error ? e.message : 'Failed to load analytics' };
    }
  }
}

