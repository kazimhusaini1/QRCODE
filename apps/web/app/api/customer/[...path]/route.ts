import { NextRequest, NextResponse } from 'next/server';
import { authenticatedFetch, sessionResponse } from '../../../lib/server-session';

const API=process.env.API_INTERNAL_URL??process.env.NEXT_PUBLIC_API_URL??'http://localhost:4000/api/v1';
export async function GET(request:NextRequest,context:{params:{path:string[]}}){const path=context.params.path.map(encodeURIComponent).join('/');const endpoint=path==='profile'?'':`/${path}`;const result=await authenticatedFetch(request,`${API}/me${endpoint}${request.nextUrl.search}`,{method:'GET'});return sessionResponse(result);}
export async function POST(request:NextRequest,context:{params:{path:string[]}}){const path=context.params.path.map(encodeURIComponent).join('/');const result=await authenticatedFetch(request,`${API}/me/${path}`,{method:'POST',headers:{'content-type':'application/json'},body:await request.text()});return sessionResponse(result);}
export async function PATCH(request:NextRequest,context:{params:{path:string[]}}){const path=context.params.path.map(encodeURIComponent).join('/');const result=await authenticatedFetch(request,`${API}/me/${path}`,{method:'PATCH',headers:{'content-type':'application/json'},body:await request.text()});return sessionResponse(result);}
