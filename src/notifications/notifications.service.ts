import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { NotificationView } from './notifications.types';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * In-app links must be relative paths on the Next.js app so clicks stay on the same origin
   * (session cookies). Strips absolute URLs to pathname; blocks sign-out and external paths.
   */
  sanitizeInAppLink(link: string | null | undefined): string | null {
    if (link == null) return null;
    const raw = String(link).trim();
    if (!raw) return null;
    let path = raw;
    try {
      if (/^https?:\/\//i.test(raw)) {
        const u = new URL(raw);
        path = `${u.pathname}${u.search}${u.hash}`;
      }
    } catch {
      return '/workspace/notifications';
    }
    if (!path.startsWith('/') || path.startsWith('//')) {
      return '/workspace/notifications';
    }
    const lower = path.toLowerCase();
    if (lower.startsWith('/auth/signout')) {
      return '/workspace/notifications';
    }
    if (!lower.startsWith('/workspace') && !lower.startsWith('/onboarding')) {
      return '/workspace/notifications';
    }
    return path.length > 2048 ? path.slice(0, 2048) : path;
  }

  async createForUser(
    userId: string,
    params: { type: string; title: string; body?: string | null; link?: string | null },
  ): Promise<void> {
    const safeLink = this.sanitizeInAppLink(params.link);
    await this.prisma.$queryRaw`
      insert into public.notifications (user_id, type, title, body, link)
      values (${userId}::uuid, ${params.type}, ${params.title}, ${params.body ?? null}, ${safeLink})
    `;
  }

  /** Create a notification for every active member of the organization. */
  async createForOrg(
    orgId: string,
    params: { type: string; title: string; body?: string | null; link?: string | null },
  ): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ user_id: string }>>`
      select om.user_id
      from public.org_members om
      join public.users u on u.id = om.user_id
      left join public.org_status s on s.org_id = om.org_id
      where om.org_id = ${orgId}::uuid and om.status = 'active'
        and coalesce(s.status::text, 'active') = 'active'
    `;
    for (const row of rows) {
      await this.createForUser(row.user_id, params);
    }
  }

  async listForUser(userId: string, limit = 50): Promise<NotificationView[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        type: string;
        title: string;
        body: string | null;
        link: string | null;
        read_at: Date | null;
        created_at: Date;
      }>
    >`
      select id, type, title, body, link, read_at, created_at
      from public.notifications
      where user_id = ${userId}::uuid
      order by created_at desc
      limit ${limit}
    `;
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      link: this.sanitizeInAppLink(r.link),
      read_at: r.read_at?.toISOString() ?? null,
      created_at: r.created_at.toISOString(),
    }));
  }

  async markRead(userId: string, notificationId: string): Promise<boolean> {
    const result = await this.prisma.$queryRaw<Array<{ n: number }>>`
      update public.notifications
      set read_at = timezone('utc', now())
      where id = ${notificationId}::uuid and user_id = ${userId}::uuid and read_at is null
      returning 1 as n
    `;
    return result.length > 0;
  }

  async getUnreadCount(userId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ n: number }>>`
      select count(*)::int as n from public.notifications
      where user_id = ${userId}::uuid and read_at is null
    `;
    return rows[0]?.n ?? 0;
  }

  async markAllRead(userId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ n: number }>>`
      update public.notifications
      set read_at = timezone('utc', now())
      where user_id = ${userId}::uuid and read_at is null
      returning 1 as n
    `;
    return rows.length;
  }

  async updatePreferences(
    userId: string,
    input: {
      in_app_enabled?: boolean;
      email_enabled?: boolean;
      telegram_enabled?: boolean;
      telegram_chat_id?: string | null;
      type_overrides?: unknown;
    },
  ): Promise<void> {
    const inApp = input?.in_app_enabled;
    const email = input?.email_enabled;
    const telegram = input?.telegram_enabled;
    const chatId =
      typeof input?.telegram_chat_id === 'string' ? input.telegram_chat_id.trim() : null;
    const typeOverrides = input?.type_overrides ?? {};

    await this.prisma.$queryRaw`
      insert into public.user_notification_preferences (
        user_id,
        in_app_enabled,
        email_enabled,
        telegram_enabled,
        telegram_chat_id,
        type_overrides
      )
      values (
        ${userId}::uuid,
        coalesce(${inApp}::boolean, true),
        coalesce(${email}::boolean, true),
        coalesce(${telegram}::boolean, false),
        ${chatId},
        ${typeOverrides}::jsonb
      )
      on conflict (user_id) do update
      set
        in_app_enabled = coalesce(excluded.in_app_enabled, user_notification_preferences.in_app_enabled),
        email_enabled = coalesce(excluded.email_enabled, user_notification_preferences.email_enabled),
        telegram_enabled = coalesce(excluded.telegram_enabled, user_notification_preferences.telegram_enabled),
        telegram_chat_id = coalesce(excluded.telegram_chat_id, user_notification_preferences.telegram_chat_id),
        type_overrides = coalesce(excluded.type_overrides, user_notification_preferences.type_overrides),
        updated_at = timezone('utc', now())
    `;
  }
}
