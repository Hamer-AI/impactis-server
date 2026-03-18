import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { BetterAuthJwtGuard } from '../auth-integration/better-auth-jwt.guard';
import { AuthenticatedUser } from '../auth-integration/auth-integration.service';
import { ReadinessGuard } from '../onboarding/readiness.guard';
import { DealRoomService } from './deal-room.service';
import {
  CreateDealRoomAgreementInput,
  CreateDealRoomCommitmentInput,
  CreateDealRoomMilestoneInput,
  LinkDealRoomDataRoomInput,
  InviteDealRoomParticipantInput,
  CreateDealRoomRequestInput,
  RejectDealRoomRequestInput,
  UpdateDealRoomMilestoneInput,
  UpdateDealRoomStageInput,
  SendDealRoomMessageInput,
} from './deal-room.types';
import type { DealRoomRequestView, DealRoomView, DealRoomMessageView, DealRoomParticipantView } from './deal-room.types';

interface RequestWithUser {
  user?: AuthenticatedUser;
}

/**
 * v3 API aliases: `/api/deal-rooms/*`
 * Keeps existing `/api/v1/deal-room/*` endpoints intact.
 */
@Controller({ path: 'deal-rooms', version: ['1', VERSION_NEUTRAL] })
@UseGuards(BetterAuthJwtGuard)
export class DealRoomsAliasController {
  constructor(private readonly dealRoom: DealRoomService) {}

  @Post('request')
  @UseGuards(ReadinessGuard)
  async requestDealRoom(
    @Req() req: RequestWithUser,
    @Body() input: CreateDealRoomRequestInput,
  ): Promise<DealRoomRequestView | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dealRoom.createDealRoomRequest({
        userId: user.id,
        startupOrgId: input.startupOrgId,
        message: input.message ?? null,
      });
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to create request' };
    }
  }

  @Get('requests/received')
  async listIncoming(@Req() req: RequestWithUser): Promise<DealRoomRequestView[]> {
    const user = req.user;
    if (!user) return [];
    return this.dealRoom.listIncomingRequests(user.id);
  }

  @Patch('request/:id/accept')
  @UseGuards(ReadinessGuard)
  async accept(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
  ): Promise<{ dealRoomId: string } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dealRoom.acceptRequest({ userId: user.id, requestId: id });
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to accept' };
    }
  }

  @Patch('request/:id/decline')
  @UseGuards(ReadinessGuard)
  async decline(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() input: RejectDealRoomRequestInput,
  ): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      await this.dealRoom.rejectRequest({ userId: user.id, requestId: id, note: input.note ?? null });
      return { success: true };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to decline' };
    }
  }

  @Get()
  async listDealRooms(@Req() req: RequestWithUser): Promise<DealRoomView[]> {
    const user = req.user;
    if (!user) return [];
    return this.dealRoom.listDealRooms(user.id);
  }

  @Get(':dealRoomId')
  async getDetails(
    @Req() req: RequestWithUser,
    @Param('dealRoomId') dealRoomId: string,
  ): Promise<{ room: DealRoomView; participants: DealRoomParticipantView[] } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dealRoom.getDealRoomDetails(user.id, dealRoomId);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to load room' };
    }
  }

  @Get(':dealRoomId/messages')
  async listMessages(
    @Req() req: RequestWithUser,
    @Param('dealRoomId') dealRoomId: string,
  ): Promise<DealRoomMessageView[] | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dealRoom.listMessages(user.id, dealRoomId);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to list messages' };
    }
  }

  @Post(':dealRoomId/messages')
  @UseGuards(ReadinessGuard)
  async sendMessage(
    @Req() req: RequestWithUser,
    @Param('dealRoomId') dealRoomId: string,
    @Body() input: SendDealRoomMessageInput,
  ): Promise<DealRoomMessageView | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dealRoom.sendMessage(user.id, dealRoomId, input.body);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to send message' };
    }
  }

  @Patch(':dealRoomId/stage')
  @UseGuards(ReadinessGuard)
  async updateStage(
    @Req() req: RequestWithUser,
    @Param('dealRoomId') dealRoomId: string,
    @Body() input: UpdateDealRoomStageInput,
  ): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dealRoom.updateStage({
        userId: user.id,
        dealRoomId,
        stage: input.stage,
        note: input.note ?? null,
      });
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to update stage' };
    }
  }

  @Post(':dealRoomId/agreements/:agreementId/sign')
  @UseGuards(ReadinessGuard)
  async signAgreement(
    @Req() req: RequestWithUser,
    @Param('dealRoomId') dealRoomId: string,
    @Param('agreementId') agreementId: string,
  ): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dealRoom.signAgreement({ userId: user.id, dealRoomId, agreementId });
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to sign agreement' };
    }
  }

  @Post(':dealRoomId/milestones')
  @UseGuards(ReadinessGuard)
  async createMilestone(
    @Req() req: RequestWithUser,
    @Param('dealRoomId') dealRoomId: string,
    @Body() input: CreateDealRoomMilestoneInput,
  ): Promise<{ id: string } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dealRoom.createMilestone({
        userId: user.id,
        dealRoomId,
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate ?? null,
      });
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to create milestone' };
    }
  }

  @Patch(':dealRoomId/milestones/:milestoneId')
  @UseGuards(ReadinessGuard)
  async updateMilestone(
    @Req() req: RequestWithUser,
    @Param('dealRoomId') dealRoomId: string,
    @Param('milestoneId') milestoneId: string,
    @Body() input: UpdateDealRoomMilestoneInput,
  ): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dealRoom.updateMilestone({
        userId: user.id,
        dealRoomId,
        milestoneId,
        title: input.title ?? null,
        description: input.description ?? null,
        dueDate: input.dueDate ?? null,
        completed: input.completed === true,
      });
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to update milestone' };
    }
  }

  @Post(':dealRoomId/commitments')
  @UseGuards(ReadinessGuard)
  async commit(
    @Req() req: RequestWithUser,
    @Param('dealRoomId') dealRoomId: string,
    @Body() input: CreateDealRoomCommitmentInput,
  ): Promise<{ id: string } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dealRoom.recordCommitment({
        userId: user.id,
        dealRoomId,
        amountUsd: input.amountUsd,
        conditions: input.conditions ?? null,
        notes: input.notes ?? null,
      });
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to record commitment' };
    }
  }

  @Post(':dealRoomId/agreements')
  @UseGuards(ReadinessGuard)
  async createAgreement(
    @Req() req: RequestWithUser,
    @Param('dealRoomId') dealRoomId: string,
    @Body() input: CreateDealRoomAgreementInput,
  ): Promise<{ id: string } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dealRoom.createAgreement({
        userId: user.id,
        dealRoomId,
        title: input.title,
        templateKey: input.templateKey ?? null,
        contentText: input.contentText ?? null,
      });
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to create agreement' };
    }
  }

  @Post(':dealRoomId/data-room-link')
  @UseGuards(ReadinessGuard)
  async linkDataRoom(
    @Req() req: RequestWithUser,
    @Param('dealRoomId') dealRoomId: string,
    @Body() input: LinkDealRoomDataRoomInput,
  ): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dealRoom.linkDataRoom({ userId: user.id, dealRoomId, startupOrgId: input.startupOrgId });
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to link data room' };
    }
  }

  @Post(':dealRoomId/ai-analyze')
  @UseGuards(ReadinessGuard)
  async aiAnalyze(
    @Req() req: RequestWithUser,
    @Param('dealRoomId') dealRoomId: string,
  ): Promise<any> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dealRoom.aiAnalyze({ userId: user.id, dealRoomId });
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to analyze' };
    }
  }

  @Post(':dealRoomId/participants/invite')
  @UseGuards(ReadinessGuard)
  async inviteParticipant(
    @Req() req: RequestWithUser,
    @Param('dealRoomId') dealRoomId: string,
    @Body() input: InviteDealRoomParticipantInput,
  ): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dealRoom.inviteParticipant({
        userId: user.id,
        dealRoomId,
        orgId: input.orgId,
        role: input.role,
      });
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to invite participant' };
    }
  }
}

