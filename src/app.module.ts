import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthIntegrationModule } from './auth-integration/auth-integration.module';
import { WorkspaceModule } from './workspace/workspace.module';
import configuration from './config/configuration';
import { HealthModule } from './health/health.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { ProfilesModule } from './profiles/profiles.module';
import { StartupsModule } from './startups/startups.module';
import { FilesModule } from './files/files.module';
import { CacheModule } from './cache/cache.module';
import { ConditionalGetEtagInterceptor } from './http/conditional-get-etag.interceptor';
import { BillingModule } from './billing/billing.module';
import { SessionsModule } from './sessions/sessions.module';
import { CapabilitiesModule } from './capabilities/capabilities.module';
import { ConnectionsModule } from './connections/connections.module';
import { MailerModule } from './mailer/mailer.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { DataRoomModule } from './data-room/data-room.module';
import { DealRoomModule } from './deal-room/deal-room.module';
import { TierGuard } from './common/guards/tier.guard';
import { SyndicatesModule } from './syndicates/syndicates.module';
import { AdminModule } from './admin/admin.module';
import { SecurityModule } from './security/security.module';
import { SupportModule } from './support/support.module';
import { WarmIntrosModule } from './warm-intros/warm-intros.module';
import { AiModule } from './ai/ai.module';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: [configuration],
    }),
    PrismaModule,
    AuthIntegrationModule,
    WorkspaceModule,
    OrganizationsModule,
    ProfilesModule,
    StartupsModule,
    FilesModule,
    BillingModule,
    SessionsModule,
    CacheModule,
    HealthModule,
    CapabilitiesModule,
    ConnectionsModule,
    MailerModule,
    NotificationsModule,
    OnboardingModule,
    DataRoomModule,
    DealRoomModule,
    SyndicatesModule,
    AdminModule,
    SecurityModule,
    SupportModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    WarmIntrosModule,
    AiModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ConditionalGetEtagInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    TierGuard,
  ],
})
export class AppModule { }
