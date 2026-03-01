import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActiveSession } from './sessions.types';

interface SessionRow {
    id: string;
    user_id: string;
    ip: string | null;
    user_agent: string | null;
    created_at: Date | string;
    updated_at: Date | string;
}

interface DeleteResult {
    count: number;
}

@Injectable()
export class SessionsService {
    private readonly logger = new Logger(SessionsService.name);

    constructor(private readonly prisma: PrismaService) { }

    async getSessionsForUser(userId: string): Promise<ActiveSession[]> {
        try {
            const rows = await this.prisma.$queryRaw<SessionRow[]>(
                `SELECT id, user_id, ip, user_agent, created_at, updated_at
         FROM auth.sessions
         WHERE user_id = $1
         ORDER BY updated_at DESC`,
                userId,
            );

            return rows.map((row) => ({
                id: typeof row.id === 'string' ? row.id : String(row.id),
                user_id: typeof row.user_id === 'string' ? row.user_id : String(row.user_id),
                ip: row.ip ?? null,
                user_agent: row.user_agent ?? null,
                created_at:
                    row.created_at instanceof Date
                        ? row.created_at.toISOString()
                        : String(row.created_at),
                updated_at:
                    row.updated_at instanceof Date
                        ? row.updated_at.toISOString()
                        : String(row.updated_at),
            }));
        } catch (error) {
            this.logger.error(
                `Failed to query auth.sessions for user ${userId}`,
                error instanceof Error ? error.stack : String(error),
            );
            return [];
        }
    }

    async revokeSession(userId: string, sessionId: string): Promise<DeleteResult> {
        try {
            const rows = await this.prisma.$queryRaw<{ id: string }[]>(
                `DELETE FROM auth.sessions WHERE id = $1 AND user_id = $2 RETURNING id`,
                sessionId,
                userId,
            );

            return { count: rows.length };
        } catch (error) {
            this.logger.error(
                `Failed to revoke session ${sessionId} for user ${userId}`,
                error instanceof Error ? error.stack : String(error),
            );
            return { count: 0 };
        }
    }

    async revokeOtherSessions(userId: string, currentSessionId: string): Promise<DeleteResult> {
        try {
            const rows = await this.prisma.$queryRaw<{ id: string }[]>(
                `DELETE FROM auth.sessions WHERE user_id = $1 AND id != $2 RETURNING id`,
                userId,
                currentSessionId,
            );

            return { count: rows.length };
        } catch (error) {
            this.logger.error(
                `Failed to revoke other sessions for user ${userId}`,
                error instanceof Error ? error.stack : String(error),
            );
            return { count: 0 };
        }
    }
}
