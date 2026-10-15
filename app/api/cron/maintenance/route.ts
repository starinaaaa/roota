import { createServerClient } from '@/lib/db';
import { revalidateTag } from 'next/cache';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  if(!process.env.CRON_SECRET || request.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`) return Response.json({error:'Доступ запрещён'},{status:401});
  const db=createServerClient();
  const {error}=await db.rpc('release_expired_reservations');
  if(error) return Response.json({error:'Задание не выполнено'},{status:503});
  revalidateTag('catalog',{expire:0});
  const cleanup=await db.rpc('clean_old_carts');
  return Response.json({ok:!cleanup.error},{status:cleanup.error?503:200});
}
