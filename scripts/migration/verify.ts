import path from 'node:path';
import { directory, pool, readJson, guardTarget } from './common';
import type { Manifest } from './export';
import selection from '../../database/migration-selection.json';
import { emptyTables, transferTables } from './policy';
const dir=await directory(process.argv[2]);
const manifest=await readJson<Manifest>(path.join(dir,'manifest.json'));
if(manifest.version!==1 || JSON.stringify(manifest.tables.map(t=>t.name))!==JSON.stringify(transferTables)) throw new Error('EXPORT_MANIFEST_MISMATCH');
const db=pool('TARGET_DATABASE_URL');
try {
  await guardTarget(db);
  const products=(await db.query('select id,name,stock_qty from products order by id')).rows;
  if(products.length!==selection.products.length || products.some(p=>!selection.products.some(s=>s.id===p.id && s.name===p.name))) throw new Error('CATALOGUE_SELECTION_MISMATCH');
  for(const table of manifest.tables) if((await db.query(`select count(*)::int n from public."${table.name}"`)).rows[0].n!==table.count) throw new Error('TABLE_COUNT_MISMATCH');
  for(const table of emptyTables) if((await db.query(`select exists(select 1 from public."${table}") present`)).rows[0].present) throw new Error('PERSONAL_OR_OPERATIONAL_TABLE_NOT_EMPTY');
  const broken=(await db.query("select count(*)::int n from product_images i left join products p on p.id=i.product_id where p.id is null or i.public_url<>('/media/'||i.product_id||'/'||i.id)")).rows[0].n;
  if(broken) throw new Error('IMAGE_REFERENCE_MISMATCH');
  const invoice=(await db.query('select last_value::text n from robokassa_inv_id')).rows[0].n;
  if(BigInt(invoice)<BigInt(manifest.invoiceHighWater)) throw new Error('INVOICE_SEQUENCE_REUSED');
  const email=(await db.query('select enabled,marketing_enabled,test_mode,test_recipients from email_settings')).rows;
  if(email.some(r=>r.enabled||r.marketing_enabled||!r.test_mode||r.test_recipients.length)) throw new Error('EMAILS_NOT_ISOLATED');
  console.log(JSON.stringify({catalogue:products.map(p=>({name:p.name,stock:p.stock_qty})),verifiedEmptyTables:emptyTables.length,invoiceSequenceSafe:true,emailsIsolated:true}));
} finally {await db.end()}
