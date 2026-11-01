import { OrderStatus } from '@prisma/client';

const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'CANCELLED'],
  READY_FOR_PICKUP: ['COMPLETED'],
  OUT_FOR_DELIVERY: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus) {
  return transitions[from].includes(to);
}

export function calculateOrderAmounts(lines: Array<{ unitPricePaisa: number; quantity: number }>, deliveryFeePaisa: number) {
  if (!Number.isSafeInteger(deliveryFeePaisa) || deliveryFeePaisa < 0) throw new RangeError('Delivery fee must be a non-negative integer amount in paisa');
  const subtotalPaisa = lines.reduce((sum, line) => {
    if (!Number.isSafeInteger(line.unitPricePaisa) || line.unitPricePaisa < 0 || !Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new RangeError('Order lines require non-negative integer paisa and positive integer quantity');
    const next = sum + line.unitPricePaisa * line.quantity;
    if (!Number.isSafeInteger(next)) throw new RangeError('Order subtotal exceeds the supported amount');
    return next;
  }, 0);
  const totalPaisa = subtotalPaisa + deliveryFeePaisa;
  if (!Number.isSafeInteger(totalPaisa)) throw new RangeError('Order total exceeds the supported amount');
  return { subtotalPaisa, discountPaisa: 0, deliveryFeePaisa, totalPaisa };
}
