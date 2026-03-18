import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateWarmIntroRequestInput {
  @IsString()
  @MinLength(36)
  @MaxLength(36)
  receiverOrgId!: string;

  @IsOptional()
  @IsString()
  @MinLength(36)
  @MaxLength(36)
  viaAdvisorOrgId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string | null;
}

export class RespondWarmIntroRequestInput {
  @IsString()
  action!: 'accept' | 'decline';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  responseNote?: string | null;
}

export type WarmIntroRequestView = {
  id: string;
  sender_org_id: string;
  receiver_org_id: string;
  via_advisor_org_id: string | null;
  message: string | null;
  status: string;
  response_note: string | null;
  created_at: string;
  responded_at: string | null;
};

