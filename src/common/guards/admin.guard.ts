import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user?: { id?: string } }>();
    const userId = req.user?.id;
    if (!userId) {
      throw new ForbiddenException({ code: 'ADMIN_REQUIRED', message: 'Admin access required.' });
    }

    const rows = await this.prisma.$queryRaw<Array<{ is_active: boolean }>>`
      select is_active
      from public.admin_users
      where user_id = ${userId}::uuid
      limit 1
    `;
    if (rows[0]?.is_active !== true) {
      throw new ForbiddenException({ code: 'ADMIN_REQUIRED', message: 'Admin access required.' });
    }

    return true;
  }
}

