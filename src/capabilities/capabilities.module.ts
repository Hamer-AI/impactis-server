import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CacheModule } from '../cache/cache.module';
import { CapabilitiesService } from './capabilities.service';
import { CapabilitiesGuard } from './capabilities.guard';

@Module({
  imports: [PrismaModule, CacheModule],
  providers: [CapabilitiesService, CapabilitiesGuard],
  exports: [CapabilitiesService, CapabilitiesGuard],
})
export class CapabilitiesModule {}

