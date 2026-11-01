import { NextRequest, NextResponse } from 'next/server';

const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const allowed = new Set(['verification/request', 'verification/confirm', 'password-reset/request', 'password-reset/confirm']);

export async function POST(request: NextRequest, context: { params: { path: string[] } }) {
  const path = context.params.path.join('/');
  if (!allowed.has(path)) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ message: 'Invalid request' }, { status: 400 });
  try {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const response = await fetch(`${API}/auth/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}) }, body: JSON.stringify(body), cache: 'no-store' });
    return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
  } catch {
    return NextResponse.json({ message: 'The marketplace service is unavailable' }, { status: 503 });
  }
}
