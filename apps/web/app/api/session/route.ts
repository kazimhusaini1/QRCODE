import { NextRequest, NextResponse } from 'next/server';

const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const COOKIE = 'mahalla_access';
const REFRESH_COOKIE = 'mahalla_refresh';

function setSessionCookies(response:NextResponse,result:{accessToken:string;refreshToken:string;expiresIn:number}){
  const secure=process.env.NODE_ENV==='production';
  response.cookies.set(COOKIE,result.accessToken,{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:result.expiresIn});
  response.cookies.set(REFRESH_COOKIE,result.refreshToken,{httpOnly:true,secure,sameSite:'strict',path:'/',maxAge:30*24*60*60});
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || !['login', 'register'].includes(body.mode)) return NextResponse.json({ message: 'Invalid request' }, { status: 400 });
  try {
    const { mode, ...credentials } = body;
    const forwardedFor=request.headers.get('x-forwarded-for');
    const response = await fetch(`${API}/auth/${mode}`, { method: 'POST', headers: { 'content-type': 'application/json',...(forwardedFor?{'x-forwarded-for':forwardedFor}:{}) }, body: JSON.stringify(mode === 'login' ? { identity: credentials.identity, password: credentials.password } : credentials), cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return NextResponse.json({ message: result.message ?? 'Unable to sign in' }, { status: response.status });
    if (result.verificationRequired) return NextResponse.json({ user: result.user, verificationRequired: true });
    const output = NextResponse.json({ user: result.user });
    setSessionCookies(output,result);
    return output;
  } catch { return NextResponse.json({ message: 'The marketplace service is unavailable' }, { status: 503 }); }
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE)?.value;
  if (!token) return NextResponse.json({ user: null });
  try {
    const forwardedFor=request.headers.get('x-forwarded-for');
    const response = await fetch(`${API}/me`, { headers: { authorization: `Bearer ${token}`,...(forwardedFor?{'x-forwarded-for':forwardedFor}:{}) }, cache: 'no-store' });
    if (response.ok) return NextResponse.json({ user: await response.json() });
  } catch { return NextResponse.json({ message: 'The marketplace service is unavailable' }, { status: 503 }); }
  const refreshToken=request.cookies.get(REFRESH_COOKIE)?.value;
  if(refreshToken){
    try{
      const forwardedFor=request.headers.get('x-forwarded-for');
      const refreshed=await fetch(`${API}/auth/refresh`,{method:'POST',headers:{'content-type':'application/json',...(forwardedFor?{'x-forwarded-for':forwardedFor}:{})},body:JSON.stringify({refreshToken}),cache:'no-store'});
      if(refreshed.ok){const session=await refreshed.json();const me=await fetch(`${API}/me`,{headers:{authorization:`Bearer ${session.accessToken}`,...(forwardedFor?{'x-forwarded-for':forwardedFor}:{})},cache:'no-store'});if(me.ok){const output=NextResponse.json({user:await me.json()});setSessionCookies(output,session);return output;}}
    }catch{return NextResponse.json({message:'The marketplace service is unavailable'},{status:503});}
  }
  const output = NextResponse.json({ user: null });
  output.cookies.delete(COOKIE);
  output.cookies.delete(REFRESH_COOKIE);
  return output;
}

export async function DELETE(request:NextRequest) {
  const refreshToken=request.cookies.get(REFRESH_COOKIE)?.value;
  const forwardedFor=request.headers.get('x-forwarded-for');
  if(refreshToken)try{await fetch(`${API}/auth/logout`,{method:'POST',headers:{'content-type':'application/json',...(forwardedFor?{'x-forwarded-for':forwardedFor}:{})},body:JSON.stringify({refreshToken}),cache:'no-store'});}catch{}
  const output = NextResponse.json({ signedOut: true });
  output.cookies.delete(COOKIE);
  output.cookies.delete(REFRESH_COOKIE);
  return output;
}
