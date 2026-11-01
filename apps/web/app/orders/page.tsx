'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cart, saveCart } from '../lib/cart';

type Order = { id: string; number: string; merchantNameSnapshot: string; status: string; fulfillment: string; paymentMethod: string; totalPaisa: number; createdAt: string; merchant:{id:string;slug:string;name:string;deliveryFeePaisa:number;acceptsDelivery:boolean;acceptsPickup:boolean}; society:{id:string;slug:string;name:string}; items: { productNameSnapshot: string; productId?:string|null; quantity: number; lineTotalPaisa: number }[]; statusEvents: { status: string; createdAt: string; note?: string | null }[]; review?: { id: string; rating: number; isPublished: boolean } | null };
const money = (value: number) => `Rs ${(value / 100).toLocaleString('en-PK')}`;

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(true);
  const [changing, setChanging] = useState('');
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [reorderNotice,setReorderNotice]=useState('');
  async function load() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/orders', { cache: 'no-store' });
      const data = await response.json();
      if (response.status === 401) { setError('Sign in to see your orders.'); setOrders([]); }
      else if (!response.ok || !Array.isArray(data)) throw new Error(data.message ?? 'Orders could not be loaded.');
      else setOrders(data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Orders could not be loaded.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  async function cancel(order: Order) {
    setChanging(order.id); setError('');
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'CANCELLED', note: 'Cancelled by customer' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? 'This order could not be cancelled.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'This order could not be cancelled.'); }
    finally { setChanging(''); }
  }
  async function submitReview(order: Order) {
    setChanging(order.id); setError('');
    try {
      const response = await fetch(`/api/customer/orders/${encodeURIComponent(order.id)}/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rating: ratings[order.id] ?? 5, comment: comments[order.id] || undefined }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message ?? 'Review could not be submitted.'); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Review could not be submitted.'); }
    finally { setChanging(''); }
  }
  async function reorder(order:Order){setChanging(order.id);setError('');setReorderNotice('');try{const response=await fetch(`/api/orders/${encodeURIComponent(order.id)}/reorder`);const data=await response.json();if(!response.ok)throw new Error(data.message??'This order cannot be placed again.');if(!data.lines?.length)throw new Error('None of the original items are currently available.');const merchant=data.merchant;const cart:Cart={merchantId:merchant.id,merchantName:merchant.name,merchantSlug:merchant.slug,societyId:data.society.id,societySlug:data.society.slug,deliveryFeePaisa:merchant.deliveryFeePaisa,acceptsDelivery:merchant.acceptsDelivery,acceptsPickup:merchant.acceptsPickup,items:data.lines.map((line:{productId:string;quantity:number})=>{const product=merchant.products.find((item:{id:string})=>item.id===line.productId);return {productId:line.productId,quantity:line.quantity,name:product.name,pricePaisa:product.pricePaisa};})};saveCart(cart);if(data.unavailableItemCount){setReorderNotice(`${data.unavailableItemCount} item(s) are no longer available; the available items are ready in your bag.`);}else window.location.href='/cart';}catch(e){setError(e instanceof Error?e.message:'Could not prepare this order again.');}finally{setChanging('');}}
  return <main className="content-page"><Link className="back-link" href="/">← Back to the neighbourhood</Link><div className="eyebrow">YOUR MAHALLA</div><h1 className="page-title">Your orders.</h1><p className="page-intro">Follow each local order from confirmation through handoff.</p>{error && !busy && <p className="form-error" role="alert">{error}</p>}{busy ? <div className="workspace-card">Loading your orders…</div> : error && orders.length === 0 ? <div className="empty-state"><h3>{error}</h3><p><Link className="text-link" href="/account">Go to your account ↗</Link></p></div> : orders.length === 0 ? <div className="empty-state"><h3>No orders just yet.</h3><p>When you order from a local business, it will appear here.</p><Link className="text-link" href="/merchants">Find a local business ↗</Link></div> : <div className="order-history">{orders.map(order => <article className="workspace-card" key={order.id}><div className="workspace-card-heading"><div><div className="eyebrow">{order.number}</div><h2>{order.merchantNameSnapshot}</h2><small>{new Date(order.createdAt).toLocaleString('en-PK')}</small></div><strong className="order-status">{order.status.replaceAll('_', ' ')}</strong></div><div className="order-history-items">{order.items.map((item, index) => <p key={`${order.id}-${index}`}>{item.quantity} × {item.productNameSnapshot}<b>{money(item.lineTotalPaisa)}</b></p>)}</div><div className="totals"><span>{order.fulfillment.replaceAll('_', ' ')} · {order.paymentMethod.replaceAll('_', ' ')}</span><strong>Total</strong><strong>{money(order.totalPaisa)}</strong></div><ol className="order-timeline">{order.statusEvents.map((event, index) => <li key={`${event.status}-${index}`}><b>{event.status.replaceAll('_', ' ')}</b><span>{new Date(event.createdAt).toLocaleString('en-PK')}</span>{event.note && <small>{event.note}</small>}</li>)}</ol><button className="refresh-button" disabled={changing===order.id} onClick={()=>void reorder(order)}>{changing===order.id?"Preparing…":"Order again"}</button>{order.status === 'PENDING' && <button className="refresh-button" disabled={changing === order.id} onClick={() => void cancel(order)}>{changing === order.id ? 'Cancelling…' : 'Cancel pending order'}</button>}{order.status==='COMPLETED'&&(order.review?<p className="subtle-note">Thanks for sharing your {order.review.rating} star review. It will appear publicly after moderation.</p>:<div className="review-form"><strong>How was this local business?</strong><div className="review-rating" role="group" aria-label="Rate your order">{[1,2,3,4,5].map(value=><button type="button" key={value} aria-label={`${value} stars`} aria-pressed={(ratings[order.id]??5)===value} onClick={()=>setRatings(prev=>({...prev,[order.id]:value}))}>{value<=(ratings[order.id]??5)?'★':'☆'}</button>)}</div><label className="checkout-label">A note for your neighbour (optional)<textarea maxLength={2000} value={comments[order.id]??''} onChange={event=>setComments(prev=>({...prev,[order.id]:event.target.value}))}/></label><button className="refresh-button" disabled={changing===order.id} onClick={()=>void submitReview(order)}>{changing===order.id?'Sending…':'Submit for review'}</button></div>)}</article>)}</div>}</main>;
}
