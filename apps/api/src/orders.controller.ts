import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Headers, Injectable, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { FulfillmentType, OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, Matches, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { randomBytes } from 'node:crypto';
import { calculateOrderAmounts, canTransitionOrder } from './order-policy';
import { calculateCouponDiscount } from './coupon-policy';
import { AuthGuard, CurrentUser, Principal } from './auth';
import { PrismaService } from './prisma.service';
import { NotificationsService } from './notifications.service';
import { attachRiskIndicators } from './fraud-indicators';
import { paymentAdapterFor } from './payment-adapters';
import { isWithinOperatingHours, WeeklyHours } from './operating-hours';

class OrderLineDto { @IsString() productId!: string; @IsInt() @Min(1) quantity!: number; }
class CreateOrderDto {
  @IsString() merchantId!: string;
  @IsString() societyId!: string;
  @IsOptional() @IsString() addressId?: string;
  @IsEnum(FulfillmentType) fulfillment!: FulfillmentType;
  @IsEnum(PaymentMethod) paymentMethod!: PaymentMethod;
  @IsOptional() @IsString() @MinLength(1) instructions?: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{3,40}$/) couponCode?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => OrderLineDto) items!: OrderLineDto[];
}
class SetStatusDto { @IsEnum(OrderStatus) status!: OrderStatus; @IsOptional() @IsString() note?: string; }

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  @Get()
  async list(@CurrentUser() user: Principal) {
    const where: Prisma.OrderWhereInput = user.role === 'SUPER_ADMIN' ? {} : ['CUSTOMER', 'STAFF'].includes(user.role) ? { customerId: user.id } : { merchant: { ownerId: user.id } };
    const orders = await this.prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50, include: { items: true, statusEvents: { orderBy: { createdAt: 'asc' } }, review: true, merchant: { select: { id: true, slug: true, name: true, deliveryFeePaisa: true, acceptsDelivery: true, acceptsPickup: true } }, society: { select: { id: true, slug: true, name: true } } } });
    if (!['MERCHANT_ADMIN', 'STAFF', 'SUPER_ADMIN'].includes(user.role)) return orders;
    return attachRiskIndicators(this.prisma, orders);
  }

  @Get(':id/reorder')
  async reorder(@CurrentUser() user: Principal, @Param('id') id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true, society: { select: { id: true, slug: true, name: true, isActive: true } }, merchant: { include: { category: { select: { name: true } }, societyAreas: { where: { enabled: true }, select: { societyId: true } }, products: { where: { isAvailable: true }, include: { inventory: true } } } } } });
    if (!order || user.role !== 'SUPER_ADMIN' && order.customerId !== user.id) throw new NotFoundException('Order not found');
    if (order.merchant.status !== 'APPROVED' || !order.society.isActive || !order.merchant.societyAreas.some(area => area.societyId === order.societyId)) throw new BadRequestException('This business no longer serves the order’s society');
    const lines = order.items.flatMap(previous => {
      const product = previous.productId ? order.merchant.products.find(item => item.id === previous.productId) : undefined;
      const stock = product?.inventory?.quantity ?? 0;
      if (!product || stock < 1) return [];
      return [{ product, quantity: Math.min(previous.quantity, stock) }];
    });
    return { merchant: { id: order.merchant.id, slug: order.merchant.slug, name: order.merchant.name, description: order.merchant.description, isOpen: order.merchant.isOpen, acceptsDelivery: order.merchant.acceptsDelivery, acceptsPickup: order.merchant.acceptsPickup, deliveryFeePaisa: order.merchant.deliveryFeePaisa, minimumOrderPaisa: order.merchant.minimumOrderPaisa, estimatedDeliveryMinutes: order.merchant.estimatedDeliveryMinutes, category: order.merchant.category, products: lines.map(line => ({ ...line.product, inventory: line.product.inventory })) }, society: order.society, unavailableItemCount: order.items.length - lines.length, lines: lines.map(line => ({ productId: line.product.id, quantity: line.quantity })) };
  }

  @Get(':id')
  async detail(@CurrentUser() user: Principal, @Param('id') id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { merchant: { select: { ownerId: true } }, items: true, statusEvents: { orderBy: { createdAt: 'asc' } } } });
    if (!order) throw new NotFoundException('Order not found');
    const staffAccess = user.role === 'STAFF' ? await this.prisma.merchantStaffAccess.findUnique({ where: { userId: user.id }, select: { merchantId: true, role: true } }) : null;
    const staffCanView = staffAccess?.merchantId === order.merchantId && ['MANAGER', 'ORDERS'].includes(staffAccess.role);
    if (user.role !== 'SUPER_ADMIN' && user.id !== order.customerId && user.id !== order.merchant.ownerId && !staffCanView) throw new ForbiddenException();
    return order;
  }

  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Reuse this unique key for retries of the same checkout attempt' })
  async create(@CurrentUser() user: Principal, @Body() body: CreateOrderDto, @Headers('idempotency-key') idempotencyKey?: string) {
    if (!['CUSTOMER', 'STAFF'].includes(user.role)) throw new ForbiddenException();
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{12,128}$/.test(idempotencyKey)) throw new BadRequestException('A 12 to 128 character Idempotency-Key header is required');
    if ((body.fulfillment === 'DELIVERY') !== Boolean(body.addressId)) throw new BadRequestException('Delivery requires an address; pickup must not include one');
    if ((body.fulfillment === 'DELIVERY' && body.paymentMethod !== 'CASH_ON_DELIVERY') || (body.fulfillment === 'PICKUP' && body.paymentMethod !== 'CASH_ON_PICKUP')) throw new BadRequestException('Choose the cash payment method matching the fulfillment type');
    const quantities = new Map<string, number>();
    for (const item of body.items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    const existing = await this.prisma.order.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.customerId !== user.id) throw new ConflictException('Idempotency key is already in use');
      return this.prisma.order.findUnique({ where: { id: existing.id }, include: { items: true, statusEvents: { orderBy: { createdAt: 'asc' } } } });
    }
    let orderId: string;
    try {
    orderId = await this.prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.findFirst({ where: { id: body.merchantId, status: 'APPROVED', societyAreas: { some: { societyId: body.societyId, enabled: true } } } });
      if (!merchant) throw new BadRequestException('Merchant is not available in the selected society');
      if (!merchant.isOpen || !isWithinOperatingHours(merchant.operatingHours as WeeklyHours | null)) throw new BadRequestException('Merchant is currently closed');
      if ((body.fulfillment === 'DELIVERY' && !merchant.acceptsDelivery) || (body.fulfillment === 'PICKUP' && !merchant.acceptsPickup)) throw new BadRequestException('Fulfillment type is unavailable');
      const society = await tx.society.findFirst({ where: { id: body.societyId, isActive: true } });
      if (!society) throw new BadRequestException('Selected society is inactive');
      const address = body.addressId ? await tx.address.findFirst({ where: { id: body.addressId, userId: user.id, societyId: body.societyId } }) : null;
      if (body.addressId && !address) throw new BadRequestException('Address does not belong to the customer and selected society');
      const products = await tx.product.findMany({ where: { id: { in: [...quantities.keys()] }, merchantId: merchant.id, isAvailable: true }, include: { inventory: true } });
      if (products.length !== quantities.size) throw new BadRequestException('One or more products are unavailable or belong to another merchant');
      const deliveryFeePaisa = body.fulfillment === 'DELIVERY' ? merchant.deliveryFeePaisa : 0;
      const totals = calculateOrderAmounts(products.map(product => ({ unitPricePaisa: product.pricePaisa, quantity: quantities.get(product.id)! })), deliveryFeePaisa);
      const { subtotalPaisa } = totals;
      if (subtotalPaisa < merchant.minimumOrderPaisa) throw new BadRequestException('Order does not meet the merchant minimum');
      let coupon: Awaited<ReturnType<typeof tx.coupon.findUnique>> = null;
      let discountPaisa = 0;
      if (body.couponCode) {
        const now = new Date();
        coupon = await tx.coupon.findUnique({ where: { code: body.couponCode.trim().toUpperCase() } });
        if (!coupon || !coupon.isActive || coupon.startsAt > now || (coupon.endsAt && coupon.endsAt <= now)) throw new BadRequestException('Coupon is invalid or expired');
        if (coupon.merchantId && coupon.merchantId !== merchant.id) throw new BadRequestException('Coupon is not valid for this merchant');
        if (coupon.minimumSubtotalPaisa > subtotalPaisa) throw new BadRequestException('Order does not meet the coupon minimum');
        if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) throw new BadRequestException('Coupon usage limit has been reached');
        const societyRestriction = await tx.couponSociety.count({ where: { couponId: coupon.id } });
        if (societyRestriction && !await tx.couponSociety.findUnique({ where: { couponId_societyId: { couponId: coupon.id, societyId: society.id } } })) throw new BadRequestException('Coupon is not valid in this society');
        const priorUses = await tx.couponRedemption.count({ where: { couponId: coupon.id, userId: user.id } });
        if (priorUses >= coupon.perUserLimit) throw new BadRequestException('You have already used this coupon the maximum number of times');
        discountPaisa = calculateCouponDiscount({ subtotalPaisa, type: coupon.discountType, value: coupon.value, maxDiscountPaisa: coupon.maxDiscountPaisa });
        const claimed = await tx.coupon.updateMany({ where: { id: coupon.id, isActive: true, ...(coupon.usageLimit !== null ? { usageCount: { lt: coupon.usageLimit } } : {}) }, data: { usageCount: { increment: 1 } } });
        if (claimed.count !== 1) throw new ConflictException('Coupon has just reached its usage limit');
      }
      for (const product of products) {
        const quantity = quantities.get(product.id)!;
        if (!product.inventory || product.inventory.quantity < quantity) throw new BadRequestException(`${product.name} does not have enough stock`);
        const update = await tx.inventory.updateMany({ where: { productId: product.id, quantity: { gte: quantity } }, data: { quantity: { decrement: quantity } } });
        if (update.count !== 1) throw new BadRequestException(`${product.name} sold out during checkout`);
        await tx.inventoryMovement.create({ data: { productId: product.id, actorId: user.id, quantityDelta: -quantity, reason: 'ORDER_RESERVED', referenceId: idempotencyKey.slice(0, 64) } });
      }
      const addressSnapshot = address ? { label: address.label, recipientName: address.recipientName, phone: address.phone, line1: address.line1, line2: address.line2, instructions: address.instructions, societyId: address.societyId } : { type: 'PICKUP' };
      const order = await tx.order.create({ data: {
        number: `MH-${Date.now().toString(36).toUpperCase()}-${randomCode()}`,
        customerId: user.id, merchantId: merchant.id, societyId: society.id, addressId: address?.id, idempotencyKey,
        addressSnapshot, merchantNameSnapshot: merchant.name, fulfillment: body.fulfillment, paymentMethod: body.paymentMethod,
        paymentStatus: paymentAdapterFor(body.paymentMethod).initialStatus(),
        subtotalPaisa, discountPaisa, deliveryFeePaisa, totalPaisa: subtotalPaisa - discountPaisa + deliveryFeePaisa,
        couponId: coupon?.id, couponCodeSnapshot: coupon?.code, instructions: body.instructions,
        items: { create: products.map(product => ({ productId: product.id, productNameSnapshot: product.name, merchantNameSnapshot: merchant.name, unitPricePaisa: product.pricePaisa, quantity: quantities.get(product.id)!, lineTotalPaisa: product.pricePaisa * quantities.get(product.id)! })) },
        statusEvents: { create: { status: OrderStatus.PENDING, actorId: user.id, note: 'Order placed' } },
      } });
      if (coupon) await tx.couponRedemption.create({ data: { couponId: coupon.id, userId: user.id, orderId: order.id, discountPaisa } });
      return order.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const retried = await this.prisma.order.findUnique({ where: { idempotencyKey } });
        if (retried?.customerId === user.id) return this.prisma.order.findUnique({ where: { id: retried.id }, include: { items: true, statusEvents: { orderBy: { createdAt: 'asc' } } } });
      }
      throw error;
    }
    const created = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true, statusEvents: { orderBy: { createdAt: 'asc' } } } });
    if (created) await this.notifications.enqueueOrderStatus(created.id, created.status).catch(error => console.error('Could not queue order notification', error));
    return created;
  }

  @Post(':id/status')
  async updateStatus(@CurrentUser() user: Principal, @Param('id') id: string, @Body() body: SetStatusDto) {
    const result = await this.prisma.$transaction(async tx => {
      const order = await tx.order.findUnique({ where: { id }, include: { merchant: { select: { ownerId: true } }, items: true } });
      if (!order) throw new NotFoundException('Order not found');
      const staffAccess = user.role === 'STAFF' ? await tx.merchantStaffAccess.findUnique({ where: { userId: user.id }, select: { merchantId: true, role: true } }) : null;
      const staffCanView = staffAccess?.merchantId === order.merchantId;
      if (user.role !== 'SUPER_ADMIN' && user.id !== order.customerId && user.id !== order.merchant.ownerId && !staffCanView) throw new ForbiddenException();
      const merchantAction = ['ACCEPTED','REJECTED','PREPARING','READY_FOR_PICKUP','OUT_FOR_DELIVERY'].includes(body.status);
      const customerAction = body.status === 'CANCELLED' && order.status === 'PENDING';
      if ((body.status === 'READY_FOR_PICKUP' && order.fulfillment !== 'PICKUP') || (body.status === 'OUT_FOR_DELIVERY' && order.fulfillment !== 'DELIVERY')) throw new BadRequestException('Status does not match the order fulfillment type');
      const staffCanProcessOrders = staffCanView && (staffAccess?.role === 'MANAGER' || staffAccess?.role === 'ORDERS');
      if (merchantAction && user.id !== order.merchant.ownerId && user.role !== 'SUPER_ADMIN' && !staffCanProcessOrders) throw new ForbiddenException();
      if (body.status === 'CANCELLED' && !customerAction && user.role !== 'SUPER_ADMIN') throw new ForbiddenException();
      if (!canTransitionOrder(order.status, body.status)) throw new BadRequestException(`Cannot change order from ${order.status} to ${body.status}`);
      if (body.status === 'CANCELLED' || body.status === 'REJECTED') {
        for (const item of order.items) if (item.productId) {
          const restored = await tx.inventory.updateMany({ where: { productId: item.productId }, data: { quantity: { increment: item.quantity } } });
          if (restored.count) await tx.inventoryMovement.create({ data: { productId: item.productId, actorId: user.id, quantityDelta: item.quantity, reason: body.status === 'REJECTED' ? 'ORDER_REJECTED' : 'ORDER_CANCELLED', referenceId: order.id } });
        }
        if (order.couponId) {
          await tx.couponRedemption.deleteMany({ where: { orderId: id } });
          await tx.coupon.updateMany({ where: { id: order.couponId, usageCount: { gt: 0 } }, data: { usageCount: { decrement: 1 } } });
        }
      }
      await tx.order.update({ where: { id }, data: { status: body.status, ...(body.status === 'COMPLETED' ? { paymentStatus: paymentAdapterFor(order.paymentMethod).statusAfterHandoff() } : {}) } });
      await tx.orderStatusEvent.create({ data: { orderId: id, status: body.status, actorId: user.id, note: body.note } });
      if (body.status === 'COMPLETED') {
        const referral = await tx.referral.findUnique({ where: { referredUserId: order.customerId } });
        if (referral?.status === 'PENDING') {
          const rewardPaisa = Number(process.env.REFERRAL_REWARD_PAISA ?? 0);
          const validReward = Number.isSafeInteger(rewardPaisa) && rewardPaisa > 0;
          let rewardCouponId: string | undefined;
          if (validReward) {
            const coupon = await tx.coupon.create({ data: { code: `REF${randomCode()}`, discountType: 'FIXED_PAISE', value: rewardPaisa, usageLimit: 1, perUserLimit: 1 } });
            rewardCouponId = coupon.id;
          }
          await tx.referral.update({ where: { id: referral.id }, data: { status: validReward ? 'REWARDED' : 'QUALIFIED', qualifiedAt: new Date(), ...(rewardCouponId ? { rewardCouponId, rewardedAt: new Date() } : {}) } });
        }
      }
      return id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const updated = await this.prisma.order.findUnique({ where: { id: result }, include: { items: true, statusEvents: { orderBy: { createdAt: 'asc' } } } });
    if (updated) await this.notifications.enqueueOrderStatus(updated.id, updated.status).catch(error => console.error('Could not queue order notification', error));
    return updated;
  }
}

function randomCode() { return randomBytes(8).toString('hex').toUpperCase(); }
