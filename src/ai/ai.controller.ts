import { Controller, Post, Query, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { BetterAuthJwtGuard } from '../auth-integration/better-auth-jwt.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { AiMatchingService } from './ai-matching.service';

@Controller({ path: 'ai', version: ['1', VERSION_NEUTRAL] })
@UseGuards(BetterAuthJwtGuard, AdminGuard)
export class AiController {
  constructor(private readonly ai: AiMatchingService) {}

  // Admin-only manual runner (until a background worker is added)
  @Post('matching/process')
  async process(@Query('limit') limitRaw?: string): Promise<{ processed: number }> {
    const limit = typeof limitRaw === 'string' ? Number.parseInt(limitRaw, 10) : 1;
    return this.ai.processNextJob(Number.isFinite(limit) ? limit : 1);
  }
}

