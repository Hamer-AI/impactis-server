import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SecurityAuthController, SecurityController } from './security.controller';
import { SecurityService } from './security.service';

@Module({
  imports: [PrismaModule],
  controllers: [SecurityAuthController, SecurityController],
  providers: [SecurityService],
})
export class SecurityModule {}

