import { NextRequest, NextResponse } from 'next/server';
import { authenticatedFetch, sessionResponse } from '../../../lib/server-session';

const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const COOKIE = 'mahalla_access';
type Context = { params: { path: string[] } };

async function proxy(request: NextRequest, context: Context) {
  const path = context.params.path.map(encodeURIComponent).join('/');
  const query = request.nextUrl.search;
  const contentType = request.headers.get('content-type');
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();
  const result=await authenticatedFetch(request,`${API}/merchant/${path}${query}`,{method:request.method,headers:contentType?{'content-type':contentType}:{},body});return sessionResponse(result);
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
