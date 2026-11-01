import { NextRequest, NextResponse } from 'next/server';
import { authenticatedFetch, sessionResponse } from '../../../../lib/server-session';

const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  try {
    const result = await authenticatedFetch(request, `${API}/orders/${encodeURIComponent(context.params.id)}/reorder`, { method: 'GET' });
    return sessionResponse(result);
  } catch {
    return NextResponse.json({ message: 'The marketplace service is unavailable' }, { status: 503 });
  }
}
