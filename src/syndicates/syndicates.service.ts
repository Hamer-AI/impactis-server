import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import type {
  CreateSyndicateInput,
  InviteToSyndicateInput,
  SyndicateInviteView,
  SyndicateMemberView,
  SyndicateStatus,
  SyndicateView,
  UpdateSyndicateStatusInput,
} from './syndicates.types';

type MembershipContext = { orgId: string; orgType: 'startup' | 'investor' | 'advisor'; memberRole: 'owner' | 'admin' | 'member' };

@Injectable()
export class SyndicatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
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
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
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
      Array<{ org_id: string; org_type: string; member_role: string }>
    >`
      select om.org_id::text as org_id, o.type::text as org_type, om.member_role::text as member_role
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
    const orgType = this.normalizeText(row?.org_type)?.toLowerCase();
    const memberRole = this.normalizeText(row?.member_role)?.toLowerCase();
    if (!row?.org_id || (orgType !== 'startup' && orgType !== 'investor' && orgType !== 'advisor')) {
      throw new Error('Organization membership is required');
    }
    if (memberRole !== 'owner' && memberRole !== 'admin' && memberRole !== 'member') {
      throw new Error('Organization membership is required');
    }
    return { orgId: row.org_id, orgType: orgType as any, memberRole: memberRole as any };
  }

  private async assertElite(orgId: string): Promise<void> {
    const plan = await this.billing.getCurrentPlanForOrg(orgId);
    const tier = (plan?.plan.code ?? 'free').toLowerCase();
    if (tier !== 'elite') {
      throw new ForbiddenException({
        code: 'UPGRADE_REQUIRED',
        requiredTier: 'elite',
        currentTier: tier,
        message: 'This feature requires elite tier.',
      });
    }
  }

  async createSyndicate(userId: string, input: CreateSyndicateInput): Promise<SyndicateView> {
    const ctx = await this.getRequesterContext(userId);
    await this.assertElite(ctx.orgId);
    if (ctx.orgType !== 'investor') {
      throw new Error('Only investors can create syndicates');
    }
    if (ctx.memberRole !== 'owner' && ctx.memberRole !== 'admin') {
      throw new Error('Only organization owner or admin can create syndicates');
    }

    const startupOrgId = input.startupOrgId ? this.ensureUuid(input.startupOrgId, 'Invalid startupOrgId') : null;
    const name = this.normalizeText(input.name) ?? '';
    const description = this.normalizeText(input.description ?? null);

    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; lead_org_id: string; startup_org_id: string | null; name: string; description: string | null; status: string; created_at: Date; updated_at: Date }>
    >`
      insert into public.syndicates (lead_org_id, startup_org_id, name, description, status)
      values (${ctx.orgId}::uuid, ${startupOrgId}::uuid, ${name}, ${description}, 'forming'::public.syndicate_status)
      returning id::text as id, lead_org_id::text as lead_org_id, startup_org_id::text as startup_org_id, name, description, status::text as status, created_at, updated_at
    `;
    const s = rows[0];
    if (!s) throw new Error('Failed to create syndicate');

    // Lead is a member by default.
    await this.prisma.$queryRaw`
      insert into public.syndicate_members (syndicate_id, org_id, status, joined_at)
      values (${s.id}::uuid, ${ctx.orgId}::uuid, 'confirmed'::public.syndicate_member_status, timezone('utc', now()))
      on conflict (syndicate_id, org_id) do update set status = excluded.status, joined_at = excluded.joined_at
    `;

    return {
      id: s.id,
      lead_org_id: s.lead_org_id,
      startup_org_id: s.startup_org_id,
      name: s.name,
      description: s.description,
      status: (s.status as SyndicateStatus) ?? 'forming',
      created_at: s.created_at.toISOString(),
      updated_at: s.updated_at.toISOString(),
    };
  }

  async listMySyndicates(userId: string): Promise<SyndicateView[]> {
    const ctx = await this.getRequesterContext(userId);
    await this.assertElite(ctx.orgId);

    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; lead_org_id: string; startup_org_id: string | null; name: string; description: string | null; status: string; created_at: Date; updated_at: Date }>
    >`
      select s.id::text as id, s.lead_org_id::text as lead_org_id, s.startup_org_id::text as startup_org_id,
        s.name, s.description, s.status::text as status, s.created_at, s.updated_at
      from public.syndicates s
      left join public.syndicate_members m on m.syndicate_id = s.id and m.org_id = ${ctx.orgId}::uuid
      where s.lead_org_id = ${ctx.orgId}::uuid or m.org_id is not null
      order by s.updated_at desc
      limit 200
    `;
    return (rows ?? []).map((s) => ({
      id: s.id,
      lead_org_id: s.lead_org_id,
      startup_org_id: s.startup_org_id,
      name: s.name,
      description: s.description,
      status: (s.status as SyndicateStatus) ?? 'forming',
      created_at: s.created_at.toISOString(),
      updated_at: s.updated_at.toISOString(),
    }));
  }

  async getSyndicateDetails(userId: string, syndicateId: string): Promise<{ syndicate: SyndicateView; members: SyndicateMemberView[]; invites: SyndicateInviteView[] }> {
    const ctx = await this.getRequesterContext(userId);
    await this.assertElite(ctx.orgId);
    const id = this.ensureUuid(syndicateId, 'Invalid syndicate id');

    const accessRows = await this.prisma.$queryRaw<Array<{ allowed: boolean }>>`
      select exists(
        select 1
        from public.syndicates s
        left join public.syndicate_members m on m.syndicate_id = s.id and m.org_id = ${ctx.orgId}::uuid
        where s.id = ${id}::uuid and (s.lead_org_id = ${ctx.orgId}::uuid or m.org_id is not null)
      ) as allowed
    `;
    if (accessRows[0]?.allowed !== true) {
      throw new ForbiddenException({ code: 'SYNDICATE_PERMISSION_DENIED', message: 'Not allowed.' });
    }

    const sRows = await this.prisma.$queryRaw<
      Array<{ id: string; lead_org_id: string; startup_org_id: string | null; name: string; description: string | null; status: string; created_at: Date; updated_at: Date }>
    >`
      select s.id::text as id, s.lead_org_id::text as lead_org_id, s.startup_org_id::text as startup_org_id,
        s.name, s.description, s.status::text as status, s.created_at, s.updated_at
      from public.syndicates s
      where s.id = ${id}::uuid
      limit 1
    `;
    const s = sRows[0];
    if (!s) throw new Error('Syndicate not found');

    const members = await this.prisma.$queryRaw<
      Array<{ id: string; syndicate_id: string; org_id: string; org_name: string; committed_usd: bigint | number | string | null; status: string; joined_at: Date | null; created_at: Date }>
    >`
      select m.id::text as id, m.syndicate_id::text as syndicate_id, m.org_id::text as org_id,
        o.name as org_name, m.committed_usd, m.status::text as status, m.joined_at, m.created_at
      from public.syndicate_members m
      join public.organizations o on o.id = m.org_id
      where m.syndicate_id = ${id}::uuid
      order by m.created_at asc
    `;

    const invites = await this.prisma.$queryRaw<
      Array<{ id: string; syndicate_id: string; invitee_org_id: string; invitee_org_name: string; message: string | null; status: string; created_at: Date; responded_at: Date | null }>
    >`
      select i.id::text as id, i.syndicate_id::text as syndicate_id, i.invitee_org_id::text as invitee_org_id,
        o.name as invitee_org_name, i.message, i.status::text as status, i.created_at, i.responded_at
      from public.syndicate_invites i
      join public.organizations o on o.id = i.invitee_org_id
      where i.syndicate_id = ${id}::uuid
      order by i.created_at desc
    `;

    return {
      syndicate: {
        id: s.id,
        lead_org_id: s.lead_org_id,
        startup_org_id: s.startup_org_id,
        name: s.name,
        description: s.description,
        status: (s.status as SyndicateStatus) ?? 'forming',
        created_at: s.created_at.toISOString(),
        updated_at: s.updated_at.toISOString(),
      },
      members: (members ?? []).map((m) => ({
        id: m.id,
        syndicate_id: m.syndicate_id,
        org_id: m.org_id,
        org_name: m.org_name,
        committed_usd: m.committed_usd == null ? null : String(m.committed_usd),
        status: m.status as any,
        joined_at: this.toIso(m.joined_at),
        created_at: m.created_at.toISOString(),
      })),
      invites: (invites ?? []).map((i) => ({
        id: i.id,
        syndicate_id: i.syndicate_id,
        invitee_org_id: i.invitee_org_id,
        invitee_org_name: i.invitee_org_name,
        message: i.message,
        status: i.status as any,
        created_at: i.created_at.toISOString(),
        responded_at: this.toIso(i.responded_at),
      })),
    };
  }

  async invite(userId: string, syndicateId: string, input: InviteToSyndicateInput): Promise<SyndicateInviteView> {
    const ctx = await this.getRequesterContext(userId);
    await this.assertElite(ctx.orgId);

    const id = this.ensureUuid(syndicateId, 'Invalid syndicate id');
    const inviteeOrgId = this.ensureUuid(input.inviteeOrgId, 'Invalid inviteeOrgId');
    const message = this.normalizeText(input.message ?? null);

    const leadRows = await this.prisma.$queryRaw<Array<{ lead_org_id: string }>>`
      select lead_org_id::text as lead_org_id from public.syndicates where id = ${id}::uuid limit 1
    `;
    if (!leadRows[0]?.lead_org_id) throw new Error('Syndicate not found');
    if (leadRows[0].lead_org_id !== ctx.orgId) {
      throw new ForbiddenException({ code: 'SYNDICATE_PERMISSION_DENIED', message: 'Only the lead can invite members.' });
    }

    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; syndicate_id: string; invitee_org_id: string; message: string | null; status: string; created_at: Date; responded_at: Date | null; invitee_org_name: string }>
    >`
      insert into public.syndicate_invites (syndicate_id, invitee_org_id, message, status)
      values (${id}::uuid, ${inviteeOrgId}::uuid, ${message}, 'pending')
      on conflict (syndicate_id, invitee_org_id) do update
      set message = excluded.message, status = 'pending', responded_at = null
      returning
        id::text as id,
        syndicate_id::text as syndicate_id,
        invitee_org_id::text as invitee_org_id,
        message,
        status::text as status,
        created_at,
        responded_at,
        (select o.name from public.organizations o where o.id = invitee_org_id) as invitee_org_name
    `;
    const i = rows[0];
    if (!i) throw new Error('Failed to create invite');
    return {
      id: i.id,
      syndicate_id: i.syndicate_id,
      invitee_org_id: i.invitee_org_id,
      invitee_org_name: i.invitee_org_name,
      message: i.message,
      status: i.status as any,
      created_at: i.created_at.toISOString(),
      responded_at: this.toIso(i.responded_at),
    };
  }

  async acceptInvite(userId: string, inviteId: string): Promise<{ success: boolean }> {
    const ctx = await this.getRequesterContext(userId);
    await this.assertElite(ctx.orgId);
    const id = this.ensureUuid(inviteId, 'Invalid invite id');

    const rows = await this.prisma.$queryRaw<Array<{ syndicate_id: string; invitee_org_id: string; status: string }>>`
      select syndicate_id::text as syndicate_id, invitee_org_id::text as invitee_org_id, status::text as status
      from public.syndicate_invites
      where id = ${id}::uuid
      limit 1
    `;
    const inv = rows[0];
    if (!inv) throw new Error('Invite not found');
    if (inv.invitee_org_id !== ctx.orgId) throw new ForbiddenException({ code: 'SYNDICATE_PERMISSION_DENIED', message: 'Not allowed.' });
    if (inv.status !== 'pending') return { success: true };

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        update public.syndicate_invites
        set status = 'accepted', responded_at = timezone('utc', now())
        where id = ${id}::uuid
      `;
      await tx.$queryRaw`
        insert into public.syndicate_members (syndicate_id, org_id, status, joined_at)
        values (${inv.syndicate_id}::uuid, ${ctx.orgId}::uuid, 'confirmed'::public.syndicate_member_status, timezone('utc', now()))
        on conflict (syndicate_id, org_id) do update set status = excluded.status, joined_at = excluded.joined_at
      `;
    });

    return { success: true };
  }

  async declineInvite(userId: string, inviteId: string): Promise<{ success: boolean }> {
    const ctx = await this.getRequesterContext(userId);
    await this.assertElite(ctx.orgId);
    const id = this.ensureUuid(inviteId, 'Invalid invite id');

    const rows = await this.prisma.$queryRaw<Array<{ invitee_org_id: string; status: string }>>`
      select invitee_org_id::text as invitee_org_id, status::text as status
      from public.syndicate_invites
      where id = ${id}::uuid
      limit 1
    `;
    const inv = rows[0];
    if (!inv) throw new Error('Invite not found');
    if (inv.invitee_org_id !== ctx.orgId) throw new ForbiddenException({ code: 'SYNDICATE_PERMISSION_DENIED', message: 'Not allowed.' });
    if (inv.status !== 'pending') return { success: true };

    await this.prisma.$queryRaw`
      update public.syndicate_invites
      set status = 'declined', responded_at = timezone('utc', now())
      where id = ${id}::uuid
    `;
    return { success: true };
  }

  async updateStatus(userId: string, syndicateId: string, input: UpdateSyndicateStatusInput): Promise<{ success: boolean }> {
    const ctx = await this.getRequesterContext(userId);
    await this.assertElite(ctx.orgId);
    const id = this.ensureUuid(syndicateId, 'Invalid syndicate id');

    const normalized = this.normalizeText(input.status)?.toLowerCase() as SyndicateStatus | null;
    const allowed = new Set<SyndicateStatus>(['forming', 'active', 'closed', 'cancelled']);
    if (!normalized || !allowed.has(normalized)) {
      throw new Error('Invalid status');
    }

    const leadRows = await this.prisma.$queryRaw<Array<{ lead_org_id: string }>>`
      select lead_org_id::text as lead_org_id from public.syndicates where id = ${id}::uuid limit 1
    `;
    if (!leadRows[0]?.lead_org_id) throw new Error('Syndicate not found');
    if (leadRows[0].lead_org_id !== ctx.orgId) {
      throw new ForbiddenException({ code: 'SYNDICATE_PERMISSION_DENIED', message: 'Only the lead can update status.' });
    }

    await this.prisma.$queryRaw`
      update public.syndicates
      set status = ${normalized}::public.syndicate_status, updated_at = timezone('utc', now())
      where id = ${id}::uuid
    `;
    return { success: true };
  }
}

