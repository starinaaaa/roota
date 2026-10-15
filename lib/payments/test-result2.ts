import type { KeyLike } from 'node:crypto';
import { sdkFor, amountInKopecks } from './model';
import { result2PublicKey } from './result2-public-key';

// ResultUrl2 is used only by the isolated migration test. The production
// Password #2 callback stays unchanged until the tested release is promoted.
export function verifiedTestResult2(body:string,env:Record<string,string|undefined>=process.env,key:KeyLike=result2PublicKey) {
  if(env.APP_ENV!=='migration' || env.ROBOKASSA_MODE!=='test' || env.ROBOKASSA_TEST_RESULT2!=='true') throw new Error('TEST_CALLBACK_DISABLED');
  if(body.length>16384) throw new Error('INVALID_NOTIFICATION');
  const {header,data}=sdkFor('test',env).notification.verifyResultURL2(body.trim(),key);
  if(header.type!=='PaymentStateNotification' || data.shop!==env.ROBOKASSA_MERCHANT_LOGIN || typeof data.invId!=='string' || !/^[1-9]\d{0,15}$/.test(data.invId) || typeof data.incSum!=='string') throw new Error('INVALID_NOTIFICATION');
  amountInKopecks(data.incSum);
  return {invoice:data.invId,amount:data.incSum,paid:data.state==='OK'};
}
