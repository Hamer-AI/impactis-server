import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export type DealRoomStage =
  | 'interest'
  | 'due_diligence'
  | 'negotiation'
  | 'commitment'
  | 'closing'
  | 'closed';

export class CreateDealRoomRequestInput {
  @IsUUID()
  startupOrgId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string | null;
}

export class RejectDealRoomRequestInput {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class SendDealRoomMessageInput {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}

export class UpdateDealRoomStageInput {
  @IsIn(['interest', 'due_diligence', 'negotiation', 'commitment', 'closing', 'closed'])
  stage!: DealRoomStage;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class CreateDealRoomMilestoneInput {
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  dueDate?: string | null; // YYYY-MM-DD
}

export class UpdateDealRoomMilestoneInput {
  @IsOptional()
  @IsString()
  @MaxLength(140)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  dueDate?: string | null;

  @IsOptional()
  completed?: boolean;
}

export class CreateDealRoomCommitmentInput {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  amountUsd!: string; // bigint string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  conditions?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class CreateDealRoomAgreementInput {
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  templateKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  contentText?: string | null;
}

export class LinkDealRoomDataRoomInput {
  @IsString()
  @MinLength(36)
  @MaxLength(36)
  startupOrgId!: string;
}

export class InviteDealRoomParticipantInput {
  @IsString()
  @MinLength(36)
  @MaxLength(36)
  orgId!: string;

  @IsString()
  role!: 'founder' | 'lead_investor' | 'co_investor' | 'advisor';
}

export type DealRoomRequestView = {
  id: string;
  startup_org_id: string;
  investor_org_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  message: string | null;
  created_at: string;
  responded_at: string | null;
  startup_org_name?: string;
  investor_org_name?: string;
};

export type DealRoomView = {
  id: string;
  connection_id: string;
  stage: DealRoomStage;
  name: string | null;
  description: string | null;
  created_at: string;
  other_org_id: string;
  other_org_name: string;
};

export type DealRoomParticipantView = {
  id: string;
  org_id: string;
  role: string;
  invited_at: string;
  accepted_at: string | null;
  left_at: string | null;
  org_name: string;
};

export type DealRoomMessageView = {
  id: string;
  deal_room_id: string;
  sender_user_id: string;
  sender_email: string | null;
  body: string;
  created_at: string;
};

