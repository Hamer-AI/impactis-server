import { Body, Controller, Get, Param, Patch, Req, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { BetterAuthJwtGuard } from '../auth-integration/better-auth-jwt.guard';
import { NotificationsService } from './notifications.service';
import type { NotificationView } from './notifications.types';
import { AuthenticatedUser } from '../auth-integration/auth-integration.service';

interface RequestWithUser {
  user?: AuthenticatedUser;
}

@Controller({ path: 'notifications', version: ['1', VERSION_NEUTRAL] })
@UseGuards(BetterAuthJwtGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(@Req() req: RequestWithUser): Promise<NotificationView[]> {
    const user = req.user;
    if (!user) return [];
    return this.notifications.listForUser(user.id);
  }

  @Get('unread-count')
  async unreadCount(@Req() req: RequestWithUser): Promise<{ count: number }> {
    const user = req.user;
    if (!user) return { count: 0 };
    const count = await this.notifications.getUnreadCount(user.id);
    return { count };
  }

  @Patch(':id/read')
  async markRead(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    const user = req.user;
    if (!user) return { success: false };
    const success = await this.notifications.markRead(user.id, id);
    return { success };
  }

  @Patch('read-all')
  async markAllRead(@Req() req: RequestWithUser): Promise<{ success: boolean; count: number }> {
    const user = req.user;
    if (!user) return { success: false, count: 0 };
    const count = await this.notifications.markAllRead(user.id);
    return { success: true, count };
  }

  // v3 mentions notification preferences; keep as a stub until UI exists.
  @Patch('preferences')
  async updatePreferences(@Req() req: RequestWithUser, @Body() input: any): Promise<{ success: boolean } | { error: string }> {
    const user = req.user;
    if (!user) return { error: 'Unauthorized' };
    try {
      await this.notifications.updatePreferences(user.id, input);
      return { success: true };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to update preferences' };
    }
  }
}
