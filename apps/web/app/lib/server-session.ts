import { NextRequest, NextResponse } from 'next/server';

const API=process.env.API_INTERNAL_URL??process.env.NEXT_PUBLIC_API_URL??'http://localhost:4000/api/v1';
const ACCESS='mahalla_access';const REFRESH='mahalla_refresh';
export type RotatedSession={accessToken:string;refreshToken:string;expiresIn:number};
export async function authenticatedFetch(request:NextRequest,url:string,init:RequestInit){
 const access=request.cookies.get(ACCESS)?.value;
 if(!access)return {response:null,session:null};
 const forwardedFor=request.headers.get('x-forwarded-for');
 const run=(token:string)=>fetch(url,{...init,headers:{...Object.fromEntries(new Headers(init.headers).entries()),...(forwardedFor?{'x-forwarded-for':forwardedFor}:{}),authorization:`Bearer ${token}`},cache:'no-store'});
 try{
  const original=await run(access);if(original.status!==401)return {response:original,session:null};
  const refreshToken=request.cookies.get(REFRESH)?.value;if(!refreshToken)return {response:original,session:null};
  const refreshed=await fetch(`${API}/auth/refresh`,{method:'POST',headers:{'content-type':'application/json',...(forwardedFor?{'x-forwarded-for':forwardedFor}:{})},body:JSON.stringify({refreshToken}),cache:'no-store'});
  if(!refreshed.ok)return {response:original,session:null};
  const session=await refreshed.json() as RotatedSession;
  const retry=await run(session.accessToken);return {response:retry,session};
 }catch{return {response:null,session:null};}
}
export async function sessionResponse(result:{response:Response|null;session:RotatedSession|null},fallbackMessage='The marketplace service is unavailable'){
 if(!result.response)return NextResponse.json({message:fallbackMessage},{status:503});
 const headers=new Headers({'content-type':result.response.headers.get('content-type')??'application/json'});const disposition=result.response.headers.get('content-disposition');if(disposition)headers.set('content-disposition',disposition);
 const response=new NextResponse(await result.response.text(),{status:result.response.status,headers});
 if(result.session){const secure=process.env.NODE_ENV==='production';response.cookies.set(ACCESS,result.session.accessToken,{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:result.session.expiresIn});response.cookies.set(REFRESH,result.session.refreshToken,{httpOnly:true,secure,sameSite:'strict',path:'/',maxAge:30*24*60*60});}
 if(result.response.status===401){response.cookies.delete(ACCESS);response.cookies.delete(REFRESH);}
 return response;
}
