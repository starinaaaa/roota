import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createDecipheriv, randomUUID } from 'node:crypto';
import { S3Client, GetBucketAclCommand, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { directory, required, readJson, hash } from './common';
import { safePath } from './policy';
const [exportPath,backupPath]=process.argv.slice(2),dir=await directory(exportPath),backup=await directory(backupPath);
const endpoint=required('S3_ENDPOINT');
if(new URL(endpoint).protocol!=='https:') throw new Error('S3_REQUIRES_TLS');
const Bucket=required('S3_BUCKET');
const client=new S3Client({endpoint,region:required('S3_REGION'),forcePathStyle:true,credentials:{accessKeyId:required('S3_ACCESS_KEY_ID'),secretAccessKey:required('S3_SECRET_ACCESS_KEY')}});
const key=Buffer.from(required('BACKUP_ENCRYPTION_KEY'),'hex');
const images=(await readFile(path.join(dir,'product_images.ndjson'),'utf8')).split('\n').filter(Boolean).map(s=>JSON.parse(s) as {bucket:string;storage_path:string});
const siteIds=new Set<string>();
for(const table of ['site_pages','site_drafts']) for(const line of (await readFile(path.join(dir,table+'.ndjson'),'utf8')).split('\n').filter(Boolean)) {
  const hero=JSON.parse(line).payload.heroImage as string;
  if(hero.startsWith('/site-media/')) siteIds.add(hero.split('/').pop()!);
}
const manifest=await readJson<{files:{bucket:string;path:string;sha256:string;bytes:number}[]}>(path.join(backup,'backup-manifest.json'));
const approved=manifest.files.filter(file=>{
  if(!['products','product-drafts'].includes(file.bucket)) return false;
  // Original, display and all pre-rendered widths belonging to a retained image.
  return images.some(image=> image.bucket===file.bucket && (file.path===image.storage_path || file.path.startsWith(image.storage_path+'.') || file.path.startsWith(image.storage_path.replace(/\.[^.]+$/,'.original.')))) ||
    [...siteIds].some(id=>file.path===`site/${id}.webp` || file.path.startsWith(`site/${id}.webp.`) || file.path.startsWith(`site/${id}.original.`));
});
for(const image of images) if(!approved.some(f=>f.bucket===image.bucket && f.path===image.storage_path)) throw new Error('REFERENCED_IMAGE_MISSING');
const acl=await client.send(new GetBucketAclCommand({Bucket}));
if(acl.Grants?.some(g=>g.Grantee?.URI?.includes('/groups/global/'))) throw new Error('S3_BUCKET_MUST_BE_PRIVATE');
const canary=`migration-check/${randomUUID()}`;
try {
  await client.send(new PutObjectCommand({Bucket,Key:canary,Body:'private-storage-check',IfNoneMatch:'*'}));
  const anonymous=await fetch(`${endpoint.replace(/\/$/,'')}/${encodeURIComponent(Bucket)}/${canary}`,{method:'GET',redirect:'error'});
  if(anonymous.status!==403 && anonymous.status!==404) throw new Error('S3_ANONYMOUS_ACCESS_NOT_DENIED');
} finally { await client.send(new DeleteObjectCommand({Bucket,Key:canary})); }
let verified=0;
for(const file of approved) {
  const Key=safePath(file.bucket,file.path);
  const encrypted=await readFile(path.join(backup,'storage',hash(Key)+'.enc'));
  if(encrypted.subarray(0,4).toString()!=='RTA1') throw new Error('INVALID_BACKUP_OBJECT');
  const decipher=createDecipheriv('aes-256-gcm',key,encrypted.subarray(4,16));decipher.setAuthTag(encrypted.subarray(-16));
  const bytes=Buffer.concat([decipher.update(encrypted.subarray(16,-16)),decipher.final()]);
  if(hash(bytes)!==file.sha256) throw new Error('SOURCE_FILE_CHECKSUM');
  try { await client.send(new PutObjectCommand({Bucket,Key,Body:bytes,IfNoneMatch:'*',ContentType:file.path.endsWith('.webp')?'image/webp':/\.jpe?g$/.test(file.path)?'image/jpeg':file.path.endsWith('.png')?'image/png':'application/octet-stream',Metadata:{sha256:file.sha256}})); }
  catch(error) { if((error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode!==412) throw new Error('S3_UPLOAD_FAILED'); }
  const uploaded=await client.send(new GetObjectCommand({Bucket,Key}));
  if(!uploaded.Body || hash(Buffer.from(await uploaded.Body.transformToByteArray()))!==file.sha256) throw new Error('S3_READBACK_CHECKSUM');
  verified++;
}
// Every copied key is explicitly named; review photos and unrelated orphan files stay in the backup.
await writeFile(path.join(dir,'storage-result.json'),JSON.stringify({verifiedAt:new Date().toISOString(),privateAccessVerified:true,verifiedFiles:verified,keys:approved.map(f=>safePath(f.bucket,f.path)),excludedFiles:manifest.files.length-approved.length}),{mode:0o600});
console.log(JSON.stringify({verifiedFiles:verified,excludedFiles:manifest.files.length-approved.length}));
