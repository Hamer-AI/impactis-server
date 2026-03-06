import { Module } from '@nestjs/common';
import { StartupsController } from './startups.controller';
import { StartupsService } from './startups.service';
import { ReadinessModule } from '../readiness/readiness.module';
import { CapabilitiesModule } from '../capabilities/capabilities.module';

@Module({
  imports: [ReadinessModule, CapabilitiesModule],
  controllers: [StartupsController],
  providers: [StartupsService],
})
export class StartupsModule {}
