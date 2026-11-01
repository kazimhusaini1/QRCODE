import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MarketplaceController } from './marketplace.controller';
import { AuthController } from './auth.controller';
import { OrdersController } from './orders.controller';
import { AuthGuard, AuthService } from './auth';
import { PrismaService } from './prisma.service';
import { MerchantController } from './merchant.controller';
import { AdminController } from './admin.controller';
import { CustomersController } from './customers.controller';
import { CouponsController } from './coupons.controller';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { AuditInterceptor } from './audit.interceptor';
import { AuthDeliveryService } from './auth-delivery';
import { StorageService } from './storage.service';
import { NotificationsService } from './notifications.service';
import { MarketplaceCacheService } from './marketplace-cache.service';
import { AuditRetentionService } from './audit-retention.service';

@Module({ controllers: [MarketplaceController, AuthController, OrdersController, MerchantController, AdminController, CustomersController, CouponsController], providers: [PrismaService, AuthService, AuthGuard, AuthRateLimitGuard, AuthDeliveryService, StorageService, NotificationsService, MarketplaceCacheService, AuditRetentionService, { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }] })
export class AppModule {}
