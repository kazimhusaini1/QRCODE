import Link from 'next/link';
import { apiGet, currentSociety, MerchantSummary, rupees } from '../../lib/marketplace';

export const dynamic = 'force-dynamic';

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  const society = await currentSociety();
  const query = new URLSearchParams({ society: society?.slug ?? 'park-view-city-lahore', category: params.slug });
  const merchants = await apiGet<MerchantSummary[]>(`merchants?${query}`) ?? [];
  const title = merchants[0]?.category.name ?? params.slug.replaceAll('-', ' ');
  return <main className="content-page"><Link href="/" className="back-link">← mahalla</Link><div className="eyebrow muted">A GOOD PLACE TO START</div><h1 className="page-title">{title}, <em>around you.</em></h1><p className="page-intro">Local {title.toLowerCase()} serving {society?.name ?? 'your society'}.</p>{merchants.length?<div className="merchant-grid">{merchants.map(m=><article className="merchant-card" key={m.id}><Link href={`/merchants/${m.slug}?society=${society?.slug}`}><div className="merchant-cover" style={m.coverUrl?{backgroundImage:`url(${m.coverUrl})`}:{}}><span>{m.category.name}</span><b>{m.isOpen?'OPEN NOW':'CLOSED'}</b></div><div className="merchant-info"><div><h3>{m.name}</h3><p>{m.description}</p></div><small>◷ {m.estimatedDeliveryMinutes?`${m.estimatedDeliveryMinutes} min`:'Pickup'}</small></div></Link>{m.products?.slice(0,3).map(p=><div className="compact-product" key={p.id}>{p.name}<b>{rupees(p.pricePaisa)}</b></div>)}</article>)}</div>:<div className="empty-state"><h3>Good things are on their way.</h3><p>No {title.toLowerCase()} are listed in this neighbourhood yet.</p><Link href="/merchants" className="text-link">Browse every business ↗</Link></div>}</main>;
}
