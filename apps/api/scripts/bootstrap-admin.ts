import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';

const scrypt=promisify(scryptCallback);const prisma=new PrismaClient();
async function main(){
 const email=process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();const password=process.env.BOOTSTRAP_ADMIN_PASSWORD;const name=process.env.BOOTSTRAP_ADMIN_NAME?.trim();
 if(!email||!password||!name||password.length<14)throw new Error('Set BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME, and BOOTSTRAP_ADMIN_PASSWORD (at least 14 characters) for the one-time bootstrap.');
 if((await prisma.user.count({where:{role:'SUPER_ADMIN'}}))>0)throw new Error('A super administrator already exists; refusing to bootstrap another one.');
 const salt=randomBytes(16);const hash=await scrypt(password,salt,64) as Buffer;
 const user=await prisma.user.create({data:{name,email,emailVerifiedAt:new Date(),referralCode:randomBytes(10).toString('hex').toUpperCase(),passwordHash:`scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`,role:'SUPER_ADMIN'}});
 console.log(`Created initial super administrator ${user.email}. Remove bootstrap credentials from the environment now.`);
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Admin bootstrap failed');process.exitCode=1;}).finally(()=>prisma.$disconnect());
