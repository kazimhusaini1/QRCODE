import Link from 'next/link';
import AccountPanel from './panel';

export default function AccountPage() {
  return <main className="content-page"><Link href="/" className="back-link">← mahalla</Link><div className="account-layout"><div><div className="eyebrow">A LITTLE CLOSER</div><h1 className="page-title">Your neighbourhood,<br/><em>your account.</em></h1><p className="page-intro">Sign in to keep your local favourites close.</p></div><AccountPanel/></div></main>;
}
