import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Query } from '../lib/db/query';
import { sanitizeRow, detectTestContacts, transferTables, emptyTables, safePath } from '../scripts/migration/policy';
import { paymentInformation } from '../lib/payments/public-mode';
import registry from '../database/registry.json';

test('every application SQL query method is supported by the PostgreSQL adapter',async()=>{
  const supported=new Set(Object.getOwnPropertyNames(Query.prototype));
  for(const root of ['app','lib']) for(const relative of await readdir(root,{recursive:true})) {
    if(!/\.tsx?$/.test(relative) || relative.startsWith('db/')) continue;
    const file=root+'/'+relative,source=ts.createSourceFile(file,await readFile(file,'utf8'),ts.ScriptTarget.Latest,true);
    const visit=(node:ts.Node)=>{
      if(ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const methods:string[]=[];let current:ts.Expression=node;
        while(ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
          const name=current.expression.name.text;
          if(name==='from') {
            const owner=current.expression.expression.getText(source);
            if(owner!=='Array' && !owner.includes('storage')) for(const method of methods) assert.ok(supported.has(method),`${file}: unsupported SQL method ${method}`);
            break;
          }
          methods.push(name);current=current.expression.expression;
        }
      }
      ts.forEachChild(node,visit);
    };visit(source);
  }
});

test('migration is allowlisted; customer data, hidden JSON keys, unsafe paths fail closed',()=>{
  assert.equal(transferTables.length+emptyTables.length,Object.keys(registry.tables).length);
  assert.ok(emptyTables.includes('payments') && emptyTables.includes('customer_reviews') && emptyTables.includes('funnel_events') && emptyTables.includes('delivery_quotes'));
  assert.throws(()=>sanitizeRow('customers',{email:'test@example.invalid'}));
  assert.throws(()=>sanitizeRow('products',{id:'x',buyer_phone:'+79990000000'}));
  assert.throws(()=>sanitizeRow('site_drafts',{id:1,payload:{customerEmail:'test@example.invalid'}}));
  assert.throws(()=>detectTestContacts({description:'Contact test@example.invalid'},['test@example.invalid']));
  assert.doesNotThrow(()=>detectTestContacts({email:'hello@roota.moscow'},['hello@roota.moscow']));
  assert.deepEqual(sanitizeRow('email_settings',{id:1,enabled:true,test_recipients:['test@example.invalid']}),{id:1,enabled:false,test_recipients:[],marketing_enabled:false,test_mode:true});
  for(const file of ['/absolute','../escape','folder/../escape','a\\b']) assert.throws(()=>safePath('products',file));
  assert.throws(()=>safePath('new-unreviewed-bucket','a'));
  assert.match(paymentInformation('live').text,/деньги списываются/i);
  assert.match(paymentInformation('test').text,/не списываются/i);
});

const socket=process.env.ROOTA_MIGRATION_TEST_SOCKET;
test('standalone schema, SQL adapter, claims, inventory, idempotency and role isolation', {skip:!socket},async()=>{
  if(!socket?.startsWith('/')) throw new Error('LOCAL_SOCKET_REQUIRED');
  const config={host:socket,port:55441,user:'roota_test'},database='roota_migration_'+randomUUID().replaceAll('-','');
  const control=new Pool({...config,database:'postgres'});
  let db:Pool|undefined;
  const role='roota_app_'+randomUUID().replaceAll('-','');
  try {
    await control.query(`create database ${database}`);
    db=new Pool({...config,database,max:4});
    await db.query(await readFile('database/schema.sql','utf8'));
    await db.query(await readFile('database/auth.sql','utf8'));
    await control.query(`create role ${role} login nosuperuser nocreatedb nocreaterole nobypassrls`);
    await db.query(`revoke create on schema public from public; grant usage on schema public to ${role}; grant select,insert,update,delete on all tables in schema public to ${role}; grant usage,select on all sequences in schema public to ${role}; grant execute on all functions in schema public to ${role};`);
    await db.query("insert into email_templates(kind,subject,body) values('order_created','Тест','Тест'),('order_paid','Тест','Тест'),('order_cancelled','Тест','Тест')");
    const app=new Pool({...config,user:role,database,max:4});
    try {
      const q=(table:string)=>new Query(app,table);
      const rpc=(fn:string,args:Record<string,unknown>={})=>new Query(app,undefined,fn,args);
      const category=randomUUID(),product=randomUUID(),image=randomUUID(),a=randomUUID(),b=randomUUID();
      assert.equal((await q('categories').insert({id:category,name:'Тест',slug:'test'}).execute()).error,null);
      assert.equal((await q('products').insert({id:product,category_id:category,name:'Последний экземпляр',description:'Описание изделия',slug:'last',price:100,stock_qty:1,publication_status:'published'}).execute()).error,null);
      await q('product_images').insert({id:image,product_id:product,storage_path:'last/a.webp',public_url:`/media/${product}/${image}`,is_primary:true}).execute();
      const row=await q('products').select('id,price,categories (\n name\n),images:product_images (id)').eq('id',product).single().execute();
      assert.equal(row.error,null);assert.equal(row.data.categories.name,'Тест');assert.equal(row.data.images[0].id,image);
      const search=await q('products').select('id',{count:'exact'}).or('name.ilike.%экземпляр%,slug.ilike.%missing%').range(0,0).execute();
      assert.equal(search.count,1);assert.equal(search.data.length,1);
      assert.equal((await q('products').select('id').like('slug','la%').execute()).data.length,1);
      assert.equal((await q('products').select('id').in('id',[]).execute()).data.length,0);
      assert.equal((await q('products').update({stock_qty:2}).execute()).error?.message,'UNBOUNDED_MUTATION');
      assert.throws(()=>q('customers;drop table products'));
      assert.throws(()=>rpc('pg_read_file'));
      for(const session of [a,b]) assert.equal((await rpc('mutate_cart',{p_session:session,p_product:product,p_qty:1,p_operation:'add',p_mode:'stock'}).execute()).error,null);
      const cart=await q('carts').select('id,cart_items(id,quantity)').eq('session_id',a).single().execute();
      assert.equal(cart.data.cart_items[0].quantity,1);
      const form={name:'Тест Тест',phone:'+79990000000',email:'test@example.invalid',deliveryType:'pickup',address:'',comment:''};
      const key=randomUUID();
      const outcomes=await Promise.all([rpc('checkout_order',{p_session:a,p_key:key,p_form:form,p_expected_total:100}).execute(),rpc('checkout_order',{p_session:b,p_key:randomUUID(),p_form:form,p_expected_total:100}).execute()]);
      assert.equal(outcomes.filter(r=>r.error===null).length,1,JSON.stringify(outcomes.map(r=>r.error)));
      assert.equal(outcomes.find(r=>r.error)?.error?.message,'OUT_OF_STOCK');
      const winner=outcomes[0].error?b:a,winningKey=winner===a?key:null;
      if(winningKey) assert.deepEqual((await rpc('checkout_order',{p_session:a,p_key:winningKey,p_form:form,p_expected_total:100}).execute()).data,outcomes[0].data);
      const order=outcomes.find(r=>!r.error)!.data.id;
      const event=await rpc('claim_notification_event',{p_order:order,p_event:'created'}).execute();
      assert.ok(event.data);assert.equal((await rpc('claim_notification_event',{p_order:order,p_event:'created'}).execute()).data,null);
      assert.equal((await rpc('claim_email_messages',{p_limit:1}).execute()).error,null);
      const jobs=await rpc('claim_order_shipment_sync',{p_limit:1}).execute();assert.ok(Array.isArray(jobs.data));
      const empty=await q('products').select('id').eq('slug','absent').maybeSingle().execute();assert.equal(empty.data,null);
      const forbidden=await app.query('create table public.forbidden(id int)').then(()=>false,()=>true);assert.equal(forbidden,true);
      const changed=await rpc('change_order',{p_id:order,p_status:'cancelled',p_payment:'pending',p_notes:'',p_tracking:'',p_reason:'Тест отмены',p_actor:randomUUID()}).execute();assert.equal(changed.error,null);
      assert.equal((await q('products').select('stock_qty').eq('id',product).single().execute()).data.stock_qty,1);
      // PostgreSQL 17 verifies the actual generated schema, rather than old test fixtures.
      assert.equal((await db.query("select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and proname='configure_roota_shipment_sync'")).rows[0].n,0);
    } finally {await app.end()}
  } finally {
    await db?.end();await control.query(`drop database if exists ${database}`);await control.query(`drop role if exists ${role}`);await control.end();
  }
});
