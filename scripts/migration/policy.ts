import registry from '../../database/registry.json';
import { siteSchema } from '../../lib/site-schema';

export const transferTables = [
  'categories', 'products', 'product_images', 'product_redirects',
  'site_pages', 'site_drafts', 'delivery_packing_rules',
  'email_templates', 'email_settings', 'delivery_points', 'delivery_city_catalog',
] as const;
export const emptyTables = Object.keys(registry.tables).filter(t => !(transferTables as readonly string[]).includes(t));
export const businessEmail = 'hello@roota.moscow';
export function sanitizeRow(table: string, row: Record<string, unknown>) {
  const allowed = (registry.tables as Record<string, string[]>)[table];
  if (!allowed || !(transferTables as readonly string[]).includes(table)) throw new Error('TABLE_NOT_APPROVED');
  if (Object.keys(row).some(k=>!allowed.includes(k))) throw new Error('SCHEMA_DRIFT');
  const result = { ...row };
  if (table === 'site_pages' || table === 'site_drafts') result.payload = siteSchema.strict().parse(row.payload);
  if (table === 'email_settings') Object.assign(result, { enabled: false, marketing_enabled: false, test_mode: true, test_recipients: [] });
  if (table === 'product_images') {
    if (!['products', 'product-drafts'].includes(String(row.bucket))) throw new Error('UNAPPROVED_BUCKET');
    result.public_url = `/media/${row.product_id}/${row.id}`;
  }
  if (table === 'delivery_packing_rules') {
    if (!Array.isArray(row.composition) || row.composition.some(x=>!x || typeof x !== 'object' || Object.keys(x).some(k=>!['category_id','quantity'].includes(k))))
      throw new Error('UNREVIEWED_PACKING_JSON');
  }
  return result;
}
export function detectTestContacts(row: Record<string, unknown>, contacts: string[]) {
  const text = JSON.stringify(row).toLowerCase();
  for (const value of contacts) {
    const normalized = value.trim().toLowerCase();
    if (normalized.length >= 7 && normalized !== businessEmail && text.includes(normalized)) throw new Error('TEST_CONTACT_IN_TRANSFER');
  }
}
export function safePath(bucket: string, object: string) {
  if (!['products','product-drafts','review-photos'].includes(bucket) || !object || object.startsWith('/') || object.includes('\\') || object.split('/').some(p=>!p || p==='.' || p==='..')) throw new Error('INVALID_OBJECT_PATH');
  return `${bucket}/${object}`;
}
