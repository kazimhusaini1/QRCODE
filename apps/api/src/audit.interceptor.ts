import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable, catchError, from, map, mergeMap, throwError } from 'rxjs';
import { PrismaService } from './prisma.service';
import { MarketplaceCacheService } from './marketplace-cache.service';

type RequestContext = { method?: string; originalUrl?: string; user?: { id?: string }; body?: unknown };
type ResponseContext = { statusCode?: number };

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);
  constructor(private readonly prisma: PrismaService, private readonly cache: MarketplaceCacheService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestContext>();
    const response = http.getResponse<ResponseContext>();
    const actorId = request.user?.id;
    const method = request.method?.toUpperCase() ?? 'UNKNOWN';
    if (!actorId || ['GET', 'HEAD', 'OPTIONS'].includes(method)) return next.handle();
    const path = (request.originalUrl ?? '/').split('?')[0].slice(0, 255);
    const requested = safeAuditSnapshot(request.body);
    const record = (status: number, before: unknown, after?: unknown) => this.prisma.auditEvent.create({ data: { actorId, method: method.slice(0, 10), path, status, details: { before: safeAuditSnapshot(before), requested, after: safeAuditSnapshot(after) } as Prisma.InputJsonValue } });
    const bestEffort = async (status: number, before: unknown, after?: unknown) => {
      try { await record(status, before, after); await this.cache.invalidateMarketplace(); }
      catch (error) { this.logger.error(`Could not persist audit event (${method} ${path})`, error instanceof Error ? error.stack : undefined); }
    };
    const continueWithSnapshot = (before: unknown) => next.handle().pipe(
      mergeMap(value => from(bestEffort(response.statusCode ?? 200, before, value)).pipe(map(() => value))),
      catchError(error => from(bestEffort(response.statusCode ?? 500, before, { error: errorStatus(error) })).pipe(mergeMap(() => throwError(() => error)))),
    );
    return from(this.captureBefore(path, actorId).catch(error => {
      this.logger.warn(`Could not capture prior state for ${method} ${path}: ${error instanceof Error ? error.message : 'unknown error'}`);
      return null;
    })).pipe(mergeMap(continueWithSnapshot));
  }

  private async captureBefore(path: string, actorId: string): Promise<unknown> {
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    const api = parts[0] === 'api' && parts[1] === 'v1' ? parts.slice(2) : parts;
    if (api[0] === 'merchant' && api[1] === 'settings') return this.prisma.merchant.findUnique({ where: { ownerId: actorId }, select: { isOpen: true, acceptsDelivery: true, acceptsPickup: true, minimumOrderPaisa: true, deliveryFeePaisa: true, estimatedDeliveryMinutes: true, operatingHours: true } });
    if (api[0] === 'merchant' && api[1] === 'products' && api[2] && api[2] !== 'stock') {
      const productId = api[2];
      if (api[3] === 'stock') return this.prisma.inventory.findUnique({ where: { productId }, select: { quantity: true } });
      return this.prisma.product.findUnique({ where: { id: productId }, select: { pricePaisa: true, isAvailable: true } });
    }
    if (api[0] === 'orders' && api[1] && api[2] === 'status') return this.prisma.order.findUnique({ where: { id: api[1] }, select: { status: true, paymentStatus: true } });
    if (api[0] === 'admin' && api[1] === 'merchants' && api[2]) return this.prisma.merchant.findUnique({ where: { id: api[2] }, select: { status: true } });
    if (api[0] === 'admin' && api[1] === 'reviews' && api[2]) return this.prisma.review.findUnique({ where: { id: api[2] }, select: { isPublished: true, rating: true } });
    if (api[0] === 'admin' && api[1] === 'coupons' && api[2]) return this.prisma.coupon.findUnique({ where: { id: api[2] }, select: { isActive: true, usageCount: true, usageLimit: true } });
    if (api[0] === 'admin' && api[1] === 'support-tickets' && api[2]) return this.prisma.supportTicket.findUnique({ where: { id: api[2] }, select: { status: true } });
    if (api[0] === 'admin' && api[1] === 'categories' && api[2]) return this.prisma.category.findUnique({ where: { id: api[2] }, select: { isActive: true, sortOrder: true } });
    if (api[0] === 'admin' && api[1] === 'societies' && api[2]) return this.prisma.society.findUnique({ where: { id: api[2] }, select: { isActive: true } });
    return null;
  }
}

function errorStatus(error: unknown) {
  return typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : 500;
}

const safeFields = new Set(['status','paymentStatus','isOpen','acceptsDelivery','acceptsPickup','minimumOrderPaisa','deliveryFeePaisa','estimatedDeliveryMinutes','isAvailable','pricePaisa','quantity','role','isPublished','operatingHours','societyIds','merchantId','categoryId','rating','isActive','orderId','fulfillment','paymentMethod','discountType','value','usageCount','usageLimit','perUserLimit','startsAt','endsAt','error']);

function safeAuditSnapshot(value: unknown, depth = 0): Prisma.InputJsonValue | null {
  if (depth > 5 || value == null) return null;
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 100);
  if (Array.isArray(value)) return value.slice(0, 50).map(item => safeAuditSnapshot(item, depth + 1));
  if (typeof value !== 'object') return null;
  const result: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!safeFields.has(key) && !(depth > 0 && ['monday','tuesday','wednesday','thursday','friday','saturday','sunday','opensAt','closesAt','closed'].includes(key))) continue;
    result[key] = safeAuditSnapshot(item, depth + 1);
  }
  return result;
}
