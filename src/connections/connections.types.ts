import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateConnectionRequestInput {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'toOrgId is required' })
  toOrgId!: string;

  static isValidUUID(value: string): boolean {
    return UUID_RE.test(value);
  }

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message?: string | null;
}

export type ConnectionRequestView = {
  id: string;
  from_org_id: string;
  from_org_name: string;
  to_org_id: string;
  to_org_name: string;
  status: 'pending' | 'accepted' | 'rejected';
  message: string | null;
  created_at: string;
  responded_at: string | null;
};

export type ConnectionView = {
  id: string;
  org_a_id: string;
  org_b_id: string;
  other_org_id: string;
  other_org_name: string;
  deal_room_id?: string | null;
  created_at: string;
};

export type ConnectionMessageView = {
  id: string;
  connection_id: string;
  from_org_id: string;
  from_org_name: string;
  body: string;
  created_at: string;
};
