import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.society.upsert({
    where: { slug: 'park-view-city-lahore' },
    update: {},
    create: { name: 'Park View City', slug: 'park-view-city-lahore', city: 'Lahore', province: 'Punjab' },
  });
  for (const [name, slug, icon] of [
    ['Restaurants', 'restaurants', '🍽️'], ['Groceries', 'groceries', '🛒'],
    ['Bakeries', 'bakeries', '🥐'], ['Services', 'services', '✂️'],
  ]) await prisma.category.upsert({ where: { slug }, update: {}, create: { name, slug, icon } });
}

main().finally(() => prisma.$disconnect());
