import { pool, required, guardTarget } from './common';
const db=pool('TARGET_DATABASE_URL');
const password=required('RUNTIME_DATABASE_PASSWORD');
if(password.length<24) throw new Error('USE_RANDOM_RUNTIME_PASSWORD');
try {
  await guardTarget(db,false);
  await db.query('BEGIN');
  const escaped=(await db.query('select quote_literal($1) value',[password])).rows[0].value;
  await db.query(`create role roota_app login password ${escaped} nosuperuser nocreatedb nocreaterole noinherit nobypassrls`);
  await db.query(`revoke create on schema public from public;
    grant usage on schema public to roota_app;
    grant select,insert,update,delete on all tables in schema public to roota_app;
    grant usage,select on all sequences in schema public to roota_app;
    grant execute on all functions in schema public to roota_app;`);
  await db.query('COMMIT');
  console.log('Runtime role created; configure DATABASE_URL securely with roota_app, never the owner.');
} catch {await db.query('ROLLBACK');throw new Error('RUNTIME_ROLE_SETUP_FAILED');}
finally {await db.end()}
