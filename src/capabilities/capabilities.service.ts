import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpstashRedisCacheService } from '../cache/upstash-redis-cache.service';

type CapabilityRow = {
  capability_code: string | null;
};

type CapabilityOverrideRow = {
  capability_code: string | null;
  is_enabled: boolean;
};

const ORG_CAPABILITIES_CACHE_TTL_SECONDS = 60;

@Injectable()
export class CapabilitiesService {
  private readonly logger = new Logger(CapabilitiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: UpstashRedisCacheService,
  ) {}

  private normalizeText(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private cacheKeyForOrg(orgId: string): string {
    const normalized = this.normalizeText(orgId);
    if (!normalized) {
      return 'capabilities:invalid-org';
    }

    return `capabilities:v1:org:${normalized}`;
  }

  async getCapabilitiesForOrg(orgId: string): Promise<Set<string>> {
    const normalizedOrgId = this.normalizeText(orgId);
    if (!normalizedOrgId) {
      return new Set<string>();
    }

    const cacheKey = this.cacheKeyForOrg(normalizedOrgId);

    try {
      const cached = await this.cache.getJson<string[]>(cacheKey);
      if (Array.isArray(cached) && cached.length > 0) {
        const set = new Set(
          cached
            .map((code) => this.normalizeText(code))
            .filter((code): code is string => !!code),
        );
        if (set.size > 0) {
          return set;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown capabilities cache read error';
      this.logger.warn(`Failed to read capabilities cache for org ${normalizedOrgId}: ${message}`);
    }

    const baseRows = await this.prisma.$queryRaw<CapabilityRow[]>`
      select
        pc.capability_code
      from public.org_current_subscription_plan_v1 cp
      join public.plan_capabilities pc on pc.plan_id = cp.plan_id
      join public.capabilities c on c.code = pc.capability_code
      where cp.org_id = ${normalizedOrgId}::uuid
        and pc.is_enabled = true
    `;

    const overrideRows = await this.prisma.$queryRaw<CapabilityOverrideRow[]>`
      select
        o.capability_code,
        o.is_enabled
      from public.org_capabilities_overrides o
      where o.org_id = ${normalizedOrgId}::uuid
        and (o.expires_at is null or o.expires_at > timezone('utc', now()))
    `;

    const effective = new Set<string>();

    for (const row of baseRows) {
      const code = this.normalizeText(row.capability_code);
      if (code) {
        effective.add(code);
      }
    }

    for (const row of overrideRows) {
      const code = this.normalizeText(row.capability_code);
      if (!code) {
        continue;
      }

      if (row.is_enabled === true) {
        effective.add(code);
      } else {
        effective.delete(code);
      }
    }

    const snapshot = Array.from(effective.values());

    try {
      await this.cache.setJson(cacheKey, snapshot, ORG_CAPABILITIES_CACHE_TTL_SECONDS);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown capabilities cache write error';
      this.logger.warn(`Failed to write capabilities cache for org ${normalizedOrgId}: ${message}`);
    }

    return effective;
  }

  async hasCapabilityForOrg(orgId: string, capabilityCode: string): Promise<boolean> {
    const normalizedOrgId = this.normalizeText(orgId);
    const normalizedCapability = this.normalizeText(capabilityCode)?.toLowerCase();
    if (!normalizedOrgId || !normalizedCapability) {
      return false;
    }

    const capabilities = await this.getCapabilitiesForOrg(normalizedOrgId);
    if (capabilities.size < 1) {
      return false;
    }

    const normalizedSet = new Set(
      Array.from(capabilities.values()).map((code) => code.toLowerCase()),
    );

    return normalizedSet.has(normalizedCapability);
  }

  async invalidateCapabilitiesForOrg(orgId: string): Promise<void> {
    const normalizedOrgId = this.normalizeText(orgId);
    if (!normalizedOrgId) {
      return;
    }

    const cacheKey = this.cacheKeyForOrg(normalizedOrgId);

    try {
      await this.cache.delete(cacheKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown capabilities cache delete error';
      this.logger.warn(`Failed to invalidate capabilities cache for org ${normalizedOrgId}: ${message}`);
    }
  }
}

