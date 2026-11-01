import { NextResponse } from 'next/server';

const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export async function GET() {
  try {
    const response = await fetch(`${API}/societies`, { cache: 'no-store' });
    const body = await response.json().catch(() => []);
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ message: 'The marketplace service is unavailable' }, { status: 503 });
  }
}
