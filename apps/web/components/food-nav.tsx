"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function FoodNav() {
  const pathname = usePathname();
  const active = pathname === '/' ? 'home' : pathname.startsWith('/reels') ? 'reels' : pathname.startsWith('/orders') ? 'orders' : pathname.startsWith('/account') ? 'profile' : pathname.startsWith('/rewards') || pathname.startsWith('/dine-in') ? 'rewards' : '';
  const items = [
    ['home', '⌂', 'Home', '/'], ['reels', '▶', 'Reels', '/reels'],
    ['orders', '▣', 'Orders', '/orders'], ['rewards', '✧', 'Rewards', '/rewards'],
    ['profile', '♙', 'Profile', '/account'],
  ];
  return <nav className="food-nav" aria-label="Main navigation">{items.map(([key, icon, label, href]) =>
    <Link key={key} href={href} className={active === key ? 'active' : ''}><span>{icon}</span>{label}</Link>
  )}<Link className="food-nav-cart" href="/cart">Bag</Link></nav>;
}
