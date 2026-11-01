import { NextRequest, NextResponse } from 'next/server';
import { authenticatedFetch, sessionResponse } from '../../lib/server-session';

const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export async function GET(request: NextRequest) {
  const result=await authenticatedFetch(request,`${API}/orders`,{method:'GET'});return sessionResponse(result);
}

export async function POST(request: NextRequest) {
  const idempotencyKey=request.headers.get('idempotency-key');
  if(!idempotencyKey)return NextResponse.json({message:'Idempotency key required'},{status:400});
  const result=await authenticatedFetch(request,`${API}/orders`,{method:'POST',headers:{'content-type':'application/json','idempotency-key':idempotencyKey},body:await request.text()});return sessionResponse(result);
}
