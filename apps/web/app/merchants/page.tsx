import Link from 'next/link';
import { apiGet, currentSociety, MerchantSummary, rupees } from '../lib/marketplace';
import FavoriteToggle from './favorite-toggle';

export const dynamic = 'force-dynamic';

export default async function MerchantsPage({ searchParams }: { searchParams: { q?: string; category?: string } }) {
  const society = await currentSociety();
  const query = new URLSearchParams({ society: society?.slug ?? 'park-view-city-lahore' });
  if (searchParams.q) query.set('q', searchParams.q);
  if (searchParams.category) query.set('category', searchParams.category);
  const merchants = await apiGet<MerchantSummary[]>(`merchants?${query}`) ?? [];
  return <main className="content-page"><Link href="/" className="back-link">← mahalla</Link><div className="eyebrow muted">LOCAL, AND LOVELY</div><h1 className="page-title">Businesses around <em>{society?.name ?? 'your society'}.</em></h1><p className="page-intro">One neighbourhood. So many good things to discover.</p><form action="/merchants" className="search listing-search"><span>⌕</span><input name="q" defaultValue={searchParams.q} placeholder="Search local businesses"/><button>Search <span>→</span></button></form>{merchants.length?<div className="merchant-grid">{merchants.map(m=><article className="merchant-card" key={m.id}><div className="merchant-cover" style={m.coverUrl?{backgroundImage:`url(${m.coverUrl})`}:{}}><Link href={`/merchants/${m.slug}?society=${society?.slug}`}><span>{m.category.name}</span><b>{m.isOpen?'OPEN NOW':'CLOSED'}</b></Link><FavoriteToggle merchantId={m.id}/></div><Link href={`/merchants/${m.slug}?society=${society?.slug}`}><div className="merchant-info"><div><h3>{m.name}</h3><p>{m.description}</p></div><small>◷ {m.estimatedDeliveryMinutes?`${m.estimatedDeliveryMinutes} min`:'Pickup'}</small></div></Link>{m.products?.slice(0,3).map(p=><div className="compact-product" key={p.id}>{p.name}<b>{rupees(p.pricePaisa)}</b></div>)}</article>)}</div>:<div className="empty-state"><div className="empty-icon">✳</div><h3>No businesses found just yet.</h3><p>Try another search or come back soon as more local favourites join Mahalla.</p></div>}</main>;
}
