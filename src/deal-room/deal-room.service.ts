import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BillingUsageService } from '../billing/billing-usage.service';
import type {
  DealRoomMessageView,
  DealRoomParticipantView,
  DealRoomRequestView,
  DealRoomStage,
  DealRoomView,
} from './deal-room.types';

type MembershipContext = { orgId: string; orgType: string };

const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_ORIGIN ??
  process.env.APP_ORIGIN ??
  'http://127.0.0.1:3000';

@Injectable()
export class DealRoomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly notifications: NotificationsService,
    private readonly billingUsage: BillingUsageService,
  ) {}

  private normalizeText(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const t = value.trim();
    return t.length > 0 ? t : null;
  }

  private ensureUuid(value: string, message: string): string {
    const v = this.normalizeText(value);
    if (
      !v ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        v,
      )
    ) {
      throw new Error(message);
    }
    return v;
  }

  private toIso(value: Date | null | undefined): string | null {
    return value ? value.toISOString() : null;
  }

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

  private async getOrgMemberEmails(
    orgId: string,
  ): Promise<Array<{ user_id: string; email: string | null }>> {
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

  async createDealRoomRequest(params: {
    userId: string;
    startupOrgId: string;
    message?: string | null;
  }): Promise<DealRoomRequestView> {
    const ctx = await this.getRequesterContext(params.userId);
    if (ctx.orgType !== 'investor' && ctx.orgType !== 'startup') {
      throw new Error('Only startup or investor organizations can start a deal discussion');
    }

    const counterpartyOrgId = this.ensureUuid(params.startupOrgId, 'Invalid startupOrgId');
    if (counterpartyOrgId === ctx.orgId) {
      throw new Error('Cannot start a deal discussion with your own organization');
    }

    const counterpartyRows = await this.prisma.$queryRaw<
      Array<{ id: string; name: string; type: string }>
    >`
      select id, name, type::text as type
      from public.organizations
      where id = ${counterpartyOrgId}::uuid
      limit 1
    `;
    const counterparty = counterpartyRows[0];
    if (!counterparty) throw new Error('Target organization was not found');

    // Determine startup/investor ids regardless of who initiated.
    const startupOrgId = ctx.orgType === 'startup' ? ctx.orgId : counterpartyOrgId;
    const investorOrgId = ctx.orgType === 'investor' ? ctx.orgId : counterpartyOrgId;

    if (ctx.orgType === 'investor' && counterparty.type?.toLowerCase() !== 'startup') {
      throw new Error('Investors can only start a deal discussion with a startup organization');
    }
    if (ctx.orgType === 'startup' && counterparty.type?.toLowerCase() !== 'investor') {
      throw new Error('Startups can only start a deal discussion with an investor organization');
    }

    // v3: must already be connected.
    const connectionRows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      select id::text as id
      from public.connections
      where (org_a_id = ${startupOrgId}::uuid and org_b_id = ${investorOrgId}::uuid)
         or (org_a_id = ${investorOrgId}::uuid and org_b_id = ${startupOrgId}::uuid)
      limit 1
    `;
    if (!connectionRows[0]?.id) {
      throw new ForbiddenException('Must be connected first');
    }

    const usage = await this.billingUsage.checkAndIncrementOrgFeatureUsage(
      ctx.orgId,
      'dealroom.requests_sent',
    );
    if (!usage.allowed) {
      throw new ForbiddenException({
        code: 'USAGE_LIMIT_REACHED',
        featureKey: usage.featureKey,
        current: usage.current,
        limit: usage.limit,
        planCode: usage.planCode,
        message:
          'You have reached the maximum number of Deal Room requests for your current plan. Upgrade to start more deal discussions.',
      });
    }

    const investorNameRows = await this.prisma.$queryRaw<Array<{ name: string }>>`
      select name from public.organizations where id = ${ctx.orgId}::uuid limit 1
    `;
    const investorName = investorNameRows[0]?.name ?? '';
    const message = this.normalizeText(params.message ?? null);

    // v3: attempt to persist initiated_by if column exists; fall back if migration not applied yet.
    let inserted: Array<{
      id: string;
      startup_org_id: string;
      investor_org_id: string;
      status: string;
      message: string | null;
      created_at: Date;
      responded_at: Date | null;
    }> = [];

    try {
      inserted = await this.prisma.$queryRaw<
        Array<{
          id: string;
          startup_org_id: string;
          investor_org_id: string;
          status: string;
          message: string | null;
          created_at: Date;
          responded_at: Date | null;
        }>
      >`
        insert into public.deal_room_requests (startup_org_id, investor_org_id, status, message, initiated_by)
        values (${startupOrgId}::uuid, ${investorOrgId}::uuid, 'pending', ${message}, ${ctx.orgId}::uuid)
        on conflict (startup_org_id, investor_org_id) do update
        set status = 'pending', message = excluded.message, responded_at = null
        returning id, startup_org_id, investor_org_id, status, message, created_at, responded_at
      `;
    } catch {
      inserted = await this.prisma.$queryRaw<
        Array<{
          id: string;
          startup_org_id: string;
          investor_org_id: string;
          status: string;
          message: string | null;
          created_at: Date;
          responded_at: Date | null;
        }>
      >`
        insert into public.deal_room_requests (startup_org_id, investor_org_id, status, message)
        values (${startupOrgId}::uuid, ${investorOrgId}::uuid, 'pending', ${message})
        on conflict (startup_org_id, investor_org_id) do update
        set status = 'pending', message = excluded.message, responded_at = null
        returning id, startup_org_id, investor_org_id, status, message, created_at, responded_at
      `;
    }

    const r = inserted[0];
    if (!r) throw new Error('Failed to create deal discussion request');

    const startupNameRows = await this.prisma.$queryRaw<Array<{ name: string }>>`
      select name from public.organizations where id = ${startupOrgId}::uuid limit 1
    `;
    const startupName = startupNameRows[0]?.name ?? '';

    const investorOrgName =
      ctx.orgType === 'investor' ? investorName : counterparty.name;
    const startupOrgName =
      ctx.orgType === 'startup' ? investorName : startupName;

    const notifyTargetOrgId = ctx.orgType === 'investor' ? startupOrgId : investorOrgId;
    const notifyTargetName = ctx.orgType === 'investor' ? startupName : counterparty.name;

    const link = `${APP_ORIGIN.replace(/\/+$/, '')}/workspace/notifications`;
    const title = `${investorName} wants to start a deal discussion`;
    const body = `You have a new Deal Room request from ${investorName}. Accept or decline in Notifications.`;
    await this.notifications.createForOrg(notifyTargetOrgId, {
      type: 'deal_room_request_received',
      title,
      body,
      link,
    });
    const targetMembers = await this.getOrgMemberEmails(notifyTargetOrgId);
    for (const m of targetMembers) {
      if (m.email?.trim()) {
        await this.mailer.send({
          to: m.email.trim(),
          subject: title,
          text: `${body}\n\nOpen: ${link}`,
          html: `<p>${body}</p><p><a href="${link}">Open notifications</a></p>`,
        });
      }
    }

    return {
      id: r.id,
      startup_org_id: r.startup_org_id,
      investor_org_id: r.investor_org_id,
      status: r.status === 'pending' ? 'pending' : (r.status as any),
      message: r.message,
      created_at: r.created_at.toISOString(),
      responded_at: this.toIso(r.responded_at),
      startup_org_name: notifyTargetName ?? startupOrgName,
      investor_org_name: investorOrgName,
    };

    /*
     * Note: previous implementation notified startup only; v3 supports both directions.
     */
  }

  async listIncomingRequests(userId: string): Promise<DealRoomRequestView[]> {
    const ctx = await this.getRequesterContext(userId);
    if (ctx.orgType !== 'startup') return [];
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        startup_org_id: string;
        investor_org_id: string;
        status: string;
        message: string | null;
        created_at: Date;
        responded_at: Date | null;
        investor_org_name: string;
      }>
    >`
      select r.id, r.startup_org_id, r.investor_org_id, r.status, r.message, r.created_at, r.responded_at,
        o.name as investor_org_name
      from public.deal_room_requests r
      join public.organizations o on o.id = r.investor_org_id
      where r.startup_org_id = ${ctx.orgId}::uuid and r.status = 'pending'
      order by r.created_at desc
      limit 100
    `;
    return rows.map((r) => ({
      id: r.id,
      startup_org_id: r.startup_org_id,
      investor_org_id: r.investor_org_id,
      status: (r.status ?? 'pending') as any,
      message: r.message,
      created_at: r.created_at.toISOString(),
      responded_at: this.toIso(r.responded_at),
      investor_org_name: r.investor_org_name,
    }));
  }

  private async getOrCreateConnection(params: {
    startupOrgId: string;
    investorOrgId: string;
  }): Promise<{ id: string; org_a_id: string; org_b_id: string }> {
    const orgA = params.startupOrgId < params.investorOrgId ? params.startupOrgId : params.investorOrgId;
    const orgB = params.startupOrgId < params.investorOrgId ? params.investorOrgId : params.startupOrgId;
    await this.prisma.$queryRaw`
      insert into public.connections (org_a_id, org_b_id)
      values (${orgA}::uuid, ${orgB}::uuid)
      on conflict (org_a_id, org_b_id) do nothing
    `;
    const rows = await this.prisma.$queryRaw<Array<{ id: string; org_a_id: string; org_b_id: string }>>`
      select id::text as id, org_a_id::text as org_a_id, org_b_id::text as org_b_id
      from public.connections
      where org_a_id = ${orgA}::uuid and org_b_id = ${orgB}::uuid
      limit 1
    `;
    const c = rows[0];
    if (!c) throw new Error('Failed to create connection');
    return c;
  }

  private async getOrCreateDealRoom(connectionId: string): Promise<{ id: string; stage: DealRoomStage }> {
    await this.prisma.$queryRaw`
      insert into public.deal_rooms (connection_id)
      values (${connectionId}::uuid)
      on conflict (connection_id) do nothing
    `;
    const rows = await this.prisma.$queryRaw<Array<{ id: string; stage: string }>>`
      select id::text as id, stage::text as stage
      from public.deal_rooms
      where connection_id = ${connectionId}::uuid
      limit 1
    `;
    const r = rows[0];
    if (!r?.id) throw new Error('Failed to create deal room');
    return { id: r.id, stage: (r.stage ?? 'interest') as DealRoomStage };
  }

  async acceptRequest(params: { userId: string; requestId: string }): Promise<{ dealRoomId: string }> {
    const ctx = await this.getRequesterContext(params.userId);
    if (ctx.orgType !== 'startup') {
      throw new Error('Only startups can accept deal room requests');
    }
    const requestId = this.ensureUuid(params.requestId, 'Invalid request id');

    const reqRows = await this.prisma.$queryRaw<
      Array<{ id: string; startup_org_id: string; investor_org_id: string }>
    >`
      select id::text as id, startup_org_id::text as startup_org_id, investor_org_id::text as investor_org_id
      from public.deal_room_requests
      where id = ${requestId}::uuid and startup_org_id = ${ctx.orgId}::uuid and status = 'pending'
      limit 1
    `;
    const req = reqRows[0];
    if (!req) throw new Error('Request not found or already responded');

    const dealRoom = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        update public.deal_room_requests
        set status = 'accepted', responded_at = timezone('utc', now())
        where id = ${requestId}::uuid
      `;

      // Connection + deal room
      const conn = await this.getOrCreateConnection({
        startupOrgId: req.startup_org_id,
        investorOrgId: req.investor_org_id,
      });
      const room = await this.getOrCreateDealRoom(conn.id);

      // Participants
      await tx.$queryRaw`
        insert into public.deal_room_participants (deal_room_id, org_id, role, accepted_at)
        values
          (${room.id}::uuid, ${req.startup_org_id}::uuid, 'startup_founder'::public.deal_room_participant_role, timezone('utc', now())),
          (${room.id}::uuid, ${req.investor_org_id}::uuid, 'lead_investor'::public.deal_room_participant_role, timezone('utc', now()))
        on conflict (deal_room_id, org_id) do update
        set accepted_at = excluded.accepted_at
      `;

      // Stage history (only if empty)
      await tx.$queryRaw`
        insert into public.deal_room_stage_history (deal_room_id, from_stage, to_stage, changed_by, note)
        select ${room.id}::uuid, null, 'interest'::public.deal_room_stage, ${params.userId}::uuid, 'Deal Room created'
        where not exists (
          select 1 from public.deal_room_stage_history h where h.deal_room_id = ${room.id}::uuid
        )
      `;

      return room;
    });

    const link = `${APP_ORIGIN.replace(/\/+$/, '')}/workspace/connections`;
    await this.notifications.createForOrg(req.investor_org_id, {
      type: 'deal_room_created',
      title: 'Deal Room opened',
      body: 'Your Deal Room request was accepted. You can now chat and progress the deal.',
      link,
    });
    const investorMembers = await this.getOrgMemberEmails(req.investor_org_id);
    for (const m of investorMembers) {
      if (m.email?.trim()) {
        await this.mailer.send({
          to: m.email.trim(),
          subject: 'Deal Room opened – Impactis',
          text: `Your Deal Room request was accepted. Open: ${link}`,
          html: `<p>Your Deal Room request was accepted.</p><p><a href="${link}">Open Deal Room</a></p>`,
        });
      }
    }

    return { dealRoomId: dealRoom.id };
  }

  async rejectRequest(params: { userId: string; requestId: string; note?: string | null }): Promise<void> {
    const ctx = await this.getRequesterContext(params.userId);
    if (ctx.orgType !== 'startup') {
      throw new Error('Only startups can reject deal room requests');
    }
    const requestId = this.ensureUuid(params.requestId, 'Invalid request id');
    const note = this.normalizeText(params.note ?? null);

    const rows = await this.prisma.$queryRaw<
      Array<{ startup_org_id: string; investor_org_id: string }>
    >`
      select startup_org_id::text as startup_org_id, investor_org_id::text as investor_org_id
      from public.deal_room_requests
      where id = ${requestId}::uuid
      limit 1
    `;
    const r = rows[0];
    if (!r) throw new Error('Request not found');
    if (r.startup_org_id !== ctx.orgId) {
      throw new ForbiddenException({ code: 'DEAL_ROOM_PERMISSION_DENIED', message: 'Not allowed' });
    }

    await this.prisma.$queryRaw`
      update public.deal_room_requests
      set status = 'rejected', responded_at = timezone('utc', now()), message = coalesce(message, '')
      where id = ${requestId}::uuid and status = 'pending'
    `;

    const link = `${APP_ORIGIN.replace(/\/+$/, '')}/workspace/notifications`;
    await this.notifications.createForOrg(r.investor_org_id, {
      type: 'deal_room_request_rejected',
      title: 'Deal Room request declined',
      body: note ? `Your request was declined: ${note}` : 'Your request was declined.',
      link,
    });
    const members = await this.getOrgMemberEmails(r.investor_org_id);
    for (const m of members) {
      if (m.email?.trim()) {
        await this.mailer.send({
          to: m.email.trim(),
          subject: 'Deal Room request declined – Impactis',
          text: `Your request was declined.${note ? `\n\nNote: ${note}` : ''}\n\nOpen: ${link}`,
          html: `<p>Your request was declined.</p>${note ? `<p>Note: ${note}</p>` : ''}<p><a href="${link}">Open</a></p>`,
        });
      }
    }
  }

  private async assertParticipant(userId: string, dealRoomId: string): Promise<MembershipContext> {
    const ctx = await this.getRequesterContext(userId);
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      select p.id::text as id
      from public.deal_room_participants p
      join public.deal_rooms r on r.id = p.deal_room_id
      join public.connections c on c.id = r.connection_id
      where p.deal_room_id = ${dealRoomId}::uuid
        and p.org_id = ${ctx.orgId}::uuid
      limit 1
    `;
    if (!rows[0]?.id) {
      throw new ForbiddenException({ code: 'DEAL_ROOM_PERMISSION_DENIED', message: 'You are not a participant of this deal room.' });
    }
    return ctx;
  }

  async listDealRooms(userId: string): Promise<DealRoomView[]> {
    const ctx = await this.getRequesterContext(userId);
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        connection_id: string;
        stage: string;
        name: string | null;
        description: string | null;
        created_at: Date;
        other_org_id: string;
        other_org_name: string;
      }>
    >`
      select
        r.id::text as id,
        r.connection_id::text as connection_id,
        r.stage::text as stage,
        r.name,
        r.description,
        r.created_at,
        case when c.org_a_id = ${ctx.orgId}::uuid then c.org_b_id else c.org_a_id end as other_org_id,
        case when c.org_a_id = ${ctx.orgId}::uuid then ob.name else oa.name end as other_org_name
      from public.deal_rooms r
      join public.connections c on c.id = r.connection_id
      join public.organizations oa on oa.id = c.org_a_id
      join public.organizations ob on ob.id = c.org_b_id
      where c.org_a_id = ${ctx.orgId}::uuid or c.org_b_id = ${ctx.orgId}::uuid
      order by r.updated_at desc
      limit 100
    `;
    return rows.map((r) => ({
      id: r.id,
      connection_id: r.connection_id,
      stage: (r.stage ?? 'interest') as DealRoomStage,
      name: r.name,
      description: r.description,
      created_at: r.created_at.toISOString(),
      other_org_id: r.other_org_id,
      other_org_name: r.other_org_name,
    }));
  }

  async getDealRoomDetails(userId: string, dealRoomId: string): Promise<{ room: DealRoomView; participants: DealRoomParticipantView[] }> {
    const ctx = await this.assertParticipant(userId, dealRoomId);
    const rooms = await this.prisma.$queryRaw<
      Array<{
        id: string;
        connection_id: string;
        stage: string;
        name: string | null;
        description: string | null;
        created_at: Date;
        other_org_id: string;
        other_org_name: string;
      }>
    >`
      select
        r.id::text as id,
        r.connection_id::text as connection_id,
        r.stage::text as stage,
        r.name,
        r.description,
        r.created_at,
        case when c.org_a_id = ${ctx.orgId}::uuid then c.org_b_id else c.org_a_id end as other_org_id,
        case when c.org_a_id = ${ctx.orgId}::uuid then ob.name else oa.name end as other_org_name
      from public.deal_rooms r
      join public.connections c on c.id = r.connection_id
      join public.organizations oa on oa.id = c.org_a_id
      join public.organizations ob on ob.id = c.org_b_id
      where r.id = ${dealRoomId}::uuid
      limit 1
    `;
    const roomRow = rooms[0];
    if (!roomRow) throw new Error('Deal room not found');

    const participants = await this.prisma.$queryRaw<
      Array<{
        id: string;
        org_id: string;
        role: string;
        invited_at: Date;
        accepted_at: Date | null;
        left_at: Date | null;
        org_name: string;
      }>
    >`
      select p.id::text as id, p.org_id::text as org_id, p.role::text as role, p.invited_at, p.accepted_at, p.left_at,
        o.name as org_name
      from public.deal_room_participants p
      join public.organizations o on o.id = p.org_id
      where p.deal_room_id = ${dealRoomId}::uuid
      order by p.invited_at asc
    `;

    return {
      room: {
        id: roomRow.id,
        connection_id: roomRow.connection_id,
        stage: (roomRow.stage ?? 'interest') as DealRoomStage,
        name: roomRow.name,
        description: roomRow.description,
        created_at: roomRow.created_at.toISOString(),
        other_org_id: roomRow.other_org_id,
        other_org_name: roomRow.other_org_name,
      },
      participants: participants.map((p) => ({
        id: p.id,
        org_id: p.org_id,
        role: p.role,
        invited_at: p.invited_at.toISOString(),
        accepted_at: this.toIso(p.accepted_at),
        left_at: this.toIso(p.left_at),
        org_name: p.org_name,
      })),
    };
  }

  async listMessages(userId: string, dealRoomId: string): Promise<DealRoomMessageView[]> {
    await this.assertParticipant(userId, dealRoomId);
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        deal_room_id: string;
        sender_user_id: string;
        sender_email: string | null;
        body: string;
        created_at: Date;
      }>
    >`
      select m.id::text as id, m.deal_room_id::text as deal_room_id, m.sender_user_id::text as sender_user_id,
        u.email as sender_email, m.body, m.created_at
      from public.deal_room_messages m
      join public.users u on u.id = m.sender_user_id
      where m.deal_room_id = ${dealRoomId}::uuid
      order by m.created_at asc
      limit 500
    `;
    return rows.map((m) => ({
      id: m.id,
      deal_room_id: m.deal_room_id,
      sender_user_id: m.sender_user_id,
      sender_email: m.sender_email,
      body: m.body,
      created_at: m.created_at.toISOString(),
    }));
  }

  async sendMessage(userId: string, dealRoomId: string, body: string): Promise<DealRoomMessageView> {
    const ctx = await this.assertParticipant(userId, dealRoomId);
    const text = this.normalizeText(body);
    if (!text) throw new Error('Message body is required');

    const inserted = await this.prisma.$queryRaw<
      Array<{ id: string; deal_room_id: string; sender_user_id: string; body: string; created_at: Date; sender_email: string | null }>
    >`
      insert into public.deal_room_messages (deal_room_id, sender_user_id, body)
      values (${dealRoomId}::uuid, ${userId}::uuid, ${text})
      returning id::text as id, deal_room_id::text as deal_room_id, sender_user_id::text as sender_user_id, body, created_at,
        (select email from public.users where id = ${userId}::uuid) as sender_email
    `;
    const m = inserted[0];
    if (!m) throw new Error('Failed to send message');

    // Notify other orgs in this room
    const orgRows = await this.prisma.$queryRaw<Array<{ org_id: string; org_name: string }>>`
      select p.org_id::text as org_id, o.name as org_name
      from public.deal_room_participants p
      join public.organizations o on o.id = p.org_id
      where p.deal_room_id = ${dealRoomId}::uuid
    `;
    const link = `${APP_ORIGIN.replace(/\/+$/, '')}/workspace/connections`;
    for (const o of orgRows) {
      if (o.org_id === ctx.orgId) continue;
      await this.notifications.createForOrg(o.org_id, {
        type: 'deal_room_message',
        title: 'New Deal Room message',
        body: text.length > 160 ? `${text.slice(0, 160)}…` : text,
        link,
      });
      const members = await this.getOrgMemberEmails(o.org_id);
      for (const mem of members) {
        if (mem.email?.trim()) {
          await this.mailer.send({
            to: mem.email.trim(),
            subject: 'New Deal Room message – Impactis',
            text: `${text}\n\nOpen: ${link}`,
            html: `<p>${text}</p><p><a href="${link}">Open Deal Room</a></p>`,
          });
        }
      }
    }

    return {
      id: m.id,
      deal_room_id: m.deal_room_id,
      sender_user_id: m.sender_user_id,
      sender_email: m.sender_email,
      body: m.body,
      created_at: m.created_at.toISOString(),
    };
  }

  async updateStage(params: { userId: string; dealRoomId: string; stage: DealRoomStage; note?: string | null }): Promise<{ success: boolean }> {
    await this.assertParticipant(params.userId, params.dealRoomId);
    const note = this.normalizeText(params.note ?? null);

    const current = await this.prisma.$queryRaw<Array<{ stage: string }>>`
      select stage::text as stage from public.deal_rooms where id = ${params.dealRoomId}::uuid limit 1
    `;
    const fromStage = (current[0]?.stage ?? null) as DealRoomStage | null;

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        update public.deal_rooms set stage = ${params.stage}::public.deal_room_stage, updated_at = timezone('utc', now())
        where id = ${params.dealRoomId}::uuid
      `;
      await tx.$queryRaw`
        insert into public.deal_room_stage_history (deal_room_id, from_stage, to_stage, changed_by, note)
        values (
          ${params.dealRoomId}::uuid,
          ${fromStage ?? null}::public.deal_room_stage,
          ${params.stage}::public.deal_room_stage,
          ${params.userId}::uuid,
          ${note}
        )
      `;
    });

    const orgRows = await this.prisma.$queryRaw<Array<{ org_id: string }>>`
      select org_id::text as org_id from public.deal_room_participants where deal_room_id = ${params.dealRoomId}::uuid
    `;
    const link = `${APP_ORIGIN.replace(/\/+$/, '')}/workspace/connections`;
    for (const o of orgRows) {
      await this.notifications.createForOrg(o.org_id, {
        type: 'deal_room_stage_changed',
        title: 'Deal stage updated',
        body: `Stage changed to ${params.stage.replace(/_/g, ' ')}`,
        link,
      });
    }

    return { success: true };
  }

  async signAgreement(params: { userId: string; dealRoomId: string; agreementId: string }): Promise<{ success: boolean }> {
    const ctx = await this.assertParticipant(params.userId, params.dealRoomId);
    const agreementId = this.ensureUuid(params.agreementId, 'Invalid agreement id');

    const rows = await this.prisma.$queryRaw<
      Array<{ id: string }>
    >`
      update public.deal_room_agreements a
      set
        signed_by = case
          when exists (
            select 1
            from jsonb_array_elements(coalesce(a.signed_by, '[]'::jsonb)) as e
            where e->>'org_id' = ${ctx.orgId}
          )
          then a.signed_by
          else coalesce(a.signed_by, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
            'org_id', ${ctx.orgId}::text,
            'signed_at', timezone('utc', now())
          ))
        end,
        status = 'signed'::public.deal_room_agreement_status,
        updated_at = timezone('utc', now())
      where a.id = ${agreementId}::uuid and a.deal_room_id = ${params.dealRoomId}::uuid
      returning a.id::text as id
    `;
    if (!rows[0]?.id) {
      throw new Error('Agreement not found');
    }

    // Notify other participants.
    const orgRows = await this.prisma.$queryRaw<Array<{ org_id: string }>>`
      select p.org_id::text as org_id
      from public.deal_room_participants p
      where p.deal_room_id = ${params.dealRoomId}::uuid
    `;
    const others = (orgRows ?? []).map((r) => r.org_id).filter((id) => id && id !== ctx.orgId);
    const link = `${APP_ORIGIN.replace(/\/+$/, '')}/workspace/deal-room/${params.dealRoomId}`;
    for (const orgId of others) {
      await this.notifications.createForOrg(orgId, {
        type: 'agreement_signed',
        title: 'Agreement signed',
        body: 'A participant signed an agreement in your deal room.',
        link,
      });
    }

    return { success: true };
  }

  async createMilestone(params: { userId: string; dealRoomId: string; title: string; description?: string | null; dueDate?: string | null }): Promise<{ id: string }> {
    await this.assertParticipant(params.userId, params.dealRoomId);
    const title = this.normalizeText(params.title) ?? '';
    if (!title) throw new Error('Title is required');
    const description = this.normalizeText(params.description ?? null);
    const dueDate = this.normalizeText(params.dueDate ?? null);

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      insert into public.deal_room_milestones (deal_room_id, title, description, due_date)
      values (${params.dealRoomId}::uuid, ${title}, ${description}, ${dueDate}::date)
      returning id::text as id
    `;
    const m = rows[0];
    if (!m?.id) throw new Error('Failed to create milestone');
    return { id: m.id };
  }

  async updateMilestone(params: { userId: string; dealRoomId: string; milestoneId: string; completed?: boolean; title?: string | null; description?: string | null; dueDate?: string | null }): Promise<{ success: boolean }> {
    await this.assertParticipant(params.userId, params.dealRoomId);
    const milestoneId = this.ensureUuid(params.milestoneId, 'Invalid milestone id');
    const title = params.title != null ? this.normalizeText(params.title) : null;
    const description = params.description != null ? this.normalizeText(params.description) : null;
    const dueDate = params.dueDate != null ? this.normalizeText(params.dueDate) : null;
    const completed = params.completed === true;

    await this.prisma.$queryRaw`
      update public.deal_room_milestones
      set
        title = coalesce(${title}, title),
        description = coalesce(${description}, description),
        due_date = coalesce(${dueDate}::date, due_date),
        completed_at = case when ${completed} then coalesce(completed_at, timezone('utc', now())) else null end
      where id = ${milestoneId}::uuid and deal_room_id = ${params.dealRoomId}::uuid
    `;
    return { success: true };
  }

  async recordCommitment(params: { userId: string; dealRoomId: string; amountUsd: string; conditions?: string | null; notes?: string | null }): Promise<{ id: string }> {
    const ctx = await this.assertParticipant(params.userId, params.dealRoomId);
    const amountRaw = this.normalizeText(params.amountUsd);
    const amount = amountRaw ? BigInt(amountRaw) : 0n;
    if (amount <= 0n) throw new Error('amountUsd must be > 0');
    const conditions = this.normalizeText(params.conditions ?? null);
    const notes = this.normalizeText(params.notes ?? null);

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      insert into public.deal_room_commitments (deal_room_id, investor_org_id, amount_usd, conditions, notes, status)
      values (${params.dealRoomId}::uuid, ${ctx.orgId}::uuid, ${amount}::bigint, ${conditions}, ${notes}, 'soft')
      returning id::text as id
    `;
    const c = rows[0];
    if (!c?.id) throw new Error('Failed to record commitment');
    return { id: c.id };
  }

  async createAgreement(params: { userId: string; dealRoomId: string; title: string; templateKey?: string | null; contentText?: string | null }): Promise<{ id: string }> {
    await this.assertParticipant(params.userId, params.dealRoomId);
    const title = this.normalizeText(params.title) ?? '';
    if (!title) throw new Error('Title is required');
    const templateKey = this.normalizeText(params.templateKey ?? null);
    const contentText = this.normalizeText(params.contentText ?? null);

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      insert into public.deal_room_agreements (deal_room_id, title, template_key, content_text, status)
      values (${params.dealRoomId}::uuid, ${title}, ${templateKey}, ${contentText}, 'draft'::public.deal_room_agreement_status)
      returning id::text as id
    `;
    const a = rows[0];
    if (!a?.id) throw new Error('Failed to create agreement');
    return { id: a.id };
  }

  async linkDataRoom(params: { userId: string; dealRoomId: string; startupOrgId: string }): Promise<{ success: boolean }> {
    await this.assertParticipant(params.userId, params.dealRoomId);
    const startupOrgId = this.ensureUuid(params.startupOrgId, 'Invalid startupOrgId');
    await this.prisma.$queryRaw`
      insert into public.deal_room_data_room_links (deal_room_id, startup_org_id, terms_accepted_at)
      values (${params.dealRoomId}::uuid, ${startupOrgId}::uuid, null)
      on conflict (deal_room_id, startup_org_id) do nothing
    `;
    return { success: true };
  }

  async aiAnalyze(params: { userId: string; dealRoomId: string }): Promise<{ summary: string; risks: string[]; milestones: Array<{ title: string; description: string; due_date: string }>; investor_fit_score: number }> {
    await this.assertParticipant(params.userId, params.dealRoomId);
    // Demo placeholder — later replace with actual LLM pipeline.
    return {
      summary: 'AI analysis is in demo mode. Enable LLM integration to generate summaries and risk flags.',
      risks: [],
      milestones: [],
      investor_fit_score: 0,
    };
  }

  async inviteParticipant(params: { userId: string; dealRoomId: string; orgId: string; role: string }): Promise<{ success: boolean }> {
    await this.assertParticipant(params.userId, params.dealRoomId);
    const orgId = this.ensureUuid(params.orgId, 'Invalid orgId');
    const role = this.normalizeText(params.role)?.toLowerCase() ?? '';
    const allowedRoles = new Set(['founder', 'lead_investor', 'co_investor', 'advisor']);
    if (!allowedRoles.has(role)) throw new Error('Invalid role');

    await this.prisma.$queryRaw`
      insert into public.deal_room_participants (deal_room_id, org_id, role)
      values (${params.dealRoomId}::uuid, ${orgId}::uuid, ${role}::public.deal_room_participant_role)
      on conflict (deal_room_id, org_id) do update
      set left_at = null
    `;

    try {
      const link = `${APP_ORIGIN.replace(/\/+$/, '')}/workspace/deal-room/${params.dealRoomId}`;
      await this.notifications.createForOrg(orgId, {
        type: 'deal_room_participant_invited',
        title: 'You were invited to a Deal Room',
        body: 'Open the Deal Room to join the discussion.',
        link,
      });
    } catch {
      // ignore notification failures
    }

    return { success: true };
  }
}

