import Link from 'next/link';
import AdminDashboard from './panel';

export default function AdminPage() {
  return <main className="content-page"><Link href="/" className="back-link">← mahalla</Link><div className="eyebrow muted">PLATFORM OPERATIONS</div><h1 className="page-title">Admin <em>desk.</em></h1><p className="page-intro">Review local businesses, monitor orders and manage society coverage.</p><AdminDashboard/></main>;
}
