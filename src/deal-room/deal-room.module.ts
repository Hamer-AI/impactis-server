import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailerModule } from '../mailer/mailer.module';
import { BillingModule } from '../billing/billing.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { DealRoomController } from './deal-room.controller';
import { DealRoomsAliasController } from './deal-rooms-alias.controller';
import { DealRoomService } from './deal-room.service';

@Module({
  imports: [PrismaModule, NotificationsModule, MailerModule, BillingModule, OnboardingModule],
  controllers: [DealRoomController, DealRoomsAliasController],
  providers: [DealRoomService],
  exports: [DealRoomService],
})
export class DealRoomModule {}

