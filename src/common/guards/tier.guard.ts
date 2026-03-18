import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from '../../billing/billing.service';
import { REQUIRES_TIER_KEY, type PlanTier } from '../decorators/requires-tier.decorator';

type RequestWithUser = {
  user?: { id: string };
};

const TIER_ORDER: Record<PlanTier, number> = {
  free: 0,
  pro: 1,
  elite: 2,
};

@Injectable()
export class TierGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredTier = this.reflector.get<PlanTier | undefined>(
      REQUIRES_TIER_KEY,
      context.getHandler(),
    );
    if (!requiredTier) {
      return true;
    }

    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const userId = req.user?.id;
    if (!userId) {
      throw new ForbiddenException({
        code: 'UPGRADE_REQUIRED',
        requiredTier,
        currentTier: 'free',
        message: `This feature requires ${requiredTier} tier or above.`,
      });
    }

    const membershipRows = await this.prisma.$queryRaw<Array<{ org_id: string }>>`
      select om.org_id::text as org_id
      from public.org_members om
      left join public.org_status os on os.org_id = om.org_id
      where om.user_id = ${userId}::uuid
        and om.status = 'active'
        and coalesce(os.status::text, 'active') = 'active'
      order by om.created_at asc
      limit 1
    `;
    const orgId = membershipRows[0]?.org_id;
    if (!orgId) {
      throw new ForbiddenException({
        code: 'UPGRADE_REQUIRED',
        requiredTier,
        currentTier: 'free',
        message: `This feature requires ${requiredTier} tier or above.`,
      });
    }

    const plan = await this.billing.getCurrentPlanForOrg(orgId);
    const currentTier = (plan?.plan.code ?? 'free') as PlanTier;

    const requiredRank = TIER_ORDER[requiredTier] ?? 0;
    const currentRank = TIER_ORDER[currentTier] ?? 0;
    if (currentRank < requiredRank) {
      throw new ForbiddenException({
        code: 'UPGRADE_REQUIRED',
        requiredTier,
        currentTier,
        message: `This feature requires ${requiredTier} tier or above.`,
      });
    }

    return true;
  }
}

