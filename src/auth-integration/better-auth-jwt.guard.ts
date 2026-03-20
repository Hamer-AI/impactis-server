import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Socket } from 'socket.io';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { AuthenticatedUser } from './auth-integration.service';
import { PrismaService } from '../prisma/prisma.service';

declare module 'http' {
  interface IncomingMessage {
    user?: AuthenticatedUser;
  }
}

@Injectable()
export class BetterAuthJwtGuard implements CanActivate {
  private jwkSet:
    | ReturnType<typeof createRemoteJWKSet>
    | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctxType = context.getType<'http' | 'ws' | 'rpc'>();

    if (ctxType === 'http') {
      const req = context.switchToHttp().getRequest<{
        headers: Record<string, string | string[] | undefined>;
        user?: AuthenticatedUser;
      }>();

      const authHeader = req.headers['authorization'];
      const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
      req.user = await this.verifyAuthorizationHeader(headerValue);
      return true;
    }

    if (ctxType === 'ws') {
      const client = context
        .switchToWs()
        .getClient<Socket & { user?: AuthenticatedUser }>();

      if (client.user) {
        return true;
      }

      const authTokenRaw = client.handshake.auth?.token;
      const authToken = typeof authTokenRaw === 'string' ? authTokenRaw.trim() : '';
      const headerAuth = client.handshake.headers.authorization;
      const headerToken = Array.isArray(headerAuth) ? headerAuth[0] : headerAuth;
      const bearer =
        authToken.length > 0
          ? authToken.startsWith('Bearer ')
            ? authToken
            : `Bearer ${authToken}`
          : headerToken;

      client.user = await this.verifyAuthorizationHeader(bearer);
      return true;
    }

    throw new UnauthorizedException('Unsupported context type for BetterAuthJwtGuard');
  }

  private async getJwkSet() {
    if (!this.jwkSet) {
      const jwksUrl = this.config.get<string>('betterAuthJwksUrl')?.trim();
      if (!jwksUrl) {
        // During transition we may still be using Supabase tokens; let the caller
        // decide whether to fall back instead of hard-failing here.
        throw new Error('Better Auth JWKS URL is not configured');
      }
      this.jwkSet = createRemoteJWKSet(new URL(jwksUrl));
    }
    return this.jwkSet;
  }

  private async verifyAuthorizationHeader(authHeader?: string | null): Promise<AuthenticatedUser> {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    try {
      const jwkSet = await this.getJwkSet();
      const issuer = this.config.get<string>('betterAuthIssuer')?.trim();
      const { payload } = await jwtVerify(token, jwkSet, issuer ? { issuer } : undefined);
      const user = this.toAuthenticatedUser(payload);
      await this.assertNotSuspended(user.id);
      return user;
    } catch (e) {
      if (e instanceof ForbiddenException) {
        throw e;
      }
      throw new UnauthorizedException('Invalid or expired auth token');
    }
  }

  private async assertNotSuspended(userId: string): Promise<void> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ suspended: boolean }>>`
        select coalesce((raw_user_meta_data->'impactis'->>'suspended') = 'true', false) as suspended
        from public.users
        where id = ${userId}::uuid
        limit 1
      `;
      if (rows[0]?.suspended === true) {
        throw new ForbiddenException({
          code: 'ACCOUNT_SUSPENDED',
          message: 'This account has been suspended. Contact support if you believe this is an error.',
        });
      }
    } catch (e) {
      if (e instanceof ForbiddenException) {
        throw e;
      }
      // If DB is unavailable, do not block auth (ops can still investigate via logs).
    }
  }

  private toAuthenticatedUser(payload: JWTPayload): AuthenticatedUser {
    const idValue = payload.sub ?? (payload as any).user_id ?? (payload as any).id;
    const id = typeof idValue === 'string' ? idValue : String(idValue ?? '');

    if (!id) {
      throw new UnauthorizedException('Token is missing subject');
    }

    const email =
      typeof payload.email === 'string'
        ? payload.email
        : typeof (payload as any).user_email === 'string'
          ? (payload as any).user_email
          : undefined;

    return {
      id,
      email,
      raw: payload as unknown as Record<string, unknown>,
    };
  }
}

