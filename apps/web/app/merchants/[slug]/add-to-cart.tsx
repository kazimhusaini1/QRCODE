'use client';

import { useState } from 'react';
import { Cart, readCart, saveCart } from '../../lib/cart';

export default function AddToCart({merchantId,merchantName,merchantSlug,societyId,societySlug,deliveryFeePaisa,acceptsDelivery,acceptsPickup,product}:{merchantId:string;merchantName:string;merchantSlug:string;societyId:string;societySlug:string;deliveryFeePaisa:number;acceptsDelivery:boolean;acceptsPickup:boolean;product:{id:string;name:string;pricePaisa:number}}){
 const [message,setMessage]=useState('');
 function add(){const current=readCart();if(current&&current.merchantId!==merchantId){setMessage('Your bag has items from another business. Empty it before adding here.');return;}const cart:Cart=current??{merchantId,merchantName,merchantSlug,societyId,societySlug,deliveryFeePaisa,acceptsDelivery,acceptsPickup,items:[]};const existing=cart.items.find(item=>item.productId===product.id);if(existing)existing.quantity++;else cart.items.push({productId:product.id,name:product.name,pricePaisa:product.pricePaisa,quantity:1});saveCart(cart);setMessage('Added to your bag.');}
 return <div className="add-control"><button onClick={add}>Add to bag +</button>{message&&<small role="status">{message}</small>}</div>;
}
