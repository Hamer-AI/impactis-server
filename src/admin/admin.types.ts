import { IsBoolean, IsOptional, IsString, MaxLength , Matches } from 'class-validator';

export type AdminMeView = {
  user_id: string;
  role: string;
  is_active: boolean;
};

export type AdminOrgView = {
  org_id: string;
  org_type: string;
  name: string;
  status: string;
  verification_status: string;
  plan_code: string | null;
  plan_tier: number | null;
  created_at: string;
};

export class UpdateOrgLifecycleInput {
  @IsString()
  @MaxLength(24)
  status!: string; // active | suspended | deleted

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string | null;
}

export class UpsertCapabilityOverrideInput {
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, { message: '$property must be a valid UUID' })
  orgId!: string;

  @IsString()
  @MaxLength(128)
  capabilityCode!: string;

  @IsBoolean()
  isEnabled!: boolean;

  @IsOptional()
  @IsString()
  expiresAt?: string | null; // ISO
}

export type AdminAuditLogView = {
  id: string;
  admin_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  payload: unknown;
  created_at: string;
};

export type AdminStatsView = {
  org_counts: Array<{ org_type: string; plan_code: string; count: number }>;
  active_deal_rooms: number;
  agreements_signed_30d: number;
  user_count: number;
  open_tickets: number;
};

export type AdminDealRoomView = {
  id: string;
  stage: string;
  created_at: string;
  updated_at: string;
  org_a_id: string;
  org_a_name: string;
  org_b_id: string;
  org_b_name: string;
};

export type AdminSubscriptionView = {
  id: string;
  org_id: string;
  org_name: string;
  plan_code: string;
  status: string;
  billing_interval: string;
  started_at: string;
  current_period_end: string | null;
};

export type AdminTicketView = {
  id: string;
  org_id: string | null;
  user_id: string;
  subject: string;
  category: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};

export class ForceOrgTierInput {
  @IsString()
  @MaxLength(16)
  planCode!: 'free' | 'pro' | 'elite';
}

export class AssignTicketInput {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  assignedTo?: string | null; // admin_users.user_id
}

export type AdminPlatformUserView = {
  user_id: string;
  email: string | null;
  name: string | null;
  created_at: string;
  suspended: boolean;
  admin_note: string | null;
  organizations: string[];
};

export class PatchAdminPlatformUserInput {
  @IsOptional()
  @IsBoolean()
  suspended?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string | null;
}

