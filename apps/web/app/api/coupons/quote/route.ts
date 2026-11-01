import { NextRequest } from 'next/server';
import { authenticatedFetch, sessionResponse } from '../../../lib/server-session';

const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export async function POST(request: NextRequest) {
  const result = await authenticatedFetch(request, `${API}/coupons/quote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: await request.text() });
  return sessionResponse(result);
}
