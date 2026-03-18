import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { BetterAuthJwtGuard } from '../auth-integration/better-auth-jwt.guard';
import { AuthenticatedUser } from '../auth-integration/auth-integration.service';
import { ReadinessGuard } from '../onboarding/readiness.guard';
import { RequiresTier } from '../common/decorators/requires-tier.decorator';
import { TierGuard } from '../common/guards/tier.guard';
import { SyndicatesService } from './syndicates.service';
import {
  CreateSyndicateInput,
  InviteToSyndicateInput,
  SyndicateInviteView,
  SyndicateView,
  UpdateSyndicateStatusInput,
} from './syndicates.types';

interface RequestWithUser {
  user?: AuthenticatedUser;
}

@Controller({ path: 'syndicates', version: ['1', VERSION_NEUTRAL] })
@UseGuards(BetterAuthJwtGuard)
@RequiresTier('elite')
@UseGuards(TierGuard)
export class SyndicatesController {
  constructor(private readonly syndicates: SyndicatesService) {}

  @Post()
  @UseGuards(ReadinessGuard)
  async create(
    @Req() req: RequestWithUser,
    @Body() input: CreateSyndicateInput,
  ): Promise<SyndicateView | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.syndicates.createSyndicate(user.id, input);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to create syndicate' };
    }
  }

  @Get()
  async listMine(@Req() req: RequestWithUser): Promise<SyndicateView[]> {
    const user = req.user;
    if (!user) return [];
    try {
      return await this.syndicates.listMySyndicates(user.id);
    } catch {
      return [];
    }
  }

  @Get(':syndicateId')
  async details(
    @Req() req: RequestWithUser,
    @Param('syndicateId') syndicateId: string,
  ): Promise<{ syndicate: SyndicateView; members: any[]; invites: any[] } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.syndicates.getSyndicateDetails(user.id, syndicateId);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to load syndicate' };
    }
  }

  @Post(':syndicateId/invites')
  @UseGuards(ReadinessGuard)
  async invite(
    @Req() req: RequestWithUser,
    @Param('syndicateId') syndicateId: string,
    @Body() input: InviteToSyndicateInput,
  ): Promise<SyndicateInviteView | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.syndicates.invite(user.id, syndicateId, input);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to invite' };
    }
  }

  @Post('invites/:inviteId/accept')
  @UseGuards(ReadinessGuard)
  async acceptInvite(
    @Req() req: RequestWithUser,
    @Param('inviteId') inviteId: string,
  ): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.syndicates.acceptInvite(user.id, inviteId);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to accept invite' };
    }
  }

  @Post('invites/:inviteId/decline')
  @UseGuards(ReadinessGuard)
  async declineInvite(
    @Req() req: RequestWithUser,
    @Param('inviteId') inviteId: string,
  ): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.syndicates.declineInvite(user.id, inviteId);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to decline invite' };
    }
  }

  @Patch(':syndicateId/status')
  @UseGuards(ReadinessGuard)
  async updateStatus(
    @Req() req: RequestWithUser,
    @Param('syndicateId') syndicateId: string,
    @Body() input: UpdateSyndicateStatusInput,
  ): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.syndicates.updateStatus(user.id, syndicateId, input);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to update status' };
    }
  }
}

