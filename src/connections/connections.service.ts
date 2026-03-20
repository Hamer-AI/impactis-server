import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BillingUsageService } from '../billing/billing-usage.service';
import { BillingService } from '../billing/billing.service';
import { CreateConnectionRequestInput } from './connections.types';
import type {
  ConnectionMessageView,
  ConnectionRequestView,
  ConnectionView,
} from './connections.types';

type MembershipContext = { orgId: string; orgType: string };

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? process.env.APP_ORIGIN ?? 'http://127.0.0.1:3000';

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly notifications: NotificationsService,
    private readonly billingUsage: BillingUsageService,
    private readonly billing: BillingService,
  ) {}

  private async getRequesterContext(userId: string): Promise<MembershipContext> {
    const rows = await this.prisma.$queryRaw<
      Array<{ org_id: string; org_type: string }>
    >`
      select om.org_id, o.type::text as org_type
      from public.org_members om
      join public.organizations o on o.id = om.org_id
      left join public.org_status s on s.org_id = o.id
      where om.user_id = ${userId}::uuid
        and om.status = 'active'
        and coalesce(s.status::text, 'active') = 'active'
      order by om.created_at asc
      limit 1
    `;
    const row = rows[0];
    if (!row?.org_id || !row?.org_type) {
      throw new Error('Organization membership is required');
    }
    return { orgId: row.org_id, orgType: row.org_type.toLowerCase() };
  }

  private async getOrgMemberEmails(orgId: string): Promise<Array<{ user_id: string; email: string | null }>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ user_id: string; email: string | null }>
    >`
      select om.user_id, u.email
      from public.org_members om
      join public.users u on u.id = om.user_id
      left join public.org_status s on s.org_id = om.org_id
      where om.org_id = ${orgId}::uuid and om.status = 'active'
        and coalesce(s.status::text, 'active') = 'active'
    `;
    return rows ?? [];
  }

  private canRequestConnection(fromType: string, toType: string): boolean {
    if (fromType === toType) return false;
    if (fromType === 'startup') return toType === 'investor' || toType === 'advisor';
    if (fromType === 'investor') return toType === 'startup' || toType === 'advisor';
    if (fromType === 'advisor') return toType === 'startup' || toType === 'investor';
    return false;
  }

  private readonly logger = new Logger(ConnectionsService.name);

  async createRequest(
    userId: string,
    input: CreateConnectionRequestInput,
  ): Promise<ConnectionRequestView> {
    const ctx = await this.getRequesterContext(userId);
    if (ctx.orgType !== 'startup' && ctx.orgType !== 'investor' && ctx.orgType !== 'advisor') {
      throw new Error('Only startup, investor, or advisor organizations can send connection requests');
    }
    const toOrgId = (input.toOrgId ?? '').trim();
    if (!toOrgId || !CreateConnectionRequestInput.isValidUUID(toOrgId)) {
      this.logger.warn(`Invalid toOrgId received: "${input.toOrgId}" (trimmed: "${toOrgId}") from user ${userId}`);
      throw new BadRequestException(`toOrgId must be a valid UUID (received: "${toOrgId.slice(0, 80)}")`);
    }
    const toOrgRows = await this.prisma.$queryRaw<
      Array<{ id: string; type: string; name: string }>
    >`
      select id, type::text as type, name from public.organizations where id = ${toOrgId}::uuid limit 1
    `;
    const toOrg = toOrgRows[0];
    if (!toOrg) {
      throw new Error('Target organization was not found');
    }
    const toOrgMembers = await this.getOrgMemberEmails(toOrgId);
    if (toOrgMembers.length < 1) {
      throw new Error('Target organization is not available for connections yet');
    }
    if (!this.canRequestConnection(ctx.orgType, toOrg.type)) {
      throw new Error(`Connection requests are not allowed from ${ctx.orgType} to ${toOrg.type}`);
    }
    if (toOrgId === ctx.orgId) {
      throw new Error('Cannot send a connection request to your own organization');
    }
    const usage = await this.billingUsage.checkAndIncrementOrgFeatureUsage(
      ctx.orgId,
      'connect_requests_sent',
    );
    if (!usage.allowed) {
      throw new ForbiddenException({
        code: 'USAGE_LIMIT_REACHED',
        featureKey: usage.featureKey,
        current: usage.current,
        limit: usage.limit,
        planCode: usage.planCode,
        message:
          'You have reached the maximum number of connection requests for your current plan. Upgrade to send more requests.',
      });
    }

    const message = input.message?.trim() || null;
    const fromNameRows = await this.prisma.$queryRaw<Array<{ name: string }>>`
      select name from public.organizations where id = ${ctx.orgId}::uuid limit 1
    `;
    const fromName = fromNameRows[0]?.name ?? '';

    const inserted = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          from_org_id: string;
          to_org_id: string;
          status: string;
          message: string | null;
          created_at: Date;
          responded_at: Date | null;
        }>
      >`
        insert into public.connection_requests (from_org_id, to_org_id, status, message)
        values (${ctx.orgId}::uuid, ${toOrgId}::uuid, 'pending'::public.connection_request_status, ${message})
        on conflict (from_org_id, to_org_id) do update
        set message = excluded.message, status = 'pending'::public.connection_request_status, responded_at = null
        returning id, from_org_id, to_org_id, status::text as status, message, created_at, responded_at
      `;
      const r = rows[0];
      if (!r) {
        throw new Error('Failed to create connection request');
      }

      // v3: create success fee lock-in record (12-month window; amounts to be filled when a deal closes).
      await tx.$queryRaw`
        insert into public.success_fee_records (
          payer_org_id,
          deal_room_id,
          intro_date,
          fee_trigger,
          gross_amount_usd,
          fee_rate_pct_x100,
          fee_amount_usd,
          status,
          notes,
          metadata
        )
        values (
          ${ctx.orgId}::uuid,
          null,
          current_date,
          'connection_intro',
          0::bigint,
          0::int,
          0::bigint,
          'pending',
          null,
          jsonb_build_object(
            'connection_request_id', ${r.id}::text,
            'from_org_id', ${ctx.orgId}::text,
            'to_org_id', ${toOrgId}::text
          )
        )
        on conflict do nothing
      `;

      return r;
    });
    const r = inserted;

    const inAppConnectionsPath = '/workspace/connections';
    const connectionsLink = `${APP_ORIGIN.replace(/\/+$/, '')}${inAppConnectionsPath}`;
    const title = `${fromName} wants to connect`;
    const body = `You have a new connection request from ${fromName}. Accept or decline in Connections.`;
    await this.notifications.createForOrg(toOrgId, {
      type: 'connection_request_received',
      title,
      body,
      link: inAppConnectionsPath,
    });
    for (const m of toOrgMembers) {
      if (m.email?.trim()) {
        await this.mailer.send({
          to: m.email.trim(),
          subject: title,
          text: `${body}\n\nView request: ${connectionsLink}`,
          html: `<p>${body.replace(/\n/g, '<br>')}</p><p><a href="${connectionsLink}">View request</a></p>`,
        });
      }
    }

    return {
      id: r.id,
      from_org_id: r.from_org_id,
      from_org_name: fromName,
      to_org_id: r.to_org_id,
      to_org_name: toOrg.name,
      status: r.status as ConnectionRequestView['status'],
      message: r.message,
      created_at: r.created_at.toISOString(),
      responded_at: r.responded_at?.toISOString() ?? null,
    };
  }

  async listIncomingRequests(userId: string): Promise<ConnectionRequestView[]> {
    const ctx = await this.getRequesterContext(userId);
    const list = await this.prisma.$queryRaw<
      Array<{
        id: string;
        from_org_id: string;
        from_org_name: string;
        to_org_id: string;
        to_org_name: string;
        status: string;
        message: string | null;
        created_at: Date;
        responded_at: Date | null;
      }>
    >`
      select
        cr.id, cr.from_org_id, cr.to_org_id, cr.status::text as status, cr.message, cr.created_at, cr.responded_at,
        fo.name as from_org_name, to_org.name as to_org_name
      from public.connection_requests cr
      join public.organizations fo on fo.id = cr.from_org_id
      join public.organizations to_org on to_org.id = cr.to_org_id
      where cr.to_org_id = ${ctx.orgId}::uuid and cr.status = 'pending'
      order by cr.created_at desc
    `;
    return list.map((r) => ({
      id: r.id,
      from_org_id: r.from_org_id,
      from_org_name: r.from_org_name,
      to_org_id: r.to_org_id,
      to_org_name: r.to_org_name,
      status: r.status as ConnectionRequestView['status'],
      message: r.message,
      created_at: r.created_at.toISOString(),
      responded_at: r.responded_at?.toISOString() ?? null,
    }));
  }

  async listOutgoingRequests(userId: string): Promise<ConnectionRequestView[]> {
    const ctx = await this.getRequesterContext(userId);
    const list = await this.prisma.$queryRaw<
      Array<{
        id: string;
        from_org_id: string;
        from_org_name: string;
        to_org_id: string;
        to_org_name: string;
        status: string;
        message: string | null;
        created_at: Date;
        responded_at: Date | null;
      }>
    >`
      select
        cr.id, cr.from_org_id, cr.to_org_id, cr.status::text as status, cr.message, cr.created_at, cr.responded_at,
        fo.name as from_org_name, to_org.name as to_org_name
      from public.connection_requests cr
      join public.organizations fo on fo.id = cr.from_org_id
      join public.organizations to_org on to_org.id = cr.to_org_id
      where cr.from_org_id = ${ctx.orgId}::uuid
      order by cr.created_at desc
    `;
    return list.map((r) => ({
      id: r.id,
      from_org_id: r.from_org_id,
      from_org_name: r.from_org_name,
      to_org_id: r.to_org_id,
      to_org_name: r.to_org_name,
      status: r.status as ConnectionRequestView['status'],
      message: r.message,
      created_at: r.created_at.toISOString(),
      responded_at: r.responded_at?.toISOString() ?? null,
    }));
  }

  async acceptRequest(userId: string, requestId: string): Promise<ConnectionView> {
    const ctx = await this.getRequesterContext(userId);
    const reqRows = await this.prisma.$queryRaw<
      Array<{ from_org_id: string; to_org_id: string }>
    >`
      select from_org_id, to_org_id from public.connection_requests
      where id = ${requestId}::uuid and to_org_id = ${ctx.orgId}::uuid and status = 'pending'
      limit 1
    `;
    const req = reqRows[0];
    if (!req) throw new Error('Connection request not found or already responded');
    const orgA = req.from_org_id < req.to_org_id ? req.from_org_id : req.to_org_id;
    const orgB = req.from_org_id < req.to_org_id ? req.to_org_id : req.from_org_id;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        update public.connection_requests set status = 'accepted'::public.connection_request_status, responded_at = timezone('utc', now())
        where id = ${requestId}::uuid
      `;
      await tx.$queryRaw`
        insert into public.connections (org_a_id, org_b_id)
        values (${orgA}::uuid, ${orgB}::uuid)
        on conflict (org_a_id, org_b_id) do nothing
      `;
    });
    const connRows = await this.prisma.$queryRaw<
      Array<{ id: string; org_a_id: string; org_b_id: string; org_a_name: string; org_b_name: string; created_at: Date }>
    >`
      select c.id, c.org_a_id, c.org_b_id, c.created_at, oa.name as org_a_name, ob.name as org_b_name
      from public.connections c
      join public.organizations oa on oa.id = c.org_a_id
      join public.organizations ob on ob.id = c.org_b_id
      where (c.org_a_id = ${req.from_org_id}::uuid and c.org_b_id = ${req.to_org_id}::uuid)
         or (c.org_a_id = ${req.to_org_id}::uuid and c.org_b_id = ${req.from_org_id}::uuid)
      limit 1
    `;
    const conn = connRows[0];
    if (!conn) throw new Error('Connection not found');
    const otherId = conn.org_a_id === ctx.orgId ? conn.org_b_id : conn.org_a_id;
    const otherName = conn.org_a_id === ctx.orgId ? conn.org_b_name : conn.org_a_name;

    const inAppConnectionsPath = '/workspace/connections';
    const connectionsLink = `${APP_ORIGIN.replace(/\/+$/, '')}${inAppConnectionsPath}`;
    const toOrgName = conn.org_a_id === ctx.orgId ? conn.org_b_name : conn.org_a_name;
    await this.notifications.createForOrg(req.from_org_id, {
      type: 'connection_request_accepted',
      title: `${toOrgName} accepted your connection request`,
      body: `You are now connected. You can message from Deal Room.`,
      link: inAppConnectionsPath,
    });
    const fromOrgMembers = await this.getOrgMemberEmails(req.from_org_id);
    for (const m of fromOrgMembers) {
      if (m.email?.trim()) {
        await this.mailer.send({
          to: m.email.trim(),
          subject: `${toOrgName} accepted your connection request`,
          text: `You are now connected. View Deal Room: ${connectionsLink}`,
          html: `<p>You are now connected with ${toOrgName}. <a href="${connectionsLink}">Open Deal Room</a></p>`,
        });
      }
    }

    const orgTypes = await this.prisma.$queryRaw<
      Array<{ id: string; type: string }>
    >`
      select id::text, type::text from public.organizations
      where id = ${conn.org_a_id}::uuid or id = ${conn.org_b_id}::uuid
    `;
    const typesSet = new Set(orgTypes.map((o) => o.type));
    const isStartupInvestor =
      typesSet.has('startup') && typesSet.has('investor');
    if (isStartupInvestor) {
      try {
        await this.prisma.$queryRaw`
          insert into public.deal_rooms (connection_id)
          values (${conn.id}::uuid)
          on conflict (connection_id) do nothing
        `;
      } catch {
        // Table may not exist yet; run prisma/migrations/add_notifications_and_deal_rooms.sql
      }
      const inAppDealPath = '/workspace/connections';
      const dealRoomLink = `${APP_ORIGIN.replace(/\/+$/, '')}${inAppDealPath}`;
      await this.notifications.createForOrg(conn.org_a_id, {
        type: 'deal_room_created',
        title: 'Deal Room created',
        body: `A Deal Room is now available for this connection. Open it from Connections.`,
        link: inAppDealPath,
      });
      await this.notifications.createForOrg(conn.org_b_id, {
        type: 'deal_room_created',
        title: 'Deal Room created',
        body: `A Deal Room is now available for this connection. Open it from Connections.`,
        link: inAppDealPath,
      });
      const allMemberEmails = [
        ...(await this.getOrgMemberEmails(conn.org_a_id)),
        ...(await this.getOrgMemberEmails(conn.org_b_id)),
      ];
      const sent = new Set<string>();
      for (const m of allMemberEmails) {
        if (m.email?.trim() && !sent.has(m.email.trim())) {
          sent.add(m.email.trim());
          await this.mailer.send({
            to: m.email.trim(),
            subject: 'Deal Room created – Impactis',
            text: `A Deal Room is now available for your connection. Open it from Connections: ${dealRoomLink}`,
            html: `<p>A Deal Room is now available. <a href="${dealRoomLink}">Open Deal Room</a></p>`,
          });
        }
      }
    }

    return {
      id: conn.id,
      org_a_id: conn.org_a_id,
      org_b_id: conn.org_b_id,
      other_org_id: otherId,
      other_org_name: otherName,
      created_at: conn.created_at.toISOString(),
    };
  }

  async rejectRequest(userId: string, requestId: string): Promise<void> {
    const ctx = await this.getRequesterContext(userId);
    const result = await this.prisma.$queryRaw<Array<{ n: number }>>`
      update public.connection_requests
      set status = 'rejected'::public.connection_request_status, responded_at = timezone('utc', now())
      where id = ${requestId}::uuid and to_org_id = ${ctx.orgId}::uuid and status = 'pending'
      returning 1 as n
    `;
    if (!result?.length) {
      throw new Error('Connection request not found or already responded');
    }
  }

  async listConnections(userId: string): Promise<ConnectionView[]> {
    const ctx = await this.getRequesterContext(userId);
    const list = await this.prisma.$queryRaw<
      Array<{
        id: string;
        org_a_id: string;
        org_b_id: string;
        other_org_id: string;
        other_org_name: string;
        deal_room_id: string | null;
        created_at: Date;
      }>
    >`
      select
        c.id, c.org_a_id, c.org_b_id, c.created_at,
        dr.id::text as deal_room_id,
        case when c.org_a_id = ${ctx.orgId}::uuid then c.org_b_id else c.org_a_id end as other_org_id,
        case when c.org_a_id = ${ctx.orgId}::uuid then ob.name else oa.name end as other_org_name
      from public.connections c
      join public.organizations oa on oa.id = c.org_a_id
      join public.organizations ob on ob.id = c.org_b_id
      left join public.deal_rooms dr on dr.connection_id = c.id
      where c.org_a_id = ${ctx.orgId}::uuid or c.org_b_id = ${ctx.orgId}::uuid
      order by c.created_at desc
    `;
    return list.map((c) => ({
      id: c.id,
      org_a_id: c.org_a_id,
      org_b_id: c.org_b_id,
      other_org_id: c.other_org_id,
      other_org_name: c.other_org_name,
      deal_room_id: c.deal_room_id ?? null,
      created_at: c.created_at.toISOString(),
    }));
  }

  async listMessages(
    userId: string,
    connectionId: string,
  ): Promise<ConnectionMessageView[]> {
    const ctx = await this.getRequesterContext(userId);
    const connRows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      select id from public.connections
      where id = ${connectionId}::uuid and (org_a_id = ${ctx.orgId}::uuid or org_b_id = ${ctx.orgId}::uuid)
      limit 1
    `;
    if (!connRows.length) throw new Error('Connection not found');
    const messages = await this.prisma.$queryRaw<
      Array<{
        id: string;
        connection_id: string;
        from_org_id: string;
        from_org_name: string;
        body: string;
        created_at: Date;
      }>
    >`
      select m.id, m.connection_id, m.from_org_id, m.body, m.created_at, o.name as from_org_name
      from public.connection_messages m
      join public.organizations o on o.id = m.from_org_id
      where m.connection_id = ${connectionId}::uuid
      order by m.created_at asc
    `;
    return messages.map((m) => ({
      id: m.id,
      connection_id: m.connection_id,
      from_org_id: m.from_org_id,
      from_org_name: m.from_org_name,
      body: m.body,
      created_at: m.created_at.toISOString(),
    }));
  }

  async sendMessage(
    userId: string,
    connectionId: string,
    body: string,
  ): Promise<ConnectionMessageView> {
    const ctx = await this.getRequesterContext(userId);
    const connRows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      select id from public.connections
      where id = ${connectionId}::uuid and (org_a_id = ${ctx.orgId}::uuid or org_b_id = ${ctx.orgId}::uuid)
      limit 1
    `;
    if (!connRows.length) throw new Error('Connection not found');
    const trimmed = body?.trim();
    if (!trimmed || trimmed.length > 10000) {
      throw new Error('Message must be 1–10000 characters');
    }

    const plan = await this.billing.getCurrentPlanForOrg(ctx.orgId);
    const planCode = (plan?.plan.code ?? 'free').toLowerCase();
    if (planCode === 'free') {
      const countRows = await this.prisma.$queryRaw<Array<{ n: number }>>`
        select count(*)::int as n
        from public.connection_messages
        where connection_id = ${connectionId}::uuid
      `;
      const current = countRows[0]?.n ?? 0;
      const limit = 5;
      if (current >= limit) {
        throw new ForbiddenException({
          code: 'USAGE_LIMIT_REACHED',
          featureKey: 'connection_messages_per_conn',
          current,
          limit,
          planCode,
          message: 'Free plan allows up to 5 messages per connection. Upgrade to continue messaging.',
        });
      }
    }
    const fromNameRows = await this.prisma.$queryRaw<Array<{ name: string }>>`
      select name from public.organizations where id = ${ctx.orgId}::uuid limit 1
    `;
    const fromName = fromNameRows[0]?.name ?? '';
    const inserted = await this.prisma.$queryRaw<
      Array<{ id: string; connection_id: string; from_org_id: string; body: string; created_at: Date }>
    >`
      insert into public.connection_messages (connection_id, from_org_id, body)
      values (${connectionId}::uuid, ${ctx.orgId}::uuid, ${trimmed})
      returning id, connection_id, from_org_id, body, created_at
    `;
    const m = inserted[0];
    if (!m) throw new Error('Failed to send message');
    return {
      id: m.id,
      connection_id: m.connection_id,
      from_org_id: m.from_org_id,
      from_org_name: fromName,
      body: m.body,
      created_at: m.created_at.toISOString(),
    };
  }

  async countPendingIncoming(userId: string): Promise<number> {
    const ctx = await this.getRequesterContext(userId);
    const rows = await this.prisma.$queryRaw<Array<{ n: number }>>`
      select count(*)::int as n from public.connection_requests
      where to_org_id = ${ctx.orgId}::uuid and status = 'pending'
    `;
    return rows[0]?.n ?? 0;
  }
}
