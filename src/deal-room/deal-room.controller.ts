import { Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { BetterAuthJwtGuard } from '../auth-integration/better-auth-jwt.guard';
import { AuthenticatedUser } from '../auth-integration/auth-integration.service';
import { ReadinessGuard } from '../onboarding/readiness.guard';
import { DealRoomService } from './deal-room.service';
import {
  CreateDealRoomRequestInput,
  CreateDealRoomMilestoneInput,
  UpdateDealRoomMilestoneInput,
  CreateDealRoomCommitmentInput,
  CreateDealRoomAgreementInput,
  LinkDealRoomDataRoomInput,
  InviteDealRoomParticipantInput,
  RejectDealRoomRequestInput,
  SendDealRoomMessageInput,
  UpdateDealRoomStageInput,
} from './deal-room.types';
import type {
  DealRoomMessageView,
  DealRoomParticipantView,
  DealRoomRequestView,
  DealRoomView,
} from './deal-room.types';

interface RequestWithUser {
  user?: AuthenticatedUser;
}

@Controller({ path: 'deal-room', version: ['1', VERSION_NEUTRAL] })
@UseGuards(BetterAuthJwtGuard)
export class DealRoomController {
  constructor(private readonly dealRoom: DealRoomService) {}

  private rethrowForbidden(e: unknown): void {
    if (e instanceof ForbiddenException) {
      throw e;
    }
  }

  @Post('requests')
  @UseGuards(ReadinessGuard)
  async createRequest(
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
      this.rethrowForbidden(e);
      return { error: e instanceof Error ? e.message : 'Failed to create request' };
    }
  }

  @Get('requests/incoming')
  async listIncoming(@Req() req: RequestWithUser): Promise<DealRoomRequestView[]> {
    const user = req.user;
    if (!user) return [];
    try {
      return await this.dealRoom.listIncomingRequests(user.id);
    } catch {
      return [];
    }
  }

  @Post('requests/:id/accept')
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
      this.rethrowForbidden(e);
      return { error: e instanceof Error ? e.message : 'Failed to accept request' };
    }
  }

  @Post('requests/:id/reject')
  @UseGuards(ReadinessGuard)
  async reject(
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
      this.rethrowForbidden(e);
      return { error: e instanceof Error ? e.message : 'Failed to reject request' };
    }
  }

  @Get()
  async listRooms(@Req() req: RequestWithUser): Promise<DealRoomView[]> {
    const user = req.user;
    if (!user) return [];
    try {
      return await this.dealRoom.listDealRooms(user.id);
    } catch {
      return [];
    }
  }

  @Get(':dealRoomId')
  async details(
    @Req() req: RequestWithUser,
    @Param('dealRoomId') dealRoomId: string,
  ): Promise<{ room: DealRoomView; participants: DealRoomParticipantView[] } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dealRoom.getDealRoomDetails(user.id, dealRoomId);
    } catch (e) {
      this.rethrowForbidden(e);
      return { error: e instanceof Error ? e.message : 'Failed to load deal room' };
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
      this.rethrowForbidden(e);
      return { error: e instanceof Error ? e.message : 'Failed to load messages' };
    }
  }

  @Get(':dealRoomId/agreements')
  async listAgreements(
    @Req() req: RequestWithUser,
    @Param('dealRoomId') dealRoomId: string,
  ): Promise<Array<{ id: string; title: string; status: string; updated_at: string }> | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dealRoom.listAgreements({ userId: user.id, dealRoomId });
    } catch (e) {
      this.rethrowForbidden(e);
      return { error: e instanceof Error ? e.message : 'Failed to load agreements' };
    }
  }

  @Get(':dealRoomId/agreements/:agreementId')
  async getAgreement(
    @Req() req: RequestWithUser,
    @Param('dealRoomId') dealRoomId: string,
    @Param('agreementId') agreementId: string,
  ): Promise<{ id: string; title: string; status: string; template_key: string | null; content_text: string | null; updated_at: string; signed_by: any } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dealRoom.getAgreement({ userId: user.id, dealRoomId, agreementId });
    } catch (e) {
      this.rethrowForbidden(e);
      return { error: e instanceof Error ? e.message : 'Failed to load agreement' };
    }
  }

  @Get(':dealRoomId/milestones')
  async listMilestones(
    @Req() req: RequestWithUser,
    @Param('dealRoomId') dealRoomId: string,
  ): Promise<Array<{ id: string; title: string; completed_at: string | null; due_date: string | null }> | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.dealRoom.listMilestones({ userId: user.id, dealRoomId });
    } catch (e) {
      this.rethrowForbidden(e);
      return { error: e instanceof Error ? e.message : 'Failed to load milestones' };
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
      this.rethrowForbidden(e);
      return { error: e instanceof Error ? e.message : 'Failed to send message' };
    }
  }

  @Post(':dealRoomId/stage')
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
      this.rethrowForbidden(e);
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
      this.rethrowForbidden(e);
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
      this.rethrowForbidden(e);
      return { error: e instanceof Error ? e.message : 'Failed to create milestone' };
    }
  }

  @Post(':dealRoomId/milestones/:milestoneId')
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
      this.rethrowForbidden(e);
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
      this.rethrowForbidden(e);
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
      this.rethrowForbidden(e);
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
      return await this.dealRoom.linkDataRoom({
        userId: user.id,
        dealRoomId,
        startupOrgId: input.startupOrgId,
      });
    } catch (e) {
      this.rethrowForbidden(e);
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
      this.rethrowForbidden(e);
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
      this.rethrowForbidden(e);
      return { error: e instanceof Error ? e.message : 'Failed to invite participant' };
    }
  }
}

