import { BadRequestException, CanActivate, ConflictException, ExecutionContext, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { createHash, createHmac, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaService } from './prisma.service';
import { AuthDeliveryService } from './auth-delivery';
import { AuthChallengePurpose } from '@prisma/client';

const scrypt = promisify(scryptCallback);
export type Principal = { id: string; role: 'CUSTOMER' | 'MERCHANT_ADMIN' | 'STAFF' | 'SUPER_ADMIN' };
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): Principal => ctx.switchToHttp().getRequest().user);

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly delivery: AuthDeliveryService) {}

  async register(input: { name: string; phone?: string; email?: string; password: string; referralCode?: string }) {
    if (!input.phone && !input.email) throw new BadRequestException('A phone number or email is required');
    if (process.env.REQUIRE_CONTACT_VERIFICATION === 'true' && process.env.SMS_AUTH_ENABLED === 'false' && !input.email) throw new BadRequestException('Use an email address to register on this demo');
    const passwordHash = await this.hashPassword(input.password);
    try {
      const referralCode = randomBytes(10).toString('hex').toUpperCase();
      const user = await this.prisma.$transaction(async tx => {
        const referrer = input.referralCode ? await tx.user.findUnique({ where: { referralCode: input.referralCode.trim().toUpperCase() }, select: { id: true, referralCode: true } }) : null;
        if (input.referralCode && !referrer) throw new BadRequestException('Referral code is invalid');
        const created = await tx.user.create({ data: { name: input.name.trim(), phone: input.phone ? normalizePhone(input.phone) : undefined, email: input.email?.trim().toLowerCase(), passwordHash, referralCode }, select: { id: true, role: true } });
        if (referrer) await tx.referral.create({ data: { referrerId: referrer.id, referredUserId: created.id, codeSnapshot: referrer.referralCode } });
        return created;
      });
      if (process.env.REQUIRE_CONTACT_VERIFICATION === 'true') {
        const identity = input.email?.toLowerCase() ?? input.phone!;
        const delivery = await this.createChallenge(identity, 'VERIFY_CONTACT');
        return { verificationRequired: true, user, ...delivery };
      }
      return await this.issueToken(user);
    } catch(error) {
      if(typeof error==='object'&&error!==null&&'code' in error&&error.code==='P2002')throw new ConflictException('An account with that email or phone already exists');
      throw error;
    }
  }

  async login(identity: string, password: string) {
    const normalized = identity.includes('@') ? { email: identity.trim().toLowerCase() } : { OR: [{ phone: normalizePhone(identity) }, { phone: identity.trim() }] };
    const user = await this.prisma.user.findFirst({ where: normalized });
    if (!user?.passwordHash || !(await this.verifyPassword(password, user.passwordHash))) throw new UnauthorizedException('Invalid credentials');
    if (process.env.REQUIRE_CONTACT_VERIFICATION === 'true' && !user.emailVerifiedAt && !user.phoneVerifiedAt) throw new UnauthorizedException('Verify your email address or phone number before signing in');
    return this.issueToken({ id: user.id, role: user.role });
  }

  async requestVerification(identity: string) { this.requireSupportedIdentity(identity); return this.createChallenge(identity, 'VERIFY_CONTACT'); }
  async requestPasswordReset(identity: string) { this.requireSupportedIdentity(identity); return this.createChallenge(identity, 'PASSWORD_RESET'); }

  private requireSupportedIdentity(identity: string) {
    if (process.env.REQUIRE_CONTACT_VERIFICATION === 'true' && process.env.SMS_AUTH_ENABLED === 'false' && !identity.includes('@')) throw new BadRequestException('Use your email address for verification on this demo');
  }

  async verifyContact(identity: string, code: string) {
    const { user, challenge } = await this.claimChallenge(identity, code, 'VERIFY_CONTACT');
    await this.prisma.$transaction(async tx => {
      const used = await tx.authChallenge.updateMany({ where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
      if (used.count !== 1) throw new BadRequestException('This code has expired or was already used');
      await tx.user.update({ where: { id: user.id }, data: challenge.channel === 'EMAIL' ? { emailVerifiedAt: new Date() } : { phoneVerifiedAt: new Date() } });
    });
    return { verified: true };
  }

  async resetPassword(identity: string, code: string, password: string) {
    const { user, challenge } = await this.claimChallenge(identity, code, 'PASSWORD_RESET');
    const passwordHash = await this.hashPassword(password);
    await this.prisma.$transaction(async tx => {
      const used = await tx.authChallenge.updateMany({ where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
      if (used.count !== 1) throw new BadRequestException('This code has expired or was already used');
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    return { reset: true };
  }

  private async createChallenge(identity: string, purpose: AuthChallengePurpose) {
    const isEmail = identity.includes('@');
    const user = await this.prisma.user.findFirst({ where: isEmail ? { email: identity.trim().toLowerCase() } : { OR: [{ phone: normalizePhone(identity) }, { phone: identity.trim() }] }, select: { id: true, email: true, phone: true, emailVerifiedAt: true, phoneVerifiedAt: true } });
    if (!user) return { sent: true };
    const channel = isEmail ? 'EMAIL' as const : 'SMS' as const;
    if (purpose === 'VERIFY_CONTACT' && (channel === 'EMAIL' ? user.emailVerifiedAt : user.phoneVerifiedAt)) return { sent: true, alreadyVerified: true };
    const recent = await this.prisma.authChallenge.findFirst({ where: { userId: user.id, purpose, consumedAt: null, createdAt: { gt: new Date(Date.now() - 60_000) } }, select: { id: true } });
    if (recent) return { sent: true };
    await this.prisma.authChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await this.prisma.authChallenge.updateMany({ where: { userId: user.id, purpose, consumedAt: null }, data: { consumedAt: new Date() } });
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret || secret.length < 32) throw new UnauthorizedException('Authentication is not configured');
    const codeHash = createHmac('sha256', secret).update(`${user.id}:${purpose}:${code}`).digest('hex');
    const recipient = channel === 'EMAIL' ? user.email! : normalizePhone(user.phone!);
    const challenge = await this.prisma.authChallenge.create({ data: { userId: user.id, purpose, channel, recipient, codeHash, expiresAt: new Date(Date.now() + 10 * 60_000) } });
    try { await this.delivery.send(channel, recipient, code, purpose); }
    catch (error) { await this.prisma.authChallenge.delete({ where: { id: challenge.id } }); throw error; }
    return { sent: true, ...(process.env.NODE_ENV !== 'production' && process.env.AUTH_CHALLENGE_TEST_MODE === 'true' ? { testCode: code } : {}) };
  }

  private async claimChallenge(identity: string, code: string, purpose: AuthChallengePurpose) {
    if (!/^\d{6}$/.test(code)) throw new BadRequestException('The code is invalid or expired');
    const user = await this.prisma.user.findFirst({ where: identity.includes('@') ? { email: identity.trim().toLowerCase() } : { OR: [{ phone: normalizePhone(identity) }, { phone: identity.trim() }] }, select: { id: true } });
    if (!user) throw new BadRequestException('The code is invalid or expired');
    const challenge = await this.prisma.authChallenge.findFirst({ where: { userId: user.id, purpose, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: 5 } }, orderBy: { createdAt: 'desc' } });
    if (!challenge) throw new BadRequestException('The code is invalid or expired');
    const attempted = await this.prisma.authChallenge.updateMany({ where: { id: challenge.id, attempts: { lt: 5 }, consumedAt: null }, data: { attempts: { increment: 1 } } });
    if (attempted.count !== 1) throw new BadRequestException('The code is invalid or expired');
    const secret = process.env.JWT_ACCESS_SECRET!;
    const supplied = createHmac('sha256', secret).update(`${user.id}:${purpose}:${code}`).digest();
    const expected = Buffer.from(challenge.codeHash, 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new BadRequestException('The code is invalid or expired');
    return { user, challenge };
  }

  async refresh(refreshToken: string) {
    if (typeof refreshToken !== 'string' || refreshToken.length < 40 || refreshToken.length > 512) throw new UnauthorizedException('Invalid refresh token');
    const hash=createHash('sha256').update(refreshToken).digest('hex');
    const existing=await this.prisma.session.findUnique({where:{refreshTokenHash:hash},include:{user:{select:{id:true,role:true}}}});
    if(!existing||existing.revokedAt||existing.expiresAt<=new Date())throw new UnauthorizedException('Refresh token is invalid or expired');
    const nextRefresh=randomBytes(48).toString('base64url');
    const nextHash=createHash('sha256').update(nextRefresh).digest('hex');
    const rotated=await this.prisma.$transaction(async tx=>{
      const changed=await tx.session.updateMany({where:{id:existing.id,revokedAt:null,expiresAt:{gt:new Date()}},data:{revokedAt:new Date()}});
      if(changed.count!==1)throw new UnauthorizedException('Refresh token has already been used');
      await tx.session.create({data:{userId:existing.userId,refreshTokenHash:nextHash,expiresAt:new Date(Date.now()+30*24*60*60*1000)}});
      return existing.user;
    });
    return this.issueAccessToken(rotated,nextRefresh);
  }

  async revoke(refreshToken?:string){
    if(!refreshToken)return {revoked:true};
    const hash=createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.session.updateMany({where:{refreshTokenHash:hash,revokedAt:null},data:{revokedAt:new Date()}});
    return {revoked:true};
  }

  async authenticate(token: string): Promise<Principal> {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret || secret.length < 32) throw new UnauthorizedException('Authentication is not configured');
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Invalid access token');
    const signature = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
    let supplied: Buffer;
    try { supplied = Buffer.from(parts[2], 'base64url'); } catch { throw new UnauthorizedException('Invalid access token'); }
    if (signature.length !== supplied.length || !timingSafeEqual(signature, supplied)) throw new UnauthorizedException('Invalid access token');
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      if (!payload.sub || payload.exp <= Math.floor(Date.now() / 1000)) throw new Error('expired');
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, role: true, emailVerifiedAt: true, phoneVerifiedAt: true } });
      if (!user) throw new Error('missing user');
      if (process.env.REQUIRE_CONTACT_VERIFICATION === 'true' && !user.emailVerifiedAt && !user.phoneVerifiedAt) throw new Error('unverified account');
      return user;
    } catch { throw new UnauthorizedException('Invalid or expired access token'); }
  }

  private async hashPassword(password: string) {
    const salt = randomBytes(16);
    const derived = await scrypt(password, salt, 64) as Buffer;
    return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
  }

  private async verifyPassword(password: string, encoded: string) {
    const [scheme, saltValue, hashValue] = encoded.split('$');
    if (scheme !== 'scrypt' || !saltValue || !hashValue) return false;
    const expected = Buffer.from(hashValue, 'base64url');
    const actual = await scrypt(password, Buffer.from(saltValue, 'base64url'), expected.length) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private async issueToken(user: Principal) {
    const secret=process.env.JWT_ACCESS_SECRET;
    if(!secret||secret.length<32)throw new UnauthorizedException('Authentication is not configured');
    const refreshToken=randomBytes(48).toString('base64url');
    const refreshTokenHash=createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.session.create({data:{userId:user.id,refreshTokenHash,expiresAt:new Date(Date.now()+30*24*60*60*1000)}});
    return this.issueAccessToken(user,refreshToken);
  }

  private issueAccessToken(user: Principal, refreshToken: string) {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret || secret.length < 32) throw new UnauthorizedException('Authentication is not configured');
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: user.id, role: user.role, exp: Math.floor(Date.now() / 1000) + 900 })).toString('base64url');
    const input = `${header}.${payload}`;
    const signature = createHmac('sha256', secret).update(input).digest('base64url');
    return { accessToken: `${input}.${signature}`, refreshToken, tokenType: 'Bearer', expiresIn: 900, user };
  }
}

function normalizePhone(value: string) {
  const compact = value.trim().replace(/[\s()-]/g, '');
  if (/^03\d{9}$/.test(compact)) return `+92${compact.slice(1)}`;
  if (/^923\d{9}$/.test(compact)) return `+${compact}`;
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact;
  throw new BadRequestException('Enter a valid phone number in international format or Pakistan mobile format');
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) throw new UnauthorizedException();
    request.user = await this.auth.authenticate(authorization.slice(7));
    return true;
  }
}
