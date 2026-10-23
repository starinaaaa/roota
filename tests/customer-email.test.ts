import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { relationList } from "../lib/relation-list";
import { renderEmail } from "../lib/email/templates";
import { EMAIL_CONSENT_VERSION } from "../lib/legal";
import { parseSignedEmailWebhook, deliveryState } from "../lib/email/webhook";
const migration = "supabase/migrations/20261013222235_customer_email_flows.sql";
async function database() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role roota_app;
 create table products(id uuid primary key,name text,slug text,stock_qty integer,publication_status text);
 create table orders(id uuid primary key,customer_email text,status text default 'new',payment_status text default 'pending',delivery_stage text,cart_session text,reservation_state text default 'active',request_payload jsonb default '{}');
 create table order_access(order_id uuid references orders,token text);
 create table carts(id uuid primary key default gen_random_uuid(),session_id text unique);
 create table cart_items(cart_id uuid references carts,product_id uuid references products,quantity integer);
 create table waitlist(id uuid primary key default gen_random_uuid(),product_id uuid references products,contact text,notified_at timestamptz,unique(product_id,contact));
 create function mutate_cart(s text,p uuid,q integer,op text,mode text) returns void language plpgsql set search_path=public as $$ declare c uuid; begin
 if not exists(select 1 from products where id=p and stock_qty>=q and publication_status='published') then raise exception 'OUT_OF_STOCK'; end if;
 insert into carts(session_id) values(s) on conflict(session_id) do nothing;select id into c from carts where session_id=s;
 delete from cart_items where cart_id=c and product_id=p;insert into cart_items values(c,p,q);end $$;
 create function save_product(uuid,jsonb,jsonb,timestamptz default null) returns uuid language sql as $$ select $1 $$;
 grant usage on schema public to service_role,anon,authenticated;grant all on all tables in schema public to service_role;`);
  await db.exec(await readFile(migration, "utf8"));
  await db.exec(
    await readFile(
      "supabase/migrations/20261013223200_email_queue_claim_guards.sql",
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      "supabase/migrations/20261013223502_review_delivery_guard.sql",
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      "supabase/migrations/20261013231515_restock_direct_consent.sql",
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      "supabase/migrations/20261014001738_checkout_email_consent.sql",
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      "database/migrations/20261021_checkout_consents.sql",
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      "database/migrations/20261023_split_checkout_notifications.sql",
      "utf8",
    ),
  );
  await db.exec("update email_settings set enabled=true,test_mode=false;");
  return db;
}
test("email templates escape buyer content and preserve literal substitutions", () => {
  const result = renderEmail(
    { subject: "Заказ {{number}}", body: "{{items}}" },
    { number: "X\r\nBCC:x", items: "<script>alert(1)</script> {{number}}" },
    "https://roota.moscow/order/abc",
    "Открыть",
  );
  assert.doesNotMatch(result.subject, /[\r\n]/);
  assert.match(result.html, /&lt;script&gt;/);
  assert.doesNotMatch(result.html, /<script>/);
  assert.match(result.plaintext, /\{\{number\}\}/);
});
test("provider webhook authenticates exact bytes, rejects tampering and distinguishes sent from delivered", () => {
  const key = "test-key";
  const base = JSON.stringify({
    auth: key,
    events_by_user: [
      {
        events: [
          {
            event_name: "transactional_email_status",
            event_data: {
              email: "a@example.com",
              job_id: "j",
              status: "delivered",
            },
          },
        ],
      },
    ],
  });
  const signature = createHash("md5").update(base).digest("hex");
  const raw = base.replace(key, signature);
  assert.equal(parseSignedEmailWebhook(raw, key)?.length, 1);
  assert.equal(
    parseSignedEmailWebhook(raw.replace("delivered", "spam"), key),
    null,
  );
  assert.equal(parseSignedEmailWebhook(raw, "wrong"), null);
  assert.equal(deliveryState("sent"), null);
  assert.equal(deliveryState("soft_bounced"), null);
  assert.equal(deliveryState("delivered"), "delivered");
});
test("atomic order events deduplicate, pickup differs from receipt, reviews require consent and cancellations stop queue", async () => {
  const db = await database();
  try {
    const id = randomUUID();
    await db.query<{ n: number; state: string; completed_at: string }>(
      "insert into orders(id,customer_email,cart_session,request_payload) values($1,'buyer@example.com','s',$2)",
      [id, { form: { reviewConsent: true } }],
    );
    await db.query<{ n: number; state: string; completed_at: string }>(
      "update orders set payment_status='paid' where id=$1",
      [id],
    );
    await db.query<{ n: number; state: string; completed_at: string }>(
      "update orders set payment_status='paid' where id=$1",
      [id],
    );
    await db.query<{ n: number; state: string; completed_at: string }>(
      "update orders set delivery_stage='in_transit' where id=$1",
      [id],
    );
    await db.query<{ n: number; state: string; completed_at: string }>(
      "update orders set delivery_stage='ready_for_pickup' where id=$1",
      [id],
    );
    assert.equal(
      (
        await db.query<{ n: number; state: string; completed_at: string }>(
          "select count(*)::int n from email_messages where kind='review_invite'",
        )
      ).rows[0].n,
      0,
    );
    await db.query<{ n: number; state: string; completed_at: string }>(
      "update orders set delivery_stage='delivered',status='delivered' where id=$1",
      [id],
    );
    await db.query<{ n: number; state: string; completed_at: string }>(
      "update orders set delivery_stage='delivered' where id=$1",
      [id],
    );
    assert.equal(
      (
        await db.query<{ n: number; state: string; completed_at: string }>(
          "select count(*)::int n from email_messages",
        )
      ).rows[0].n,
      6,
    );
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          "select scheduled_at>=now()+interval '47 hours' ok from email_messages where kind='review_invite'",
        )
      ).rows[0].ok,
      true,
    );
    await db.query<{ n: number; state: string; completed_at: string }>(
      "update orders set payment_status='refunded' where id=$1",
      [id],
    );
    assert.equal(
      (
        await db.query<{ n: number; state: string; completed_at: string }>(
          "select count(*)::int n from claim_email_messages(20)",
        )
      ).rows[0].n,
      0,
    );
    const noConsent = randomUUID();
    await db.query<{ n: number; state: string; completed_at: string }>(
      "insert into orders(id,customer_email) values($1,'other@example.com')",
      [noConsent],
    );
    await db.query<{ n: number; state: string; completed_at: string }>(
      "update orders set payment_status='paid',delivery_stage='delivered' where id=$1",
      [noConsent],
    );
    assert.equal(
      (
        await db.query<{ n: number; state: string; completed_at: string }>(
          "select count(*)::int n from email_messages where order_id=$1 and kind='review_invite'",
          [noConsent],
        )
      ).rows[0].n,
      0,
    );
    await db.exec("set role anon");
    await assert.rejects(
      db.query<{ n: number; state: string; completed_at: string }>(
        "select * from email_messages",
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.query<{ n: number; state: string; completed_at: string }>(
        "select * from claim_email_messages(10)",
      ),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
test("confirmed waitlist batches three at a time, stops at sold out, and never treats reserve release as replenishment", async () => {
  const db = await database();
  try {
    const p = randomUUID();
    await db.query<{ n: number; state: string; completed_at: string }>(
      "insert into products values($1,'Тарелочка','plate',1,'published')",
      [p],
    );
    for (let i = 0; i < 5; i++) {
      const email = `buyer${i}@example.com`,
        token = String(i + 1).padStart(64, "a");
      await db.query<{ n: number; state: string; completed_at: string }>(
        "insert into waitlist(product_id,contact) values($1,$2)",
        [p, email],
      );
      await db.query<{ n: number; state: string; completed_at: string }>(
        "select request_email_subscription($1,'restock',$2,$3,'v1')",
        [email, p, token],
      );
      if (i < 4)
        await db.query<{ n: number; state: string; completed_at: string }>(
          "select confirm_email_subscription($1)",
          [token],
        );
    }
    await db.query<{ n: number; state: string; completed_at: string }>(
      "select open_email_restock($1)",
      [p],
    );
    await db.exec("select prepare_email_queue();select prepare_email_queue();");
    assert.equal(
      (
        await db.query<{ n: number; state: string; completed_at: string }>(
          "select count(*)::int n from email_messages where kind='restock'",
        )
      ).rows[0].n,
      3,
    );
    await db.query<{ n: number; state: string; completed_at: string }>(
      "update products set stock_qty=0 where id=$1",
      [p],
    );
    await db.exec("select prepare_email_queue();");
    await db.exec("select claim_email_messages(20)");
    assert.equal(
      (
        await db.query<{ n: number; state: string; completed_at: string }>(
          "select count(*)::int n from email_messages where kind='restock' and state='sending'",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query<{ n: number; state: string; completed_at: string }>(
          "select count(*)::int n from waitlist where notified_at is not null",
        )
      ).rows[0].n,
      0,
    );
    await db.query<{ n: number; state: string; completed_at: string }>(
      "update products set stock_qty=1 where id=$1",
      [p],
    );
    await db.exec("select prepare_email_queue();");
    assert.equal(
      (
        await db.query<{ n: number; state: string; completed_at: string }>(
          "select count(*)::int n from email_restock_events where active",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
test("cart double opt-in, expiry, payment cancellation, current activity and atomic restore protect buyers", async () => {
  const db = await database();
  try {
    const p = randomUUID(),
      token = "b".repeat(64);
    await db.query<{ n: number; state: string; completed_at: string }>(
      "insert into products values($1,'Тарелочка','plate',2,'published')",
      [p],
    );
    await db.query<{ n: number; state: string; completed_at: string }>(
      "select request_email_subscription('buyer@example.com','cart','session',$1,'v1',$2)",
      [token, [{ product_id: p, quantity: 1, name: "Тарелочка" }]],
    );
    await db.exec(
      "update checkout_drafts set last_activity_at=now()-interval '3 hours';select prepare_email_queue();",
    );
    assert.equal(
      (
        await db.query<{ n: number; state: string; completed_at: string }>(
          "select count(*)::int n from email_messages where kind='cart_reminder'",
        )
      ).rows[0].n,
      0,
    );
    await db.query<{ n: number; state: string; completed_at: string }>(
      "select confirm_email_subscription($1)",
      [token],
    );
    await db.exec("select prepare_email_queue();");
    assert.equal(
      (
        await db.query<{ n: number; state: string; completed_at: string }>(
          "select count(*)::int n from email_messages where kind='cart_reminder'",
        )
      ).rows[0].n,
      1,
    );
    await db.query<{ n: number; state: string; completed_at: string }>(
      "select mutate_cart('current',$1,1,'set','stock')",
      [p],
    );
    await assert.rejects(
      db.query<{ n: number; state: string; completed_at: string }>(
        "select restore_email_cart($1,'current',false)",
        [token],
      ),
      /CART_NOT_EMPTY/,
    );
    await db.query<{ n: number; state: string; completed_at: string }>(
      "update products set stock_qty=0 where id=$1",
      [p],
    );
    await assert.rejects(
      db.query<{ n: number; state: string; completed_at: string }>(
        "select restore_email_cart($1,'current',true)",
        [token],
      ),
      /OUT_OF_STOCK/,
    );
    assert.equal(
      (
        await db.query<{ n: number; state: string; completed_at: string }>(
          "select count(*)::int n from cart_items",
        )
      ).rows[0].n,
      1,
    );
    await db.query<{ n: number; state: string; completed_at: string }>(
      "update products set stock_qty=2 where id=$1",
      [p],
    );
    await db.query<{ n: number; state: string; completed_at: string }>(
      "select restore_email_cart($1,'current',true)",
      [token],
    );
    assert.equal(
      (
        await db.query<{ n: number; state: string; completed_at: string }>(
          "select state from email_messages where kind='cart_reminder'",
        )
      ).rows[0].state,
      "cancelled",
    );
    await db.query<{ n: number; state: string; completed_at: string }>(
      "insert into orders(id,customer_email,cart_session) values($1,'buyer@example.com','session')",
      [randomUUID()],
    );
    assert.notEqual(
      (
        await db.query<{ n: number; state: string; completed_at: string }>(
          "select completed_at from checkout_drafts",
        )
      ).rows[0].completed_at,
      null,
    );
    await db.query<{ n: number; state: string; completed_at: string }>(
      "select revoke_email_subscription($1,true)",
      [token],
    );
    await db.exec("select claim_email_messages(20)");
    assert.equal(
      (
        await db.query<{ n: number; state: string; completed_at: string }>(
          "select count(*)::int n from email_messages where kind='order_created' and state='sending'",
        )
      ).rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});
test("test mode leaves real recipients untouched and stale send leases become unknown, never pending", async () => {
  const db = await database();
  try {
    await db.exec(
      "update email_settings set test_mode=true;insert into orders(id,customer_email) values(gen_random_uuid(),'buyer@example.com'),(gen_random_uuid(),'hello@roota.moscow');",
    );
    assert.equal(
      (
        await db.query<{ n: number; state: string; completed_at: string }>(
          "select count(*)::int n from claim_email_messages(10)",
        )
      ).rows[0].n,
      1,
    );
    await db.exec(
      "update email_messages set claimed_at=now()-interval '11 minutes' where state='sending';select prepare_email_queue();",
    );
    assert.equal(
      (
        await db.query<{ n: number; state: string; completed_at: string }>(
          "select state from email_messages where recipient='hello@roota.moscow'",
        )
      ).rows[0].state,
      "unknown",
    );
    assert.equal(
      (
        await db.query<{ n: number; state: string; completed_at: string }>(
          "select count(*)::int n from claim_email_messages(10)",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});

test("a changed checkout contact invalidates old cart letters; cancelled rows do not delay valid messages", async () => {
  const db = await database();
  try {
    const product = randomUUID(),
      oldToken = "c".repeat(64),
      newToken = "d".repeat(64);
    await db.query(
      "insert into products values($1,'Изделие','plate',1,'published')",
      [product],
    );
    const items = [{ product_id: product, name: "Изделие", quantity: 1 }];
    await db.query(
      "select request_email_subscription('old@example.com','cart','same-session',$1,'v1',$2)",
      [oldToken, items],
    );
    await db.query("select confirm_email_subscription($1)", [oldToken]);
    await db.query(
      "select request_email_subscription('new@example.com','cart','same-session',$1,'v1',$2)",
      [newToken, items],
    );
    await db.query("select confirm_email_subscription($1)", [newToken]);
    await db.exec(
      "update email_messages set state='cancelled' where kind='confirm';",
    );
    const claimed = await db.query<{ recipient: string }>(
      "select recipient from claim_email_messages(1)",
    );
    assert.equal(claimed.rows.length, 1);
    assert.equal(claimed.rows[0].recipient, "new@example.com");
    assert.equal(
      (
        await db.query<{ state: string }>(
          "select state from email_messages where recipient='old@example.com' and kind='cart_link'",
        )
      ).rows[0].state,
      "cancelled",
    );
  } finally {
    await db.close();
  }
});

test("review submission rejects missing delivery, preserves any rating and deduplicates replies", async () => {
  const db = await database();
  try {
    const id = randomUUID(),
      token = "e".repeat(64);
    await db.query(
      "insert into orders(id,customer_email,payment_status) values($1,'buyer@example.com','paid')",
      [id],
    );
    await db.query("insert into order_access(order_id,token) values($1,$2)", [
      id,
      token,
    ]);
    await assert.rejects(
      db.query(
        "select submit_customer_review($1,1,'Не понравилось',array[]::text[],true)",
        [token],
      ),
      /ORDER_UNAVAILABLE/,
    );
    await db.query(
      "update orders set delivery_stage='delivered',status='delivered' where id=$1",
      [id],
    );
    await db.query(
      "select submit_customer_review($1,1,'Не понравилось',array[]::text[],true)",
      [token],
    );
    await db.query(
      "select submit_customer_review($1,5,'Дубликат',array[]::text[],false)",
      [token],
    );
    const { rows } = await db.query<{
      rating: number;
      body: string;
      publication_consent: boolean;
      state: string;
    }>("select rating,body,publication_consent,state from customer_reviews");
    assert.deepEqual(rows, [
      {
        rating: 1,
        body: "Не понравилось",
        publication_consent: true,
        state: "pending",
      },
    ]);
  } finally {
    await db.close();
  }
});

test("direct restock consent activates immediately without confirming ownership, deduplicates and respects revocation", async () => {
  const db = await database();
  try {
    const p = randomUUID(),
      token = "b".repeat(64);
    await db.query(
      "insert into products values($1,'Тарелка','plate',1,'published')",
      [p],
    );
    await db.query(
      "select subscribe_restock('direct@example.com',$1,$2,'direct-v1')",
      [p, token],
    );
    await db.query(
      "select subscribe_restock('direct@example.com',$1,$2,'direct-v1')",
      [p, "c".repeat(64)],
    );
    const c = (
      await db.query<{
        confirmed_at: null;
        direct_consent_at: string;
        token: string;
      }>("select confirmed_at,direct_consent_at,token from email_subscriptions")
    ).rows;
    assert.equal(c.length, 1);
    assert.equal(c[0].confirmed_at, null);
    assert.ok(c[0].direct_consent_at);
    assert.equal(c[0].token, token);
    assert.equal(
      (await db.query("select * from email_messages where kind='confirm'")).rows
        .length,
      0,
    );
    await db.query("select open_email_restock($1)", [p]);
    await db.exec("select prepare_email_queue()");
    assert.equal(
      (await db.query("select * from claim_email_messages(10)")).rows.length,
      1,
    );
    await db.query("select revoke_email_subscription($1,false)", [token]);
    await db.exec(
      "update email_messages set state='pending'; select claim_email_messages(10)",
    );
    assert.equal(
      (await db.query<{ state: string }>("select state from email_messages"))
        .rows[0].state,
      "cancelled",
    );
    await db.query(
      "select subscribe_restock('direct@example.com',$1,$2,'direct-v1')",
      [p, "d".repeat(64)],
    );
    assert.equal(
      (
        await db.query<{ revoked_at: null }>(
          "select revoked_at from email_subscriptions",
        )
      ).rows[0].revoked_at,
      null,
    );
  } finally {
    await db.close();
  }
});

test("single checkout consent saves news and cart directly, suppresses confirmation, restores safely and revokes only its session", async () => {
  const db = await database();
  try {
    const p = randomUUID(),
      session = randomUUID();
    await db.query(
      "insert into products values($1,'Тарелка','plate',2,'published')",
      [p],
    );
    const items = [{ product_id: p, name: "Тарелка", quantity: 1 }];
    await db.query(
      "select sync_checkout_email_consent($1,'all@example.com',true,$2,$3,'all-v1',$4)",
      [session, "a".repeat(64), "b".repeat(64), items],
    );
    const c = (
      await db.query<{
        purpose: string;
        direct_consent_at: string;
        confirmed_at: null;
      }>(
        "select purpose,direct_consent_at,confirmed_at from email_subscriptions order by purpose",
      )
    ).rows;
    assert.deepEqual(
      c.map((x) => x.purpose),
      ["cart", "news"],
    );
    assert.ok(c.every((x) => x.direct_consent_at && x.confirmed_at === null));
    assert.equal(
      (await db.query("select * from email_messages")).rows.length,
      0,
    );
    await db.exec(
      "update checkout_drafts set last_activity_at=now()-interval '3 hours'; select prepare_email_queue();",
    );
    assert.equal(
      (
        await db.query(
          "select * from claim_email_messages(10) where kind='cart_reminder'",
        )
      ).rows.length,
      1,
    );
    await db.query("select restore_email_cart($1,$2,false)", [
      "a".repeat(64),
      randomUUID(),
    ]);
    await db.query(
      "select sync_checkout_email_consent('other-session','all@example.com',true,$1,$2,'all-v1',$3)",
      ["c".repeat(64), "d".repeat(64), items],
    );
    await db.query(
      "select sync_checkout_email_consent($1,'',false,$2,$3,'all-v1','[]')",
      [session, "e".repeat(64), "f".repeat(64)],
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from email_subscriptions where resource=$1 and revoked_at is null",
          [session],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from email_subscriptions where resource='other-session' and revoked_at is null",
        )
      ).rows[0].n,
      2,
    );
    await db.query(
      "select sync_checkout_email_consent('other-session','new@example.com',true,$1,$2,'all-v1',$3)",
      ["e".repeat(64), "f".repeat(64), items],
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from email_subscriptions where email='all@example.com' and revoked_at is null",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from email_subscriptions where email='new@example.com' and revoked_at is null",
        )
      ).rows[0].n,
      2,
    );
  } finally {
    await db.close();
  }
});

test("committed order keeps advertising separate and records its current edition before autosave", async () => {
  const db = await database();
  try {
    await db.query(
      "insert into orders(id,customer_email,cart_session,request_payload) values($1,'yes@example.com','yes-session',$2)",
      [
        randomUUID(),
        {
          form: {
            acceptedTerms: true,
            emailConsent: true,
            reviewConsent: true,
            newsletterDataConsent: true,
            subscribeToNews: true,
            emailConsentVersion: EMAIL_CONSENT_VERSION,
          },
        },
      ],
    );
    for (const form of [
      { emailConsent: true },
      {
        emailConsent: true,
        newsletterDataConsent: true,
        subscribeToNews: false,
        emailConsentVersion: EMAIL_CONSENT_VERSION,
      },
      {
        emailConsent: true,
        newsletterDataConsent: true,
        subscribeToNews: true,
        emailConsentVersion: "old",
      },
    ]) {
      await db.query(
        "insert into orders(id,customer_email,cart_session,request_payload) values($1,'unconfirmed@example.com',$2,$3)",
        [randomUUID(), randomUUID(), { form }],
      );
    }
    assert.equal(
      (
        await db.query(
          "select * from email_subscriptions where email='unconfirmed@example.com'",
        )
      ).rows.length,
      0,
    );
    await db.query(
      "insert into orders(id,customer_email,cart_session,request_payload) values($1,'no@example.com','no-session',$2)",
      [randomUUID(), { form: { emailConsent: false } }],
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from email_subscriptions where purpose='news' and email='yes@example.com' and direct_consent_at is not null and confirmed_at is null",
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select * from email_subscriptions where email='no@example.com'",
        )
      ).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});

test("one-to-one payment relation supplies paid date and reservation without crashing order emails", () => {
  const payment = {
    status: "paid",
    paid_at: "2026-10-14T09:46:52Z",
    expires_at: null,
  };
  for (const relation of [payment, [payment], null]) {
    const payments = relationList(relation);
    assert.equal(
      payments.find((p) => p.status === "paid")?.paid_at,
      relation ? payment.paid_at : undefined,
    );
  }
});
test("order email includes purchase and delivery details, escapes content and normalizes stored line breaks", () => {
  const result = renderEmail(
    { subject: "Заказ {{number}}", body: "Оплата получена.\\\\nСпасибо!" },
    {
      number: "GL-20261014-0F81B91A",
      date: "14 октября",
      items: "Тарелка <Поцелуй> × 2 — 200 ₽",
      total: "321",
      shipping: "121 ₽",
      recipient: "Покупатель",
      delivery: "Ozon",
      address: "Москва",
      tracking: "123456",
      payment: "Оплачено",
    },
    "https://roota.moscow/order/abc",
    "Открыть заказ",
    undefined,
    true,
  );
  assert.equal(result.subject, "Заказ GL-20261014-0F81B91A");
  assert.match(result.plaintext, /Заказ № GL-20261014-0F81B91A/);
  assert.doesNotMatch(result.html + result.plaintext, /страхова/i);
  assert.match(result.html, /&lt;Поцелуй&gt;/);
  assert.match(result.plaintext, /Доставка: 121 ₽/);
  assert.match(result.plaintext, /Номер отправления: 123456/);
  assert.doesNotMatch(result.html, /\\n/);
});

test("purchase email shows photos, unit prices and a printable confirmation without unsafe image URLs", () => {
  const values = {
    number: "GL-20261014-TEST",
    items: "Изделие × 2 — 300 ₽",
    total: "421",
    shipping: "121 ₽",
    date: "14 октября",
    recipient: "Покупатель",
    delivery: "Ozon",
    address: "Москва",
    tracking: "POST-1",
    payment: "Оплачено",
    fulfillment: "Передадим в доставку за 1–3 рабочих дня.",
    document_url: "https://roota.moscow/order/token/confirmation",
  };
  const result = renderEmail(
    { subject: "Заказ {{number}}", body: "Спасибо!" },
    values,
    "https://roota.moscow/order/token",
    "Открыть заказ",
    undefined,
    true,
    [
      {
        name: "Тарелка <Лес>",
        quantity: 2,
        price: 150,
        imageUrl: "https://roota.moscow/media/product/image",
      },
      { name: "Чашка", quantity: 1, price: 1, imageUrl: "javascript:alert(1)" },
    ],
  );
  assert.match(
    result.html,
    /<img src="https:\/\/roota.moscow\/media\/product\/image"/,
  );
  assert.match(result.html, /Тарелка &lt;Лес&gt;/);
  assert.match(result.html, /2 шт. × 150/);
  assert.match(result.html, /Сохранить подтверждение покупки/);
  assert.match(
    result.plaintext,
    /Подтверждение покупки: https:\/\/roota.moscow\/order\/token\/confirmation/,
  );
  assert.match(result.html, /Передадим в доставку за 1–3 рабочих дня/);
  for (const message of [result.html, result.plaintext]) {
    assert.match(message, /14 дней после получения/);
    assert.match(message, /номер заказа и что хотите вернуть/);
    assert.match(message, /hello@roota\.moscow/);
    assert.match(message, /не позднее 10 дней/);
  }
  assert.doesNotMatch(result.html, /javascript:/);
});

test("marketing unsubscribe cancels subscription mail while order mail remains eligible; hard bounce blocks both", async () => {
  const db = await database();
  try {
    const order = randomUUID();
    await db.query(
      "insert into orders(id,customer_email,cart_session) values($1,'isolated@example.test',$2)",
      [order, randomUUID()],
    );
    await db.exec(
      "insert into email_blocks(email,reason) values('isolated@example.test','marketing_unsubscribed'); insert into email_messages(event_key,kind,recipient) values('marketing-test','confirm','isolated@example.test');",
    );
    const claimed = await db.query<{ kind: string }>(
      "select kind from claim_email_messages(10)",
    );
    assert.deepEqual(
      claimed.rows.map((row) => row.kind),
      ["order_created"],
    );
    assert.equal(
      (
        await db.query<{ state: string }>(
          "select state from email_messages where event_key='marketing-test'",
        )
      ).rows[0].state,
      "cancelled",
    );
    await db.exec(
      "update email_blocks set reason='bounced'; insert into email_messages(event_key,kind,recipient) values('service-test','order_paid','isolated@example.test');",
    );
    assert.equal(
      (await db.query("select * from claim_email_messages(10)")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query<{ state: string }>(
          "select state from email_messages where event_key='service-test'",
        )
      ).rows[0].state,
      "cancelled",
    );
  } finally {
    await db.close();
  }
});

test("required checkout notices save the basket without advertisements and disabling advertisements keeps the reminder", async () => {
  const db = await database();
  try {
    const session = randomUUID(),
      product = randomUUID();
    await db.query(
      "insert into products values($1,'Невидимка','invisible',10,'published')",
      [product],
    );
    const items = JSON.stringify([
      { product_id: product, quantity: 1, name: "Невидимка" },
    ]);
    const sync = (service: boolean, marketing: boolean) =>
      db.query(
        "select sync_checkout_notifications($1,'separate@example.test',$2,$3,$4,$5,$6,$7)",
        [
          session,
          service,
          marketing,
          randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", ""),
          randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", ""),
          EMAIL_CONSENT_VERSION,
          items,
        ],
      );
    await sync(true, false);
    assert.equal(
      (
        await db.query("select 1 from checkout_drafts where session_id=$1", [
          session,
        ])
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select 1 from email_subscriptions where purpose='news' and resource=$1 and revoked_at is null",
          [session],
        )
      ).rows.length,
      0,
    );
    await sync(true, true);
    assert.equal(
      (
        await db.query(
          "select 1 from email_subscriptions where purpose='news' and resource=$1 and revoked_at is null",
          [session],
        )
      ).rows.length,
      1,
    );
    await sync(true, false);
    assert.equal(
      (
        await db.query(
          "select 1 from email_subscriptions where purpose='cart' and resource=$1 and revoked_at is null",
          [session],
        )
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select 1 from email_subscriptions where purpose='news' and resource=$1 and revoked_at is null",
          [session],
        )
      ).rows.length,
      0,
    );
    await db.exec(
      "update email_settings set marketing_enabled=true; update checkout_drafts set last_activity_at=now()-interval '3 hours'",
    );
    await db.query("select prepare_email_queue()");
    assert.equal(
      (
        await db.query(
          "select 1 from email_messages where kind='cart_reminder' and state='pending'",
        )
      ).rows.length,
      1,
    );
    await sync(false, false);
    assert.equal(
      (
        await db.query(
          "select 1 from email_subscriptions where resource=$1 and revoked_at is null",
          [session],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select 1 from email_messages where kind='cart_reminder' and state='pending'",
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "select sync_checkout_notifications($1,'bad',true,false,$2,$3,$4,'[]')",
        [session, "x".repeat(64), "y".repeat(64), EMAIL_CONSENT_VERSION],
      ),
      /INVALID_INPUT/,
    );
    await db.exec("set role anon");
    await assert.rejects(
      db.query(
        "select sync_checkout_notifications('x','',false,false,'','','','[]')",
      ),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test("order confirmations, payment updates and review invitations do not require advertisements", async () => {
  const db = await database();
  try {
    const id = randomUUID();
    await db.query(
      "insert into orders(id,customer_email,cart_session,request_payload) values($1,'service@example.test',$2,$3)",
      [
        id,
        randomUUID(),
        {
          form: {
            acceptedTerms: true,
            emailConsent: true,
            reviewConsent: true,
            subscribeToNews: false,
            newsletterDataConsent: false,
            emailConsentVersion: EMAIL_CONSENT_VERSION,
          },
        },
      ],
    );
    await db.query("update orders set payment_status='paid' where id=$1", [id]);
    await db.query("update orders set delivery_stage='delivered' where id=$1", [
      id,
    ]);
    const kinds = (
      await db.query<{ kind: string }>(
        "select kind from email_messages where order_id=$1 order by kind",
        [id],
      )
    ).rows.map((r) => r.kind);
    assert.deepEqual(kinds, [
      "order_created",
      "order_delivered",
      "order_paid",
      "review_invite",
    ]);
    assert.equal(
      (
        await db.query(
          "select 1 from email_subscriptions where purpose='news' and email='service@example.test'",
        )
      ).rows.length,
      0,
    );
    await db.query("select prepare_email_queue()");
    assert.equal(
      (
        await db.query(
          "select 1 from email_messages where order_id=$1 and kind='review_invite' and state='pending'",
          [id],
        )
      ).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});
