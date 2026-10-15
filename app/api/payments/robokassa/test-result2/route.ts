import { createServerClient } from '@/lib/db';
import { verifiedTestResult2 } from '@/lib/payments/test-result2';
import { amountInKopecks } from '@/lib/payments/model';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(message:string,status:number)=>new Response(message,{status,headers:{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'}});
export async function POST(request:Request) {
  if(process.env.APP_ENV!=='migration' || process.env.ROBOKASSA_MODE!=='test' || process.env.ROBOKASSA_TEST_RESULT2!=='true') return reply('not found',404);
  let event:ReturnType<typeof verifiedTestResult2>;
  try {event=verifiedTestResult2(await request.text());} catch {return reply('invalid notification',400)}
  if(!event.paid) return reply('ignored',202);
  const db=createServerClient();
  const {data:payment,error}=await db.from('payments').select('id,inv_id,mode,amount').eq('inv_id',event.invoice).eq('mode','test').maybeSingle();
  if(error) return reply('retry later',503);
  if(!payment || amountInKopecks(String(payment.amount))!==amountInKopecks(event.amount)) return reply('payment mismatch',400);
  const result=await db.rpc('confirm_robokassa',{p_payment:payment.id,p_inv_id:event.invoice,p_amount:String(payment.amount),p_mode:'test'});
  return result.error ? reply('retry later',503) : reply('OK'+event.invoice,200);
}
