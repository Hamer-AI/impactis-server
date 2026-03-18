import { Body, Controller, Get, Param, Post, Query, Req, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { BetterAuthJwtGuard } from '../auth-integration/better-auth-jwt.guard';
import { AuthenticatedUser } from '../auth-integration/auth-integration.service';
import { SecurityService } from './security.service';
import { DisableTwoFactorInput, EnableTwoFactorInput, VerifyTwoFactorInput } from './security.types';
import type { SecurityEventView, UserDeviceView } from './security.types';

interface RequestWithUser {
  user?: AuthenticatedUser;
}

@Controller({ path: 'auth', version: ['1', VERSION_NEUTRAL] })
@UseGuards(BetterAuthJwtGuard)
export class SecurityAuthController {
  constructor(private readonly security: SecurityService) {}

  @Post('2fa/enable')
  async enable2fa(@Req() req: RequestWithUser, @Body() input: EnableTwoFactorInput): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.security.enableTwoFactor(user.id, input);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to enable 2FA' };
    }
  }

  @Post('2fa/verify')
  async verify2fa(@Req() req: RequestWithUser, @Body() _input: VerifyTwoFactorInput): Promise<{ success: boolean }> {
    const user = req.user;
    if (!user) return { success: false };
    // Minimal placeholder: actual verification should be handled by Better Auth.
    return { success: true };
  }

  @Post('2fa/disable')
  async disable2fa(@Req() req: RequestWithUser, @Body() input: DisableTwoFactorInput): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.security.disableTwoFactor(user.id, input);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to disable 2FA' };
    }
  }
}

@Controller({ path: 'security', version: ['1', VERSION_NEUTRAL] })
@UseGuards(BetterAuthJwtGuard)
export class SecurityController {
  constructor(private readonly security: SecurityService) {}

  @Get('devices')
  async devices(@Req() req: RequestWithUser): Promise<UserDeviceView[]> {
    const user = req.user;
    if (!user) return [];
    return this.security.listDevices(user.id);
  }

  @Post('devices/:deviceId/revoke')
  async revokeDevice(@Req() req: RequestWithUser, @Param('deviceId') deviceId: string): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      return await this.security.revokeDevice(user.id, deviceId);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to revoke device' };
    }
  }

  @Get('events')
  async events(@Req() req: RequestWithUser, @Query('limit') limitRaw?: string): Promise<SecurityEventView[]> {
    const user = req.user;
    if (!user) return [];
    const limit = typeof limitRaw === 'string' ? Number.parseInt(limitRaw, 10) : 30;
    return this.security.listSecurityEvents(user.id, Number.isFinite(limit) ? limit : 30);
  }
}

