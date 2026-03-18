import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';

@Injectable()
export class ReadinessGuard implements CanActivate {
  constructor(private readonly onboarding: OnboardingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<{ user?: { id?: string } }>();
    const userId = req.user?.id;
    if (!userId) {
      return true;
    }

    const me = await this.onboarding.getOnboardingMeForUser(userId);
    const score = me.scores?.overall_score ?? 0;
    const step1Completed = me.onboarding.step1_completed === true;
    const missing = Array.isArray(me.onboarding.missing) ? me.onboarding.missing : [];

    // Enforce: step 1 must be completed AND normalized readiness score must be 100%.
    if (!step1Completed || score < 100) {
      throw new ForbiddenException({
        code: 'READINESS_BLOCKED',
        requiredScore: 100,
        score,
        missing,
        message: 'Complete onboarding and profile setup before using this feature.',
      });
    }

    return true;
  }
}

