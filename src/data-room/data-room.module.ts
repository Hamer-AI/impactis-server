import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CapabilitiesModule } from '../capabilities/capabilities.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { MailerModule } from '../mailer/mailer.module';
import { FilesModule } from '../files/files.module';
import { BillingModule } from '../billing/billing.module';
import { TierGuard } from '../common/guards/tier.guard';
import { DataRoomController } from './data-room.controller';
import { DataRoomService } from './data-room.service';

@Module({
  imports: [PrismaModule, NotificationsModule, CapabilitiesModule, MailerModule, OnboardingModule, FilesModule, BillingModule],
  controllers: [DataRoomController],
  providers: [DataRoomService, TierGuard],
  exports: [DataRoomService],
})
export class DataRoomModule {}

