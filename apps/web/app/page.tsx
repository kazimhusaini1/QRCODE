import { apiGet, currentSociety, MerchantSummary } from './lib/marketplace';

export const dynamic = 'force-dynamic';
const foodPhotos = [
  'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1548365328-8b849e6f6a62?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85',
];

export default async function Home() {
  const society = await currentSociety();
  const merchants = await apiGet<MerchantSummary[]>(`merchants?society=${encodeURIComponent(society?.slug ?? 'park-view-city-lahore')}`) ?? [];
  const categories = await apiGet<{id:string;name:string;slug:string;icon?:string}[]>('categories') ?? [];
  return <main className="food-home">
    <header className="food-header"><a className="food-brand" href="/">ParkView <b>Eats</b></a><div className="food-location">📍 Deliver to <strong>{society?.name ?? 'Choose your area'}</strong></div><a className="food-profile" href="/account">♙ <span>Sign in</span></a></header>
    <form action="/search" className="food-search"><span>⌕</span><input name="q" placeholder="Search restaurants, dishes, cuisines…"/><button>Search</button></form>
    <section className="food-offer"><div><small>THIS WEEK ONLY · PARK VIEW CITY</small><h1>Good food.<br/><em>Brighter days.</em></h1><p>Local favourites, delivered around you.</p><a href="/deals">Explore today’s deals →</a></div><div className="food-offer-photo" /></section>
    <section className="food-section"><header><div><small>FIND YOUR CRAVING</small><h2>Choose a cuisine</h2></div><a href="/search">See all →</a></header><div className="food-categories">{(categories.length?categories:[{id:'pizza',name:'Pizza',slug:'pizza'},{id:'burgers',name:'Burgers',slug:'burgers'},{id:'desi',name:'Desi',slug:'desi'},{id:'chinese',name:'Chinese',slug:'chinese'}]).slice(0,6).map((c,i)=><a key={c.id} href={`/categories/${c.slug}`}><span>{['🍕','🍔','🍛','🥡','🥗','🍩'][i%6]}</span>{c.name}</a>)}</div></section>
    <section className="food-section"><header><div><small>GOOD NEIGHBOURS, GREAT FINDS</small><h2>Popular near you</h2></div><a href="/merchants">See all →</a></header>{merchants.length ? <div className="food-restaurants">{merchants.map((m,i)=><a href={`/merchants/${m.slug}?society=${society?.slug}`} className="food-restaurant" key={m.id}><div className="food-restaurant-photo" style={{backgroundImage:`url(${m.coverUrl || foodPhotos[i%foodPhotos.length]})`}}><b>★ 4.{8-i%3}</b><button aria-label="Save restaurant">♡</button></div><strong>{m.name}</strong><span>{m.category.name} · {m.estimatedDeliveryMinutes ?? 30}–40 min</span><small>{m.isOpen?'Open now':'Closed'} · Free delivery on orders over Rs 1,000</small></a>)}</div> : <div className="food-empty"><b>🍽</b><h3>Your neighbourhood’s table is getting set.</h3><p>Local restaurants will appear here as they join. Browse all categories or check back soon.</p><a href="/merchant">Restaurant owners: join ParkView Eats →</a></div>}</section>
    <section className="food-promo-row"><a href="/reels"><b>▶ FOOD REELS</b><span>See what your neighbours are eating →</span></a><a href="/deals"><b>✦ DEALS & OFFERS</b><span>Fresh offers from local kitchens →</span></a></section>
    <section className="food-section"><header><div><small>SHORT, TASTY, LOCAL</small><h2>Food reels</h2></div><a href="/reels">Watch all →</a></header><div className="food-reel-row">{foodPhotos.slice(0,3).map((photo,i)=><a key={photo} href="/reels" style={{backgroundImage:`linear-gradient(0deg,#0009,transparent 55%),url(${photo})`}}><span>▶ {['Cheese pull worth the wait','A burger made for sharing','Your next lunch plan'][i]}</span></a>)}</div></section>
    <footer className="food-footer"><b>ParkView Eats</b><span>Good Food, Brighter Days · Park View City</span><a href="/dine-in">Dine-in rewards</a><a href="/contact">Help & support</a></footer>
  </main>;
}
