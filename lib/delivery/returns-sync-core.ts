import { randomUUID } from "node:crypto";
import type { OzonTransport } from "./ozon-transport";
import { returnSearchSchema, returnHistorySchema } from "./return-model";
export interface ReturnDatabase {
  query(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
}

// Only reads Ozon. Stores carrier returns separately from customer applications.
export async function syncCarrierReturns(
  db: ReturnDatabase,
  transport: Pick<OzonTransport, "call">,
  methodId: number,
) {
  const owner = randomUUID();
  const claim = await db.query(
    `update delivery_return_sync set lease_owner=$1,
    lease_until=now()+interval '5 minutes' where id and next_sync_at<=now()
    and (lease_until is null or lease_until<now()) returning cursor`,
    [owner],
  );
  if (!claim.rows.length) return { checked: 0, failed: 0, skipped: true };
  let cursor = claim.rows[0].cursor as string | null;
  let checked = 0,
    historyBudget = 3;
  const deadline = Date.now() + 60000;
  const cursors = new Set<string>();
  try {
    for (let page = 0; page < 3; page++) {
      const response = returnSearchSchema.parse(
        await transport.call("/v1/return/search", {
          pagination: { limit: 100, ...(cursor ? { cursor } : {}) },
          filters: { shipment_method_id: methodId },
        }),
      );
      for (const item of response.returns) {
        if (Date.now() > deadline) throw new Error("RETURN_SYNC_DEADLINE");
        if (item.shipment_method_id !== methodId)
          throw new Error("RETURN_METHOD_MISMATCH");
        const old = (
          await db.query(
            `select history, history_for_status_changed_at, history_error from delivery_returns where return_number=$1`,
            [item.return_number],
          )
        ).rows[0];
        let history = old?.history ?? [],
          caughtUp = old?.history_for_status_changed_at ?? null;
        let historyError = Boolean(old?.history_error);
        const oldDate = old?.history_for_status_changed_at;
        const current =
          oldDate instanceof Date ? oldDate.toISOString() : oldDate;
        if (
          (!current ||
            Date.parse(String(current)) !==
              Date.parse(item.status_changed_at) ||
            historyError) &&
          historyBudget > 0
        ) {
          historyBudget--;
          try {
            const result = returnHistorySchema.parse(
              await transport.call("/v1/return/status-history", {
                return_number: item.return_number,
              }),
            );
            history = result.status_history;
            const found = result.status_history.some(
              (e) =>
                e.return_status === item.status &&
                Date.parse(e.changed_at) === Date.parse(item.status_changed_at),
            );
            caughtUp = found ? item.status_changed_at : null;
            historyError = !found;
          } catch {
            historyError = true;
          }
        }
        // Match both current and archived generations of a replaced posting.
        const matches = (
          await db.query(
            `select order_id from order_shipments where provider='ozon' and
          (posting_number=$1 or jsonb_path_exists(coalesce(status_history,'{}'::jsonb),
           '$.**.posting_number ? (@ == $number)',jsonb_build_object('number',$1::text))
           or ($2::text is not null and jsonb_path_exists(coalesce(request_payload,'{}'::jsonb),
           '$.**.posting_external_id ? (@ == $external)',jsonb_build_object('external',$2::text)))) limit 2`,
            [item.return_number, item.return_external_id || null],
          )
        ).rows;
        await db.query(
          `insert into delivery_returns(return_number,order_id,shipment_method_id,status,status_changed_at,
          created_at,current_placement_name,current_placement_address,cancellation_reason,cancellation_responsible,
          history,history_for_status_changed_at,history_error,synced_at)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now()) on conflict(return_number) do update set
          order_id=coalesce(excluded.order_id,delivery_returns.order_id), status=excluded.status,
          status_changed_at=excluded.status_changed_at,current_placement_name=excluded.current_placement_name,
          current_placement_address=excluded.current_placement_address,cancellation_reason=excluded.cancellation_reason,
          cancellation_responsible=excluded.cancellation_responsible,history=excluded.history,
          history_for_status_changed_at=excluded.history_for_status_changed_at,history_error=excluded.history_error,synced_at=now()
          where excluded.status_changed_at>=delivery_returns.status_changed_at`,
          [
            item.return_number,
            matches.length === 1 ? matches[0].order_id : null,
            methodId,
            item.status,
            item.status_changed_at,
            item.created_at ?? null,
            item.current_placement_name ?? null,
            item.current_placement_address ?? null,
            item.cancellation_reason ?? null,
            item.cancellation_responsible ?? null,
            JSON.stringify(history),
            caughtUp,
            historyError,
          ],
        );
        checked++;
      }
      const next = response.returns.length
        ? response.next_cursor || null
        : null;
      if (next && (next === cursor || cursors.has(next)))
        throw new Error("RETURN_CURSOR_LOOP");
      if (next) cursors.add(next);
      cursor = next;
      await db.query(
        `update delivery_return_sync set cursor=$2 where id and lease_owner=$1`,
        [owner, cursor],
      );
      if (!cursor) break;
    }
    await db.query(
      `update delivery_return_sync set lease_owner=null,lease_until=null,last_error=null,
      synced_at=now(),next_sync_at=now()+case when cursor is null then interval '1 hour' else interval '15 minutes' end
      where id and lease_owner=$1`,
      [owner],
    );
    return { checked, failed: 0, more: Boolean(cursor) };
  } catch {
    await db.query(
      `update delivery_return_sync set lease_owner=null,lease_until=null,
      last_error='Не удалось проверить возвраты Ozon. Повторим автоматически.',next_sync_at=now()+interval '15 minutes'
      where id and lease_owner=$1`,
      [owner],
    );
    return { checked, failed: 1 };
  }
}
