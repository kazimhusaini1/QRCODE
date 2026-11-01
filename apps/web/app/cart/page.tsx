import Link from 'next/link';
import CartPanel from './panel';

export default function CartPage(){return <main className="content-page"><Link href="/" className="back-link">← mahalla</Link><div className="eyebrow muted">ONE LOCAL BUSINESS AT A TIME</div><h1 className="page-title">Your <em>bag.</em></h1><p className="page-intro">Review your order and choose delivery or pickup.</p><CartPanel/></main>;}
