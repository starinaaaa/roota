import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifiedTestResult2 } from '../lib/payments/test-result2';

test('migration ResultUrl2 verifies the provider signature and store; it cannot process live payments',()=>{
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const env={APP_ENV:'migration',ROBOKASSA_MODE:'test',ROBOKASSA_TEST_RESULT2:'true',ROBOKASSA_MERCHANT_LOGIN:'test-shop',ROBOKASSA_TEST_PASSWORD1:'dummy-test-one',ROBOKASSA_TEST_PASSWORD2:'dummy-test-two',ROBOKASSA_HASH_ALGORITHM:'md5'};
  const token=(data:Record<string,unknown>,alg='RS256')=>{
    const head=Buffer.from(JSON.stringify({alg,typ:'JWT'})).toString('base64url');
    const payload=Buffer.from(JSON.stringify({header:{type:'PaymentStateNotification'},data})).toString('base64url');
    return head+'.'+payload+'.'+sign('RSA-SHA256',Buffer.from(head+'.'+payload),privateKey).toString('base64url');
  };
  const data={shop:'test-shop',invId:'9000000000001',incSum:'6147.00',state:'OK'};
  assert.deepEqual(verifiedTestResult2(token(data),env,publicKey),{invoice:'9000000000001',amount:'6147.00',paid:true});
  assert.throws(()=>verifiedTestResult2(token({...data,shop:'other'}),env,publicKey));
  assert.throws(()=>verifiedTestResult2(token({...data,incSum:'6147.001'}),env,publicKey));
  assert.throws(()=>verifiedTestResult2(token(data,'none'),env,publicKey));
  const signed=token(data);assert.throws(()=>verifiedTestResult2(signed.slice(0,-8)+'AAAAAAAA',env,publicKey));
  assert.throws(()=>verifiedTestResult2(signed,{...env,APP_ENV:'production'},publicKey));
  assert.throws(()=>verifiedTestResult2(signed,{...env,ROBOKASSA_MODE:'live'},publicKey));
  assert.equal(verifiedTestResult2(token({...data,state:'HOLD'}),env,publicKey).paid,false);
});
