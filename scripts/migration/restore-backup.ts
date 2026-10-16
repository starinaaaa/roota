import { spawn } from 'node:child_process';
import { createDecipheriv } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, open } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { directory, required, hash, pool, readJson } from './common';
import { safePath } from './policy';
const dir=await directory(process.argv[2]);
const url=new URL(required('RESTORE_DATABASE_URL'));
// Restore drill has no path to a remote or existing production database.
if(!['localhost','127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_restore')) throw new Error('RESTORE_REQUIRES_LOCAL_DISPOSABLE_DATABASE_ENDING_IN_RESTORE');
const db=pool('RESTORE_DATABASE_URL');
try {
  if((await db.query("select count(*)::int n from pg_tables where schemaname='public'")).rows[0].n) throw new Error('RESTORE_DATABASE_NOT_EMPTY');
  await db.query(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
  end $$; create extension if not exists pgcrypto;`);
  const manifest=await readJson<{archiveSha256:string;files:{bucket:string;path:string;sha256:string}[]}>(path.join(dir,'backup-manifest.json'));
  const archive=path.join(dir,'database.dump.enc');
  const {createHash}=await import('node:crypto');const digest=createHash('sha256');
  for await(const chunk of createReadStream(archive)) digest.update(chunk);
  if(digest.digest('hex')!==manifest.archiveSha256) throw new Error('ARCHIVE_CHECKSUM');
  const key=Buffer.from(required('BACKUP_ENCRYPTION_KEY'),'hex');
  const file=await open(archive,'r');const header=Buffer.alloc(16),tag=Buffer.alloc(16);const size=(await file.stat()).size;
  await file.read(header,0,16,0);await file.read(tag,0,16,size-16);await file.close();
  if(header.subarray(0,4).toString()!=='RTA1') throw new Error('INVALID_BACKUP');
  const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(4));decipher.setAuthTag(tag);
  const child=spawn('pg_restore',['--no-owner','--no-acl','--schema=public','--single-transaction','--exit-on-error','--dbname',url.pathname.slice(1)],{env:{...process.env,PGHOST:url.searchParams.get('host') || url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:'disable'},stdio:['pipe','ignore','pipe']});
  let restoreError='';
  child.stderr.on('data',chunk=>{restoreError=(restoreError+String(chunk)).slice(-16000)});
  const exited=new Promise<void>((resolve,reject)=>{child.on('error',()=>reject(new Error('RESTORE_START_FAILED')));child.on('close',code=>{
    if(code===0) return resolve();
    // Error headlines contain schema identifiers; omit SQL, row values and context.
    const headline=restoreError.match(/ERROR:\s+((?:schema|function|type|relation|role|extension) "[a-zA-Z0-9_.]+" does not exist)/)?.[1];
    reject(new Error(headline ? 'RESTORE_MISSING_DEPENDENCY: '+headline : 'RESTORE_FAILED_DETAILS_SUPPRESSED'));
  });});
  await Promise.all([pipeline(createReadStream(archive,{start:16,end:size-17}),decipher,child.stdin),exited]);
  for(const entry of manifest.files) {
    const encrypted=await readFile(path.join(dir,'storage',hash(safePath(entry.bucket,entry.path))+'.enc'));
    const cipher=createDecipheriv('aes-256-gcm',key,encrypted.subarray(4,16));cipher.setAuthTag(encrypted.subarray(-16));
    const bytes=Buffer.concat([cipher.update(encrypted.subarray(16,-16)),cipher.final()]);
    if(hash(bytes)!==entry.sha256) throw new Error('OBJECT_CHECKSUM');
  }
  const tables=(await db.query("select count(*)::int n from pg_tables where schemaname='public'")).rows[0].n;
  await db.query('create schema migration_restore_proof; revoke all on schema migration_restore_proof from public; create table migration_restore_proof.state(archive_sha256 text not null)');
  await db.query('insert into migration_restore_proof.state values($1)',[manifest.archiveSha256]);
  await writeFile(path.join(dir,'restore-verified.json'),JSON.stringify({verified:true,scope:'public database restore plus decrypt/checksum of every storage object; Auth/platform restore not verified',archiveSha256:manifest.archiveSha256,verifiedAt:new Date().toISOString(),tables}),{mode:0o600});
  console.log(JSON.stringify({restoredPublicTables:tables,verifiedFiles:manifest.files.length}));
} catch(error) {
  const message=error instanceof Error && (/^[A-Z][A-Z_]+$/.test(error.message) || error.message.startsWith('RESTORE_MISSING_DEPENDENCY: ')) ? error.message : 'BACKUP_RESTORE_DRILL_FAILED_DETAILS_SUPPRESSED';
  throw new Error(message);
}
finally { await db.end(); }
