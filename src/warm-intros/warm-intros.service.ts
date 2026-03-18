import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateWarmIntroRequestInput, RespondWarmIntroRequestInput, WarmIntroRequestView } from './warm-intros.types';

type OrgContext = { orgId: string; orgType: 'startup' | 'investor' | 'advisor' };

@Injectable()
export class WarmIntrosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private normalizeText(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const t = value.trim();
    return t.length > 0 ? t : null;
  }

  private async resolveOrg(userId: string): Promise<OrgContext> {
    const rows = await this.prisma.$queryRaw<Array<{ org_id: string; org_type: string }>>`
      select o.id::text as org_id, o.type::text as org_type
      from public.org_members om
      join public.organizations o on o.id = om.org_id
      left join public.org_status s on s.org_id = om.org_id
      where om.user_id = ${userId}::uuid and om.status = 'active'
        and coalesce(s.status::text, 'active') = 'active'
      order by om.created_at asc
      limit 1
    `;
    const r = rows[0];
    const orgType = this.normalizeText(r?.org_type)?.toLowerCase();
    if (!r?.org_id || (orgType !== 'startup' && orgType !== 'investor' && orgType !== 'advisor')) {
      throw new Error('Organization membership is required');
    }
    return { orgId: r.org_id, orgType: orgType as OrgContext['orgType'] };
  }

  private toView(row: any): WarmIntroRequestView {
    return {
      id: row.id,
      sender_org_id: row.sender_org_id,
      receiver_org_id: row.receiver_org_id,
      via_advisor_org_id: row.via_advisor_org_id ?? null,
      message: row.message ?? null,
      status: row.status,
      response_note: row.response_note ?? null,
      created_at: row.created_at.toISOString(),
      responded_at: row.responded_at ? row.responded_at.toISOString() : null,
    };
  }

  async createRequest(userId: string, input: CreateWarmIntroRequestInput): Promise<WarmIntroRequestView> {
    const ctx = await this.resolveOrg(userId);
    const receiverOrgId = this.normalizeText(input.receiverOrgId) ?? '';
    if (!receiverOrgId) throw new Error('receiverOrgId is required');
    const viaAdvisorOrgId = this.normalizeText(input.viaAdvisorOrgId ?? null);
    const message = this.normalizeText(input.message ?? null);

    // Only startup/advisor can request intros to investors (per product intent).
    if (ctx.orgType === 'investor') {
      throw new ForbiddenException({ code: 'CAPABILITY_BLOCKED', message: 'Investors cannot request warm intros.' });
    }

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        sender_org_id: string;
        receiver_org_id: string;
        via_advisor_org_id: string | null;
        message: string | null;
        status: string;
        response_note: string | null;
        created_at: Date;
        responded_at: Date | null;
      }>
    >`
      insert into public.warm_intro_requests (sender_org_id, receiver_org_id, via_advisor_org_id, message, status)
      values (${ctx.orgId}::uuid, ${receiverOrgId}::uuid, ${viaAdvisorOrgId}::uuid, ${message}, 'pending')
      returning
        id::text as id,
        sender_org_id::text as sender_org_id,
        receiver_org_id::text as receiver_org_id,
        via_advisor_org_id::text as via_advisor_org_id,
        message,
        status,
        response_note,
        created_at,
        responded_at
    `;
    const created = rows[0];
    if (!created?.id) throw new Error('Failed to create warm intro request');

    await this.notifications.createForOrg(receiverOrgId, {
      type: 'warm_intro_requested',
      title: 'Warm intro requested',
      body: 'You received a warm intro request.',
      link: '/workspace/notifications',
    });

    return this.toView(created);
  }

  async listIncoming(userId: string): Promise<WarmIntroRequestView[]> {
    const ctx = await this.resolveOrg(userId);
    const rows = await this.prisma.$queryRaw<Array<any>>`
      select
        id::text as id,
        sender_org_id::text as sender_org_id,
        receiver_org_id::text as receiver_org_id,
        via_advisor_org_id::text as via_advisor_org_id,
        message,
        status,
        response_note,
        created_at,
        responded_at
      from public.warm_intro_requests
      where receiver_org_id = ${ctx.orgId}::uuid
      order by created_at desc
      limit 200
    `;
    return (rows ?? []).map((r) => this.toView(r));
  }

  async listSent(userId: string): Promise<WarmIntroRequestView[]> {
    const ctx = await this.resolveOrg(userId);
    const rows = await this.prisma.$queryRaw<Array<any>>`
      select
        id::text as id,
        sender_org_id::text as sender_org_id,
        receiver_org_id::text as receiver_org_id,
        via_advisor_org_id::text as via_advisor_org_id,
        message,
        status,
        response_note,
        created_at,
        responded_at
      from public.warm_intro_requests
      where sender_org_id = ${ctx.orgId}::uuid
      order by created_at desc
      limit 200
    `;
    return (rows ?? []).map((r) => this.toView(r));
  }

  async respond(userId: string, requestId: string, input: RespondWarmIntroRequestInput): Promise<{ success: boolean }> {
    const ctx = await this.resolveOrg(userId);
    const rid = this.normalizeText(requestId) ?? '';
    if (!rid) throw new Error('Invalid request id');
    const action = this.normalizeText(input.action)?.toLowerCase();
    if (action !== 'accept' && action !== 'decline') throw new Error('Invalid action');
    const responseNote = this.normalizeText(input.responseNote ?? null);
    const status = action === 'accept' ? 'accepted' : 'declined';

    const rows = await this.prisma.$queryRaw<Array<{ sender_org_id: string }>>`
      update public.warm_intro_requests
      set status = ${status}, response_note = ${responseNote}, responded_at = timezone('utc', now())
      where id = ${rid}::uuid and receiver_org_id = ${ctx.orgId}::uuid and status = 'pending'
      returning sender_org_id::text as sender_org_id
    `;
    const senderOrgId = rows[0]?.sender_org_id;
    if (!senderOrgId) return { success: false };

    await this.notifications.createForOrg(senderOrgId, {
      type: 'warm_intro_responded',
      title: `Warm intro ${status}`,
      body: responseNote ?? null,
      link: '/workspace/notifications',
    });

    return { success: true };
  }
}

