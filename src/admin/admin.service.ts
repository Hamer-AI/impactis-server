import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AdminAuditLogView,
  AdminDealRoomView,
  AdminMeView,
  AdminOrgView,
  AdminStatsView,
  AdminSubscriptionView,
  AdminTicketView,
  ForceOrgTierInput,
  UpsertCapabilityOverrideInput,
  UpdateOrgLifecycleInput,
} from './admin.types';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeText(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const t = value.trim();
    return t.length > 0 ? t : null;
  }

  async getAdminMe(userId: string): Promise<AdminMeView | null> {
    const rows = await this.prisma.$queryRaw<Array<{ user_id: string; role: string; is_active: boolean }>>`
      select user_id::text as user_id, role, is_active
      from public.admin_users
      where user_id = ${userId}::uuid
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    return { user_id: row.user_id, role: row.role, is_active: row.is_active === true };
  }

  async listOrganizations(params?: { type?: string | null; status?: string | null; limit?: number }): Promise<AdminOrgView[]> {
    const orgType = this.normalizeText(params?.type ?? null)?.toLowerCase() ?? null;
    const status = this.normalizeText(params?.status ?? null)?.toLowerCase() ?? null;
    const limit = typeof params?.limit === 'number' && Number.isFinite(params.limit) ? Math.max(1, Math.min(500, Math.trunc(params.limit))) : 200;

    const rows = await this.prisma.$queryRaw<
      Array<{
        org_id: string;
        org_type: string;
        name: string;
        status: string | null;
        verification_status: string | null;
        plan_code: string | null;
        plan_tier: number | string | null;
        created_at: Date;
      }>
    >`
      select
        o.id::text as org_id,
        o.type::text as org_type,
        o.name,
        coalesce(os.status::text, 'active') as status,
        coalesce(ov.status::text, 'unverified') as verification_status,
        bpc.plan_code,
        bpc.plan_tier,
        o.created_at
      from public.organizations o
      left join public.org_status os on os.org_id = o.id
      left join public.org_verifications ov on ov.org_id = o.id
      left join public.org_current_subscription_plan_v1 cp on cp.org_id = o.id
      left join public.billing_plan_catalog bpc on bpc.id = cp.plan_id
      where (${orgType}::text is null or o.type::text = ${orgType})
        and (${status}::text is null or coalesce(os.status::text, 'active') = ${status})
      order by o.created_at desc
      limit ${limit}
    `;

    const toInt = (value: unknown): number | null => {
      if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
      if (typeof value === 'string') {
        const parsed = Number.parseInt(value.trim(), 10);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    return (rows ?? []).map((r) => ({
      org_id: r.org_id,
      org_type: r.org_type,
      name: r.name,
      status: (r.status ?? 'active'),
      verification_status: (r.verification_status ?? 'unverified'),
      plan_code: r.plan_code,
      plan_tier: toInt(r.plan_tier),
      created_at: r.created_at.toISOString(),
    }));
  }

  async updateOrgLifecycle(adminUserId: string, orgId: string, input: UpdateOrgLifecycleInput): Promise<{ success: boolean }> {
    const normalizedStatus = this.normalizeText(input.status)?.toLowerCase() ?? 'active';
    const allowed = new Set(['active', 'suspended', 'deleted']);
    if (!allowed.has(normalizedStatus)) {
      throw new Error('Invalid org status');
    }
    const reason = this.normalizeText(input.reason ?? null);

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        insert into public.org_status (org_id, status, updated_by, reason)
        values (${orgId}::uuid, ${normalizedStatus}::public.org_lifecycle_status, ${adminUserId}::uuid, ${reason})
        on conflict (org_id) do update
        set status = excluded.status, updated_by = excluded.updated_by, reason = excluded.reason, updated_at = timezone('utc', now())
      `;
      await tx.$queryRaw`
        insert into public.admin_audit_logs (admin_id, action, target_type, target_id, payload)
        values (${adminUserId}::uuid, 'org_status_updated', 'org', ${orgId}, jsonb_build_object('status', ${normalizedStatus}, 'reason', ${reason}))
      `;
    });

    return { success: true };
  }

  async upsertCapabilityOverride(adminUserId: string, input: UpsertCapabilityOverrideInput): Promise<{ success: boolean }> {
    const orgId = input.orgId;
    const capabilityCode = this.normalizeText(input.capabilityCode)?.toLowerCase() ?? '';
    if (!capabilityCode) throw new Error('capabilityCode is required');
    const expiresAt = this.normalizeText(input.expiresAt ?? null);

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        insert into public.org_capabilities_overrides (org_id, capability_code, is_enabled, source, expires_at)
        values (${orgId}::uuid, ${capabilityCode}, ${input.isEnabled}, 'admin', ${expiresAt}::timestamptz)
        on conflict (org_id, capability_code) do update
        set is_enabled = excluded.is_enabled, source = excluded.source, expires_at = excluded.expires_at, updated_at = timezone('utc', now())
      `;
      await tx.$queryRaw`
        insert into public.admin_audit_logs (admin_id, action, target_type, target_id, payload)
        values (${adminUserId}::uuid, 'capability_override_upserted', 'org', ${orgId}, jsonb_build_object('capability_code', ${capabilityCode}, 'is_enabled', ${input.isEnabled}, 'expires_at', ${expiresAt}))
      `;
    });

    return { success: true };
  }

  async listAuditLogs(limit = 200): Promise<AdminAuditLogView[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.trunc(limit))) : 200;
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; admin_id: string; action: string; target_type: string | null; target_id: string | null; payload: unknown; created_at: Date }>
    >`
      select id::text as id, admin_id::text as admin_id, action, target_type, target_id, payload, created_at
      from public.admin_audit_logs
      order by created_at desc
      limit ${safeLimit}
    `;
    return (rows ?? []).map((r) => ({
      id: r.id,
      admin_id: r.admin_id,
      action: r.action,
      target_type: r.target_type,
      target_id: r.target_id,
      payload: r.payload,
      created_at: r.created_at.toISOString(),
    }));
  }

  async getStats(): Promise<AdminStatsView> {
    const orgCounts = await this.prisma.$queryRaw<
      Array<{ org_type: string; plan_code: string; n: number }>
    >`
      select
        o.type::text as org_type,
        coalesce(bpc.plan_code, 'free') as plan_code,
        count(*)::int as n
      from public.organizations o
      left join public.org_current_subscription_plan_v1 cp on cp.org_id = o.id
      left join public.billing_plan_catalog bpc on bpc.id = cp.plan_id
      left join public.org_status os on os.org_id = o.id
      where coalesce(os.status::text, 'active') = 'active'
      group by o.type, bpc.plan_code
      order by o.type::text asc, coalesce(bpc.plan_code, 'free') asc
    `;

    const dealRooms = await this.prisma.$queryRaw<Array<{ n: number }>>`
      select count(*)::int as n
      from public.deal_rooms r
    `;

    const signed = await this.prisma.$queryRaw<Array<{ n: number }>>`
      select count(*)::int as n
      from public.deal_room_agreements a
      where a.status in ('signed'::public.deal_room_agreement_status, 'executed'::public.deal_room_agreement_status)
        and a.updated_at > (timezone('utc', now()) - interval '30 days')
    `;

    return {
      org_counts: (orgCounts ?? []).map((r) => ({ org_type: r.org_type, plan_code: r.plan_code, count: r.n ?? 0 })),
      active_deal_rooms: dealRooms[0]?.n ?? 0,
      agreements_signed_30d: signed[0]?.n ?? 0,
    };
  }

  async getOrganizationDetail(orgId: string): Promise<any | null> {
    const rows = await this.prisma.$queryRaw<Array<{ payload: any }>>`
      select jsonb_build_object(
        'org', to_jsonb(o),
        'status', to_jsonb(os),
        'verification', to_jsonb(ov),
        'score', to_jsonb(s),
        'plan', to_jsonb(cp) || coalesce(jsonb_build_object('plan_code', bpc.plan_code, 'plan_name', bpc.display_name, 'plan_tier', bpc.plan_tier), '{}'::jsonb)
      ) as payload
      from public.organizations o
      left join public.org_status os on os.org_id = o.id
      left join public.org_verifications ov on ov.org_id = o.id
      left join public.org_profile_scores s on s.org_id = o.id
      left join public.org_current_subscription_plan_v1 cp on cp.org_id = o.id
      left join public.billing_plan_catalog bpc on bpc.id = cp.plan_id
      where o.id = ${orgId}::uuid
      limit 1
    `;
    return rows[0]?.payload ?? null;
  }

  async forceOrgTier(adminUserId: string, orgId: string, input: ForceOrgTierInput): Promise<{ success: boolean }> {
    const planCode = this.normalizeText(input.planCode)?.toLowerCase() ?? null;
    if (planCode !== 'free' && planCode !== 'pro' && planCode !== 'elite') {
      throw new Error('Invalid planCode');
    }

    await this.prisma.$transaction(async (tx) => {
      const orgRows = await tx.$queryRaw<Array<{ org_type: string }>>`
        select type::text as org_type from public.organizations where id = ${orgId}::uuid limit 1
      `;
      const orgType = this.normalizeText(orgRows[0]?.org_type)?.toLowerCase();
      if (!orgType) throw new Error('Organization not found');

      const planRows = await tx.$queryRaw<Array<{ plan_id: string }>>`
        select id::text as plan_id
        from public.billing_plan_catalog
        where segment::text = ${orgType}
          and plan_code = ${planCode}
          and is_active = true
        limit 1
      `;
      const planId = planRows[0]?.plan_id;
      if (!planId) throw new Error('Plan not found');

      // Cancel any existing active/trialing subs.
      await tx.$queryRaw`
        update public.org_subscriptions
        set status = 'canceled'::public.billing_subscription_status, canceled_at = timezone('utc', now()), updated_at = timezone('utc', now())
        where org_id = ${orgId}::uuid and status in ('trialing'::public.billing_subscription_status, 'active'::public.billing_subscription_status, 'past_due'::public.billing_subscription_status, 'paused'::public.billing_subscription_status)
      `;

      await tx.$queryRaw`
        insert into public.org_subscriptions (org_id, plan_id, status, billing_interval, source, started_at, current_period_start, current_period_end, metadata)
        values (${orgId}::uuid, ${planId}::uuid, 'active'::public.billing_subscription_status, 'monthly'::public.billing_interval, 'admin', timezone('utc', now()), timezone('utc', now()), (timezone('utc', now()) + interval '30 days'), jsonb_build_object('forced', true))
      `;

      await tx.$queryRaw`
        insert into public.admin_audit_logs (admin_id, action, target_type, target_id, payload)
        values (${adminUserId}::uuid, 'org_tier_forced', 'org', ${orgId}, jsonb_build_object('plan_code', ${planCode}))
      `;
    });

    return { success: true };
  }

  async listDealRooms(limit = 200): Promise<AdminDealRoomView[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.trunc(limit))) : 200;
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; stage: string; created_at: Date; updated_at: Date; org_a_id: string; org_a_name: string; org_b_id: string; org_b_name: string }>
    >`
      select
        r.id::text as id,
        r.stage::text as stage,
        r.created_at,
        r.updated_at,
        oa.id::text as org_a_id,
        oa.name as org_a_name,
        ob.id::text as org_b_id,
        ob.name as org_b_name
      from public.deal_rooms r
      join public.connections c on c.id = r.connection_id
      join public.organizations oa on oa.id = c.org_a_id
      join public.organizations ob on ob.id = c.org_b_id
      order by r.updated_at desc
      limit ${safeLimit}
    `;
    return (rows ?? []).map((r) => ({
      id: r.id,
      stage: r.stage,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
      org_a_id: r.org_a_id,
      org_a_name: r.org_a_name,
      org_b_id: r.org_b_id,
      org_b_name: r.org_b_name,
    }));
  }

  async listSubscriptions(limit = 200): Promise<AdminSubscriptionView[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.trunc(limit))) : 200;
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; org_id: string; org_name: string; plan_code: string; status: string; billing_interval: string; started_at: Date; current_period_end: Date | null }>
    >`
      select s.id::text as id, s.org_id::text as org_id, o.name as org_name, p.plan_code, s.status::text as status,
        s.billing_interval::text as billing_interval, s.started_at, s.current_period_end
      from public.org_subscriptions s
      join public.organizations o on o.id = s.org_id
      join public.billing_plan_catalog p on p.id = s.plan_id
      order by s.created_at desc
      limit ${safeLimit}
    `;
    return (rows ?? []).map((r) => ({
      id: r.id,
      org_id: r.org_id,
      org_name: r.org_name,
      plan_code: r.plan_code,
      status: r.status,
      billing_interval: r.billing_interval,
      started_at: r.started_at.toISOString(),
      current_period_end: r.current_period_end ? r.current_period_end.toISOString() : null,
    }));
  }

  async listTickets(limit = 200): Promise<AdminTicketView[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.trunc(limit))) : 200;
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; org_id: string | null; user_id: string; subject: string; category: string | null; status: string; priority: string; assigned_to: string | null; created_at: Date; updated_at: Date }>
    >`
      select id::text as id, org_id::text as org_id, user_id::text as user_id, subject, category,
        status::text as status, priority::text as priority, assigned_to, created_at, updated_at
      from public.support_tickets
      order by updated_at desc
      limit ${safeLimit}
    `;
    return (rows ?? []).map((t) => ({
      id: t.id,
      org_id: t.org_id,
      user_id: t.user_id,
      subject: t.subject,
      category: t.category,
      status: t.status,
      priority: t.priority,
      assigned_to: t.assigned_to,
      created_at: t.created_at.toISOString(),
      updated_at: t.updated_at.toISOString(),
    }));
  }

  async assignTicket(adminUserId: string, ticketId: string, assignedTo: string | null): Promise<{ success: boolean }> {
    const normalizedTicketId = this.normalizeText(ticketId);
    if (!normalizedTicketId) throw new Error('Invalid ticket id');
    const normalizedAssigned = this.normalizeText(assignedTo ?? null);

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        update public.support_tickets
        set assigned_to = ${normalizedAssigned}, updated_at = timezone('utc', now())
        where id = ${normalizedTicketId}::uuid
      `;
      await tx.$queryRaw`
        insert into public.admin_audit_logs (admin_id, action, target_type, target_id, payload)
        values (${adminUserId}::uuid, 'ticket_assigned', 'ticket', ${normalizedTicketId}, jsonb_build_object('assigned_to', ${normalizedAssigned}))
      `;
    });

    return { success: true };
  }
}

