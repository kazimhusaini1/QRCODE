import { PrismaService } from './prisma.service';

type RiskOrder = { customerId: string; totalPaisa: number };

export function classifyRiskIndicators(totalPaisa: number, cancelledCount: number, recentCount: number, highValueThreshold: number): string[] {
  const indicators: string[] = [];
  if (Number.isSafeInteger(highValueThreshold) && highValueThreshold > 0 && totalPaisa >= highValueThreshold) indicators.push('HIGH_VALUE');
  if (cancelledCount >= 3) indicators.push('REPEATED_CANCELLATIONS');
  if (recentCount >= 5) indicators.push('HIGH_ORDER_FREQUENCY');
  return indicators;
}

/** Explainable review flags only; never an automated restriction or ban. */
export async function attachRiskIndicators<T extends RiskOrder>(prisma: PrismaService, orders: T[]): Promise<(T & { riskIndicators: string[] })[]> {
  if (!orders.length) return orders.map(order => ({ ...order, riskIndicators: [] }));
  const customerIds = [...new Set(orders.map(order => order.customerId))];
  const now = new Date();
  const [cancellations, recentVolume] = await Promise.all([
    prisma.order.groupBy({ by: ['customerId'], where: { customerId: { in: customerIds }, createdAt: { gte: new Date(now.getTime() - 30 * 86400000) }, status: { in: ['CANCELLED', 'REJECTED'] } }, _count: { _all: true } }),
    prisma.order.groupBy({ by: ['customerId'], where: { customerId: { in: customerIds }, createdAt: { gte: new Date(now.getTime() - 24 * 3600000) } }, _count: { _all: true } }),
  ]);
  const highValueThreshold = Number(process.env.HIGH_VALUE_ORDER_PAISA ?? 1_000_000);
  return orders.map(order => {
    const cancelledCount = cancellations.find(item => item.customerId === order.customerId)?._count._all ?? 0;
    const recentCount = recentVolume.find(item => item.customerId === order.customerId)?._count._all ?? 0;
    return { ...order, riskIndicators: classifyRiskIndicators(order.totalPaisa, cancelledCount, recentCount, highValueThreshold) };
  });
}
