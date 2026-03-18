import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';

export type UsageCheckResult = {
  allowed: boolean;
  featureKey: string;
  current: number;
  limit: number | null;
  planCode: string;
};

@Injectable()
export class BillingUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  private normalizeText(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const t = value.trim();
    return t.length > 0 ? t : null;
  }

  private async resolvePlanCodeForOrg(orgId: string): Promise<string> {
    const snapshot = await this.billing.getCurrentPlanForOrg(orgId);
    const code = this.normalizeText(snapshot?.plan.code ?? null);
    return code ?? 'free';
  }

  private getMonthRange(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { start, end };
  }

  private resolveLimit(featureKey: string, planCode: string): number | null {
    const code = featureKey;
    const plan = planCode.toLowerCase();

    // Hard-coded v3 limits for now; can later move to billing_plan_features
    if (code === 'connect_requests_sent') {
      if (plan === 'free') return 2;
      return null; // unlimited for pro/elite
    }

    if (code === 'dealroom.create' || code === 'dealroom.requests_sent') {
      if (plan === 'free') return 1;
      if (plan === 'pro') return 10;
      return null; // elite unlimited
    }

    return null;
  }

  /**
   * Check and optionally increment a usage counter for the given feature.
   * Uses a monthly window for now; this is enough for demo limits.
   */
  async checkAndIncrementOrgFeatureUsage(
    orgId: string,
    featureKey: string,
  ): Promise<UsageCheckResult> {
    const normalizedOrgId = this.normalizeText(orgId);
    const normalizedFeatureKey = this.normalizeText(featureKey);
    if (!normalizedOrgId || !normalizedFeatureKey) {
      return {
        allowed: false,
        featureKey,
        current: 0,
        limit: 0,
        planCode: 'free',
      };
    }

    const planCode = await this.resolvePlanCodeForOrg(normalizedOrgId);
    const limit = this.resolveLimit(normalizedFeatureKey, planCode);

    const { start, end } = this.getMonthRange();

    const currentRows = await this.prisma.$queryRaw<
      Array<{ usage_count: bigint | number | string | null }>
    >`
      select usage_count
      from public.org_feature_usage_counters
      where org_id = ${normalizedOrgId}::uuid
        and feature_key = ${normalizedFeatureKey}
        and period_start = ${start}::date
        and period_end = ${end}::date
      limit 1
    `;

    const currentRaw = currentRows[0]?.usage_count ?? 0;
    const currentBefore =
      typeof currentRaw === 'bigint'
        ? Number(currentRaw)
        : typeof currentRaw === 'number'
        ? currentRaw
        : Number.parseInt(String(currentRaw), 10) || 0;

    if (limit != null && currentBefore >= limit) {
      return {
        allowed: false,
        featureKey: normalizedFeatureKey,
        current: currentBefore,
        limit,
        planCode,
      };
    }

    const rows = await this.prisma.$queryRaw<
      Array<{ usage_count: bigint | number | string | null }>
    >`
      insert into public.org_feature_usage_counters (org_id, feature_key, period_start, period_end, usage_count)
      values (${normalizedOrgId}::uuid, ${normalizedFeatureKey}, ${start}::date, ${end}::date, 1)
      on conflict (org_id, feature_key, period_start, period_end) do update
      set usage_count = public.org_feature_usage_counters.usage_count + 1,
          updated_at = timezone('utc', now())
      returning usage_count
    `;

    const raw = rows[0]?.usage_count ?? (currentBefore + 1);
    const current =
      typeof raw === 'bigint'
        ? Number(raw)
        : typeof raw === 'number'
        ? raw
        : Number.parseInt(String(raw), 10) || 0;

    const allowed = true;

    return {
      allowed,
      featureKey: normalizedFeatureKey,
      current,
      limit,
      planCode,
    };
  }
}

