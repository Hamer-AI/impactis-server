import { Body, Controller, Get, Post, Query, Req, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { BetterAuthJwtGuard } from '../auth-integration/better-auth-jwt.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { AiMatchingService } from './ai-matching.service';
import { AiEnhancementService } from './ai-enhancement.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller({ path: 'ai', version: ['1', VERSION_NEUTRAL] })
@UseGuards(BetterAuthJwtGuard)
export class AiController {
  constructor(
    private readonly aiMatching: AiMatchingService,
    private readonly aiEnhancement: AiEnhancementService,
    private readonly prisma: PrismaService,
  ) {}

  // Admin-only manual runner (until a background worker is added)
  @Post('matching/process')
  @UseGuards(BetterAuthJwtGuard, AdminGuard)
  async process(@Query('limit') limitRaw?: string): Promise<{ processed: number }> {
    const limit = typeof limitRaw === 'string' ? Number.parseInt(limitRaw, 10) : 1;
    return this.aiMatching.processNextJob(Number.isFinite(limit) ? limit : 1);
  }

  @Post('enhance')
  @UseGuards(BetterAuthJwtGuard)
  async enhance(@Body() body: { text: string; context: string }): Promise<{ enhancedText: string }> {
    const enhancedText = await this.aiEnhancement.enhanceText(body.text, body.context);
    return { enhancedText };
  }

  @Get('analyze-readiness')
  @UseGuards(BetterAuthJwtGuard)
  async analyzeReadiness(@Req() req: any): Promise<any> {
    const userId = req.user.id;
    
    // Fetch startup profile data
    const rows = await this.prisma.$queryRaw<any[]>`
      select sa.*
      from public.startup_onboarding_answers sa
      join public.org_members om on om.org_id = sa.org_id
      where om.user_id = ${userId}::uuid and om.status = 'active'
      limit 1
    `;
    const profile = rows[0];
    if (!profile) {
      return { summary: 'No startup profile found. Please complete onboarding first.', riskFlags: [] };
    }

    return this.aiEnhancement.analyzeReadiness(profile);
  }
}

