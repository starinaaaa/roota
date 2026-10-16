import { Pool } from 'pg';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export function required(key: string) {
  let value = process.env[key];
  if(key==='SOURCE_DATABASE_URL' && !value && process.env.SOURCE_DATABASE_PASSWORD) {
    const url=new URL('postgresql://postgres@db.tntzcgdakwmzmoygmlur.supabase.co:5432/postgres');
    url.password=process.env.SOURCE_DATABASE_PASSWORD;
    value=url.toString();
  }
  if (!value) throw new Error(`MISSING_${key}`);
  return value;
}
export function connection(key: string) {
  const url = new URL(required(key));
  const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  for (const key of ['sslmode','ssl','sslcert','sslrootcert','sslkey']) url.searchParams.delete(key);
  return {
    connectionString: url.toString(), max: 1, connectionTimeoutMillis: 10000,
    ssl: local ? false as const : { rejectUnauthorized: true,
      ...(process.env[`${key}_CA_FILE`] ? { ca: readFileSync(process.env[`${key}_CA_FILE`]!, 'utf8') } : {}),
    },
  };
}
export function pool(key: string) { return new Pool(connection(key)); }
export async function directory(value: string, create = false) {
  if (!value || !path.isAbsolute(value)) throw new Error('ABSOLUTE_DIRECTORY_REQUIRED');
  const dir = path.resolve(value), repo = path.resolve('.');
  if (dir === repo || dir.startsWith(repo + path.sep)) throw new Error('BACKUP_MUST_BE_OUTSIDE_REPOSITORY');
  if (create) await mkdir(dir, {mode:0o700}); // Existing destinations are deliberately refused.
  if (((await stat(dir)).mode & 0o077) !== 0) throw new Error('DIRECTORY_MUST_BE_PRIVATE');
  return dir;
}
export const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
export async function readJson<T>(file: string): Promise<T> { return JSON.parse(await readFile(file,'utf8')); }
export async function guardTarget(target: Pool, sourceRequired = true) {
  const targetUrl = new URL(required('TARGET_DATABASE_URL'));
  if (!targetUrl.pathname.endsWith('_migration') && !(targetUrl.hostname==='2d418c52ffb1faf1ccb7a245.twc1.net' && targetUrl.pathname==='/default_db') && !['localhost','127.0.0.1'].includes(targetUrl.hostname)) throw new Error('USE_ISOLATED_DATABASE_ENDING_IN_MIGRATION');
  if (sourceRequired && new URL(required('SOURCE_DATABASE_URL')).hostname === targetUrl.hostname) throw new Error('SOURCE_AND_TARGET_MUST_DIFFER');
  const { rows } = await target.query("select current_database() as name");
  if (rows[0].name !== decodeURIComponent(targetUrl.pathname.slice(1))) throw new Error('DATABASE_NAME_MISMATCH');
}
