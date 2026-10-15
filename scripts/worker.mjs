// A lightweight worker shipped with the same app. Every DB job uses its own
// existing transactional claim/lease; no cloud Supabase scheduler is required.
const secret=process.env.CRON_SECRET;
if(!secret || secret.length<32) throw new Error('CRON_SECRET_NOT_CONFIGURED');
const port=process.env.PORT || '3000';
const busy=new Set();
async function run(path) {
  if(busy.has(path)) return;
  busy.add(path);
  try {
    const response=await fetch(`http://127.0.0.1:${port}/api/cron/${path}`,{headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(250000)});
    if(!response.ok) console.error('scheduled_job_failed',path,response.status);
  } catch { console.error('scheduled_job_unavailable',path); }
  finally { busy.delete(path); }
}
let lastDay='';
setInterval(()=>{
  const now=new Date(),minute=now.getUTCMinutes(),day=now.toISOString().slice(0,10);
  void run('maintenance');
  if(process.env.CUSTOMER_EMAILS_ENABLED==='true') void run('customer-emails');
  if(minute%15===0) void run('order-shipments');
  if(now.getUTCHours()===2 && day!==lastDay) {lastDay=day;void run('delivery-points');}
},60000);
