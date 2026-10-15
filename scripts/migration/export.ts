import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pool, directory, hash, readJson } from './common';
import { transferTables, emptyTables, sanitizeRow, detectTestContacts } from './policy';
import registry from '../../database/registry.json';
import primaryKeys from '../../database/primary-keys.json';
import sourceFunctions from '../../database/source-functions.json';
import selection from '../../database/migration-selection.json';
import { required } from './common';

export type Manifest = { version: 1; source: string; createdAt: string; schemaSha256: string; invoiceHighWater: string; stockPolicy: string; stockAdjustments: {product_id:string; quantity:number}[];
  tables: { name: string; count: number; sha256: string }[]; emptyTables: string[]; };
const [destination, backupDirectory] = process.argv.slice(2);
const dir = await directory(destination, true);
const backup = await readJson<{ verified: boolean; archiveSha256: string }>(path.join(await directory(backupDirectory), 'restore-verified.json'));
if (!backup.verified || !backup.archiveSha256) throw new Error('VERIFIED_SOURCE_BACKUP_REQUIRED');
// The restored archive is a consistent source too, and avoids transferring the
// large delivery directory over the network a second time.
const fromRestore=process.env.EXPORT_FROM_RESTORE==='true';
if(fromRestore) {
  const url=new URL(required('RESTORE_DATABASE_URL'));
  if(!['localhost','127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_restore')) throw new Error('EXPORT_REQUIRES_LOCAL_VERIFIED_RESTORE');
}
const db = pool(fromRestore ? 'RESTORE_DATABASE_URL' : 'SOURCE_DATABASE_URL');
try {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  if(fromRestore && (await db.query('select archive_sha256 from migration_restore_proof.state')).rows[0]?.archive_sha256!==backup.archiveSha256) throw new Error('RESTORE_ARCHIVE_MISMATCH');
  const actual = (await db.query("select table_name,column_name from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows;
  for (const [table, columns] of Object.entries(registry.tables)) {
    if (JSON.stringify(actual.filter(r=>r.table_name===table).map(r=>r.column_name)) !== JSON.stringify(columns)) throw new Error('SCHEMA_DRIFT');
  }
  const liveTables = (await db.query("select tablename from pg_tables where schemaname='public'")).rows.map(r=>r.tablename).sort();
  if (JSON.stringify(liveTables) !== JSON.stringify(Object.keys(registry.tables).sort())) throw new Error('UNCLASSIFIED_TABLE');
  const dependencies = (await db.query("select conrelid::regclass::text as child,confrelid::regclass::text as parent from pg_constraint where contype='f' and connamespace='public'::regnamespace")).rows;
  for (const fk of dependencies) if ((transferTables as readonly string[]).includes(fk.child) && !(transferTables as readonly string[]).includes(fk.parent)) throw new Error('TRANSFER_DEPENDS_ON_EXCLUDED_TABLE');
  const liveFunctions=(await db.query("select proname,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace")).rows;
  for(const [name,definition] of Object.entries(sourceFunctions)) if(liveFunctions.find(f=>f.proname===name)?.definition!==definition) throw new Error('FUNCTION_DRIFT');
  const stockPolicy=required('MIGRATION_STOCK_POLICY');
  if(!['preserve','release-test-reservations'].includes(stockPolicy)) throw new Error('CHOOSE_REVIEWED_STOCK_POLICY');
  const stockAdjustments=(await db.query("select i.product_id,sum(i.quantity)::int quantity from order_items i join orders o on o.id=i.order_id where o.reservation_state='active' and i.purchase_mode='stock' group by i.product_id order by i.product_id")).rows as {product_id:string;quantity:number}[];
  const adjustment=new Map(stockAdjustments.map(r=>[r.product_id,r.quantity]));
  const selectedIds=selection.products.map(p=>p.id);
  const selected=(await db.query('select id,name,category_id from products where id=any($1::uuid[])',[selectedIds])).rows;
  if(selected.length!==selectedIds.length || selected.some(p=>!selection.products.some(w=>w.id===p.id && w.name===p.name) || !selection.categoryIds.includes(p.category_id))) throw new Error('SELECTED_CATALOGUE_CHANGED');
  const selectedFilter: Record<string,{where:string;args:unknown[]}>= {
    products:{where:'where id=any($1::uuid[])',args:[selectedIds]},
    product_images:{where:'where product_id=any($1::uuid[])',args:[selectedIds]},
    product_redirects:{where:'where product_id=any($1::uuid[])',args:[selectedIds]},
    categories:{where:'where id=any($1::uuid[])',args:[selection.categoryIds]},
    delivery_packing_rules:{where:"where not exists(select 1 from jsonb_array_elements(composition) part where not ((part->>'category_id')=any($1::text[])))",args:[selection.categoryIds]},
  };
  const contacts = (await db.query(`select email value from customers union select phone from customers
    union select customer_email from orders union select customer_phone from orders
    union select email from email_subscriptions union select recipient from email_messages
    union select phone from delivery_quotes union select email from payments
    union select form->>'email' from payment_test_orders union select form->>'phone' from payment_test_orders
    union select contact from waitlist union select email from waitlist union select telegram from waitlist`)).rows.map(r=>r.value).filter(Boolean);
  const schema = await readFile('database/schema.sql','utf8');
  const high = await db.query('select greatest((select last_value from public.robokassa_inv_id),(select coalesce(max(inv_id),0) from payments))::text n');
  const manifest: Manifest = { version:1, source:'tntzcgdakwmzmoygmlur', createdAt:new Date().toISOString(), schemaSha256:hash(schema), invoiceHighWater: high.rows[0].n, stockPolicy, stockAdjustments: stockPolicy==='release-test-reservations'?stockAdjustments.filter(r=>selectedIds.includes(r.product_id)):[], tables:[], emptyTables };
  for (const table of transferTables) {
    // Snapshot is fixed for the entire export; pagination cannot mix revisions.
    const columns = (primaryKeys as Record<string,string[]>)[table];
    let text = '', count = 0;
    const pageSize=5000;
    let cursor:unknown[]|undefined;
    for (;;) {
      const filter=selectedFilter[table],args=filter?.args??[];
      const keys=columns.map(c=>`"${c}"`).join(',');
      const after=cursor ? `${filter?.where?'and':'where'} (${keys}) > (${cursor.map((_,i)=>'$'+(args.length+i+1)).join(',')})` : '';
      const rows=(await db.query(`select to_jsonb(t) row from public."${table}" t ${filter?.where??''} ${after} order by ${keys} limit ${pageSize}`,[...args,...(cursor??[])])).rows;
      for (const {row} of rows) { const clean = sanitizeRow(table,row);
        if(table==='products' && stockPolicy==='release-test-reservations') {
          clean.stock_qty=Number(clean.stock_qty)+(adjustment.get(String(clean.id))??0);
          if(clean.product_kind==='unique' && Number(clean.stock_qty)>1) throw new Error('UNIQUE_STOCK_REQUIRES_MANUAL_REVIEW');
          clean.in_stock=clean.publication_status==='published' && Number(clean.stock_qty)>0;
        }
        if(table==='site_pages' || table==='site_drafts') {
          const payload=clean.payload as {featuredIds:string[]};
          payload.featuredIds=payload.featuredIds.filter(id=>selectedIds.includes(id));
        }
        detectTestContacts(clean,contacts); text += JSON.stringify(clean)+'\n'; count++; }
      if (rows.length<pageSize) break;
      cursor=columns.map(c=>rows.at(-1)!.row[c]);
    }
    await writeFile(path.join(dir,table+'.ndjson'),text,{mode:0o600,flag:'wx'});
    manifest.tables.push({name:table,count,sha256:hash(text)});
    console.log(JSON.stringify({exportedTable:table,rows:count}));
  }
  await db.query('COMMIT');
  await writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({exportedTables:manifest.tables.length,excludedTables:emptyTables.length}));
} catch(error) {
  await db.query('ROLLBACK');
  throw new Error(error instanceof Error && /^[A-Z][A-Z_]+$/.test(error.message) ? error.message : 'SELECTIVE_EXPORT_FAILED_NO_CUSTOMER_DATA_LOGGED');
}
finally { await db.end(); }
