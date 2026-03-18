import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { WarmIntrosController } from './warm-intros.controller';
import { WarmIntrosService } from './warm-intros.service';

@Module({
  imports: [PrismaModule, NotificationsModule, OnboardingModule],
  controllers: [WarmIntrosController],
  providers: [WarmIntrosService],
})
export class WarmIntrosModule {}

