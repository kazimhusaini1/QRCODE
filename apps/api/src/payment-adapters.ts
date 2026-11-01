import { BadRequestException } from '@nestjs/common';
import { PaymentMethod, PaymentStatus } from '@prisma/client';

/** Provider boundary: gateways must implement authorization, webhook verification, refunds, and idempotency before being registered. */
export interface PaymentAdapter {
  readonly methods: readonly PaymentMethod[];
  initialStatus(): PaymentStatus;
  statusAfterHandoff(): PaymentStatus;
}

export class CashPaymentAdapter implements PaymentAdapter {
  readonly methods = [PaymentMethod.CASH_ON_DELIVERY, PaymentMethod.CASH_ON_PICKUP] as const;
  initialStatus() { return PaymentStatus.PENDING; }
  statusAfterHandoff() { return PaymentStatus.PAID; }
}

const adapters: PaymentAdapter[] = [new CashPaymentAdapter()];

export function paymentAdapterFor(method: PaymentMethod): PaymentAdapter {
  const adapter = adapters.find(candidate => candidate.methods.includes(method));
  if (!adapter) throw new BadRequestException('No payment provider is configured for this method');
  return adapter;
}
