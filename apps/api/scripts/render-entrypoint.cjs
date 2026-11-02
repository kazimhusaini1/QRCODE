const { spawnSync, spawn } = require('node:child_process');

if (!process.env.DATABASE_URL) {
  const required = ['MYSQL_HOST', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD'];
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`Missing required database setting: ${key}`);
      process.exit(1);
    }
  }

  const user = encodeURIComponent(process.env.MYSQL_USER);
  const password = encodeURIComponent(process.env.MYSQL_PASSWORD);
  const database = encodeURIComponent(process.env.MYSQL_DATABASE);
  const port = process.env.MYSQL_PORT || '3306';
  process.env.DATABASE_URL = `mysql://${user}:${password}@${process.env.MYSQL_HOST}:${port}/${database}`;
}

try {
  const databaseUrl = new URL(process.env.DATABASE_URL);
  if (!['mysql:', 'postgres:', 'postgresql:'].includes(databaseUrl.protocol)) throw new Error();
  if (process.env.NODE_ENV === 'production' && databaseUrl.hostname.endsWith('.tidbcloud.com') && databaseUrl.searchParams.get('sslaccept') !== 'strict') {
    throw new Error('TiDB Cloud connections must use sslaccept=strict.');
  }
} catch (error) {
  console.error(error instanceof Error && error.message ? error.message : 'DATABASE_URL must be a valid MySQL or PostgreSQL connection URL.');
  process.exit(1);
}

const schemaPath = process.env.PRISMA_SCHEMA || 'prisma/schema.prisma';

async function waitForDatabase() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await prisma.$disconnect();
      return;
    } catch {
      await prisma.$disconnect().catch(() => undefined);
      if (attempt === 60) throw new Error('The database did not become ready within 120 seconds.');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

async function main() {
  await waitForDatabase();
  const migration = spawnSync(process.execPath, [
    'node_modules/prisma/build/index.js', 'migrate', 'deploy',
    '--schema', schemaPath,
  ], { cwd: '/workspace/apps/api', stdio: 'inherit', env: process.env });
  if (migration.status !== 0) process.exit(migration.status ?? 1);

  const seed = spawnSync(process.execPath, [
    'node_modules/prisma/build/index.js', 'db', 'seed',
    '--schema', schemaPath,
  ], { cwd: '/workspace/apps/api', stdio: 'inherit', env: process.env });
  if (seed.status !== 0) process.exit(seed.status ?? 1);

  const server = spawn(process.execPath, ['dist/main.js'], { cwd: '/workspace/apps/api', stdio: 'inherit', env: process.env });
  server.on('exit', code => process.exit(code ?? 1));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Render API startup failed.');
  process.exit(1);
});
