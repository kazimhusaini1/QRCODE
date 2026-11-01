import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { PrismaService } from './prisma.service';

type RequestWithRoute = { ip?: string; path?: string; route?: { path?: string }; method?: string };
type ResponseWithHeader = { setHeader(name: string, value: string): void };

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithRoute>();
    const response = context.switchToHttp().getResponse<ResponseWithHeader>();
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret || secret.length < 32) throw new ServiceUnavailableException('Authentication is not configured');
    const path = request.route?.path ?? request.path ?? 'auth';
    const isRefresh = path === 'refresh' || path.endsWith('/refresh');
    const isLogout = path === 'logout' || path.endsWith('/logout');
    const limit = isRefresh ? 60 : isLogout ? 30 : 10;
    const scope = `${request.method ?? 'POST'}:${path}:${request.ip ?? 'unknown'}`;
    const key = createHmac('sha256', secret).update(scope).digest('hex');
    try {
      await this.prisma.$executeRaw`
        INSERT INTO RateLimitBucket (bucketKey, hits, expiresAt, updatedAt)
        VALUES (${key}, 1, DATE_ADD(NOW(3), INTERVAL 900 SECOND), NOW(3)) AS incoming
        ON DUPLICATE KEY UPDATE
          hits = IF(RateLimitBucket.expiresAt <= NOW(3), 1, RateLimitBucket.hits + 1),
          expiresAt = IF(RateLimitBucket.expiresAt <= NOW(3), incoming.expiresAt, RateLimitBucket.expiresAt),
          updatedAt = NOW(3)
      `;
      const bucket = await this.prisma.rateLimitBucket.findUnique({ where: { bucketKey: key }, select: { hits: true, expiresAt: true } });
      if (!bucket) throw new Error('Rate limit bucket was not created');
      response.setHeader('RateLimit-Limit', String(limit));
      response.setHeader('RateLimit-Remaining', String(Math.max(0, limit - bucket.hits)));
      response.setHeader('RateLimit-Reset', String(Math.ceil(bucket.expiresAt.getTime() / 1000)));
      if (bucket.hits > limit) {
        response.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.expiresAt.getTime() - Date.now()) / 1000))));
        throw new HttpException('Too many authentication requests. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
      }
      if (Math.random() < 0.01) await this.prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } } });
      return true;
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) throw error;
      throw new ServiceUnavailableException('Authentication controls are temporarily unavailable');
    }
  }
}
