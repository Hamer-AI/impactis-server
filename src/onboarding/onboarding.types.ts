import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export type OnboardingRole = 'startup' | 'investor' | 'advisor';

export type OnboardingStepStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';

export type OrgScoreSnapshot = {
  overall_score: number;
  onboarding_score: number;
  profile_score: number;
  verification_score: number;
  activity_score: number;
  missing_fields: string[];
  score_details: Record<string, unknown>;
  calculated_at: string | null;
};

export type OnboardingProgressStepView = {
  step_key: string;
  step_number: number;
  status: OnboardingStepStatus;
  skipped_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
};

export type OnboardingMeView = {
  user_id: string;
  org_id: string;
  org_type: OnboardingRole;
  onboarding: {
    step1_completed: boolean;
    onboarding_completed: boolean;
    blocked: boolean;
    missing: string[];
  };
  scores: OrgScoreSnapshot | null;
};

export class SaveOnboardingProgressInput {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  stepKey!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  stepNumber?: number;

  @IsIn(['not_started', 'in_progress', 'completed', 'skipped'])
  status!: OnboardingStepStatus;

  @IsOptional()
  @IsBoolean()
  skipped?: boolean;
}

export class SaveOnboardingStep1Input {
  @IsIn(['startup', 'investor', 'advisor'])
  role!: OnboardingRole;

  /**
   * Minimal payload for role-specific step-1 required fields.
   * We validate required keys server-side based on role.
   */
  @IsObject()
  values!: Record<string, unknown>;
}

export class UpsertOnboardingAnswersInput {
  @IsIn(['startup', 'investor', 'advisor'])
  role!: OnboardingRole;

  @IsObject()
  answers!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @IsOptional()
  @IsBoolean()
  skipped?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  score?: number;
}

