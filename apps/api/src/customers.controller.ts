import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AuthGuard, CurrentUser, Principal } from './auth';
import { PrismaService } from './prisma.service';

class AddressDto {
  @IsString() @MinLength(2) label!: string;
  @IsString() @MinLength(2) recipientName!: string;
  @IsString() phone!: string;
  @IsString() @MinLength(2) line1!: string;
  @IsOptional() @IsString() line2?: string;
  @IsOptional() @IsString() instructions?: string;
  @IsString() societyId!: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
class SocietyDto { @IsString() societyId!: string; }
class UpdateProfileDto { @IsString() @MinLength(2) @MaxLength(100) name!: string; }
class NotificationPreferencesDto { @IsOptional() @IsBoolean() emailOrderNotifications?: boolean; @IsOptional() @IsBoolean() smsOrderNotifications?: boolean; }
class ReviewDto { @IsInt() @Min(1) @Max(5) rating!: number; @IsOptional() @IsString() @MaxLength(2000) comment?: string; }
class SupportTicketDto { @IsString() @MinLength(3) @MaxLength(160) subject!: string; @IsString() @MinLength(10) @MaxLength(5000) message!: string; @IsOptional() @IsString() orderId?: string; }

@ApiTags('customer')
@ApiBearerAuth()
@Controller('me')
@UseGuards(AuthGuard)
export class CustomersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async profile(@CurrentUser() user: Principal) {
    return this.prisma.user.findUnique({ where: { id: user.id }, select: { id: true, name: true, phone: true, email: true, role: true, emailOrderNotifications: true, smsOrderNotifications: true, activeSociety: { select: { id: true, name: true, slug: true, city: true } }, createdAt: true } });
  }

  @Get('profile')
  async profileForWeb(@CurrentUser() user: Principal) { return this.profile(user); }

  @Patch('notification-preferences')
  async updateNotificationPreferences(@CurrentUser() user: Principal, @Body() body: NotificationPreferencesDto) {
    if (!['CUSTOMER', 'STAFF'].includes(user.role)) throw new ForbiddenException();
    if (!Object.keys(body).length) throw new BadRequestException('Choose at least one notification preference');
    return this.prisma.user.update({ where: { id: user.id }, data: body, select: { emailOrderNotifications: true, smsOrderNotifications: true } });
  }

  @Patch()
  async updateProfile(@CurrentUser() user: Principal, @Body() body: UpdateProfileDto) {
    if (!['CUSTOMER', 'STAFF'].includes(user.role)) throw new ForbiddenException();
    return this.prisma.user.update({ where: { id: user.id }, data: { name: body.name.trim() }, select: { id: true, name: true, phone: true, email: true, role: true, emailOrderNotifications: true, smsOrderNotifications: true, activeSociety: { select: { id: true, name: true, slug: true, city: true } }, createdAt: true } });
  }

  @Patch('profile')
  async updateProfileFromWeb(@CurrentUser() user: Principal, @Body() body: UpdateProfileDto) {
    return this.updateProfile(user, body);
  }

  @Get('referrals')
  async referrals(@CurrentUser() user: Principal) {
    if (!['CUSTOMER', 'STAFF'].includes(user.role)) throw new ForbiddenException();
    const account = await this.prisma.user.findUnique({ where: { id: user.id }, select: { referralCode: true } });
    if (!account) throw new NotFoundException('Account not found');
    const [sent, received] = await Promise.all([
      this.prisma.referral.findMany({ where: { referrerId: user.id }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, status: true, createdAt: true, qualifiedAt: true, rewardedAt: true, rewardCoupon: { select: { code: true, value: true, discountType: true, isActive: true } } } }),
      this.prisma.referral.findUnique({ where: { referredUserId: user.id }, select: { status: true, codeSnapshot: true, rewardedAt: true } }),
    ]);
    const site = (process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    return { referralCode: account.referralCode, inviteLink: `${site}/account?ref=${encodeURIComponent(account.referralCode)}`, sent, received, rewardEnabled: Number(process.env.REFERRAL_REWARD_PAISA ?? 0) > 0 };
  }

  @Get('support-tickets')
  async supportTickets(@CurrentUser() user: Principal) {
    if (!['CUSTOMER', 'STAFF'].includes(user.role)) throw new ForbiddenException();
    return this.prisma.supportTicket.findMany({ where: { customerId: user.id }, orderBy: { createdAt: 'desc' }, take: 100, include: { order: { select: { id: true, number: true } } } });
  }

  @Post('support-tickets')
  async createSupportTicket(@CurrentUser() user: Principal, @Body() body: SupportTicketDto) {
    if (!['CUSTOMER', 'STAFF'].includes(user.role)) throw new ForbiddenException();
    if (body.orderId && !await this.prisma.order.findFirst({ where: { id: body.orderId, customerId: user.id }, select: { id: true } })) throw new NotFoundException('Order not found');
    return this.prisma.supportTicket.create({ data: { customerId: user.id, orderId: body.orderId, subject: body.subject.trim(), message: body.message.trim() }, include: { order: { select: { id: true, number: true } } } });
  }

  @Get('favorites')
  async favorites(@CurrentUser() user: Principal) {
    if (!['CUSTOMER', 'STAFF'].includes(user.role)) throw new ForbiddenException();
    return this.prisma.favorite.findMany({ where: { userId: user.id, merchant: { status: 'APPROVED' } }, orderBy: { createdAt: 'desc' }, include: { merchant: { select: { id: true, name: true, slug: true, description: true, logoUrl: true, coverUrl: true, isOpen: true, category: { select: { name: true } } } } } });
  }

  @Post('favorites/:merchantId')
  async addFavorite(@CurrentUser() user: Principal, @Param('merchantId') merchantId: string) {
    if (!['CUSTOMER', 'STAFF'].includes(user.role)) throw new ForbiddenException();
    const merchant = await this.prisma.merchant.findFirst({ where: { id: merchantId, status: 'APPROVED' }, select: { id: true } });
    if (!merchant) throw new NotFoundException('Business not found');
    return this.prisma.favorite.upsert({ where: { userId_merchantId: { userId: user.id, merchantId } }, create: { userId: user.id, merchantId }, update: {} });
  }

  @Delete('favorites/:merchantId')
  async removeFavorite(@CurrentUser() user: Principal, @Param('merchantId') merchantId: string) {
    if (!['CUSTOMER', 'STAFF'].includes(user.role)) throw new ForbiddenException();
    await this.prisma.favorite.deleteMany({ where: { userId: user.id, merchantId } });
    return { removed: true };
  }

  @Patch('society')
  async setSociety(@CurrentUser() user: Principal, @Body() body: SocietyDto) {
    if (!['CUSTOMER', 'STAFF'].includes(user.role)) throw new ForbiddenException();
    const society = await this.prisma.society.findFirst({ where: { id: body.societyId, isActive: true } });
    if (!society) throw new NotFoundException('Active society not found');
    return this.prisma.user.update({ where: { id: user.id }, data: { activeSocietyId: society.id }, select: { id: true, activeSociety: { select: { id: true, name: true, slug: true } } } });
  }

  @Get('addresses')
  async addresses(@CurrentUser() user: Principal) {
    return this.prisma.address.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] });
  }

  @Post('addresses')
  async createAddress(@CurrentUser() user: Principal, @Body() body: AddressDto) {
    if (!['CUSTOMER', 'STAFF'].includes(user.role)) throw new ForbiddenException();
    const society = await this.prisma.society.findFirst({ where: { id: body.societyId, isActive: true } });
    if (!society) throw new BadRequestException('Selected society is unavailable');
    return this.prisma.$transaction(async tx => {
      if (body.isDefault) await tx.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
      const address = await tx.address.create({ data: { ...body, userId: user.id, latitude: body.latitude, longitude: body.longitude } });
      if (!await tx.user.findFirst({ where: { id: user.id, activeSocietyId: { not: null } } })) await tx.user.update({ where: { id: user.id }, data: { activeSocietyId: society.id } });
      return address;
    });
  }

  @Patch('addresses/:id')
  async updateAddress(@CurrentUser() user: Principal, @Param('id') id: string, @Body() body: AddressDto) {
    const exists = await this.prisma.address.findFirst({ where: { id, userId: user.id } });
    if (!exists) throw new NotFoundException('Address not found');
    const society = await this.prisma.society.findFirst({ where: { id: body.societyId, isActive: true } });
    if (!society) throw new BadRequestException('Selected society is unavailable');
    return this.prisma.$transaction(async tx => {
      if (body.isDefault) await tx.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
      return tx.address.update({ where: { id }, data: body });
    });
  }

  @Delete('addresses/:id')
  async deleteAddress(@CurrentUser() user: Principal, @Param('id') id: string) {
    const exists = await this.prisma.address.findFirst({ where: { id, userId: user.id } });
    if (!exists) throw new NotFoundException('Address not found');
    await this.prisma.address.delete({ where: { id } });
    return { deleted: true };
  }

  @Post('orders/:orderId/review')
  async reviewOrder(@CurrentUser() user: Principal, @Param('orderId') orderId: string, @Body() body: ReviewDto) {
    if (!['CUSTOMER', 'STAFF'].includes(user.role)) throw new ForbiddenException();
    const order = await this.prisma.order.findFirst({ where: { id: orderId, customerId: user.id }, select: { id: true, merchantId: true, status: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'COMPLETED') throw new BadRequestException('You can review an order after it is completed');
    return this.prisma.review.upsert({
      where: { orderId },
      create: { orderId, userId: user.id, merchantId: order.merchantId, rating: body.rating, comment: body.comment?.trim() || null },
      update: { rating: body.rating, comment: body.comment?.trim() || null },
    });
  }
}
