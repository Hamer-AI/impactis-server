import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSupportTicketInput {
  @IsString()
  @MinLength(3)
  @MaxLength(140)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(48)
  category?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string | null;
}

export class AddSupportMessageInput {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}

export class CreateAiChatMessageInput {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  context?: string | null; // help | deal_room | data_room | matching
}

export class EscalateAiChatInput {
  @IsString()
  @MinLength(36)
  @MaxLength(36)
  sessionId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export type SupportTicketView = {
  id: string;
  org_id: string | null;
  user_id: string;
  subject: string;
  category: string | null;
  status: string;
  priority: string;
  ai_resolved: boolean;
  created_at: string;
  updated_at: string;
};

export type SupportMessageView = {
  id: string;
  ticket_id: string;
  sender_id: string;
  is_staff: boolean;
  is_ai: boolean;
  body: string;
  created_at: string;
};

export type AiChatSessionView = {
  id: string;
  context: string | null;
  messages: unknown;
  escalated: boolean;
  ticket_id: string | null;
  created_at: string;
  updated_at: string;
};

