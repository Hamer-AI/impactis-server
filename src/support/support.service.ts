import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AddSupportMessageInput,
  AiChatSessionView,
  CreateAiChatMessageInput,
  CreateSupportTicketInput,
  EscalateAiChatInput,
  SupportMessageView,
  SupportTicketView,
} from './support.types';

type MembershipContext = { orgId: string | null };

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeText(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const t = value.trim();
    return t.length > 0 ? t : null;
  }

  private async resolveOrg(userId: string): Promise<MembershipContext> {
    const rows = await this.prisma.$queryRaw<Array<{ org_id: string | null }>>`
      select om.org_id::text as org_id
      from public.org_members om
      left join public.org_status s on s.org_id = om.org_id
      where om.user_id = ${userId}::uuid and om.status = 'active'
        and coalesce(s.status::text, 'active') = 'active'
      order by om.created_at asc
      limit 1
    `;
    return { orgId: rows[0]?.org_id ?? null };
  }

  async createTicket(userId: string, input: CreateSupportTicketInput): Promise<{ ticket: SupportTicketView; message?: SupportMessageView | null }> {
    const ctx = await this.resolveOrg(userId);
    const subject = this.normalizeText(input.subject) ?? '';
    const category = this.normalizeText(input.category ?? null);
    const message = this.normalizeText(input.message ?? null);

    const created = await this.prisma.$queryRaw<
      Array<{ id: string; org_id: string | null; user_id: string; subject: string; category: string | null; status: string; priority: string; ai_resolved: boolean; created_at: Date; updated_at: Date }>
    >`
      insert into public.support_tickets (org_id, user_id, subject, category, status, priority, ai_resolved)
      values (${ctx.orgId}::uuid, ${userId}::uuid, ${subject}, ${category}, 'open'::public.support_ticket_status, 'medium'::public.support_ticket_priority, false)
      returning id::text as id, org_id::text as org_id, user_id::text as user_id, subject, category, status::text as status, priority::text as priority, ai_resolved, created_at, updated_at
    `;
    const t = created[0];
    if (!t) throw new Error('Failed to create ticket');

    let createdMsg: SupportMessageView | null = null;
    if (message) {
      const rows = await this.prisma.$queryRaw<
        Array<{ id: string; ticket_id: string; sender_id: string; is_staff: boolean; is_ai: boolean; body: string; created_at: Date }>
      >`
        insert into public.support_messages (ticket_id, sender_id, is_staff, is_ai, body)
        values (${t.id}::uuid, ${userId}::uuid, false, false, ${message})
        returning id::text as id, ticket_id::text as ticket_id, sender_id::text as sender_id, is_staff, is_ai, body, created_at
      `;
      const m = rows[0];
      if (m) {
        createdMsg = {
          id: m.id,
          ticket_id: m.ticket_id,
          sender_id: m.sender_id,
          is_staff: m.is_staff === true,
          is_ai: m.is_ai === true,
          body: m.body,
          created_at: m.created_at.toISOString(),
        };
      }
    }

    return {
      ticket: {
        id: t.id,
        org_id: t.org_id,
        user_id: t.user_id,
        subject: t.subject,
        category: t.category,
        status: t.status,
        priority: t.priority,
        ai_resolved: t.ai_resolved === true,
        created_at: t.created_at.toISOString(),
        updated_at: t.updated_at.toISOString(),
      },
      message: createdMsg,
    };
  }

  async listMyTickets(userId: string): Promise<SupportTicketView[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; org_id: string | null; user_id: string; subject: string; category: string | null; status: string; priority: string; ai_resolved: boolean; created_at: Date; updated_at: Date }>
    >`
      select id::text as id, org_id::text as org_id, user_id::text as user_id, subject, category,
        status::text as status, priority::text as priority, ai_resolved, created_at, updated_at
      from public.support_tickets
      where user_id = ${userId}::uuid
      order by updated_at desc
      limit 200
    `;
    return (rows ?? []).map((t) => ({
      id: t.id,
      org_id: t.org_id,
      user_id: t.user_id,
      subject: t.subject,
      category: t.category,
      status: t.status,
      priority: t.priority,
      ai_resolved: t.ai_resolved === true,
      created_at: t.created_at.toISOString(),
      updated_at: t.updated_at.toISOString(),
    }));
  }

  async listTicketMessages(userId: string, ticketId: string): Promise<SupportMessageView[]> {
    const tid = this.normalizeText(ticketId);
    if (!tid) return [];

    // Ensure ticket belongs to user.
    const allowed = await this.prisma.$queryRaw<Array<{ ok: boolean }>>`
      select exists(select 1 from public.support_tickets where id = ${tid}::uuid and user_id = ${userId}::uuid) as ok
    `;
    if (allowed[0]?.ok !== true) return [];

    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; ticket_id: string; sender_id: string; is_staff: boolean; is_ai: boolean; body: string; created_at: Date }>
    >`
      select id::text as id, ticket_id::text as ticket_id, sender_id::text as sender_id, is_staff, is_ai, body, created_at
      from public.support_messages
      where ticket_id = ${tid}::uuid
      order by created_at asc
    `;
    return (rows ?? []).map((m) => ({
      id: m.id,
      ticket_id: m.ticket_id,
      sender_id: m.sender_id,
      is_staff: m.is_staff === true,
      is_ai: m.is_ai === true,
      body: m.body,
      created_at: m.created_at.toISOString(),
    }));
  }

  async addTicketMessage(userId: string, ticketId: string, input: AddSupportMessageInput): Promise<SupportMessageView> {
    const tid = this.normalizeText(ticketId);
    if (!tid) throw new Error('Invalid ticket id');
    const body = this.normalizeText(input.body);
    if (!body) throw new Error('Message is required');

    const ok = await this.prisma.$queryRaw<Array<{ ok: boolean }>>`
      select exists(select 1 from public.support_tickets where id = ${tid}::uuid and user_id = ${userId}::uuid) as ok
    `;
    if (ok[0]?.ok !== true) throw new Error('Not allowed');

    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; ticket_id: string; sender_id: string; is_staff: boolean; is_ai: boolean; body: string; created_at: Date }>
    >`
      insert into public.support_messages (ticket_id, sender_id, is_staff, is_ai, body)
      values (${tid}::uuid, ${userId}::uuid, false, false, ${body})
      returning id::text as id, ticket_id::text as ticket_id, sender_id::text as sender_id, is_staff, is_ai, body, created_at
    `;
    const m = rows[0];
    if (!m) throw new Error('Failed to add message');

    await this.prisma.$queryRaw`
      update public.support_tickets
      set updated_at = timezone('utc', now())
      where id = ${tid}::uuid
    `;

    return {
      id: m.id,
      ticket_id: m.ticket_id,
      sender_id: m.sender_id,
      is_staff: m.is_staff === true,
      is_ai: m.is_ai === true,
      body: m.body,
      created_at: m.created_at.toISOString(),
    };
  }

  async sendHelpBotMessage(userId: string, input: CreateAiChatMessageInput): Promise<{ session: AiChatSessionView; reply: string }> {
    const ctx = this.normalizeText(input.context ?? null);
    const msg = this.normalizeText(input.message);
    if (!msg) throw new Error('Message is required');

    // Minimal bot: deterministic canned reply; later replace with GPT + knowledge base.
    const reply = 'Thanks — our support bot is in demo mode. Please describe the issue and we can escalate to a human agent if needed.';

    const sessionRows = await this.prisma.$queryRaw<
      Array<{ id: string; context: string | null; messages: unknown; escalated: boolean; ticket_id: string | null; created_at: Date; updated_at: Date }>
    >`
      insert into public.ai_chat_sessions (user_id, context, messages, escalated)
      values (
        ${userId}::uuid,
        ${ctx},
        jsonb_build_array(
          jsonb_build_object('role','user','content',${msg},'created_at',timezone('utc', now())),
          jsonb_build_object('role','assistant','content',${reply},'created_at',timezone('utc', now()))
        ),
        false
      )
      returning id::text as id, context, messages, escalated, ticket_id::text as ticket_id, created_at, updated_at
    `;
    const s = sessionRows[0];
    if (!s) throw new Error('Failed to create chat session');

    return {
      session: {
        id: s.id,
        context: s.context,
        messages: s.messages ?? [],
        escalated: s.escalated === true,
        ticket_id: s.ticket_id,
        created_at: s.created_at.toISOString(),
        updated_at: s.updated_at.toISOString(),
      },
      reply,
    };
  }

  async escalateChatToTicket(userId: string, input: EscalateAiChatInput): Promise<{ success: boolean; ticketId: string | null }> {
    const sessionId = this.normalizeText(input.sessionId);
    if (!sessionId) throw new Error('sessionId is required');
    const note = this.normalizeText(input.note ?? null);

    const ctx = await this.resolveOrg(userId);

    const result = await this.prisma.$transaction(async (tx) => {
      const sessions = await tx.$queryRaw<Array<{ id: string; escalated: boolean; ticket_id: string | null; messages: any }>>`
        select id::text as id, escalated, ticket_id::text as ticket_id, messages
        from public.ai_chat_sessions
        where id = ${sessionId}::uuid and user_id = ${userId}::uuid
        limit 1
      `;
      const s = sessions[0];
      if (!s?.id) throw new Error('Chat session not found');
      if (s.escalated === true && s.ticket_id) {
        return { ticketId: s.ticket_id };
      }

      const subject = 'Help bot escalation';
      const created = await tx.$queryRaw<Array<{ id: string }>>`
        insert into public.support_tickets (org_id, user_id, subject, category, status, priority, ai_resolved)
        values (${ctx.orgId}::uuid, ${userId}::uuid, ${subject}, 'other', 'open'::public.support_ticket_status, 'medium'::public.support_ticket_priority, false)
        returning id::text as id
      `;
      const ticketId = created[0]?.id;
      if (!ticketId) throw new Error('Failed to create support ticket');

      const body = note ?? 'User requested to talk to a human support agent.';
      await tx.$queryRaw`
        insert into public.support_messages (ticket_id, sender_id, is_staff, is_ai, body)
        values (${ticketId}::uuid, ${userId}::uuid, false, false, ${body})
      `;

      await tx.$queryRaw`
        update public.ai_chat_sessions
        set escalated = true, escalated_at = timezone('utc', now()), ticket_id = ${ticketId}::uuid, updated_at = timezone('utc', now())
        where id = ${sessionId}::uuid
      `;

      return { ticketId };
    });

    // Notify support admins (admin_users role= support or admin/super_admin)
    try {
      const adminRows = await this.prisma.$queryRaw<Array<{ user_id: string }>>`
        select user_id::text as user_id
        from public.admin_users
        where is_active = true
      `;
      for (const a of adminRows) {
        await this.prisma.$queryRaw`
          insert into public.notifications (user_id, type, title, body, link)
          values (${a.user_id}::uuid, 'support_ticket_update', 'New support ticket', 'A user escalated from the help bot.', '/admin')
        `;
      }
    } catch {
      // ignore admin notify failures
    }

    return { success: true, ticketId: result.ticketId ?? null };
  }
}

