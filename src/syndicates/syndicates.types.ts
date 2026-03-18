import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export type SyndicateStatus = 'forming' | 'active' | 'closed' | 'cancelled';
export type SyndicateMemberStatus = 'invited' | 'confirmed' | 'declined' | 'withdrew';
export type SyndicateInviteStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export class CreateSyndicateInput {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsUUID()
  startupOrgId?: string | null;
}

export class InviteToSyndicateInput {
  @IsUUID()
  inviteeOrgId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string | null;
}

export class UpdateSyndicateStatusInput {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  status!: SyndicateStatus;
}

export type SyndicateView = {
  id: string;
  lead_org_id: string;
  startup_org_id: string | null;
  name: string;
  description: string | null;
  status: SyndicateStatus;
  created_at: string;
  updated_at: string;
};

export type SyndicateMemberView = {
  id: string;
  syndicate_id: string;
  org_id: string;
  org_name: string;
  committed_usd: string | null;
  status: SyndicateMemberStatus;
  joined_at: string | null;
  created_at: string;
};

export type SyndicateInviteView = {
  id: string;
  syndicate_id: string;
  invitee_org_id: string;
  invitee_org_name: string;
  message: string | null;
  status: SyndicateInviteStatus;
  created_at: string;
  responded_at: string | null;
};

