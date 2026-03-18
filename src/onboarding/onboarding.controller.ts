import { Body, Controller, Get, Patch, Post, Put, Req, UseGuards, VERSION_NEUTRAL, Param } from '@nestjs/common';
import { BetterAuthJwtGuard } from '../auth-integration/better-auth-jwt.guard';
import { AuthenticatedUser } from '../auth-integration/auth-integration.service';
import { OnboardingService } from './onboarding.service';
import {
  OnboardingMeView,
  OnboardingProgressStepView,
  SaveOnboardingProgressInput,
  SaveOnboardingStep1Input,
  UpsertOnboardingAnswersInput,
  OrgScoreSnapshot,
} from './onboarding.types';

interface RequestWithUser {
  user?: AuthenticatedUser;
}

@Controller({ path: 'onboarding', version: ['1', VERSION_NEUTRAL] })
@UseGuards(BetterAuthJwtGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get('me')
  async getMe(@Req() req: RequestWithUser): Promise<OnboardingMeView | null> {
    const user = req.user;
    if (!user) {
      return null;
    }

    try {
      return await this.onboarding.getOnboardingMeForUser(user.id);
    } catch {
      return null;
    }
  }

  // v3 alias: org-scoped progress
  @Get(':orgId/progress')
  async getProgress(
    @Req() req: RequestWithUser,
    @Param('orgId') orgId: string,
  ): Promise<OnboardingProgressStepView[] | { error: string }> {
    const user = req.user;
    if (!user) {
      return { error: 'Unauthorized' };
    }
    try {
      return await this.onboarding.listProgressForOrg(user.id, orgId);
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to load onboarding progress' };
    }
  }

  // v3 alias: save a single step status
  @Post(':orgId/step')
  async saveStep(
    @Req() req: RequestWithUser,
    @Param('orgId') orgId: string,
    @Body() input: SaveOnboardingProgressInput,
  ): Promise<{ success: boolean; me?: OnboardingMeView; error?: string }> {
    const user = req.user;
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const me = await this.onboarding.saveProgressForOrg(user.id, orgId, input);
      return { success: true, me };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to save step' };
    }
  }

  // v3 alias: skip a step
  @Patch(':orgId/step/:stepKey/skip')
  async skipStep(
    @Req() req: RequestWithUser,
    @Param('orgId') orgId: string,
    @Param('stepKey') stepKey: string,
  ): Promise<{ success: boolean; me?: OnboardingMeView; error?: string }> {
    const user = req.user;
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }
    try {
      const me = await this.onboarding.skipStepForOrg(user.id, orgId, stepKey);
      return { success: true, me };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to skip step' };
    }
  }

  // v3 alias: get score snapshot
  @Get(':orgId/score')
  async getOrgScore(
    @Req() req: RequestWithUser,
    @Param('orgId') orgId: string,
  ): Promise<OrgScoreSnapshot | { error: string }> {
    const user = req.user;
    if (!user) {
      return { error: 'Unauthorized' };
    }
    try {
      const score = await this.onboarding.getScoreForOrg(user.id, orgId);
      if (!score) return { error: 'Not found' };
      return score;
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to load score' };
    }
  }

  @Post('step1')
  async saveStep1(
    @Req() req: RequestWithUser,
    @Body() input: SaveOnboardingStep1Input,
  ): Promise<{ success: boolean; me?: OnboardingMeView; error?: string }> {
    const user = req.user;
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const me = await this.onboarding.saveStep1ForUser(user.id, input);
      return { success: true, me };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to save step 1' };
    }
  }

  @Post('progress')
  async saveProgress(
    @Req() req: RequestWithUser,
    @Body() input: SaveOnboardingProgressInput,
  ): Promise<{ success: boolean; me?: OnboardingMeView; error?: string }> {
    const user = req.user;
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const me = await this.onboarding.saveProgressForUser(user.id, input);
      return { success: true, me };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to save onboarding progress' };
    }
  }

  @Put('answers')
  async upsertAnswers(
    @Req() req: RequestWithUser,
    @Body() input: UpsertOnboardingAnswersInput,
  ): Promise<{ success: boolean; me?: OnboardingMeView; error?: string }> {
    const user = req.user;
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const me = await this.onboarding.upsertAnswersForUser(user.id, input);
      return { success: true, me };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to save onboarding answers' };
    }
  }

  @Get('score')
  async getScore(@Req() req: RequestWithUser): Promise<OrgScoreSnapshot | null> {
    const user = req.user;
    if (!user) {
      return null;
    }

    try {
      return await this.onboarding.getScoreForUser(user.id);
    } catch {
      return null;
    }
  }
}

