const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API}/${path}`, { cache: 'no-store' });
    return response.ok ? await response.json() as T : null;
  } catch { return null; }
}

export type MerchantSummary = {
  id: string; name: string; slug: string; description: string; logoUrl?: string | null; coverUrl?: string | null;
  isOpen: boolean; category: { name: string; slug: string }; estimatedDeliveryMinutes?: number | null;
  operatingHours?: Record<string,{opensAt?:string;closesAt?:string;closed:boolean}>|null;
  products?: { id: string; name: string; description: string; pricePaisa: number; imageUrl?: string | null; inventory?: { quantity: number } | null }[];
};
export type SocietySummary = { id: string; name: string; slug: string; city: string };
export const rupees = (paisa: number) => `Rs ${(paisa / 100).toLocaleString('en-PK')}`;
export async function currentSociety() {
  const societies = await apiGet<SocietySummary[]>('societies') ?? [];
  return societies.find(s => s.slug === 'park-view-city-lahore') ?? societies[0] ?? null;
}
