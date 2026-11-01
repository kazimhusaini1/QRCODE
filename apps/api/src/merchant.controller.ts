import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MerchantStaffRole, Prisma } from '@prisma/client';
import { IsArray, IsBoolean, IsEmail, IsEnum, IsInt, IsObject, IsOptional, IsString, Min, MinLength, ArrayMinSize, Max } from 'class-validator';
import { AuthGuard, CurrentUser, Principal } from './auth';
import { PrismaService } from './prisma.service';
import { StorageService } from './storage.service';
import { attachRiskIndicators } from './fraud-indicators';

class ApplyMerchantDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(2) slug!: string;
  @IsString() @MinLength(10) description!: string;
  @IsString() phone!: string;
  @IsString() categoryId!: string;
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) societyIds!: string[];
  @IsOptional() @IsInt() @Min(0) minimumOrderPaisa?: number;
  @IsOptional() @IsInt() @Min(0) deliveryFeePaisa?: number;
}
class ProductDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() description!: string;
  @IsInt() @Min(0) pricePaisa!: number;
  @IsInt() @Min(0) quantity!: number;
  @IsOptional() @IsString() imageUrl?: string;
}
class QuantityDto { @IsInt() @Min(0) quantity!: number; }
class ServiceAreasDto { @IsArray() @ArrayMinSize(1) @IsString({ each: true }) societyIds!: string[]; }
class MerchantSettingsDto {
  @IsOptional() @IsBoolean() isOpen?: boolean;
  @IsOptional() @IsBoolean() acceptsDelivery?: boolean;
  @IsOptional() @IsBoolean() acceptsPickup?: boolean;
  @IsOptional() @IsInt() @Min(0) minimumOrderPaisa?: number;
  @IsOptional() @IsInt() @Min(0) deliveryFeePaisa?: number;
  @IsOptional() @IsInt() @Min(1) estimatedDeliveryMinutes?: number;
  @IsOptional() @IsObject() operatingHours?: Record<string, { opensAt?: string; closesAt?: string; closed: boolean }>;
}
class UpdateProductDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(0) pricePaisa?: number;
  @IsOptional() @IsBoolean() isAvailable?: boolean;
  @IsOptional() @IsString() imageUrl?: string;
}
class PresignImageDto { @IsString() contentType!: string; @IsInt() @Min(1) @Max(8388608) sizeBytes!: number; }
class AddStaffDto { @IsEmail() email!: string; @IsEnum(MerchantStaffRole) role!: MerchantStaffRole; }

@ApiTags('merchant')
@ApiBearerAuth()
@Controller('merchant')
@UseGuards(AuthGuard)
@Injectable()
export class MerchantController {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  @Post('uploads/presign')
  async presignProductImage(@CurrentUser() user: Principal, @Body() body: PresignImageDto) {
    const merchant = await this.getMerchantAccess(user, 'CATALOG');
    return this.storage.createProductUpload(merchant.id, body.contentType, body.sizeBytes);
  }

  @Post('apply')
  async apply(@CurrentUser() user: Principal, @Body() body: ApplyMerchantDto) {
    if (user.role !== 'CUSTOMER') throw new ForbiddenException('Only a customer account can apply for merchant access');
    const societyIds = [...new Set(body.societyIds)];
    const result = await this.prisma.$transaction(async tx => {
      const category = await tx.category.findFirst({ where: { id: body.categoryId, isActive: true } });
      if (!category) throw new BadRequestException('Category is not available');
      const societies = await tx.society.findMany({ where: { id: { in: societyIds }, isActive: true }, select: { id: true } });
      if (societies.length !== societyIds.length) throw new BadRequestException('One or more selected service areas are unavailable');
      const merchant = await tx.merchant.create({ data: {
        ownerId: user.id, name: body.name.trim(), slug: body.slug.toLowerCase().trim(), description: body.description,
        phone: body.phone, categoryId: body.categoryId, minimumOrderPaisa: body.minimumOrderPaisa ?? 0,
        deliveryFeePaisa: body.deliveryFeePaisa ?? 0, status: 'PENDING',
        societyAreas: { create: societyIds.map(societyId => ({ societyId })) },
      } });
      await tx.user.update({ where: { id: user.id }, data: { role: 'MERCHANT_ADMIN' } });
      return merchant;
    });
    return result;
  }

  @Get('profile')
  async profile(@CurrentUser() user: Principal) {
    const merchant = await this.getMerchantAccess(user, 'VIEW');
    const profile = await this.prisma.merchant.findUnique({ where: { id: merchant.id }, include: { category: true, societyAreas: { include: { society: true } }, products: { include: { inventory: true }, orderBy: { name: 'asc' } } } });
    const accessRole = user.role === 'MERCHANT_ADMIN' ? 'OWNER' : (await this.prisma.merchantStaffAccess.findUnique({ where: { userId: user.id }, select: { role: true } }))?.role ?? null;
    return profile ? { ...profile, accessRole } : null;
  }

  @Get('staff')
  async staff(@CurrentUser() user: Principal) {
    const merchant = await this.getOwnedMerchant(user);
    return this.prisma.merchantStaffAccess.findMany({ where: { merchantId: merchant.id }, orderBy: { createdAt: 'asc' }, include: { user: { select: { id: true, name: true, email: true, phone: true } } } });
  }

  @Post('staff')
  async addStaff(@CurrentUser() user: Principal, @Body() body: AddStaffDto) {
    const merchant = await this.getOwnedMerchant(user);
    const account = await this.prisma.user.findUnique({ where: { email: body.email.trim().toLowerCase() }, select: { id: true, role: true } });
    if (!account) throw new BadRequestException('The staff member must create an account before access can be granted');
    if (account.id === user.id || account.role === 'SUPER_ADMIN' || account.role === 'MERCHANT_ADMIN') throw new BadRequestException('This account cannot be added as merchant staff');
    const existingAccess = await this.prisma.merchantStaffAccess.findUnique({ where: { userId: account.id }, select: { merchantId: true } });
    if (existingAccess && existingAccess.merchantId !== merchant.id) throw new BadRequestException('This account already has staff access for another merchant');
    return this.prisma.$transaction(async tx => {
      const membership = await tx.merchantStaffAccess.upsert({ where: { merchantId_userId: { merchantId: merchant.id, userId: account.id } }, create: { merchantId: merchant.id, userId: account.id, previousRole: account.role, role: body.role }, update: { role: body.role } });
      await tx.user.update({ where: { id: account.id }, data: { role: 'STAFF' } });
      return membership;
    });
  }

  @Delete('staff/:id')
  async removeStaff(@CurrentUser() user: Principal, @Param('id') id: string) {
    const merchant = await this.getOwnedMerchant(user);
    const membership = await this.prisma.merchantStaffAccess.findFirst({ where: { id, merchantId: merchant.id }, select: { userId: true, previousRole: true } });
    if (!membership) throw new BadRequestException('Staff access not found');
    await this.prisma.$transaction(async tx => {
      await tx.merchantStaffAccess.delete({ where: { id } });
      const remaining = await tx.merchantStaffAccess.count({ where: { userId: membership.userId } });
      if (!remaining) await tx.user.updateMany({ where: { id: membership.userId, role: 'STAFF' }, data: { role: membership.previousRole } });
    });
    return { removed: true };
  }

  @Patch('settings')
  async updateSettings(@CurrentUser() user: Principal, @Body() body: MerchantSettingsDto) {
    const merchant = await this.getMerchantAccess(user, 'MANAGE');
    if (Object.keys(body).length === 0) throw new BadRequestException('At least one setting is required');
    if (body.operatingHours) {
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      if (Object.keys(body.operatingHours).some(day => !days.includes(day)) || days.some(day => {
        const hours = body.operatingHours?.[day];
        if (!hours || typeof hours.closed !== 'boolean') return true;
        if (hours.closed) return false;
        return !/^([01]\d|2[0-3]):[0-5]\d$/.test(hours.opensAt ?? '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hours.closesAt ?? '') || hours.opensAt === hours.closesAt;
      })) throw new BadRequestException('Provide valid opening and closing times for all seven days');
    }
    return this.prisma.merchant.update({ where: { id: merchant.id }, data: { ...body, operatingHours: body.operatingHours as Prisma.InputJsonValue | undefined } });
  }

  @Post('products')
  async createProduct(@CurrentUser() user: Principal, @Body() body: ProductDto) {
    const merchant = await this.getMerchantAccess(user, 'CATALOG');
    if (user.role === 'STAFF' && (await this.prisma.merchantStaffAccess.findUnique({ where: { userId: user.id }, select: { role: true } }))?.role === 'CATALOG' && body.quantity !== 0) throw new ForbiddenException('Catalog staff can add products with zero initial stock; inventory access is required to add stock');
    if (body.imageUrl) await this.storage.verifyProductUpload(merchant.id, body.imageUrl);
    return this.prisma.$transaction(async tx => {
      const product = await tx.product.create({ data: {
        merchantId: merchant.id, name: body.name.trim(), description: body.description,
        pricePaisa: body.pricePaisa, imageUrl: body.imageUrl, inventory: { create: { quantity: body.quantity } },
      }, include: { inventory: true } });
      if (body.quantity) await tx.inventoryMovement.create({ data: { productId: product.id, actorId: user.id, quantityDelta: body.quantity, reason: 'INITIAL_STOCK' } });
      return product;
    });
  }

  @Patch('products/:id')
  async updateProduct(@CurrentUser() user: Principal, @Param('id') productId: string, @Body() body: UpdateProductDto) {
    const merchant = await this.getMerchantAccess(user, 'CATALOG');
    const changed = await this.prisma.product.updateMany({ where: { id: productId, merchantId: merchant.id }, data: body });
    if (!changed.count) throw new BadRequestException('Product not found');
    return this.prisma.product.findUnique({ where: { id: productId }, include: { inventory: true } });
  }

  @Put('products/:id/stock')
  async setStock(@CurrentUser() user: Principal, @Param('id') productId: string, @Body() body: QuantityDto) {
    const merchant = await this.getMerchantAccess(user, 'INVENTORY');
    return this.prisma.$transaction(async tx => {
      const product = await tx.product.findFirst({ where: { id: productId, merchantId: merchant.id }, include: { inventory: true } });
      if (!product?.inventory) throw new BadRequestException('Product not found');
      const quantityDelta = body.quantity - product.inventory.quantity;
      const inventory = await tx.inventory.update({ where: { productId }, data: { quantity: body.quantity } });
      if (quantityDelta) await tx.inventoryMovement.create({ data: { productId, actorId: user.id, quantityDelta, reason: 'MANUAL_ADJUSTMENT' } });
      return inventory;
    }, { isolationLevel: 'Serializable' });
  }

  @Get('inventory/movements')
  async inventoryMovements(@CurrentUser() user: Principal) {
    const merchant = await this.getMerchantAccess(user, 'INVENTORY');
    return this.prisma.inventoryMovement.findMany({ where: { product: { merchantId: merchant.id } }, orderBy: { createdAt: 'desc' }, take: 200, include: { product: { select: { id: true, name: true } } } });
  }

  @Get('analytics')
  async analytics(@CurrentUser() user: Principal) {
    const merchant = await this.getMerchantAccess(user, 'VIEW');
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const orderRange = { merchantId: merchant.id, createdAt: { gte: since } };
    const [orders, completed, cancelled, revenue, popular, daily] = await Promise.all([
      this.prisma.order.count({ where: orderRange }),
      this.prisma.order.count({ where: { ...orderRange, status: 'COMPLETED' } }),
      this.prisma.order.count({ where: { ...orderRange, status: { in: ['CANCELLED', 'REJECTED'] } } }),
      this.prisma.order.aggregate({ where: { ...orderRange, status: 'COMPLETED' }, _sum: { totalPaisa: true } }),
      this.prisma.orderItem.groupBy({ by: ['productId'], where: { productId: { not: null }, order: { ...orderRange, status: 'COMPLETED' } }, _sum: { quantity: true, lineTotalPaisa: true }, orderBy: { _sum: { lineTotalPaisa: 'desc' } }, take: 10 }),
      this.prisma.$queryRaw<Array<{ day: Date; orderCount: bigint | number; revenuePaisa: bigint | number }>>(Prisma.sql`SELECT DATE(o.createdAt) AS day, COUNT(*) AS orderCount, COALESCE(SUM(o.totalPaisa), 0) AS revenuePaisa FROM \`Order\` o WHERE o.merchantId = ${merchant.id} AND o.status = 'COMPLETED' AND o.createdAt >= ${since} GROUP BY DATE(o.createdAt) ORDER BY day`),
    ]);
    const productIds = popular.flatMap(item => item.productId ? [item.productId] : []);
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } });
    return { periodDays: 30, orders, completedOrders: completed, cancelledOrders: cancelled, completedRevenuePaisa: revenue._sum.totalPaisa ?? 0, popularProducts: popular.flatMap(item => { const product = products.find(row => row.id === item.productId); return product ? [{ productId: product.id, name: product.name, quantity: item._sum.quantity ?? 0, revenuePaisa: item._sum.lineTotalPaisa ?? 0 }] : []; }), dailySales: daily.map(row => ({ day: new Date(row.day).toISOString().slice(0, 10), orders: Number(row.orderCount), revenuePaisa: Number(row.revenuePaisa) })) };
  }

  @Get('orders')
  async merchantOrders(@CurrentUser() user: Principal) {
    const merchant = await this.getMerchantAccess(user, 'ORDERS');
    const orders = await this.prisma.order.findMany({ where: { merchantId: merchant.id }, orderBy: { createdAt: 'desc' }, take: 100, include: { items: true, statusEvents: { orderBy: { createdAt: 'asc' } }, merchant: { select: { ownerId: true } } } });
    return attachRiskIndicators(this.prisma, orders);
  }

  @Put('service-areas')
  async setServiceAreas(@CurrentUser() user: Principal, @Body() body: ServiceAreasDto) {
    const merchant = await this.getMerchantAccess(user, 'MANAGE');
    const ids = [...new Set(body.societyIds)];
    const societies = await this.prisma.society.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } });
    if (societies.length !== ids.length) throw new BadRequestException('One or more selected service areas are unavailable');
    return this.prisma.$transaction(async tx => {
      await tx.merchantSociety.updateMany({ where: { merchantId: merchant.id }, data: { enabled: false } });
      for (const societyId of ids) await tx.merchantSociety.upsert({ where: { merchantId_societyId: { merchantId: merchant.id, societyId } }, create: { merchantId: merchant.id, societyId, enabled: true }, update: { enabled: true } });
      return tx.merchantSociety.findMany({ where: { merchantId: merchant.id, enabled: true }, include: { society: true } });
    });
  }

  private async getOwnedMerchant(user: Principal) {
    if (user.role !== 'MERCHANT_ADMIN') throw new ForbiddenException('Only the merchant owner can manage staff access');
    const merchant = await this.prisma.merchant.findUnique({ where: { ownerId: user.id } });
    if (!merchant) throw new BadRequestException('Merchant profile is not registered');
    return merchant;
  }
  private async getMerchantAccess(user: Principal, permission: 'VIEW' | 'MANAGE' | 'ORDERS' | 'CATALOG' | 'INVENTORY') {
    if (user.role === 'MERCHANT_ADMIN') return this.getOwnedMerchant(user);
    if (user.role !== 'STAFF') throw new ForbiddenException();
    const membership = await this.prisma.merchantStaffAccess.findFirst({ where: { userId: user.id }, include: { merchant: true } });
    if (!membership) throw new ForbiddenException();
    const allowed = membership.role === 'MANAGER' || permission === 'VIEW' || (permission === 'ORDERS' && membership.role === 'ORDERS') || (permission === 'CATALOG' && membership.role === 'CATALOG') || (permission === 'INVENTORY' && membership.role === 'INVENTORY');
    if (!allowed) throw new ForbiddenException('Your merchant staff role does not allow this action');
    return membership.merchant;
  }
}
