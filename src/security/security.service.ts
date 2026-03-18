import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  DisableTwoFactorInput,
  EnableTwoFactorInput,
  SecurityEventView,
  UserDeviceView,
} from './security.types';

@Injectable()
export class SecurityService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeText(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const t = value.trim();
    return t.length > 0 ? t : null;
  }

  private toIso(value: Date | null | undefined): string | null {
    return value ? value.toISOString() : null;
  }

  async enableTwoFactor(userId: string, input: EnableTwoFactorInput): Promise<{ success: boolean }> {
    const method = this.normalizeText(input.method)?.toLowerCase();
    if (method !== 'totp' && method !== 'sms' && method !== 'email') {
      throw new Error('Invalid method');
    }
    const phone = this.normalizeText(input.phoneNumber ?? null);

    // NOTE: This is a minimal implementation to support the settings UI.
    // The actual OTP/TOTP validation should be handled by Better Auth later.
    await this.prisma.$queryRaw`
      insert into public.user_two_factor_settings (user_id, method, is_enabled, phone_number, verified_at)
      values (${userId}::uuid, ${method}::public.user_two_factor_method, true, ${phone}, timezone('utc', now()))
      on conflict (user_id, method) do update
      set is_enabled = true, phone_number = coalesce(excluded.phone_number, user_two_factor_settings.phone_number), verified_at = timezone('utc', now()), updated_at = timezone('utc', now())
    `;

    await this.prisma.$queryRaw`
      insert into public.user_security_events (user_id, event_type, metadata)
      values (${userId}::uuid, 'two_factor_enabled'::public.security_event_type, jsonb_build_object('method', ${method}))
    `;

    return { success: true };
  }

  async disableTwoFactor(userId: string, input: DisableTwoFactorInput): Promise<{ success: boolean }> {
    void input;
    await this.prisma.$queryRaw`
      update public.user_two_factor_settings
      set is_enabled = false, updated_at = timezone('utc', now())
      where user_id = ${userId}::uuid
    `;

    await this.prisma.$queryRaw`
      insert into public.user_security_events (user_id, event_type, metadata)
      values (${userId}::uuid, 'two_factor_disabled'::public.security_event_type, '{}'::jsonb)
    `;

    return { success: true };
  }

  async listDevices(userId: string): Promise<UserDeviceView[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        device_name: string | null;
        device_type: string | null;
        user_agent: string | null;
        ip_address: string | null;
        country: string | null;
        is_trusted: boolean;
        last_seen_at: Date | null;
        revoked_at: Date | null;
      }>
    >`
      select id::text as id, device_name, device_type, user_agent, ip_address, country, is_trusted, last_seen_at, revoked_at
      from public.user_devices
      where user_id = ${userId}::uuid
      order by last_seen_at desc
      limit 200
    `;
    return (rows ?? []).map((d) => ({
      id: d.id,
      device_name: d.device_name,
      device_type: d.device_type,
      user_agent: d.user_agent,
      ip_address: d.ip_address,
      country: d.country,
      is_trusted: d.is_trusted === true,
      last_seen_at: this.toIso(d.last_seen_at),
      revoked_at: this.toIso(d.revoked_at),
    }));
  }

  async revokeDevice(userId: string, deviceId: string): Promise<{ success: boolean }> {
    const normalized = this.normalizeText(deviceId);
    if (!normalized) throw new Error('Invalid device id');
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      update public.user_devices
      set revoked_at = timezone('utc', now())
      where id = ${normalized}::uuid and user_id = ${userId}::uuid and revoked_at is null
      returning id::text as id
    `;
    const success = !!rows[0]?.id;
    if (success) {
      await this.prisma.$queryRaw`
        insert into public.user_security_events (user_id, event_type, metadata)
        values (${userId}::uuid, 'suspicious_activity'::public.security_event_type, jsonb_build_object('device_revoked', ${normalized}))
      `;
    }
    return { success };
  }

  async listSecurityEvents(userId: string, limit = 30): Promise<SecurityEventView[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.trunc(limit))) : 30;
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        event_type: string;
        ip_address: string | null;
        user_agent: string | null;
        country: string | null;
        city: string | null;
        created_at: Date;
        metadata: unknown;
      }>
    >`
      select id::text as id, event_type::text as event_type, ip_address, user_agent, country, city, created_at, metadata
      from public.user_security_events
      where user_id = ${userId}::uuid
      order by created_at desc
      limit ${safeLimit}
    `;
    return (rows ?? []).map((e) => ({
      id: e.id,
      event_type: e.event_type,
      ip_address: e.ip_address,
      user_agent: e.user_agent,
      country: e.country,
      city: e.city,
      created_at: e.created_at.toISOString(),
      metadata: e.metadata ?? {},
    }));
  }
}

