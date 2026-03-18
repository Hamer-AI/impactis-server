import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class EnableTwoFactorInput {
  @IsString()
  @MinLength(3)
  @MaxLength(16)
  method!: 'totp' | 'sms' | 'email';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phoneNumber?: string | null;
}

export class VerifyTwoFactorInput {
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  code!: string;
}

export class DisableTwoFactorInput {
  @IsOptional()
  @IsString()
  @MaxLength(12)
  code?: string | null;
}

export type UserDeviceView = {
  id: string;
  device_name: string | null;
  device_type: string | null;
  user_agent: string | null;
  ip_address: string | null;
  country: string | null;
  is_trusted: boolean;
  last_seen_at: string | null;
  revoked_at: string | null;
};

export type SecurityEventView = {
  id: string;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  country: string | null;
  city: string | null;
  created_at: string;
  metadata: unknown;
};

