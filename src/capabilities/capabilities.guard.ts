import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CAPABILITY_KEY, RequiredCapability } from './capabilities.decorator';
import { CapabilitiesService } from './capabilities.service';

@Injectable()
export class CapabilitiesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly capabilities: CapabilitiesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredCapability | undefined>(
      CAPABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) {
      return true;
    }

    const http = context.switchToHttp();
    const req = http.getRequest<{
      headers?: Record<string, string | string[] | undefined>;
      params?: Record<string, unknown>;
      query?: Record<string, unknown>;
    }>();

    const orgIdFromHeaderRaw = req.headers?.['x-org-id'];
    const orgIdFromHeader = Array.isArray(orgIdFromHeaderRaw)
      ? orgIdFromHeaderRaw[0]
      : orgIdFromHeaderRaw;
    const orgIdFromQuery = typeof req.query?.orgId === 'string' ? req.query.orgId : null;
    const orgIdFromParams = typeof req.params?.orgId === 'string' ? req.params.orgId : null;

    const orgId =
      (typeof orgIdFromHeader === 'string' ? orgIdFromHeader.trim() : '') ||
      (orgIdFromQuery ?? '') ||
      (orgIdFromParams ?? '');

    if (!orgId) {
      throw new ForbiddenException('Organization context is required for capability checks.');
    }

    const requiredList: string[] = Array.isArray(required) ? required : [required];
    for (const capabilityCode of requiredList) {
      const hasCapability = await this.capabilities.hasCapabilityForOrg(orgId, capabilityCode);
      if (!hasCapability) {
        throw new ForbiddenException(
          `Capability ${capabilityCode} is required for this operation.`,
        );
      }
    }

    return true;
  }
}

