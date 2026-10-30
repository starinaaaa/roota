import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  canReviewOrder,
  reviewPhotoError,
  reviewSchema,
  REVIEW_PHOTO_MAX_BYTES,
} from "../lib/reviews";

test("review validation allows five optional photos and requires an explicit rating and public name", () => {
  assert.equal(
    reviewSchema.safeParse({ rating: "", body: "Отзыв", displayName: "Анна" })
      .success,
    false,
  );
  assert.equal(
    reviewSchema.safeParse({
      rating: "1",
      body: "  Не подошло  ",
      displayName: "  Анна  ",
    }).success,
    true,
  );
  assert.equal(
    reviewSchema.safeParse({ rating: "5", body: " ", displayName: "Анна" })
      .success,
    false,
  );
  assert.equal(
    reviewSchema.safeParse({ rating: "5", body: "Отзыв", displayName: " " })
      .success,
    false,
  );
  const photo = { size: REVIEW_PHOTO_MAX_BYTES, type: "image/jpeg" };
  assert.equal(reviewPhotoError([]), null);
  assert.equal(reviewPhotoError(Array(5).fill(photo)), null);
  assert.match(reviewPhotoError(Array(6).fill(photo))!, /не больше 5/);
  assert.match(
    reviewPhotoError([{ ...photo, size: photo.size + 1 }])!,
    /больше 3 МБ/,
  );
  assert.match(reviewPhotoError([{ ...photo, type: "image/heic" }])!, /HEIC/);
  assert.equal(
    canReviewOrder({
      payment_status: "paid",
      status: "delivered",
      delivery_stage: "delivered",
    }),
    true,
  );
  for (const order of [
    {
      payment_status: "pending",
      status: "delivered",
      delivery_stage: "delivered",
    },
    {
      payment_status: "paid",
      status: "cancelled",
      delivery_stage: "delivered",
    },
    { payment_status: "paid", status: "new", delivery_stage: "in_transit" },
  ])
    assert.equal(canReviewOrder(order), false);
});

test("website reviews save name and photos atomically, reward once, and schedule one invitation after seven days", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/schema.sql", "utf8"));
    await db.exec("create role roota_app; create role anon;");
    await db.exec(
      await readFile("database/migrations/20261025_garden.sql", "utf8"),
    );
    await db.exec(
      "insert into email_settings(id,enabled,marketing_enabled,test_mode) values(1,true,true,false); insert into email_templates(kind,subject,body) select kind,kind,kind from unnest(array['review_invite','order_created','order_paid','order_shipped','order_pickup','order_delivered']) kind;",
    );
    await db.exec(
      await readFile("database/migrations/20261029_review_rewards.sql", "utf8"),
    );
    const createOrder = async (consent = true) => {
      const id = randomUUID(),
        token = randomBytes(32).toString("hex");
      await db.query(
        "insert into orders(id,customer_name,customer_phone,customer_email,total_amount,delivery_type,payment_status,status,delivery_stage,request_payload) values($1,'Анна Тестовая','+79990000000','test@example.invalid',1000,'russia','paid','new','in_transit',$2)",
        [id, { form: { reviewConsent: consent } }],
      );
      await db.query("insert into order_access(order_id,token) values($1,$2)", [
        id,
        token,
      ]);
      return { id, token };
    };
    const pending = await createOrder();
    await db.query("update orders set delivery_stage='delivered' where id=$1", [
      pending.id,
    ]);
    // Migration postpones pending mail, without recreating sent invitations.
    const sent = await createOrder();
    await db.query("update orders set delivery_stage='delivered' where id=$1", [
      sent.id,
    ]);
    await db.query(
      "update email_messages set state='accepted' where order_id=$1 and kind='review_invite'",
      [sent.id],
    );
    await db.exec(
      await readFile(
        "database/migrations/20261030_website_reviews.sql",
        "utf8",
      ),
    );
    const delay = (
      await db.query<{ hours: number }>(
        "select extract(epoch from scheduled_at-created_at)/3600 as hours from email_messages where kind='review_invite' and order_id=$1",
        [pending.id],
      )
    ).rows[0];
    assert.ok(Number(delay.hours) >= 168);
    assert.equal(
      (
        await db.query<{ state: string }>(
          "select state from email_messages where order_id=$1 and kind='review_invite'",
          [sent.id],
        )
      ).rows[0].state,
      "accepted",
    );
    const fresh = await createOrder();
    await assert.rejects(
      db.query<{ id: string }>(
        "select submit_customer_review($1,5,'Рано',array[]::text[],false,'Анна')",
        [fresh.token],
      ),
      /ORDER_UNAVAILABLE/,
    );
    await db.query(
      "update orders set delivery_stage='ready_for_pickup' where id=$1",
      [fresh.id],
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from email_messages where order_id=$1 and kind='review_invite'",
          [fresh.id],
        )
      ).rows[0].n,
      0,
    );
    await db.query("update orders set delivery_stage='delivered' where id=$1", [
      fresh.id,
    ]);
    const invite = (
      await db.query<{ ok: boolean }>(
        "select scheduled_at>=created_at+interval '168 hours' ok from email_messages where order_id=$1 and kind='review_invite'",
        [fresh.id],
      )
    ).rows[0];
    assert.equal(invite.ok, true);
    const photos = Array.from({ length: 5 }, (_, i) => `${fresh.id}/${i}.jpg`);
    const saved = (
      await db.query<{ id: string }>(
        "select submit_customer_review($1,1,'  Есть замечания  ',$2::text[],false,'  Анна  ') id",
        [fresh.token, photos],
      )
    ).rows[0].id;
    const review = (
      await db.query<{
        display_name: string;
        body: string;
        photo_paths: string[];
        publication_consent: boolean;
        state: string;
      }>("select * from customer_reviews where id=$1", [saved])
    ).rows[0];
    assert.equal(review.display_name, "Анна");
    assert.equal(review.body, "Есть замечания");
    assert.deepEqual(review.photo_paths, photos);
    assert.equal(review.publication_consent, false);
    assert.equal(review.state, "pending");
    const repeated = (
      await db.query<{ id: string }>(
        "select submit_customer_review($1,5,'Дубль',array[]::text[],true,'Другое имя') id",
        [fresh.token],
      )
    ).rows[0];
    assert.equal(repeated.id, saved);
    assert.equal(
      (
        await db.query<{ display_name: string }>(
          "select display_name from customer_reviews where id=$1",
          [saved],
        )
      ).rows[0].display_name,
      "Анна",
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from review_rewards where source_order_id=$1",
          [fresh.id],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query<{ state: string }>(
          "select state from email_messages where order_id=$1 and kind='review_invite'",
          [fresh.id],
        )
      ).rows[0].state,
      "cancelled",
    );
    const noConsent = await createOrder(false);
    await db.query("update orders set delivery_stage='delivered' where id=$1", [
      noConsent.id,
    ]);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from email_messages where order_id=$1 and kind='review_invite'",
          [noConsent.id],
        )
      ).rows[0].n,
      0,
    );
    const invalid = await createOrder();
    await db.query("update orders set delivery_stage='delivered' where id=$1", [
      invalid.id,
    ]);
    await assert.rejects(
      db.query<{ id: string }>(
        "select submit_customer_review($1,5,'Текст',$2::text[],true,'Анна')",
        [invalid.token, Array(6).fill(`${invalid.id}/x.jpg`)],
      ),
      /INVALID_PHOTOS/,
    );
    await assert.rejects(
      db.query<{ id: string }>(
        "select submit_customer_review($1,5,'Текст',$2::text[],true,'Анна')",
        [invalid.token, [`${fresh.id}/x.jpg`]],
      ),
      /INVALID_PHOTOS/,
    );
    await assert.rejects(
      db.query<{ id: string }>(
        "select submit_customer_review($1,5,'Текст',array[]::text[],true,' ')",
        [invalid.token],
      ),
      /INVALID_DISPLAY_NAME/,
    );
    await db.query<{ id: string }>(
      "select submit_customer_review($1,1,'Без фото',array[]::text[],false,'Анна')",
      [invalid.token],
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from review_rewards where source_order_id=$1",
          [invalid.id],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          "select has_function_privilege('anon','public.submit_customer_review(text,integer,text,text[],boolean,text)','execute') ok",
        )
      ).rows[0].ok,
      false,
    );
  } finally {
    await db.close();
  }
});
