export type Cart={merchantId:string;merchantName:string;merchantSlug:string;societyId:string;societySlug:string;deliveryFeePaisa:number;acceptsDelivery:boolean;acceptsPickup:boolean;items:{productId:string;name:string;pricePaisa:number;quantity:number}[]};
export const CART_KEY='mahalla_cart_v1';
export function readCart():Cart|null{try{return JSON.parse(localStorage.getItem(CART_KEY)??'null') as Cart|null;}catch{return null;}}
export function saveCart(cart:Cart|null){if(cart)localStorage.setItem(CART_KEY,JSON.stringify(cart));else localStorage.removeItem(CART_KEY);window.dispatchEvent(new Event('mahalla-cart-change'));}
export const subtotal=(cart:Cart)=>cart.items.reduce((sum,item)=>sum+item.pricePaisa*item.quantity,0);
