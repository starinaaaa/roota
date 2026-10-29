import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { postingInfoSchema } from "../lib/delivery/posting-status";
import { enrichPostingTracking } from "../lib/delivery/posting-tracking";
import { customerParcels } from "../lib/delivery/customer-parcels";
import { trackingDate } from "../lib/delivery/tracking-format";
import { syncCarrierReturns } from "../lib/delivery/returns-sync-core";
import { saveReturnApplication } from "../lib/return-request-service";
import { returnRequestSchema } from "../lib/delivery/return-model";
const at = "2026-10-28T12:00:00Z";
const event = (status = "on_way") => ({ status, status_changed_at: at });

test("keeps parcel ETA and storage dates, strips contacts and retries history without aggregate change", async () => {
  const info = postingInfoSchema.parse({
    postings: [
      {
        ...event(),
        posting_number: "A",
        original_delivery_at: "2026-10-30T18:00:00Z",
        delivery_at: "2026-10-31T18:00:00Z",
        recipient: { phone: "private" },
      },
      {
        ...event("in_delivery_point"),
        posting_number: "B",
        delivery_at: null,
        storage_expires_at: "2026-11-10T18:00:00Z",
      },
    ],
  }).postings;
  assert.ok(!("recipient" in info[0]));
  let fail = true;
  const calls: string[] = [];
  const transport = {
    async call<T>(path: string, body: unknown): Promise<T> {
      assert.equal(path, "/v1/posting/status-history");
      const number = (body as { posting_number: string }).posting_number;
      calls.push(number);
      if (number === "B" && fail) throw new Error("unavailable");
      return {
        history: [
          event(number === "B" ? "in_delivery_point" : "on_way"),
          { status: "created", status_changed_at: "2026-10-24T12:00:00Z" },
        ],
      } as T;
    },
  };
  const first = await enrichPostingTracking(
    transport,
    [
      { request_id: 1, posting_number: "A" },
      { request_id: 2, posting_number: "B" },
    ],
    info,
  );
  assert.equal(first[0].history?.[0].status, "created");
  assert.equal(first[1].history_error, true);
  fail = false;
  calls.length = 0;
  const next = await enrichPostingTracking(transport, first, info);
  assert.deepEqual(calls, ["B"]);
  const parcels = customerParcels(null, [], {
    status_history: { postings: next },
  });
  assert.equal(parcels[0].deliveryAt, "2026-10-31T18:00:00Z");
  assert.equal(parcels[1].storageExpiresAt, "2026-11-10T18:00:00Z");
  assert.equal(next[1].history_error, false);
  assert.match(trackingDate(parcels[0].deliveryAt)!, /31 октября/);
});

test("eventual history and shared budget preserve last good history without claiming completion", async () => {
  const info = postingInfoSchema.parse({
    postings: [
      { ...event("delivered"), posting_number: "A", delivery_at: null },
    ],
  }).postings;
  const pending = await enrichPostingTracking(
    { call: async <T>() => ({ history: [event()] }) as T },
    [
      {
        request_id: 1,
        posting_number: "A",
        delivery_at: "2026-10-29T18:00:00Z",
      },
    ],
    info,
  );
  assert.equal(pending[0].history_error, true);
  assert.equal(pending[0].delivery_at, null);
  const unchanged = await enrichPostingTracking(
    {
      call: async () => {
        throw Error("must not call");
      },
    },
    pending,
    info,
    { remaining: 0 },
  );
  assert.deepEqual(unchanged[0].history, pending[0].history);
  assert.equal(unchanged[0].history_for_status_changed_at, undefined);
  await assert.rejects(
    enrichPostingTracking(
      {
        call: async () => {
          throw Error();
        },
      },
      [{ posting_number: "MISSING", request_id: 1 }],
      info,
    ),
    /POSTING_NOT_FOUND/,
  );
});

test("migration is repeatable, terminal history is repaired, and returns stay separate from orders/refunds", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("database/schema.sql", "utf8"));
    const migration = await readFile(
      "database/migrations/20261028_delivery_tracking_returns.sql",
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration);
    const order = (
      await db.query<{ id: string }>(
        `insert into orders(customer_name,customer_phone,total_amount,delivery_type,status,payment_status,delivery_stage) values('Test','Test',6000,'russia','delivered','paid','delivered') returning id`,
      )
    ).rows[0];
    await db.query(
      `insert into order_shipments(order_id,state,posting_number,carrier_status,status_history) values($1,'created','A','delivered',$2)`,
      [
        order.id,
        JSON.stringify({
          postings: [
            {
              request_id: 1,
              posting_number: "A",
              ...event("delivered"),
              history_error: true,
            },
          ],
        }),
      ],
    );
    assert.equal(
      (await db.query(`select * from claim_order_shipment_sync(20)`)).rows
        .length,
      1,
    );
    await db.query(
      `update order_shipments set next_sync_at=now(),status_history=$2 where order_id=$1`,
      [
        order.id,
        JSON.stringify({
          postings: [
            {
              request_id: 1,
              posting_number: "A",
              ...event("delivered"),
              history_for_status_changed_at: at,
            },
          ],
        }),
      ],
    );
    assert.equal(
      (await db.query(`select * from claim_order_shipment_sync(20)`)).rows
        .length,
      0,
    );
    const adapter = {
      query: async (sql: string, values?: unknown[]) =>
        db.query<Record<string, unknown>>(sql, values),
    };
    let pages = 0;
    const transport = {
      async call<T>(path: string, body: unknown): Promise<T> {
        if (path === "/v1/return/search") {
          pages++;
          const cursor = (body as { pagination: { cursor?: string } })
            .pagination.cursor;
          return {
            returns: cursor
              ? []
              : [
                  {
                    return_number: "A",
                    shipment_method_id: 7,
                    status: "at_pickup_point",
                    status_changed_at: at,
                    current_placement_address: "Москва, пункт возврата",
                    cancellation_reason: "Отказ при вручении",
                  },
                ],
            next_cursor: cursor ? null : "NEXT",
          } as T;
        }
        assert.equal(path, "/v1/return/status-history");
        return {
          status_history: [
            { return_status: "at_pickup_point", changed_at: at },
          ],
        } as T;
      },
    };
    assert.deepEqual(await syncCarrierReturns(adapter, transport, 7), {
      checked: 1,
      failed: 0,
      more: false,
    });
    assert.equal(pages, 2);
    const saved = (
      await db.query<{ order_id: string; status: string; history: unknown[] }>(
        `select * from delivery_returns`,
      )
    ).rows[0];
    assert.equal(saved.order_id, order.id);
    assert.equal(saved.status, "at_pickup_point");
    assert.equal(saved.history.length, 1);
    assert.equal(
      (await db.query(`select * from customer_return_requests`)).rows.length,
      0,
    );
    assert.equal(
      (await db.query(`select * from order_returns`)).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          `select status from orders where id=$1`,
          [order.id],
        )
      ).rows[0].status,
      "delivered",
    );
    assert.equal(
      (await syncCarrierReturns(adapter, transport, 7)).skipped,
      true,
    );
    await db.exec(`update delivery_return_sync set next_sync_at=now()`);
    assert.equal(
      (
        await syncCarrierReturns(
          adapter,
          {
            call: async () => {
              throw Error("forbidden");
            },
          },
          7,
        )
      ).failed,
      1,
    );
    assert.equal(
      (await db.query(`select * from delivery_returns`)).rows.length,
      1,
    );
    assert.ok(
      (await db.query(`select last_error from delivery_return_sync`)).rows[0],
    );
    await assert.rejects(
      saveReturnApplication(adapter, order.id, {
        reason: "damaged",
        description: "Изделие повреждено при вручении",
        photos: [],
      }),
      /PHOTO_REQUIRED/,
    );
    await assert.rejects(
      saveReturnApplication(adapter, order.id, {
        reason: "damaged",
        description: "Изделие повреждено при вручении",
        photos: ["another-order/photo.jpg"],
      }),
      /INVALID_PHOTO_PATH/,
    );
    const second = (
      await db.query<{ id: string }>(
        `insert into orders(customer_name,customer_phone,total_amount,delivery_type,status,payment_status) values('Test','Test',6000,'russia','confirmed','paid') returning id`,
      )
    ).rows[0];
    await assert.rejects(
      saveReturnApplication(adapter, second.id, {
        reason: "other",
        description: "Хочу согласовать возврат изделия",
        photos: [],
      }),
      /ORDER_NOT_ELIGIBLE/,
    );
    await db.query(`insert into order_shipments(order_id,state,posting_number,status_history) values($1,'created','PARTIAL',$2)`,[second.id,JSON.stringify({postings:[{posting_number:"PARTIAL",request_id:1,status:"delivered"}]})]);
    await saveReturnApplication(adapter,second.id,{reason:"other",description:"Обращение по первой полученной посылке",photos:[]});
    await saveReturnApplication(adapter, order.id, {
      reason: "other",
      description: "Хочу согласовать возврат изделия",
      photos: [],
    });
    await assert.rejects(
      saveReturnApplication(adapter, order.id, {
        reason: "other",
        description: "Ещё одна заявка на возврат",
        photos: [],
      }),
    );
    await db.query(
      `update customer_return_requests set status='closed' where order_id=$1`,
      [order.id],
    );
    await db.query(
      `insert into customer_return_requests(order_id,reason,description) values($1,'other','Хочу обсудить возврат изделия')`,
      [order.id],
    );
    await assert.rejects(
      db.query(
        `insert into customer_return_requests(order_id,reason,description) values($1,'other','Повторная заявка на изделие')`,
        [order.id],
      ),
    );
  } finally {
    await db.close();
  }
});

test("customer reasons and descriptions are bounded; no shipment/refund instructions in request", () => {
  assert.equal(
    returnRequestSchema.safeParse({
      reason: "damaged",
      description: "Тарелка разбилась при получении",
    }).success,
    true,
  );
  assert.equal(
    returnRequestSchema.safeParse({ reason: "damaged", description: "!" })
      .success,
    false,
  );
  assert.equal(
    returnRequestSchema.safeParse({
      reason: "refund_now",
      description: "Тарелка разбилась при получении",
    }).success,
    false,
  );
});
