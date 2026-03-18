import { SetMetadata } from '@nestjs/common';

export type PlanTier = 'free' | 'pro' | 'elite';

export const REQUIRES_TIER_KEY = 'requiredTier';

/**
 * Require the caller's organization to be at least the specified tier.
 * Tier ordering: free < pro < elite.
 */
export const RequiresTier = (tier: Exclude<PlanTier, 'free'>) =>
  SetMetadata(REQUIRES_TIER_KEY, tier);

