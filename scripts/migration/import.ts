import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pool, directory, hash, readJson, guardTarget } from './common';
import { transferTables, emptyTables, sanitizeRow } from './policy';
import type { Manifest } from './export';
import registry from '../../database/registry.json';
import { randomBytes } from 'node:crypto';
import { required } from './common';
const dir=await directory(process.argv[2]);
const manifest=await readJson<Manifest>(path.join(dir,'manifest.json'));
const schema=await readFile('database/schema.sql','utf8');
if(manifest.version!==1 || manifest.schemaSha256!==hash(schema) || JSON.stringify(manifest.tables.map(t=>t.name))!==JSON.stringify(transferTables) || JSON.stringify(manifest.emptyTables)!==JSON.stringify(emptyTables)) throw new Error('EXPORT_MANIFEST_MISMATCH');
const db=pool('TARGET_DATABASE_URL');
const compressed=process.env.MIGRATION_COMPRESSED_IMPORT==='true';
if(compressed) {
  const local=new URL(required('RESTORE_DATABASE_URL'));
  if(!['localhost','127.0.0.1'].includes(local.hostname) || !local.pathname.endsWith('_restore')) throw new Error('COMPRESSION_REQUIRES_LOCAL_RESTORE');
}
const encoder=compressed ? pool('RESTORE_DATABASE_URL') : undefined;
const transportKey=compressed ? randomBytes(32).toString('hex') : '';
try {
  await guardTarget(db);
  if((await db.query("select count(*)::int n from pg_tables where schemaname='public'")).rows[0].n) throw new Error('TARGET_MUST_BE_EMPTY');
  // One transaction includes schema + data + validation. No partial imported database.
  await db.query('BEGIN');
  if(compressed) {
    // Trusted pgcrypto supports ZIP-compressed PGP packets. Temporary tools are
    // removed before COMMIT; the application has no extension dependency.
    if((await db.query("select exists(select 1 from pg_extension where extname='pgcrypto') present")).rows[0].present) throw new Error('COMPRESSION_REQUIRES_NO_EXISTING_PGCRYPTO');
    await db.query('create schema roota_migration_tools; create extension pgcrypto with schema roota_migration_tools');
  }
  await db.query(schema.replace(/^BEGIN;\n/m,'').replace(/^COMMIT;\n/m,''));
  await db.query(await readFile('database/studio-notifications.sql','utf8'));
  const triggers=(await db.query("select c.relname table_name,t.tgname name from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal")).rows;
  for(const table of transferTables) await db.query(`alter table public."${table}" disable trigger user`);
  for(const entry of manifest.tables) {
    const content=await readFile(path.join(dir,entry.name+'.ndjson'),'utf8');
    if(hash(content)!==entry.sha256) throw new Error('EXPORT_CHECKSUM');
    const rows=content.split('\n').filter(Boolean).map(s=>sanitizeRow(entry.name,JSON.parse(s)));
    if(rows.length!==entry.count) throw new Error('EXPORT_COUNT_MISMATCH');
    const columns=(registry.tables as Record<string,string[]>)[entry.name].map(c=>`"${c}"`).join(',');
    for(let i=0;i<rows.length;i+=1000) {
      const json=JSON.stringify(rows.slice(i,i+1000));
      const payload=encoder ? (await encoder.query("select pgp_sym_encrypt($1,$2,'compress-algo=1,compress-level=6,cipher-algo=aes256') bytes",[json,transportKey])).rows[0].bytes : json;
      await db.query(`insert into public."${entry.name}" (${columns}) select ${columns} from jsonb_populate_recordset(null::public."${entry.name}",${compressed?'roota_migration_tools.pgp_sym_decrypt($1::bytea,$2)::jsonb':'$1::jsonb'})`,compressed?[payload,transportKey]:[payload]);
      if(i && i%10000===0) console.log(JSON.stringify({importingTable:entry.name,rows:Math.min(i+1000,rows.length)}));
    }
    if((await db.query(`select count(*)::int n from public."${entry.name}"`)).rows[0].n!==entry.count) throw new Error('IMPORTED_COUNT_MISMATCH');
    console.log(JSON.stringify({importedTable:entry.name,rows:entry.count}));
  }
  for(const table of transferTables) await db.query(`alter table public."${table}" enable trigger user`);
  for(const table of emptyTables) if((await db.query(`select exists(select 1 from public."${table}") found`)).rows[0].found) throw new Error('EXCLUDED_TABLE_NOT_EMPTY');
  if(!/^\d{1,16}$/.test(manifest.invoiceHighWater)) throw new Error('INVALID_INVOICE_HIGH_WATER');
  await db.query("select setval('public.robokassa_inv_id',$1::bigint,true)",[manifest.invoiceHighWater]);
  await db.query((await readFile('database/auth.sql','utf8')).replace(/^BEGIN;\n/m,'').replace(/^COMMIT;\n/m,''));
  if((await db.query("select count(*)::int n from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal and t.tgenabled='O'")).rows[0].n!==triggers.length) throw new Error('TRIGGER_RESTORE_MISMATCH');
  if(compressed) await db.query('drop extension pgcrypto; drop schema roota_migration_tools');
  await db.query('COMMIT');
  await writeFile(path.join(dir,'import-result.json'),JSON.stringify({importedAt:new Date().toISOString(),schemaSha256:manifest.schemaSha256,emptyTables,invoiceHighWaterPreserved:true}),{mode:0o600});
  console.log(JSON.stringify({importedTables:manifest.tables.length,emptyTables:emptyTables.length,authReady:true}));
} catch(error) {
  await db.query('ROLLBACK');
  const code=(error as {code?:unknown})?.code;
  throw new Error(error instanceof Error && /^[A-Z][A-Z_]+$/.test(error.message) ? error.message : typeof code==='string' && /^[A-Z0-9]{5}$/.test(code) ? 'IMPORT_SQLSTATE_'+code : 'SELECTIVE_IMPORT_FAILED_DETAILS_SUPPRESSED');
}
finally { await db.end(); await encoder?.end(); }
