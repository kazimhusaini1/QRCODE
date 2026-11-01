import { Controller, Get, NotFoundException, Param, Query, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PrismaService } from './prisma.service';
import { MarketplaceCacheService } from './marketplace-cache.service';
import { isWithinOperatingHours, WeeklyHours } from './operating-hours';

@ApiTags('marketplace')
@Controller()
export class MarketplaceController {
  constructor(private readonly prisma: PrismaService, private readonly cache: MarketplaceCacheService) {}

  @Get('health')
  @ApiOperation({ summary: 'Service health check' })
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    const redis = await this.cache.health();
    if (process.env.NODE_ENV === 'production' && redis !== 'ready') throw new ServiceUnavailableException('Redis is unavailable');
    return { status: 'ok', service: 'mahalla-api', database: 'ready', redis };
  }

  @Get('societies')
  @ApiOperation({ summary: 'List active societies' })
  societies() { return this.cache.remember('societies', 300, () => this.prisma.society.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, city: true, province: true } })); }

  @Get('categories')
  @ApiOperation({ summary: 'List active merchant categories' })
  categories() { return this.cache.remember('categories', 300, () => this.prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, slug: true, icon: true } })); }

  @Get('merchants')
  @ApiOperation({ summary: 'Discover approved merchants eligible for a society' })
  @ApiQuery({ name: 'society', required: true, description: 'Society slug, for example park-view-city-lahore' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'q', required: false })
  async merchants(@Query('society') societySlug?: string, @Query('category') categorySlug?: string, @Query('q') q?: string) {
    if (!societySlug) throw new NotFoundException('A society is required to discover merchants');
    const key = `merchants:${JSON.stringify([societySlug, categorySlug ?? '', q?.trim() ?? ''])}`;
    return this.cache.remember(key, 15, async () => {
      const society = await this.prisma.society.findUnique({ where: { slug: societySlug }, select: { id: true } });
      if (!society) throw new NotFoundException('Society not found');
      const merchants = await this.prisma.merchant.findMany({
      where: {
        status: 'APPROVED',
        societyAreas: { some: { societyId: society.id, enabled: true } },
        ...(categorySlug ? { category: { slug: categorySlug, isActive: true } } : {}),
        ...(q?.trim() ? { name: { contains: q.trim() } } : {}),
      },
      orderBy: [{ isOpen: 'desc' }, { name: 'asc' }], take: 50,
      select: { id: true, name: true, slug: true, description: true, logoUrl: true, coverUrl: true, isOpen: true, operatingHours: true, acceptsDelivery: true, acceptsPickup: true, minimumOrderPaisa: true, deliveryFeePaisa: true, estimatedDeliveryMinutes: true, category: { select: { name: true, slug: true } }, products: { where: { isAvailable: true }, orderBy: { name: 'asc' }, take: 6, select: { id: true, name: true, description: true, pricePaisa: true, imageUrl: true, inventory: { select: { quantity: true } } } } },
      });
      return merchants.map(merchant => ({ ...merchant, isOpen: merchant.isOpen && isWithinOperatingHours(merchant.operatingHours as WeeklyHours | null) }));
    });
  }

  @Get('merchants/:slug')
  @ApiOperation({ summary: 'Load a merchant shared catalog for an eligible society' })
  @ApiQuery({ name: 'society', required: true })
  async merchant(@Param('slug') slug: string, @Query('society') societySlug?: string) {
    if (!societySlug) throw new NotFoundException('A society is required to view a merchant');
    return this.cache.remember(`merchant:${JSON.stringify([slug, societySlug])}`, 15, async () => {
    const merchant = await this.prisma.merchant.findFirst({
      where: { slug, status: 'APPROVED', societyAreas: { some: { enabled: true, society: { slug: societySlug, isActive: true } } } },
      select: {
        id: true, name: true, slug: true, description: true, phone: true, logoUrl: true, coverUrl: true,
        isOpen: true, acceptsDelivery: true, acceptsPickup: true, minimumOrderPaisa: true,
        deliveryFeePaisa: true, estimatedDeliveryMinutes: true, operatingHours: true, category: { select: { name: true, slug: true } },
        products: { where: { isAvailable: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, description: true, imageUrl: true, pricePaisa: true, inventory: { select: { quantity: true } } } },
      },
    });
    if (!merchant) throw new NotFoundException('Merchant not found in the selected society');
    return { ...merchant, isOpen: merchant.isOpen && isWithinOperatingHours(merchant.operatingHours as WeeklyHours | null) };
    });
  }

  @Get('merchants/:slug/reviews')
  @ApiOperation({ summary: 'List published verified-purchase reviews and rating summary' })
  async reviews(@Param('slug') slug: string) {
    return this.cache.remember(`merchant-reviews:${slug}`, 30, async () => {
    const merchant = await this.prisma.merchant.findFirst({ where: { slug, status: 'APPROVED' }, select: { id: true } });
    if (!merchant) throw new NotFoundException('Merchant not found');
    const [items, summary] = await Promise.all([
      this.prisma.review.findMany({ where: { merchantId: merchant.id, isPublished: true }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, rating: true, comment: true, createdAt: true } }),
      this.prisma.review.aggregate({ where: { merchantId: merchant.id, isPublished: true }, _avg: { rating: true }, _count: { _all: true } }),
    ]);
    return { averageRating: summary._avg.rating ?? null, reviewCount: summary._count._all, items };
    });
  }
}
