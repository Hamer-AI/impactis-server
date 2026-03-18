import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiController } from './ai.controller';
import { AiMatchingService } from './ai-matching.service';

@Module({
  imports: [PrismaModule],
  controllers: [AiController],
  providers: [AiMatchingService],
  exports: [AiMatchingService],
})
export class AiModule {}

