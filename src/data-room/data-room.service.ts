import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CapabilitiesService } from '../capabilities/capabilities.service';
import { FilesService } from '../files/files.service';
import type {
  DataRoomAccessGrantView,
  DataRoomAccessRequestView,
  DataRoomContentsView,
  DataRoomDocumentView,
  DataRoomFolderView,
  DataRoomPermissionLevel,
} from './data-room.types';

type MembershipContext = { orgId: string; orgType: string };

const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_ORIGIN ??
  process.env.APP_ORIGIN ??
  'http://127.0.0.1:3000';

@Injectable()
export class DataRoomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly notifications: NotificationsService,
    private readonly capabilities: CapabilitiesService,
    private readonly files: FilesService,
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

  private async assertCapability(orgId: string, code: string): Promise<void> {
    const ok = await this.capabilities.hasCapabilityForOrg(orgId, code);
    if (!ok) {
      throw new ForbiddenException({
        code: 'CAPABILITY_BLOCKED',
        message: `Your current plan does not allow this action (${code}).`,
      });
    }
  }

  private toIso(value: Date | null | undefined): string | null {
    return value ? value.toISOString() : null;
  }

  async createAccessRequest(params: {
    userId: string;
    startupOrgId: string;
    message?: string | null;
  }): Promise<DataRoomAccessRequestView> {
    const ctx = await this.getRequesterContext(params.userId);
    if (ctx.orgType !== 'investor' && ctx.orgType !== 'advisor') {
      throw new Error('Only investor or advisor organizations can request data room access');
    }
    const startupOrgId = this.ensureUuid(
      params.startupOrgId,
      'Invalid startupOrgId',
    );
    if (startupOrgId === ctx.orgId) {
      throw new Error('Cannot request access to your own organization');
    }

    const startupRows = await this.prisma.$queryRaw<
      Array<{ id: string; name: string; type: string }>
    >`
      select id, name, type::text as type
      from public.organizations
      where id = ${startupOrgId}::uuid
      limit 1
    `;
    const startup = startupRows[0];
    if (!startup) throw new Error('Startup organization was not found');
    if (startup.type?.toLowerCase() !== 'startup') {
      throw new Error('Data room access can only be requested for startup organizations');
    }

    const requesterNameRows = await this.prisma.$queryRaw<Array<{ name: string }>>`
      select name from public.organizations where id = ${ctx.orgId}::uuid limit 1
    `;
    const requesterName = requesterNameRows[0]?.name ?? '';
    const message = this.normalizeText(params.message ?? null);

    const inserted = await this.prisma.$queryRaw<
      Array<{
        id: string;
        startup_org_id: string;
        requester_org_id: string;
        message: string | null;
        status: string;
        reviewed_at: Date | null;
        review_note: string | null;
        created_at: Date;
      }>
    >`
      insert into public.data_room_access_requests (startup_org_id, requester_org_id, message, status)
      values (${startupOrgId}::uuid, ${ctx.orgId}::uuid, ${message}, 'pending'::public.data_room_access_status)
      on conflict (startup_org_id, requester_org_id) do update
      set message = excluded.message,
          status = 'pending'::public.data_room_access_status,
          reviewed_at = null,
          review_note = null
      returning id, startup_org_id, requester_org_id, message, status::text as status, reviewed_at, review_note, created_at
    `;
    const r = inserted[0];
    if (!r) throw new Error('Failed to create access request');

    const link = `${APP_ORIGIN.replace(/\/+$/, '')}/workspace/data-room`;
    const title = `${requesterName} requested Data Room access`;
    const body = `You have a new Data Room access request from ${requesterName}. Review it in your Data Room settings.`;
    await this.notifications.createForOrg(startupOrgId, {
      type: 'data_room_access_request',
      title,
      body,
      link,
    });
    const startupMembers = await this.getOrgMemberEmails(startupOrgId);
    for (const m of startupMembers) {
      if (m.email?.trim()) {
        await this.mailer.send({
          to: m.email.trim(),
          subject: title,
          text: `${body}\n\nOpen: ${link}`,
          html: `<p>${body}</p><p><a href="${link}">Open Data Room</a></p>`,
        });
      }
    }

    return {
      id: r.id,
      startup_org_id: r.startup_org_id,
      requester_org_id: r.requester_org_id,
      message: r.message,
      status: r.status as any,
      reviewed_at: this.toIso(r.reviewed_at),
      review_note: r.review_note,
      created_at: r.created_at.toISOString(),
      startup_org_name: startup.name,
      requester_org_name: requesterName,
    };
  }

  async listMyAccessRequests(userId: string): Promise<DataRoomAccessRequestView[]> {
    const ctx = await this.getRequesterContext(userId);
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        startup_org_id: string;
        requester_org_id: string;
        message: string | null;
        status: string;
        reviewed_at: Date | null;
        review_note: string | null;
        created_at: Date;
        startup_org_name: string;
      }>
    >`
      select
        r.id, r.startup_org_id, r.requester_org_id, r.message, r.status::text as status, r.reviewed_at, r.review_note, r.created_at,
        o.name as startup_org_name
      from public.data_room_access_requests r
      join public.organizations o on o.id = r.startup_org_id
      where r.requester_org_id = ${ctx.orgId}::uuid
      order by r.created_at desc
      limit 100
    `;
    return rows.map((r) => ({
      id: r.id,
      startup_org_id: r.startup_org_id,
      requester_org_id: r.requester_org_id,
      message: r.message,
      status: r.status as any,
      reviewed_at: this.toIso(r.reviewed_at),
      review_note: r.review_note,
      created_at: r.created_at.toISOString(),
      startup_org_name: r.startup_org_name,
    }));
  }

  async listIncomingAccessRequests(userId: string): Promise<DataRoomAccessRequestView[]> {
    const ctx = await this.getRequesterContext(userId);
    if (ctx.orgType !== 'startup') {
      return [];
    }
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        startup_org_id: string;
        requester_org_id: string;
        message: string | null;
        status: string;
        reviewed_at: Date | null;
        review_note: string | null;
        created_at: Date;
        requester_org_name: string;
      }>
    >`
      select
        r.id, r.startup_org_id, r.requester_org_id, r.message, r.status::text as status, r.reviewed_at, r.review_note, r.created_at,
        o.name as requester_org_name
      from public.data_room_access_requests r
      join public.organizations o on o.id = r.requester_org_id
      where r.startup_org_id = ${ctx.orgId}::uuid
      order by r.created_at desc
      limit 200
    `;
    return rows.map((r) => ({
      id: r.id,
      startup_org_id: r.startup_org_id,
      requester_org_id: r.requester_org_id,
      message: r.message,
      status: r.status as any,
      reviewed_at: this.toIso(r.reviewed_at),
      review_note: r.review_note,
      created_at: r.created_at.toISOString(),
      requester_org_name: r.requester_org_name,
    }));
  }

  async approveAccessRequest(params: {
    userId: string;
    requestId: string;
    permissionLevel?: DataRoomPermissionLevel;
    expiresAt?: string | null;
    note?: string | null;
  }): Promise<DataRoomAccessGrantView> {
    const ctx = await this.getRequesterContext(params.userId);
    if (ctx.orgType !== 'startup') {
      throw new Error('Only startups can approve data room access requests');
    }
    const requestId = this.ensureUuid(params.requestId, 'Invalid request id');
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        startup_org_id: string;
        requester_org_id: string;
        status: string;
        requester_org_name: string;
      }>
    >`
      select
        r.id, r.startup_org_id, r.requester_org_id, r.status::text as status,
        o.name as requester_org_name
      from public.data_room_access_requests r
      join public.organizations o on o.id = r.requester_org_id
      where r.id = ${requestId}::uuid
      limit 1
    `;
    const req = rows[0];
    if (!req) throw new Error('Access request not found');
    if (req.startup_org_id !== ctx.orgId) {
      throw new ForbiddenException({ code: 'DATA_ROOM_PERMISSION_DENIED', message: 'Not allowed' });
    }

    const permissionLevel: DataRoomPermissionLevel =
      params.permissionLevel === 'view_download' ? 'view_download' : 'view';
    const expiresAt = this.normalizeText(params.expiresAt ?? null);
    const note = this.normalizeText(params.note ?? null);

    await this.prisma.$queryRaw`
      update public.data_room_access_requests
      set status = 'approved'::public.data_room_access_status,
          reviewed_at = timezone('utc', now()),
          review_note = ${note}
      where id = ${requestId}::uuid
    `;

    const grantRows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        startup_org_id: string;
        grantee_org_id: string;
        permission_level: string;
        terms_accepted_at: Date | null;
        granted_at: Date;
        revoked_at: Date | null;
        expires_at: Date | null;
      }>
    >`
      insert into public.data_room_access_grants (startup_org_id, grantee_org_id, permission_level, expires_at, revoked_at)
      values (
        ${ctx.orgId}::uuid,
        ${req.requester_org_id}::uuid,
        ${permissionLevel}::public.data_room_permission_level,
        ${expiresAt ? expiresAt : null}::timestamptz,
        null
      )
      on conflict (startup_org_id, grantee_org_id) do update
      set permission_level = excluded.permission_level,
          expires_at = excluded.expires_at,
          revoked_at = null
      returning id, startup_org_id, grantee_org_id, permission_level::text as permission_level, terms_accepted_at, granted_at, revoked_at, expires_at
    `;
    const g = grantRows[0];
    if (!g) throw new Error('Failed to create grant');

    const link = `${APP_ORIGIN.replace(/\/+$/, '')}/workspace/data-room`;
    const title = `Data Room access approved`;
    const body = `Your request to access the Data Room has been approved by ${ctx.orgId}.`;
    await this.notifications.createForOrg(req.requester_org_id, {
      type: 'data_room_access_granted',
      title,
      body,
      link,
    });
    const requesterMembers = await this.getOrgMemberEmails(req.requester_org_id);
    for (const m of requesterMembers) {
      if (m.email?.trim()) {
        await this.mailer.send({
          to: m.email.trim(),
          subject: title,
          text: `Your Data Room access request was approved.\n\nOpen: ${link}`,
          html: `<p>Your Data Room access request was approved.</p><p><a href="${link}">Open Data Room</a></p>`,
        });
      }
    }

    return {
      id: g.id,
      startup_org_id: g.startup_org_id,
      grantee_org_id: g.grantee_org_id,
      permission_level: g.permission_level as any,
      terms_accepted_at: this.toIso(g.terms_accepted_at),
      granted_at: g.granted_at.toISOString(),
      revoked_at: this.toIso(g.revoked_at),
      expires_at: this.toIso(g.expires_at),
    };
  }

  async rejectAccessRequest(params: {
    userId: string;
    requestId: string;
    note?: string | null;
  }): Promise<void> {
    const ctx = await this.getRequesterContext(params.userId);
    if (ctx.orgType !== 'startup') {
      throw new Error('Only startups can reject data room access requests');
    }
    const requestId = this.ensureUuid(params.requestId, 'Invalid request id');
    const note = this.normalizeText(params.note ?? null);

    const rows = await this.prisma.$queryRaw<
      Array<{ startup_org_id: string; requester_org_id: string }>
    >`
      select startup_org_id, requester_org_id
      from public.data_room_access_requests
      where id = ${requestId}::uuid
      limit 1
    `;
    const r = rows[0];
    if (!r) throw new Error('Access request not found');
    if (r.startup_org_id !== ctx.orgId) {
      throw new ForbiddenException({ code: 'DATA_ROOM_PERMISSION_DENIED', message: 'Not allowed' });
    }

    await this.prisma.$queryRaw`
      update public.data_room_access_requests
      set status = 'rejected'::public.data_room_access_status,
          reviewed_at = timezone('utc', now()),
          review_note = ${note}
      where id = ${requestId}::uuid
    `;

    const link = `${APP_ORIGIN.replace(/\/+$/, '')}/workspace/data-room`;
    const title = `Data Room access request rejected`;
    const body = `Your Data Room access request was rejected.`;
    await this.notifications.createForOrg(r.requester_org_id, {
      type: 'data_room_access_rejected',
      title,
      body,
      link,
    });
    const members = await this.getOrgMemberEmails(r.requester_org_id);
    for (const m of members) {
      if (m.email?.trim()) {
        await this.mailer.send({
          to: m.email.trim(),
          subject: title,
          text: `${body}\n\nOpen: ${link}`,
          html: `<p>${body}</p><p><a href="${link}">Open</a></p>`,
        });
      }
    }
  }

  private async getGrantForViewer(params: {
    startupOrgId: string;
    viewerOrgId: string;
  }): Promise<DataRoomAccessGrantView | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        startup_org_id: string;
        grantee_org_id: string;
        permission_level: string;
        terms_accepted_at: Date | null;
        granted_at: Date;
        revoked_at: Date | null;
        expires_at: Date | null;
      }>
    >`
      select id, startup_org_id, grantee_org_id,
        permission_level::text as permission_level,
        terms_accepted_at, granted_at, revoked_at, expires_at
      from public.data_room_access_grants
      where startup_org_id = ${params.startupOrgId}::uuid
        and grantee_org_id = ${params.viewerOrgId}::uuid
        and revoked_at is null
        and (expires_at is null or expires_at > timezone('utc', now()))
      limit 1
    `;
    const g = rows[0];
    if (!g) return null;
    return {
      id: g.id,
      startup_org_id: g.startup_org_id,
      grantee_org_id: g.grantee_org_id,
      permission_level: g.permission_level as any,
      terms_accepted_at: this.toIso(g.terms_accepted_at),
      granted_at: g.granted_at.toISOString(),
      revoked_at: this.toIso(g.revoked_at),
      expires_at: this.toIso(g.expires_at),
    };
  }

  async acceptTerms(params: { userId: string; startupOrgId: string }): Promise<{ success: boolean }> {
    const ctx = await this.getRequesterContext(params.userId);
    if (ctx.orgType !== 'investor' && ctx.orgType !== 'advisor') {
      throw new Error('Only investor or advisor organizations can accept terms');
    }
    const startupOrgId = this.ensureUuid(params.startupOrgId, 'Invalid startupOrgId');
    const g = await this.getGrantForViewer({ startupOrgId, viewerOrgId: ctx.orgId });
    if (!g) {
      throw new ForbiddenException({ code: 'DATA_ROOM_ACCESS_REQUIRED', message: 'Request access first.' });
    }

    await this.prisma.$queryRaw`
      insert into public.data_room_consents (startup_org_id, grantee_org_id, consented_at, ip_address, user_agent)
      values (${startupOrgId}::uuid, ${ctx.orgId}::uuid, timezone('utc', now()), null, null)
      on conflict (startup_org_id, grantee_org_id) do update
      set consented_at = excluded.consented_at
    `;

    await this.prisma.$queryRaw`
      update public.data_room_access_grants
      set terms_accepted_at = timezone('utc', now())
      where id = ${g.id}::uuid
    `;
    return { success: true };
  }

  async serveDocumentInline(params: { userId: string; documentId: string }): Promise<{ url: string }> {
    const ctx = await this.getRequesterContext(params.userId);
    if (ctx.orgType !== 'investor' && ctx.orgType !== 'advisor') {
      throw new Error('Only investor or advisor organizations can view documents');
    }

    const documentId = this.ensureUuid(params.documentId, 'Invalid documentId');
    const docRows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        startup_org_id: string;
        storage_object_path: string | null;
        content_type: string | null;
      }>
    >`
      select id::text as id, startup_org_id::text as startup_org_id, storage_object_path, content_type
      from public.startup_data_room_documents
      where id = ${documentId}::uuid
      limit 1
    `;
    const doc = docRows[0];
    if (!doc?.id || !doc.startup_org_id) {
      throw new Error('Document not found');
    }

    const grant = await this.getGrantForViewer({ startupOrgId: doc.startup_org_id, viewerOrgId: ctx.orgId });
    if (!grant) {
      throw new ForbiddenException({ code: 'DATA_ROOM_ACCESS_REQUIRED', message: 'Request access first.' });
    }
    if (!grant.terms_accepted_at) {
      throw new ForbiddenException({ code: 'DATA_ROOM_ACCESS_REQUIRED', message: 'Please accept the Data Room terms first.' });
    }

    const objectKey = this.normalizeText(doc.storage_object_path);
    if (!objectKey) {
      throw new Error('Document storage path is missing');
    }

    const signed = await this.files.createInlineViewUrl({
      objectKey,
      contentType: doc.content_type,
      expiresInSeconds: 3600,
    });

    try {
      await this.recordDocumentView({ userId: params.userId, documentId, seconds: 0 });
    } catch {
      // ignore analytics failures
    }

    return { url: signed.url };
  }

  async getStartupAnalytics(params: { userId: string; startupOrgId: string }): Promise<Array<{
    document_id: string;
    title: string;
    view_count: number;
    total_seconds: number;
    last_viewed_at: string | null;
  }>> {
    const ctx = await this.getRequesterContext(params.userId);
    if (ctx.orgType !== 'startup') {
      throw new ForbiddenException({ code: 'DATA_ROOM_PERMISSION_DENIED', message: 'Not allowed.' });
    }
    const startupOrgId = this.ensureUuid(params.startupOrgId, 'Invalid startupOrgId');
    if (startupOrgId !== ctx.orgId) {
      throw new ForbiddenException({ code: 'DATA_ROOM_PERMISSION_DENIED', message: 'Not allowed.' });
    }

    const rows = await this.prisma.$queryRaw<
      Array<{ document_id: string; title: string; view_count: number; total_seconds: number; last_viewed_at: Date | null }>
    >`
      select
        d.id::text as document_id,
        d.title,
        coalesce(sum(v.view_count), 0)::int as view_count,
        coalesce(sum(v.total_seconds), 0)::int as total_seconds,
        max(v.last_viewed_at) as last_viewed_at
      from public.startup_data_room_documents d
      left join public.data_room_document_views v on v.document_id = d.id
      where d.startup_org_id = ${startupOrgId}::uuid
      group by d.id, d.title
      order by view_count desc, last_viewed_at desc nulls last
      limit 200
    `;

    return (rows ?? []).map((r) => ({
      document_id: r.document_id,
      title: r.title,
      view_count: r.view_count ?? 0,
      total_seconds: r.total_seconds ?? 0,
      last_viewed_at: this.toIso(r.last_viewed_at),
    }));
  }

  async revokeGrant(params: { userId: string; grantId: string; note?: string | null }): Promise<void> {
    const ctx = await this.getRequesterContext(params.userId);
    if (ctx.orgType !== 'startup') {
      throw new Error('Only startups can revoke data room access grants');
    }
    const grantId = this.ensureUuid(params.grantId, 'Invalid grant id');
    const note = this.normalizeText(params.note ?? null);
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; startup_org_id: string; grantee_org_id: string }>
    >`
      select id, startup_org_id, grantee_org_id
      from public.data_room_access_grants
      where id = ${grantId}::uuid
      limit 1
    `;
    const g = rows[0];
    if (!g) throw new Error('Grant not found');
    if (g.startup_org_id !== ctx.orgId) {
      throw new ForbiddenException({ code: 'DATA_ROOM_PERMISSION_DENIED', message: 'Not allowed' });
    }
    await this.prisma.$queryRaw`
      update public.data_room_access_grants
      set revoked_at = timezone('utc', now())
      where id = ${grantId}::uuid
    `;
    const link = `${APP_ORIGIN.replace(/\/+$/, '')}/workspace/data-room`;
    await this.notifications.createForOrg(g.grantee_org_id, {
      type: 'data_room_access_revoked',
      title: 'Data Room access revoked',
      body: note ? `Access was revoked: ${note}` : 'Your Data Room access was revoked.',
      link,
    });
    const members = await this.getOrgMemberEmails(g.grantee_org_id);
    for (const m of members) {
      if (m.email?.trim()) {
        await this.mailer.send({
          to: m.email.trim(),
          subject: 'Data Room access revoked',
          text: `Your Data Room access was revoked.\n\n${note ? `Note: ${note}\n\n` : ''}Open: ${link}`,
          html: `<p>Your Data Room access was revoked.</p>${note ? `<p>Note: ${note}</p>` : ''}<p><a href="${link}">Open</a></p>`,
        });
      }
    }
  }

  private async listStartupFolders(startupOrgId: string): Promise<DataRoomFolderView[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; parent_id: string | null; path: string; name: string; created_at: Date }>
    >`
      select id, parent_id, path, name, created_at
      from public.startup_data_room_folders
      where startup_org_id = ${startupOrgId}::uuid
      order by path asc
    `;
    return rows.map((r) => ({
      id: r.id,
      parent_id: r.parent_id,
      path: r.path,
      name: r.name,
      created_at: r.created_at.toISOString(),
    }));
  }

  private async listStartupDocuments(startupOrgId: string): Promise<DataRoomDocumentView[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        startup_org_id: string;
        folder_id: string | null;
        document_type: string;
        title: string;
        file_url: string | null;
        storage_bucket: string | null;
        storage_object_path: string | null;
        file_name: string | null;
        file_size_bytes: number | null;
        content_type: string | null;
        created_at: Date;
        updated_at: Date;
      }>
    >`
      select
        id,
        startup_org_id,
        folder_id,
        document_type::text as document_type,
        title,
        file_url,
        storage_bucket,
        storage_object_path,
        file_name,
        file_size_bytes,
        content_type,
        created_at,
        updated_at
      from public.startup_data_room_documents
      where startup_org_id = ${startupOrgId}::uuid
      order by updated_at desc
    `;
    return rows.map((r) => ({
      id: r.id,
      startup_org_id: r.startup_org_id,
      folder_id: r.folder_id,
      document_type: r.document_type,
      title: r.title,
      file_url: r.file_url,
      storage_bucket: r.storage_bucket,
      storage_object_path: r.storage_object_path,
      file_name: r.file_name,
      file_size_bytes: r.file_size_bytes,
      content_type: r.content_type,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
    }));
  }

  async getStartupContents(params: { userId: string; startupOrgId: string }): Promise<DataRoomContentsView> {
    const ctx = await this.getRequesterContext(params.userId);
    const startupOrgId = this.ensureUuid(params.startupOrgId, 'Invalid startupOrgId');

    // Startup org members can see their own contents without grants.
    if (ctx.orgId !== startupOrgId) {
      await this.assertCapability(ctx.orgId, 'dataroom.view');
      const grant = await this.getGrantForViewer({ startupOrgId, viewerOrgId: ctx.orgId });
      if (!grant) {
        throw new ForbiddenException({ code: 'DATA_ROOM_ACCESS_REQUIRED', message: 'Request access to view this Data Room.' });
      }
      // Optional stricter behavior: require terms acceptance before viewing anything.
      // For now, we only require it before download (enforced on download endpoints later).
    }

    const [folders, documents] = await Promise.all([
      this.listStartupFolders(startupOrgId),
      this.listStartupDocuments(startupOrgId),
    ]);
    const grant = ctx.orgId === startupOrgId ? null : await this.getGrantForViewer({ startupOrgId, viewerOrgId: ctx.orgId });
    return { startup_org_id: startupOrgId, folders, documents, grant };
  }

  async recordDocumentView(params: { userId: string; documentId: string; seconds?: number }): Promise<{ success: boolean }> {
    const ctx = await this.getRequesterContext(params.userId);
    const documentId = this.ensureUuid(params.documentId, 'Invalid document id');
    const seconds = typeof params.seconds === 'number' && Number.isFinite(params.seconds) ? Math.max(0, Math.round(params.seconds)) : 0;

    const docRows = await this.prisma.$queryRaw<Array<{ id: string; startup_org_id: string }>>`
      select id, startup_org_id
      from public.startup_data_room_documents
      where id = ${documentId}::uuid
      limit 1
    `;
    const doc = docRows[0];
    if (!doc) throw new Error('Document not found');

    if (ctx.orgId !== doc.startup_org_id) {
      await this.assertCapability(ctx.orgId, 'dataroom.view');
      const grant = await this.getGrantForViewer({ startupOrgId: doc.startup_org_id, viewerOrgId: ctx.orgId });
      if (!grant) {
        throw new ForbiddenException({ code: 'DATA_ROOM_ACCESS_REQUIRED', message: 'Request access to view this document.' });
      }
    }

    await this.prisma.$queryRaw`
      insert into public.data_room_document_views (document_id, viewer_org_id, view_count, total_seconds, last_viewed_at)
      values (${documentId}::uuid, ${ctx.orgId}::uuid, 1, ${seconds}, timezone('utc', now()))
      on conflict (document_id, viewer_org_id) do update
      set view_count = public.data_room_document_views.view_count + 1,
          total_seconds = public.data_room_document_views.total_seconds + ${seconds},
          last_viewed_at = timezone('utc', now())
    `;
    return { success: true };
  }
}

