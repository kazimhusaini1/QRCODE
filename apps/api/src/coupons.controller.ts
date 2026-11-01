import { BadRequestException, Body, Controller, ForbiddenException, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsInt, IsString, Matches, Min } from 'class-validator';
import { AuthGuard, CurrentUser, Principal } from './auth';
import { calculateCouponDiscount } from './coupon-policy';
import { PrismaService } from './prisma.service';

class CouponQuoteDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{3,40}$/) code!: string;
  @IsString() merchantId!: string;
  @IsString() societyId!: string;
  @IsInt() @Min(0) subtotalPaisa!: number;
}

@ApiTags('coupons')
@ApiBearerAuth()
@Controller('coupons')
@UseGuards(AuthGuard)
export class CouponsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('quote')
  async quote(@CurrentUser() user: Principal, @Body() body: CouponQuoteDto) {
    if (!['CUSTOMER', 'STAFF'].includes(user.role)) throw new ForbiddenException();
    const [coupon, merchant, society] = await Promise.all([
      this.prisma.coupon.findUnique({ where: { code: body.code.trim().toUpperCase() }, include: { societies: true } }),
      this.prisma.merchant.findFirst({ where: { id: body.merchantId, status: 'APPROVED', societyAreas: { some: { societyId: body.societyId, enabled: true } } }, select: { id: true } }),
      this.prisma.society.findFirst({ where: { id: body.societyId, isActive: true }, select: { id: true } }),
    ]);
    if (!merchant || !society) throw new BadRequestException('Merchant or society is not available');
    const now = new Date();
    if (!coupon || !coupon.isActive || coupon.startsAt > now || (coupon.endsAt && coupon.endsAt <= now)) throw new BadRequestException('Coupon is invalid or expired');
    if (coupon.merchantId && coupon.merchantId !== merchant.id) throw new BadRequestException('Coupon is not valid for this merchant');
    if (coupon.societies.length && !coupon.societies.some(item => item.societyId === society.id)) throw new BadRequestException('Coupon is not valid in this society');
    if (body.subtotalPaisa < coupon.minimumSubtotalPaisa) throw new BadRequestException('Order does not meet the coupon minimum');
    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) throw new BadRequestException('Coupon usage limit has been reached');
    if (await this.prisma.couponRedemption.count({ where: { couponId: coupon.id, userId: user.id } }) >= coupon.perUserLimit) throw new BadRequestException('You have already used this coupon the maximum number of times');
    const discountPaisa = calculateCouponDiscount({ subtotalPaisa: body.subtotalPaisa, type: coupon.discountType, value: coupon.value, maxDiscountPaisa: coupon.maxDiscountPaisa });
    return { code: coupon.code, subtotalPaisa: body.subtotalPaisa, discountPaisa, totalAfterDiscountPaisa: body.subtotalPaisa - discountPaisa, discountType: coupon.discountType, minimumSubtotalPaisa: coupon.minimumSubtotalPaisa };
  }
}
