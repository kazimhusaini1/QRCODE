import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_ACCESS_SECRET must contain at least 32 characters');
  const configuredOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:3000,http://localhost:3001').split(',').map(value => value.trim()).filter(Boolean);
  const origins = process.env.NODE_ENV === 'production'
    ? configuredOrigins
    : [...new Set([...configuredOrigins, 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:8081'])];
  if (process.env.NODE_ENV === 'production' && origins.some(origin => !origin.startsWith('https://'))) throw new Error('Production WEB_ORIGIN values must use HTTPS');
  const publicSiteUrl = process.env.PUBLIC_SITE_URL;
  if (process.env.NODE_ENV === 'production' && (!publicSiteUrl || !publicSiteUrl.startsWith('https://'))) throw new Error('Production PUBLIC_SITE_URL must use HTTPS');
  const referralReward = Number(process.env.REFERRAL_REWARD_PAISA ?? 0);
  if (!Number.isSafeInteger(referralReward) || referralReward < 0) throw new Error('REFERRAL_REWARD_PAISA must be a non-negative safe integer');
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required in production');
    const demoMode = process.env.DEMO_MODE === 'true';
    const verificationRequired = process.env.REQUIRE_CONTACT_VERIFICATION === 'true';
    if (!demoMode && !verificationRequired) throw new Error('Production requires REQUIRE_CONTACT_VERIFICATION=true outside demo mode');
    if (process.env.AUTH_CHALLENGE_TEST_MODE === 'true') throw new Error('AUTH_CHALLENGE_TEST_MODE cannot be enabled in production');
    if (verificationRequired && (!process.env.RESEND_API_KEY || !process.env.AUTH_EMAIL_FROM)) throw new Error('Production email verification requires RESEND_API_KEY and AUTH_EMAIL_FROM');
    if (verificationRequired && process.env.SMS_AUTH_ENABLED !== 'false' && (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_FROM_NUMBER)) throw new Error('Production phone verification requires Twilio credentials unless SMS_AUTH_ENABLED=false');
    if (process.env.PRODUCT_UPLOADS_ENABLED !== 'false' && (!process.env.S3_ENDPOINT || !process.env.S3_BUCKET || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY || !process.env.S3_PUBLIC_BASE_URL?.startsWith('https://'))) throw new Error('Production product images require HTTPS S3-compatible storage configuration unless PRODUCT_UPLOADS_ENABLED=false');
  }
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 5');
  const port = Number(process.env.API_PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('API_PORT must be a valid TCP port');
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  const express = app.getHttpAdapter().getInstance();
  express.disable('x-powered-by');
  if (trustProxyHops > 0) express.set('trust proxy', trustProxyHops);
  app.use((request: { method?: string; path?: string }, response: { setHeader: (name: string, value: string) => void; on: (event: string, callback: () => void) => void; statusCode?: number }, next: () => void) => {
    const started = Date.now();
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    response.setHeader('Cache-Control', 'no-store');
    if (process.env.NODE_ENV === 'production') response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    response.on('finish', () => console.info(JSON.stringify({ level: 'info', event: 'http_request', method: request.method, path: request.path, status: response.statusCode, durationMs: Date.now() - started })));
    next();
  });
  app.enableCors({ origin: origins, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_API_DOCS === 'true') {
    const swagger = new DocumentBuilder().setTitle('Mahalla API').setDescription('Society-based local commerce API').setVersion('1.0').addBearerAuth().build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));
  }
  await app.listen(port, '0.0.0.0');
}
bootstrap();
