import Link from 'next/link';
import MerchantDashboard from './panel';
import { apiGet, SocietySummary } from '../lib/marketplace';

export const dynamic = 'force-dynamic';

export default async function MerchantPage() {
  const societies=await apiGet<SocietySummary[]>('societies')??[];
  const categories=await apiGet<{id:string;name:string}[]>('categories')??[];
  return <main className="content-page"><Link href="/" className="back-link">← mahalla</Link><div className="eyebrow muted">YOUR LOCAL BUSINESS, IN ONE PLACE</div><h1 className="page-title">Merchant <em>studio.</em></h1><p className="page-intro">Manage your shared catalog, central stock, service areas and incoming orders.</p><MerchantDashboard societies={societies} categories={categories}/></main>;
}
