import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';

const scrypt = promisify(scryptCallback);
const prisma = new PrismaClient();

async function main() {
  const email = process.env.LOCAL_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.LOCAL_SUPER_ADMIN_NAME?.trim();
  const password = process.env.LOCAL_SUPER_ADMIN_PASSWORD;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || !password || password.length < 14) {
    throw new Error('A valid email, name, and password of at least 14 characters are required.');
  }

  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64) as Buffer;
  const passwordHash = `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;

  await prisma.$transaction(async tx => {
    const target = await tx.user.findUnique({ where: { email }, select: { id: true } });
    const currentAdmin = target ?? await tx.user.findFirst({ where: { role: 'SUPER_ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true } });

    if (currentAdmin) {
      await tx.user.updateMany({ where: { role: 'SUPER_ADMIN', id: { not: currentAdmin.id } }, data: { role: 'CUSTOMER' } });
      await tx.user.update({ where: { id: currentAdmin.id }, data: { email, name, passwordHash, emailVerifiedAt: new Date(), role: 'SUPER_ADMIN' } });
    } else {
      await tx.user.create({ data: { email, name, passwordHash, emailVerifiedAt: new Date(), referralCode: randomBytes(10).toString('hex').toUpperCase(), role: 'SUPER_ADMIN' } });
    }
  });

  console.log(`Local super-admin account is ready for ${email}. Sign in at http://localhost:3001/account, then open /admin.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Could not configure the local super-admin account.');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
