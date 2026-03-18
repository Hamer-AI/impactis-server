import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { BetterAuthJwtGuard } from '../auth-integration/better-auth-jwt.guard';
import { AuthenticatedUser } from '../auth-integration/auth-integration.service';
import { ReadinessGuard } from '../onboarding/readiness.guard';
import { WarmIntrosService } from './warm-intros.service';
import { CreateWarmIntroRequestInput, RespondWarmIntroRequestInput, WarmIntroRequestView } from './warm-intros.types';

interface RequestWithUser {
  user?: AuthenticatedUser;
}

@Controller({ path: 'warm-intros', version: ['1', VERSION_NEUTRAL] })
@UseGuards(BetterAuthJwtGuard, ReadinessGuard)
export class WarmIntrosController {
  constructor(private readonly warmIntros: WarmIntrosService) {}

  @Post('request')
  async requestIntro(
    @Req() req: RequestWithUser,
    @Body() input: CreateWarmIntroRequestInput,
  ): Promise<WarmIntroRequestView | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.warmIntros.createRequest(user.id, input);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to create request' };
    }
  }

  @Get('incoming')
  async incoming(@Req() req: RequestWithUser): Promise<WarmIntroRequestView[]> {
    const user = req.user;
    if (!user) return [];
    return this.warmIntros.listIncoming(user.id);
  }

  @Get('sent')
  async sent(@Req() req: RequestWithUser): Promise<WarmIntroRequestView[]> {
    const user = req.user;
    if (!user) return [];
    return this.warmIntros.listSent(user.id);
  }

  @Patch(':id/respond')
  async respond(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() input: RespondWarmIntroRequestInput,
  ): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.warmIntros.respond(user.id, id, input);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to respond' };
    }
  }
}

