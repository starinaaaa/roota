import { hashPassword } from 'better-auth/crypto';
import { randomUUID } from 'node:crypto';
import { pool, required, guardTarget } from './common';
const email=required('ADMIN_BOOTSTRAP_EMAIL').trim().toLowerCase();
const password=required('ADMIN_BOOTSTRAP_PASSWORD');
if(!(required('ADMIN_EMAILS').split(',').map(s=>s.trim().toLowerCase())).includes(email) || password.length<12 || password.length>128) throw new Error('ADMIN_BOOTSTRAP_CONFIG');
const db=pool('TARGET_DATABASE_URL');
try {
  await guardTarget(db,false);
  const digest=await hashPassword(password),id=randomUUID();
  await db.query('BEGIN');
  await db.query('insert into admin_user(id,name,email,"emailVerified","createdAt","updatedAt") values($1,$2,$3,true,now(),now())',[id,'Администратор',email]);
  await db.query('insert into admin_account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") values($1,$2::text,\'credential\',$2::uuid,$3,now(),now())',[randomUUID(),id,digest]);
  await db.query('COMMIT');
  console.log('Administrator created; remove ADMIN_BOOTSTRAP_PASSWORD from the environment.');
} catch {await db.query('ROLLBACK');throw new Error('ADMIN_BOOTSTRAP_FAILED_EXISTING_ACCOUNTS_ARE_NEVER_OVERWRITTEN');}
finally{await db.end()}
