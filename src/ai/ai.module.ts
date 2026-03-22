import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiController } from './ai.controller';
import { AiMatchingService } from './ai-matching.service';
import { AiEnhancementService } from './ai-enhancement.service';


@Module({
  imports: [PrismaModule],
  controllers: [AiController],
  providers: [AiMatchingService, AiEnhancementService],
  exports: [AiMatchingService, AiEnhancementService],
})
export class AiModule {}

