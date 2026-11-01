import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuditRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditRetentionService.name);
  private timer?: NodeJS.Timeout;
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const days = Number(process.env.AUDIT_RETENTION_DAYS ?? 365);
    if (!Number.isInteger(days) || days < 30 || days > 3650) throw new Error('AUDIT_RETENTION_DAYS must be an integer between 30 and 3650');
    await this.prune(days);
    this.timer = setInterval(() => void this.prune(days), 24 * 60 * 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private async prune(days: number) {
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const result = await this.prisma.auditEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
      if (result.count) this.logger.log(`Removed ${result.count} expired audit events`);
    } catch (error) { this.logger.error('Could not apply audit event retention', error instanceof Error ? error.stack : undefined); }
  }
}
