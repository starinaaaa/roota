import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ParcelList from "../components/order/ParcelList";
import { customerParcels } from "../lib/delivery/customer-parcels";

test("parcel UI renders per-box dates and chronological history without claiming an exact location", () => {
  const parcels = customerParcels(null, [], {
    status_history: {
      postings: [
        {
          posting_number: "FIRST",
          request_id: 1,
          status: "on_way",
          delivery_at: "2026-10-31T18:00:00Z",
          original_delivery_at: "2026-10-30T18:00:00Z",
          history: [
            { status: "on_way", status_changed_at: "2026-10-28T12:00:00Z" },
            { status: "created", status_changed_at: "2026-10-24T12:00:00Z" },
          ],
        },
        {
          posting_number: "SECOND",
          request_id: 2,
          status: "in_delivery_point",
          storage_expires_at: "2026-11-10T18:00:00Z",
          history_error: true,
        },
      ],
    },
  });
  const html = renderToStaticMarkup(createElement(ParcelList, { parcels }));
  assert.match(html, /31 октября/);
  assert.match(html, /30 октября/);
  assert.match(html, /10 ноября/);
  assert.match(html, /<details>/);
  assert.match(html, /История доставки/);
  assert.match(html, /История обновляется/);
  assert.match(html, /FIRST/);
  assert.match(html, /SECOND/);
  assert.doesNotMatch(html, /Сейчас в|координаты/);
  assert.ok(html.indexOf("24 октября") < html.indexOf("28 октября"));
});
