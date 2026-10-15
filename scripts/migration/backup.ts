import { spawn } from 'node:child_process';
import { createCipheriv, randomBytes, createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { writeFile, appendFile, mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { directory, required, hash } from './common';
import { safePath } from './policy';
const dir = await directory(process.argv[2], true);
const key = Buffer.from(required('BACKUP_ENCRYPTION_KEY'), 'hex');
if (key.length !== 32) throw new Error('BACKUP_KEY_MUST_BE_32_BYTES_HEX');
const url = new URL(required('SOURCE_DATABASE_URL'));
const local = ['localhost','127.0.0.1'].includes(url.hostname);
const env = { ...process.env, PGDATABASE: url.pathname.slice(1), PGHOST:url.hostname, PGPORT:url.port || '5432', PGUSER:decodeURIComponent(url.username), PGPASSWORD:decodeURIComponent(url.password), PGSSLMODE:local ? 'disable' : 'verify-full', PGSSLROOTCERT:local ? undefined : 'system', ...(process.env.SOURCE_DATABASE_URL_CA_FILE ? { PGSSLROOTCERT:process.env.SOURCE_DATABASE_URL_CA_FILE } : {}) };
try {
  const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm',key,nonce);
  const archive = path.join(dir,'database.dump.enc');
  await writeFile(archive,Buffer.concat([Buffer.from('RTA1'),nonce]),{mode:0o600,flag:'wx'});
  const child = spawn('pg_dump',['--format=custom','--no-owner','--no-acl'],{ env, stdio:['ignore','pipe','pipe'] });
  let dumpError = '';
  child.stderr.on('data', chunk => { dumpError = (dumpError + String(chunk)).slice(-16000); });
  const exited = new Promise<void>((resolve,reject)=>{child.on('error',()=>reject(new Error('DUMP_START_FAILED')));child.on('close',code=>{
    if(code===0) return resolve();
    const reason = /permission denied/i.test(dumpError) ? 'PERMISSION' : /timeout/i.test(dumpError) ? 'TIMEOUT' : /connection|SSL|EOF/i.test(dumpError) ? 'CONNECTION' : 'OTHER';
    reject(new Error('DUMP_FAILED_'+reason));
  });});
  await Promise.all([pipeline(child.stdout,cipher,createWriteStream(archive,{flags:'a',mode:0o600})),exited]);
  await appendFile(archive,cipher.getAuthTag());
  console.log(JSON.stringify({databaseArchiveComplete:true}));
  const db = createClient(required('NEXT_PUBLIC_SUPABASE_URL'),required('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:buckets,error} = await db.storage.listBuckets();
  if (error) throw new Error('BUCKET_LIST_FAILED');
  const files: {bucket:string;path:string;sha256:string;bytes:number}[]=[];
  await mkdir(path.join(dir,'storage'),{mode:0o700});
  for (const bucket of buckets ?? []) {
    const walk = async (prefix='') => {
      for(let offset=0;;offset+=500) {
        const {data,error} = await db.storage.from(bucket.id).list(prefix,{limit:500,offset,sortBy:{column:'name',order:'asc'}});
        if(error) throw new Error('OBJECT_LIST_FAILED');
        for(const item of data ?? []) {
          const name=[prefix,item.name].filter(Boolean).join('/');
          if(!item.id) {await walk(name);continue;}
          safePath(bucket.id,name);
          const {data:blob,error:downloadError}=await db.storage.from(bucket.id).download(name);
          if(downloadError || !blob) throw new Error('OBJECT_DOWNLOAD_FAILED');
          const bytes=Buffer.from(await blob.arrayBuffer()),nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);
          const encrypted=Buffer.concat([Buffer.from('RTA1'),nonce,cipher.update(bytes),cipher.final(),cipher.getAuthTag()]);
          const filename=hash(bucket.id+'/'+name)+'.enc';
          await writeFile(path.join(dir,'storage',filename),encrypted,{mode:0o600,flag:'wx'});
          files.push({bucket:bucket.id,path:name,sha256:hash(bytes),bytes:bytes.length});
          if(files.length % 50 === 0) console.log(JSON.stringify({encryptedFiles:files.length}));
        }
        if((data?.length??0)<500) break;
      }
    }; await walk();
  }
  const digest=createHash('sha256');
  const {createReadStream}=await import('node:fs');
  for await(const chunk of createReadStream(archive)) digest.update(chunk);
  await writeFile(path.join(dir,'backup-manifest.json'),JSON.stringify({version:1,createdAt:new Date().toISOString(),archiveSha256:digest.digest('hex'),scope:'full logical pg_dump plus storage objects; platform configuration is separate',buckets,files},null,2),{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({encryptedBackup:true,files:files.length,restoreVerified:false}));
} catch(error) {
  const code=error instanceof Error && /^[A-Z][A-Z_]+$/.test(error.message) ? error.message : 'SOURCE_BACKUP_FAILED_DETAILS_SUPPRESSED';
  throw new Error(code);
}
