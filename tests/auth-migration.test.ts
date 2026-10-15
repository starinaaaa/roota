import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { hashPassword } from 'better-auth/crypto';
import { authOptions } from '../lib/auth-config';
const socket=process.env.ROOTA_MIGRATION_TEST_SOCKET;
test('local admin login: no signup, HttpOnly session, CSRF, revocation and persisted rate limiting',{skip:!socket},async()=>{
  if(!socket?.startsWith('/')) throw new Error('LOCAL_SOCKET_REQUIRED');
  const config={host:socket,port:55441,user:'roota_test'},database='roota_auth_'+randomUUID().replaceAll('-','');
  const control=new Pool({...config,database:'postgres'});let db:Pool|undefined;
  try {
    await control.query(`create database ${database}`);db=new Pool({...config,database});
    await db.query(await readFile('database/auth.sql','utf8'));
    const options=authOptions(db);options.baseURL='http://localhost:3000';options.secret='local-integration-test-secret-01234567890123456789';
    options.advanced={...options.advanced,defaultCookieAttributes:{httpOnly:true,secure:false,sameSite:'lax'}};
    const auth=betterAuth(options),id=randomUUID(),password='Local-only-test-password-72';
    await db.query('insert into admin_user(id,name,email,"emailVerified","createdAt","updatedAt") values($1,\'Тест\',\'admin@example.invalid\',true,now(),now())',[id]);
    await db.query('insert into admin_account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") values($1,$2::text,\'credential\',$2::uuid,$3,now(),now())',[randomUUID(),id,await hashPassword(password)]);
    const request=(path:string,body?:unknown,cookie?:string,origin='http://localhost:3000')=>auth.handler(new Request('http://localhost:3000/api/auth/'+path,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}));
    const signup=await request('sign-up/email',{name:'Тест',email:'other@example.invalid',password});assert.ok(signup.status>=400);
    const login=await request('sign-in/email',{email:'admin@example.invalid',password});assert.equal(login.status,200);
    const cookies=login.headers.getSetCookie();assert.ok(cookies.some(c=>/httponly/i.test(c)));assert.ok(cookies.some(c=>/samesite=lax/i.test(c)));
    const cookie=cookies.map(c=>c.split(';')[0]).join('; ');
    const session=await request('get-session',undefined,cookie);assert.equal((await session.json()).user.id,id);
    const csrf=await request('sign-out',{},cookie,'https://evil.example.invalid');assert.equal(csrf.status,403);
    assert.equal((await request('sign-out',{},cookie)).status,200);
    assert.equal(await (await request('get-session',undefined,cookie)).json(),null);
    let limited=false;
    for(let i=0;i<8;i++) {const response=await request('sign-in/email',{email:'admin@example.invalid',password:'wrong-test-password'});if(response.status===429) {limited=true;break;}}
    assert.equal(limited,true);
    assert.ok((await db.query('select count(*)::int n from "rateLimit"')).rows[0].n>0);
  } finally {await db?.end();await control.query(`drop database if exists ${database}`);await control.end()}
});
