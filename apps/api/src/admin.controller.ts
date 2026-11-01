import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, Matches } from 'class-validator';
import { CouponDiscountType, MerchantStatus, SupportTicketStatus } from '@prisma/client';
import { AuthGuard, CurrentUser, Principal } from './auth';
import { PrismaService } from './prisma.service';
import { attachRiskIndicators } from './fraud-indicators';

class ReviewMerchantDto { @IsEnum(MerchantStatus) status!: MerchantStatus; }
class CategoryDto { @IsString() name!: string; @IsString() slug!: string; @IsOptional() @IsString() icon?: string; }
class SocietyDto { @IsString() name!: string; @IsString() slug!: string; @IsString() city!: string; @IsString() province!: string; }
class UpdateCategoryDto { @IsOptional() @IsString() name?: string; @IsOptional() @IsString() slug?: string; @IsOptional() @IsString() icon?: string; @IsOptional() @IsBoolean() isActive?: boolean; }
class UpdateSocietyDto { @IsOptional() @IsString() name?: string; @IsOptional() @IsString() slug?: string; @IsOptional() @IsString() city?: string; @IsOptional() @IsString() province?: string; @IsOptional() @IsBoolean() isActive?: boolean; }
class CreateCouponDto {
  @IsString() @MinLength(3) @MaxLength(40) @Matches(/^[A-Za-z0-9_-]+$/) code!: string;
  @IsEnum(CouponDiscountType) discountType!: CouponDiscountType;
  @IsInt() @Min(1) value!: number;
  @IsOptional() @IsInt() @Min(1) maxDiscountPaisa?: number;
  @IsOptional() @IsInt() @Min(0) minimumSubtotalPaisa?: number;
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsString() endsAt?: string;
  @IsOptional() @IsInt() @Min(1) usageLimit?: number;
  @IsOptional() @IsInt() @Min(1) perUserLimit?: number;
  @IsOptional() @IsString() merchantId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) societyIds?: string[];
}

function csvCell(value: string) {
  const safe = /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
class CouponStatusDto { @IsBoolean() isActive!: boolean; }
class ReviewStatusDto { @IsBoolean() isPublished!: boolean; }
class SupportTicketUpdateDto { @IsOptional() @IsEnum(SupportTicketStatus) status?: SupportTicketStatus; @IsOptional() @IsString() @MaxLength(5000) response?: string; }

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(AuthGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  async overview(@CurrentUser() user: Principal) {
    this.requireAdmin(user);
    const [customers, merchants, pendingMerchants, orders, orderStatuses] = await Promise.all([
      this.prisma.user.count({ where: { role: 'CUSTOMER' } }),
      this.prisma.merchant.count(),
      this.prisma.merchant.count({ where: { status: 'PENDING' } }),
      this.prisma.order.count(),
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return { customers, merchants, pendingMerchants, orders, orderStatuses: Object.fromEntries(orderStatuses.map(x => [x.status, x._count._all])) };
  }

  @Get('reports')
  async reports(@CurrentUser() user: Principal, @Query('from') from?: string, @Query('to') to?: string) {
    this.requireAdmin(user);
    return this.buildReport(from, to);
  }

  @Get('reports/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="mahalla-report.csv"')
  async exportReport(@CurrentUser() user: Principal, @Query('from') from?: string, @Query('to') to?: string) {
    this.requireAdmin(user);
    const report = await this.buildReport(from, to);
    const rows: string[][] = [['Report', 'Name', 'Orders', 'Completed orders', 'Cancelled orders', 'Completed revenue (paisa)']];
    for (const row of report.societies) rows.push(['Society', row.name, String(row.orders), String(row.completedOrders), String(row.cancelledOrders), String(row.revenuePaisa)]);
    for (const row of report.merchants) rows.push(['Merchant', row.name, String(row.orders), String(row.completedOrders), String(row.cancelledOrders), String(row.revenuePaisa)]);
    return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
  }

  private async buildReport(from?: string, to?: string) {
    const end = to ? new Date(to) : new Date();
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) end.setUTCDate(end.getUTCDate() + 1);
    const start = from ? new Date(from) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end || end.getTime() - start.getTime() > 366 * 24 * 60 * 60 * 1000) throw new BadRequestException('Choose a valid report range up to 366 days');
    const range = { createdAt: { gte: start, lt: end } };
    const completedRange = { ...range, status: 'COMPLETED' as const };
    const [orders, completed, cancelled, revenue, societyOrders, societyCompleted, societyCancelled, merchantOrders, merchantCompleted, merchantCancelled, merchantRevenue] = await Promise.all([
      this.prisma.order.count({ where: range }),
      this.prisma.order.count({ where: completedRange }),
      this.prisma.order.count({ where: { ...range, status: { in: ['CANCELLED', 'REJECTED'] } } }),
      this.prisma.order.aggregate({ where: completedRange, _sum: { totalPaisa: true } }),
      this.prisma.order.groupBy({ by: ['societyId'], where: range, _count: { _all: true } }),
      this.prisma.order.groupBy({ by: ['societyId'], where: completedRange, _count: { _all: true }, _sum: { totalPaisa: true } }),
      this.prisma.order.groupBy({ by: ['societyId'], where: { ...range, status: { in: ['CANCELLED', 'REJECTED'] } }, _count: { _all: true } }),
      this.prisma.order.groupBy({ by: ['merchantId'], where: range, _count: { _all: true } }),
      this.prisma.order.groupBy({ by: ['merchantId'], where: completedRange, _count: { _all: true } }),
      this.prisma.order.groupBy({ by: ['merchantId'], where: { ...range, status: { in: ['CANCELLED', 'REJECTED'] } }, _count: { _all: true } }),
      this.prisma.order.groupBy({ by: ['merchantId'], where: completedRange, _sum: { totalPaisa: true } }),
    ]);
    const societyIds = [...new Set(societyOrders.map(row => row.societyId))];
    const merchantIds = [...new Set(merchantOrders.map(row => row.merchantId))];
    const [societyNames, merchantNames] = await Promise.all([
      this.prisma.society.findMany({ where: { id: { in: societyIds } }, select: { id: true, name: true } }),
      this.prisma.merchant.findMany({ where: { id: { in: merchantIds } }, select: { id: true, name: true } }),
    ]);
    const mapRows = (ids: string[], names: { id: string; name: string }[], counts: { societyId?: string; merchantId?: string; _count: { _all: number } }[], completions: { societyId?: string; merchantId?: string; _count: { _all: number }; _sum?: { totalPaisa: number | null } }[], cancellations: { societyId?: string; merchantId?: string; _count: { _all: number } }[], revenueRows: { societyId?: string; merchantId?: string; _sum: { totalPaisa: number | null } }[]) => ids.map(id => ({ id, name: names.find(item => item.id === id)?.name ?? 'Removed', orders: counts.find(row => row.societyId === id || row.merchantId === id)?._count._all ?? 0, completedOrders: completions.find(row => row.societyId === id || row.merchantId === id)?._count._all ?? 0, cancelledOrders: cancellations.find(row => row.societyId === id || row.merchantId === id)?._count._all ?? 0, revenuePaisa: revenueRows.find(row => row.societyId === id || row.merchantId === id)?._sum.totalPaisa ?? 0 })).sort((a,b) => b.revenuePaisa-a.revenuePaisa);
    return { from: start.toISOString(), to: end.toISOString(), summary: { orders, completedOrders: completed, cancelledOrders: cancelled, completedRevenuePaisa: revenue._sum.totalPaisa ?? 0 }, societies: mapRows(societyIds, societyNames, societyOrders, societyCompleted, societyCancelled, societyCompleted), merchants: mapRows(merchantIds, merchantNames, merchantOrders, merchantCompleted, merchantCancelled, merchantRevenue) };
  }

  @Get('merchants')
  merchants(@CurrentUser() user: Principal) { this.requireAdmin(user); return this.prisma.merchant.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { category: true, societyAreas: { include: { society: true } } } }); }

  @Get('orders')
  async orders(@CurrentUser() user: Principal) { this.requireAdmin(user); const orders = await this.prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { items: true, statusEvents: { orderBy: { createdAt: 'asc' } } } }); return attachRiskIndicators(this.prisma, orders); }

  @Get('users')
  users(@CurrentUser() user: Principal) { this.requireAdmin(user); return this.prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true, activeSociety: { select: { name: true } } } }); }

  @Get('coupons')
  coupons(@CurrentUser() user: Principal) { this.requireAdmin(user); return this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { societies: { include: { society: { select: { id: true, name: true } } } }, merchant: { select: { id: true, name: true } } } }); }

  @Post('coupons')
  async createCoupon(@CurrentUser() user: Principal, @Body() body: CreateCouponDto) {
    this.requireAdmin(user);
    if (body.discountType === 'PERCENT_BPS' && body.value > 10_000) throw new BadRequestException('Percentage coupons cannot exceed 100%');
    const startsAt = body.startsAt ? new Date(body.startsAt) : new Date();
    const endsAt = body.endsAt ? new Date(body.endsAt) : undefined;
    if (!Number.isFinite(startsAt.getTime()) || (endsAt && (!Number.isFinite(endsAt.getTime()) || endsAt <= startsAt))) throw new BadRequestException('Coupon dates are invalid');
    return this.prisma.coupon.create({ data: {
      code: body.code.toUpperCase(), discountType: body.discountType, value: body.value,
      maxDiscountPaisa: body.maxDiscountPaisa, minimumSubtotalPaisa: body.minimumSubtotalPaisa,
      startsAt, endsAt, usageLimit: body.usageLimit, perUserLimit: body.perUserLimit,
      merchant: body.merchantId ? { connect: { id: body.merchantId } } : undefined,
      societies: body.societyIds?.length ? { create: body.societyIds.map(societyId => ({ society: { connect: { id: societyId } } })) } : undefined,
    }, include: { societies: { include: { society: true } }, merchant: true } });
  }

  @Patch('coupons/:id')
  async updateCoupon(@CurrentUser() user: Principal, @Param('id') id: string, @Body() body: CouponStatusDto) {
    this.requireAdmin(user);
    const result = await this.prisma.coupon.updateMany({ where: { id }, data: { isActive: body.isActive } });
    if (!result.count) throw new NotFoundException('Coupon not found');
    return this.prisma.coupon.findUnique({ where: { id } });
  }

  @Get('reviews')
  reviews(@CurrentUser() user: Principal) { this.requireAdmin(user); return this.prisma.review.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { merchant: { select: { id: true, name: true } }, user: { select: { name: true } }, order: { select: { number: true } } } }); }

  @Get('referrals')
  async referrals(@CurrentUser() user: Principal) {
    this.requireAdmin(user);
    const [pending, qualified, rewarded, recent] = await Promise.all([
      this.prisma.referral.count({ where: { status: 'PENDING' } }),
      this.prisma.referral.count({ where: { status: 'QUALIFIED' } }),
      this.prisma.referral.count({ where: { status: 'REWARDED' } }),
      this.prisma.referral.findMany({ orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, status: true, codeSnapshot: true, createdAt: true, qualifiedAt: true, rewardedAt: true, referrer: { select: { id: true, name: true } }, referredUser: { select: { id: true, name: true } } } }),
    ]);
    return { pending, qualified, rewarded, recent };
  }

  @Get('audit-events')
  auditEvents(@CurrentUser() user: Principal) {
    this.requireAdmin(user);
    return this.prisma.auditEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { actor: { select: { id: true, name: true, role: true } } } });
  }

  @Get('support-tickets')
  supportTickets(@CurrentUser() user: Principal) {
    this.requireAdmin(user);
    return this.prisma.supportTicket.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 200, include: { customer: { select: { id: true, name: true, email: true, phone: true } }, order: { select: { id: true, number: true, totalPaisa: true, status: true } } } });
  }

  @Patch('support-tickets/:id')
  async updateSupportTicket(@CurrentUser() user: Principal, @Param('id') id: string, @Body() body: SupportTicketUpdateDto) {
    this.requireAdmin(user);
    if (!Object.keys(body).length) throw new BadRequestException('Provide a status or response');
    const result = await this.prisma.supportTicket.updateMany({ where: { id }, data: { ...body, response: body.response?.trim() } });
    if (!result.count) throw new NotFoundException('Support ticket not found');
    return this.prisma.supportTicket.findUnique({ where: { id }, include: { customer: { select: { id: true, name: true } }, order: { select: { id: true, number: true } } } });
  }

  @Patch('reviews/:id')
  async updateReview(@CurrentUser() user: Principal, @Param('id') id: string, @Body() body: ReviewStatusDto) {
    this.requireAdmin(user);
    const result = await this.prisma.review.updateMany({ where: { id }, data: { isPublished: body.isPublished } });
    if (!result.count) throw new NotFoundException('Review not found');
    return this.prisma.review.findUnique({ where: { id } });
  }

  @Get('categories')
  categories(@CurrentUser() user: Principal) { this.requireAdmin(user); return this.prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }); }

  @Post('categories')
  createCategory(@CurrentUser() user: Principal, @Body() body: CategoryDto) { this.requireAdmin(user); return this.prisma.category.create({ data: body }); }

  @Patch('categories/:id')
  async updateCategory(@CurrentUser() user: Principal, @Param('id') id: string, @Body() body: UpdateCategoryDto) {
    this.requireAdmin(user);
    const result = await this.prisma.category.updateMany({ where: { id }, data: body });
    if (!result.count) throw new NotFoundException('Category not found');
    return this.prisma.category.findUnique({ where: { id } });
  }

  @Get('societies')
  societies(@CurrentUser() user: Principal) { this.requireAdmin(user); return this.prisma.society.findMany({ orderBy: { name: 'asc' } }); }

  @Post('societies')
  createSociety(@CurrentUser() user: Principal, @Body() body: SocietyDto) { this.requireAdmin(user); return this.prisma.society.create({ data: body }); }

  @Patch('societies/:id')
  async updateSociety(@CurrentUser() user: Principal, @Param('id') id: string, @Body() body: UpdateSocietyDto) {
    this.requireAdmin(user);
    const result = await this.prisma.society.updateMany({ where: { id }, data: body });
    if (!result.count) throw new NotFoundException('Society not found');
    return this.prisma.society.findUnique({ where: { id } });
  }

  @Patch('merchants/:id/status')
  async reviewMerchant(@CurrentUser() user: Principal, @Param('id') id: string, @Body() body: ReviewMerchantDto) {
    this.requireAdmin(user);
    const updated = await this.prisma.merchant.updateMany({ where: { id }, data: { status: body.status } });
    if (updated.count !== 1) throw new NotFoundException('Merchant not found');
    return this.prisma.merchant.findUnique({ where: { id }, include: { societyAreas: { include: { society: true } } } });
  }

  private requireAdmin(user: Principal) { if (user.role !== 'SUPER_ADMIN') throw new ForbiddenException(); }
}
