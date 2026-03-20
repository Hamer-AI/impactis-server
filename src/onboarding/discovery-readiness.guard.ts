import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';

@Injectable()
export class DiscoveryReadinessGuard implements CanActivate {
  constructor(private readonly onboarding: OnboardingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<{ user?: { id?: string } }>();
    const userId = req.user?.id;
    if (!userId) {
      return true;
    }

    const me = await this.onboarding.getOnboardingMeForUser(userId);
    const step1Completed = me.onboarding.step1_completed === true;
    if (!step1Completed) {
      throw new ForbiddenException({
        code: 'READINESS_BLOCKED',
        requiredScore: 100,
        score: me.scores?.overall_score ?? 0,
        missing: ['onboarding.step1'],
        message: 'Complete onboarding step 1 before using discovery.',
      });
    }

    return true;
  }
}
