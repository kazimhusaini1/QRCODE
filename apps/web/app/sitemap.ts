import type { MetadataRoute } from 'next';
import { apiGet, currentSociety } from './lib/marketplace';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const society = await currentSociety();
  const merchants = society ? await apiGet<{ slug: string }[]>(`merchants?society=${encodeURIComponent(society.slug)}`) ?? [] : [];
  const categories = await apiGet<{ slug: string }[]>('categories') ?? [];
  return [
    ...['', '/merchants', '/about', '/contact', '/privacy', '/terms', '/cancellation'].map(path => ({ url: `${base}${path}`, changeFrequency: 'weekly' as const, priority: path ? 0.6 : 1 })),
    ...categories.map(category => ({ url: `${base}/categories/${category.slug}`, changeFrequency: 'daily' as const, priority: 0.7 })),
    ...merchants.map(merchant => ({ url: `${base}/merchants/${merchant.slug}?society=${encodeURIComponent(society!.slug)}`, changeFrequency: 'daily' as const, priority: 0.7 })),
  ];
}
