import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import { PrismaService } from './prisma.service';

const queueName = 'mahalla-order-notifications';
type OrderNotice = { orderId: string; status: string };

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private queue?: Queue<OrderNotice>;
  private worker?: Worker<OrderNotice>;
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const value = process.env.REDIS_URL;
    if (!value) {
      if (process.env.NODE_ENV === 'production') throw new Error('REDIS_URL is required in production');
      this.logger.warn('REDIS_URL is not set; queued notifications are disabled');
      return;
    }
    const url = new URL(value);
    const connection = {
      host: url.hostname,
      port: Number(url.port || (url.protocol === 'rediss:' ? 6380 : 6379)),
      ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
      ...(url.pathname.length > 1 ? { db: Number(url.pathname.slice(1)) } : {}),
      ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
      maxRetriesPerRequest: null,
    };
    this.queue = new Queue<OrderNotice>(queueName, { connection });
    this.worker = new Worker<OrderNotice>(queueName, job => this.deliver(job), { connection, concurrency: 8, limiter: { max: 30, duration: 1000 } });
    this.worker.on('failed', (job, error) => this.logger.error(`Notification job ${job?.id ?? 'unknown'} failed`, error.stack));
    await Promise.all([this.queue.waitUntilReady(), this.worker.waitUntilReady()]);
  }

  async enqueueOrderStatus(orderId: string, status: string) {
    if (!this.queue) return;
    await this.queue.add('order-status', { orderId, status }, {
      jobId: `order-${orderId}-${status}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }

  async onModuleDestroy() {
    await Promise.all([this.worker?.close(), this.queue?.close()]);
  }

  private async deliver(job: Job<OrderNotice>) {
    const order = await this.prisma.order.findUnique({ where: { id: job.data.orderId }, include: {
      customer: { select: { name: true, email: true, phone: true, emailVerifiedAt: true, phoneVerifiedAt: true, emailOrderNotifications: true, smsOrderNotifications: true } },
      merchant: { include: { owner: { select: { name: true, email: true, phone: true, emailVerifiedAt: true, phoneVerifiedAt: true, emailOrderNotifications: true, smsOrderNotifications: true } }, staffAccess: { where: { role: { in: ['MANAGER', 'ORDERS'] } }, include: { user: { select: { id: true, name: true, email: true, phone: true, emailVerifiedAt: true, phoneVerifiedAt: true, emailOrderNotifications: true, smsOrderNotifications: true } } } } } },
    } });
    if (!order) return;
    const title = job.data.status === 'PENDING' ? `Order ${order.number} received` : `Order ${order.number} update`;
    const customerMessage = job.data.status === 'PENDING'
      ? `Hi ${order.customer.name}, your order from ${order.merchantNameSnapshot} has been sent to the merchant.`
      : `Hi ${order.customer.name}, your order from ${order.merchantNameSnapshot} is now ${job.data.status.toLowerCase().replaceAll('_', ' ')}.`;
    await this.sendToUser(order.customer, title, customerMessage, `order-${order.id}-${job.data.status}-customer`);
    if (job.data.status === 'PENDING') {
      await this.sendToUser(order.merchant.owner, `New order ${order.number}`, `${order.customer.name} placed a new order. Open the merchant dashboard to review it.`, `order-${order.id}-PENDING-merchant`);
      for (const staff of order.merchant.staffAccess) await this.sendToUser(staff.user, `New order ${order.number}`, `${order.customer.name} placed a new order. Open the merchant dashboard to review it.`, `order-${order.id}-PENDING-staff-${staff.user.id}`);
    }
  }

  private async sendToUser(user: { name: string; email: string | null; phone: string | null; emailVerifiedAt: Date | null; phoneVerifiedAt: Date | null; emailOrderNotifications: boolean; smsOrderNotifications: boolean }, subject: string, message: string, idempotencyKey: string) {
    const requireVerified = process.env.REQUIRE_CONTACT_VERIFICATION === 'true';
    const emailEnabled = !!process.env.RESEND_API_KEY && !!process.env.AUTH_EMAIL_FROM;
    const smsEnabled = !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN && !!process.env.TWILIO_FROM_NUMBER;
    if (user.emailOrderNotifications && user.email && emailEnabled && (!requireVerified || user.emailVerifiedAt)) {
      const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ from: process.env.AUTH_EMAIL_FROM, to: [user.email], subject, text: message }), signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}`);
      return;
    }
    if (user.smsOrderNotifications && user.phone && smsEnabled && (!requireVerified || user.phoneVerifiedAt)) {
      const account = process.env.TWILIO_ACCOUNT_SID!;
      const body = new URLSearchParams({ To: toE164(user.phone), From: process.env.TWILIO_FROM_NUMBER!, Body: `${subject}. ${message}` });
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(account)}/Messages.json`, { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${account}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`SMS provider returned HTTP ${response.status}`);
      return;
    }
  }
}

function toE164(value: string) {
  const compact = value.trim().replace(/[\s()-]/g, '');
  if (/^03\d{9}$/.test(compact)) return `+92${compact.slice(1)}`;
  if (/^923\d{9}$/.test(compact)) return `+${compact}`;
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact;
  throw new Error('The user phone number cannot be sent to the SMS provider');
}
