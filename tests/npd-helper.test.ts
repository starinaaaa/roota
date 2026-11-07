import test from "node:test";
import assert from "node:assert/strict";
import {
  receiptPlan,
  kopecks,
  receiptLink,
  planDigest,
  recoveryDecision,
} from "../extensions/roota-npd/core.mjs";
import { createController } from "../extensions/roota-npd/controller.mjs";
const job = () => ({
  sale_id: "fixture-sale",
  claim_token: "a".repeat(64),
  state: "claimed",
  operation_mode: "safe",
  payment_method: "cash",
  paid_at: "2026-11-06T21:05:00Z",
  amount: "12000.00",
  items: [
    {
      name: "Керамическая тарелка «Поцелуй»",
      quantity: 2,
      unitPrice: 6000,
      sum: 12000,
      kind: "goods",
    },
  ],
});
test("NPD plan preserves receipt names, Moscow settlement date and exact kopecks for each unit", async () => {
  const p = receiptPlan(job());
  assert.equal(p.date, "2026-11-07");
  assert.equal(p.total, 1200000);
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[0].name, "Керамическая тарелка «Поцелуй»");
  assert.equal(p.rows[0].kopecks, 600000);
  const split = receiptPlan({
    ...job(),
    amount: "100.00",
    items: [{ name: "Деталь", quantity: 3, sum: 100, kind: "goods" }],
  });
  assert.deepEqual(
    split.rows.map((r) => r.kopecks),
    [3334, 3333, 3333],
  );
  assert.equal(await planDigest(p), await planDigest(receiptPlan(job())));
  assert.equal(kopecks("0.01"), 1);
  for (const value of ["1e3", "-1", "1.001", "NaN"])
    assert.throws(() => kopecks(value));
  assert.throws(
    () => receiptPlan({ ...job(), payment_method: "robokassa" }),
    /Робокассу/,
  );
  assert.throws(() => receiptPlan({ ...job(), amount: 1 }), /итогом/);
  assert.throws(
    () => receiptPlan({ ...job(), buyer_type: "organization" }),
    /организации/,
  );
  assert.throws(
    () =>
      receiptPlan({ ...job(), items: [{ ...job().items[0], unitPrice: 1 }] }),
    /Цена/,
  );
  assert.equal(
    receiptLink(
      "https://lknpd.nalog.ru.evil.test/api/v1/receipt/773212983545/x/print",
    ),
    false,
  );
});
function fixture({
  live = false,
  failResult = false,
  failSave = false,
  failFence = false,
} = {}) {
  const storage: { armed: boolean; active?: { phase: string } } = {
    armed: live,
  };
  let clicks = 0,
    fills = 0,
    fences = 0,
    registered = false;
  const calls: Record<string, unknown>[] = [];
  const io = {
    liveCertified: live,
    load: async () => structuredClone(storage),
    save: async (v: Record<string, unknown>) =>
      Object.assign(storage, structuredClone(v)),
    api: async (
      body: Record<string, unknown>,
    ): Promise<Record<string, unknown>> => {
      calls.push(body);
      if (body.action === "claim")
        return {
          job: { ...job(), operation_mode: live ? "live" : "safe" },
          liveAllowed: live,
        };
      if (body.action === "heartbeat") return { liveAllowed: live };
      if (body.action === "recover") return { job: job() };
      if (body.action === "submit") {
        fences++;
        if (failFence) throw Error("response lost");
        return { maySubmit: true };
      }
      if (body.action === "result") {
        if (failSave) throw Error("Roota offline");
        registered = true;
        return { state: "registered" };
      }
      return {
        state: body.action === "preview" ? "preview_ready" : "uncertain",
      };
    },
    ui: {
      openForm: async () => 123,
      fill: async () => {
        fills++;
        return { total: 1200000 };
      },
      verify: async () => ({ total: 1200000 }),
      submit: async () => {
        clicks++;
      },
      result: async () => {
        if (failResult) throw Error("unknown");
        return {
          url: "https://lknpd.nalog.ru/api/v1/receipt/773212983545/fixture/print",
          registeredAt: "2026-11-07T10:00:00Z",
          pixelHash: "b".repeat(64),
          total: 1200000,
        };
      },
    },
  };
  return {
    io,
    get storage() {
      return storage;
    },
    get clicks() {
      return clicks;
    },
    get fills() {
      return fills;
    },
    get fences() {
      return fences;
    },
    get registered() {
      return registered;
    },
    calls,
  };
}
test("safe mode fills and verifies, and cannot fence, click or mark income issued", async () => {
  const f = fixture();
  const c = createController(f.io);
  await Promise.all([c.start(), c.start()]);
  assert.equal(f.fills, 1);
  assert.equal(f.clicks, 0);
  assert.equal(f.fences, 0);
  assert.equal(f.registered, false);
  assert.equal(f.storage.active?.phase, "preview_ready");
  assert.ok(f.calls.some((c) => c.action === "preview"));
  await assert.rejects(c.start({ safe: false, mode: "live" }));
});
test("fence response loss, lost FNS result and worker restart never submit twice", async () => {
  for (const failFence of [true, false]) {
    const f = fixture({ live: true, failResult: true, failFence });
    await assert.rejects(
      createController(f.io).start({ safe: false, mode: "live" }),
    );
    assert.equal(f.storage.active?.phase, "uncertain");
    const before = f.clicks;
    await assert.rejects(createController(f.io).recover());
    assert.equal(f.clicks, before);
    assert.equal(f.fences, 1);
    assert.equal(f.registered, false);
    assert.ok(
      f.calls.some((c) => c.action === "error" && c.status === "uncertain"),
    );
  }
  for (const phase of [
    "fencing",
    "fenced",
    "clicking",
    "submitted",
    "uncertain",
  ])
    assert.equal(recoveryDecision(phase), "reconcile");
});
test("receipt result is durably persisted and resent without another FNS operation", async () => {
  const f = fixture({ live: true, failSave: true });
  await assert.rejects(
    createController(f.io).start({ safe: false, mode: "live" }),
  );
  assert.equal(f.storage.active?.phase, "result_pending");
  assert.equal(f.clicks, 1);
  f.io.api = async (
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    f.calls.push(body);
    return body.action === "heartbeat" ? {} : { state: "registered" };
  };
  await createController(f.io).recover();
  assert.equal(f.clicks, 1);
  assert.equal(f.storage.active?.phase, "completed");
});
test("an edited sum stops before any server fence or FNS registration", async () => {
  const f = fixture({ live: true });
  f.io.ui.verify = async () => {
    throw Error("Итог изменился");
  };
  await assert.rejects(
    createController(f.io).start({ safe: false, mode: "live" }),
  );
  assert.equal(f.fences, 0);
  assert.equal(f.clicks, 0);
  assert.equal(f.storage.active?.phase, "error");
});

test("recovery accepts a manually reconciled identical receipt without reading or submitting FNS again", async () => {
  const f = fixture({ live: true, failFence: true });
  const controller = createController(f.io);
  await assert.rejects(controller.start({ safe: false, mode: "live" }));
  const oldApi = f.io.api;
  f.io.api = async (body) =>
    body.action === "registered-status"
      ? {
          registered: true,
          url: "https://lknpd.nalog.ru/api/v1/receipt/773212983545/fixture/print",
          registeredAt: "2026-11-07T10:00:00Z",
        }
      : oldApi(body);
  const before = f.clicks;
  await controller.recover();
  assert.equal(f.storage.active?.phase, "completed");
  assert.equal(f.clicks, before);
});
