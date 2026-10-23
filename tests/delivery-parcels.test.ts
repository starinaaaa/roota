import test from "node:test";
import assert from "node:assert/strict";
import {
  packingForParcels,
  parcelContexts,
  shipmentDescription,
  type PackingRule,
  type DeliveryContext,
} from "../lib/delivery/model";
import { postingsFor } from "../lib/delivery/postings";
import {
  aggregatePostingStatus,
  shipmentPostings,
} from "../lib/delivery/parcel-status";
const rules: PackingRule[] = [1, 2, 3, 4].map((quantity) => ({
  id: `rule-${quantity}`,
  name: `${quantity}`,
  composition: [{ category_id: "plates", quantity }],
  weight_g: quantity === 1 ? 600 : 1000,
  length_mm: 250,
  width_mm: 250,
  height_mm: 60,
  active: true,
  updated_at: "2026-10-23T00:00:00Z",
}));
const item = {
  product_id: "plate",
  category_id: "plates",
  quantity: 1,
  price: 6000,
  purchase_mode: "stock",
};
test("plates split into pairs plus remainder and declared values never duplicate goods", () => {
  for (const quantity of [1, 2, 3, 4, 5, 6, 9, 100]) {
    const items = [{ ...item, quantity }];
    const packing = packingForParcels(items, rules, "plates");
    const context: DeliveryContext = {
      phone: "+79991234567",
      items,
      packing,
      shipmentMethodId: 1,
    };
    const parcels = parcelContexts(context);
    assert.equal(parcels.length, Math.ceil(quantity / 2));
    assert.deepEqual(
      parcels.map((p) => p.items.reduce((sum, i) => sum + i.quantity, 0)),
      Array.from({ length: Math.ceil(quantity / 2) }, (_, i) =>
        Math.min(2, quantity - i * 2),
      ),
    );
    const postings = postingsFor(context);
    assert.equal(
      postings.reduce((sum, p) => sum + Number(p.declared_value.amount), 0),
      quantity * 6000,
    );
    assert.equal(
      new Set(postings.map((p) => p.request_id)).size,
      postings.length,
    );
    assert.ok(
      postings.every(
        (p) => p.dimensions.length_mm === 250 && p.dimensions.height_mm === 60,
      ),
    );
    if (quantity === 4)
      assert.deepEqual(
        postings.map((p) => p.declared_value.amount),
        ["12000.00", "12000.00"],
      );
  }
});
test("different products and purchase modes retain their quantities and prices", () => {
  const items = [
    item,
    {
      ...item,
      product_id: "other",
      quantity: 3,
      price: 7000,
      purchase_mode: "preorder",
    },
    { ...item, purchase_mode: "preorder", price: 6500 },
  ];
  const plan = packingForParcels(items, rules, "plates");
  const actual = plan.parcels!.flatMap((p) => p.items);
  for (const original of items)
    assert.equal(
      actual
        .filter(
          (i) =>
            i.product_id === original.product_id &&
            i.purchase_mode === original.purchase_mode,
        )
        .reduce((sum, i) => sum + i.quantity, 0),
      original.quantity,
    );
  assert.equal(
    actual.reduce((sum, i) => sum + i.quantity * i.price, 0),
    33500,
  );
  assert.throws(
    () =>
      packingForParcels(
        [{ ...item, quantity: 3 }],
        rules.filter((r) => r.id !== "rule-1"),
        "plates",
      ),
    /упаковка/,
  );
  assert.throws(
    () => packingForParcels([{ ...item, quantity: 0 }], rules, "plates"),
    /количество/,
  );
  assert.throws(
    () =>
      packingForParcels(
        [{ ...item, category_id: "glasses", quantity: 3 }],
        rules,
        "plates",
      ),
    /упаковка/,
  );
});
test("legacy orders keep one frozen parcel and shipment descriptions name plates", () => {
  const context: DeliveryContext = {
    phone: "+79991234567",
    items: [{ ...item, quantity: 4 }],
    packing: rules[3],
    shipmentMethodId: 1,
  };
  assert.equal(postingsFor(context).length, 1);
  assert.equal(postingsFor(context)[0].declared_value.amount, "24000.00");
  assert.equal(
    shipmentDescription([
      { product_name: "Невидимка", quantity: 2, category: { slug: "plates" } },
    ]),
    "Тарелка керамическая «Невидимка» × 2",
  );
  assert.equal(
    shipmentDescription([
      {
        product_name: "Тарелка Невидимка",
        quantity: 1,
        category: { slug: "plates" },
      },
    ]),
    "Тарелка керамическая «Невидимка» × 1",
  );
  assert.equal(
    shipmentDescription([
      { product_name: "Стакан", quantity: 1, category: { slug: "stakany" } },
    ]),
    "Стакан керамический × 1",
  );
  assert.deepEqual(shipmentPostings({ posting_number: "old" }), [
    { posting_number: "old", request_id: 1 },
  ]);
});
test("multiple parcels only reach delivered and pickup when all parcels do", () => {
  const status = (...statuses: string[]) =>
    aggregatePostingStatus(
      statuses.map((s, i) => ({
        posting_number: String(i),
        status: s,
        status_changed_at: "2026-10-23T00:00:00Z",
      })),
    );
  assert.equal(status("delivered", "on_way"), "on_way");
  assert.equal(
    status("in_delivery_point", "ready_for_shipping"),
    "ready_for_shipping",
  );
  assert.equal(status("delivered", "in_delivery_point"), "in_delivery_point");
  assert.equal(status("delivered", "delivered"), "delivered");
  assert.equal(status("canceled", "delivered"), "forming_failed");
  assert.equal(status("canceled", "canceled"), "canceled");
  assert.equal(status("delivered", "new_status"), "unknown");
});

test("checkout sums every parcel in kopecks, requires every quote and the slowest ETA", async () => {
  const { createOzonAdapter } = await import("../lib/delivery/ozon-adapter");
  const items = [{ ...item, quantity: 4 }];
  const context: DeliveryContext = {
    phone: "+79991234567",
    items,
    packing: packingForParcels(items, rules, "plates"),
    shipmentMethodId: 1,
  };
  let results: unknown[] = [1, 2].map((request_id) => ({
    request_id,
    delivery_point_id: 7,
    posting: {
      estimated_delivery_cost: { amount: "114.01", currency_code: "RUB" },
      estimated_insurance_cost: { amount: "72.00", currency_code: "RUB" },
      estimated_delivery_days: request_id === 1 ? 4 : 6,
    },
  }));
  const adapter = createOzonAdapter({
    call: async <T>(_path: string, body: unknown) => {
      assert.equal((body as { postings: unknown[] }).postings.length, 2);
      return { results } as T;
    },
  });
  assert.deepEqual(await adapter.quote(7, context), {
    deliveryCost: 228.02,
    insuranceCost: 144,
    estimatedDays: 6,
  });
  assert.deepEqual(await adapter.checkPoints([7, 8], context), [7]);
  results = results.slice(0, 1);
  assert.deepEqual(await adapter.checkPoints([7], context), []);
  await assert.rejects(adapter.quote(7, context));
  results.push({ request_id: 2, error: { code: "NotAvailable" } });
  await assert.rejects(adapter.quote(7, context));
});

test("Ozon cancellation accepts an empty acknowledgement body", async () => {
  const { OzonTransport } = await import("../lib/delivery/ozon-transport");
  const transport = new OzonTransport("id", "secret", (async (
    url: string | URL | Request,
  ) =>
    String(url).includes("/oauth/token")
      ? Response.json({ access_token: "token", expires_in: 3600 })
      : new Response(null, { status: 200 })) as typeof fetch);
  assert.deepEqual(
    await transport.call("/v1/posting/cancel", { posting_number: "old" }),
    {},
  );
});
