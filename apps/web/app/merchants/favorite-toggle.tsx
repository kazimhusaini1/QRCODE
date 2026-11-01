'use client';

import { useEffect, useState } from 'react';

type Favorite = { merchantId: string };

export default function FavoriteToggle({ merchantId }: { merchantId: string }) {
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch('/api/customer/favorites').then(async response => { if (response.ok) { const rows = await response.json() as Favorite[]; setSaved(rows.some(row => row.merchantId === merchantId)); } }).catch(() => undefined); }, [merchantId]);
  async function toggle() {
    setBusy(true);
    try {
      const response = await fetch(`/api/customer/favorites/${encodeURIComponent(merchantId)}`, { method: saved ? 'DELETE' : 'POST' });
      if (response.status === 401) { window.location.href = '/account'; return; }
      if (!response.ok) throw new Error('Could not update saved businesses');
      setSaved(!saved);
    } catch { /* The state stays unchanged so the customer can retry. */ }
    finally { setBusy(false); }
  }
  return <button type="button" className={`favorite-toggle${saved ? ' is-saved' : ''}`} aria-label={saved ? 'Remove from saved businesses' : 'Save business'} aria-pressed={saved} disabled={busy} onClick={event => { event.preventDefault(); event.stopPropagation(); void toggle(); }}>{saved ? '♥' : '♡'}</button>;
}
