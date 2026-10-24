import "server-only";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { transaction } from "@/lib/db/pool";
import type { PoolClient } from "pg";
import type { WheelData, WheelTask } from "./model";
import { eligibleTasks, parseTasks } from "./model";
import { wheelIdentity } from "./auth";

export class WheelError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const uuid = z.uuid();
const title = z.string().trim().min(1).max(240);
const command = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    text: z.string().max(30000),
    requestId: uuid,
  }),
  z.object({ action: z.literal("edit"), id: uuid, title }),
  z.object({
    action: z.literal("status"),
    id: uuid,
    status: z.enum(["active", "done", "deferred"]),
  }),
  z.object({ action: z.literal("delete"), id: uuid }),
  z.object({ action: z.literal("start"), id: uuid }),
  z.object({ action: z.literal("spin"), reroll: z.boolean().optional() }),
  z.object({ action: z.literal("reset") }),
]);
type Identity = NonNullable<Awaited<ReturnType<typeof wheelIdentity>>>;
export async function wheelTransaction<T>(
  user: Identity,
  work: (db: PoolClient) => Promise<T>,
) {
  return transaction(async (db) => {
    await db.query(
      "SELECT set_config('wheel.user_id',$1,true),set_config('wheel.is_owner',$2,true)",
      [user.id, String(user.owner)],
    );
    await db.query(
      "INSERT INTO wheel_profile(user_id,name) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING",
      [user.id, user.name],
    );
    return work(db);
  });
}
export async function identityRequired() {
  const user = await wheelIdentity();
  if (!user) throw new WheelError("Войдите, чтобы открыть свои задачи.", 401);
  return user;
}
export async function readWheel(
  db: PoolClient,
  user: Identity,
  target = user.id,
): Promise<WheelData> {
  if (target !== user.id && !user.owner)
    throw new WheelError("Это личный список другого человека.", 403);
  const profile = (
    await db.query(
      "SELECT user_id,name,skipped,selected_id FROM wheel_profile WHERE user_id=$1",
      [target],
    )
  ).rows[0];
  if (!profile) throw new WheelError("Профиль не найден.", 404);
  const tasks = (
    await db.query(
      "SELECT id,title,status,started_at,completed_at FROM wheel_task WHERE user_id=$1 AND deleted_at IS NULL ORDER BY created_at,id",
      [target],
    )
  ).rows;
  const people = user.owner
    ? (
        await db.query(
          "SELECT user_id,name FROM wheel_profile ORDER BY created_at",
        )
      ).rows
    : [];
  return { user, profile, tasks, people, readonly: target !== user.id };
}
export async function changeWheel(input: unknown) {
  const user = await identityRequired();
  const parsed = command.safeParse(input);
  if (!parsed.success)
    throw new WheelError("Проверьте данные. Название — от 1 до 240 символов.");
  const value = parsed.data;
  return wheelTransaction(user, async (db) => {
    // Serialize concurrent tabs/requests; selection and exclusions commit together.
    const profile = (
      await db.query(
        "SELECT * FROM wheel_profile WHERE user_id=$1 FOR UPDATE",
        [user.id],
      )
    ).rows[0];
    if (value.action === "add") {
      const lines = parseTasks(value.text);
      if (
        !lines.length ||
        lines.length > 100 ||
        lines.some((t) => !title.safeParse(t).success)
      )
        throw new WheelError(
          "Вставьте от 1 до 100 задач, до 240 символов каждая.",
        );
      const count = Number(
        (
          await db.query(
            "SELECT count(*) FROM wheel_task WHERE user_id=$1 AND deleted_at IS NULL",
            [user.id],
          )
        ).rows[0].count,
      );
      if (count + lines.length > 1000)
        throw new WheelError(
          "В списке уже 1000 задач. Удалите ненужные, чтобы добавить новые.",
        );
      // Stable client request IDs make retrying an interrupted add idempotent.
      await db.query(
        "INSERT INTO wheel_task(id,user_id,title) SELECT overlay(overlay(md5($3 || ':' || ordinal::text) placing '4' from 13) placing '8' from 17)::uuid,$1,title FROM unnest($2::text[]) WITH ORDINALITY AS items(title,ordinal) ON CONFLICT(id) DO NOTHING",
        [user.id, lines, value.requestId],
      );
    } else if (value.action === "reset") {
      await db.query(
        "UPDATE wheel_profile SET skipped='{}',selected_id=NULL WHERE user_id=$1",
        [user.id],
      );
    } else if (value.action === "spin") {
      let skipped: string[] = profile.skipped;
      if (value.reroll && profile.selected_id)
        skipped = [...new Set([...skipped, profile.selected_id])];
      const tasks = (
        await db.query(
          "SELECT id,title,status FROM wheel_task WHERE user_id=$1 AND deleted_at IS NULL ORDER BY created_at,id",
          [user.id],
        )
      ).rows as WheelTask[];
      const candidates = eligibleTasks(tasks, skipped);
      const selected = candidates.length
        ? candidates[randomInt(candidates.length)].id
        : null;
      await db.query(
        "UPDATE wheel_profile SET skipped=$2,selected_id=$3 WHERE user_id=$1",
        [user.id, skipped, selected],
      );
    } else {
      const task = (
        await db.query(
          "SELECT id,status FROM wheel_task WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
          [value.id, user.id],
        )
      ).rows[0];
      if (!task)
        throw new WheelError("Задача уже удалена. Обновите список.", 404);
      if (value.action === "edit")
        await db.query(
          "UPDATE wheel_task SET title=$3 WHERE id=$1 AND user_id=$2",
          [value.id, user.id, value.title],
        );
      if (value.action === "delete")
        await db.query(
          "UPDATE wheel_task SET deleted_at=now() WHERE id=$1 AND user_id=$2",
          [value.id, user.id],
        );
      if (value.action === "start") {
        if (task.status !== "active" || profile.selected_id !== value.id)
          throw new WheelError("Сначала выберите доступную задачу.");
        await db.query(
          "UPDATE wheel_task SET started_at=coalesce(started_at,now()) WHERE id=$1 AND user_id=$2",
          [value.id, user.id],
        );
      }
      if (value.action === "status")
        await db.query(
          "UPDATE wheel_task SET status=$3,completed_at=CASE WHEN $3='done' THEN now() ELSE NULL END,started_at=NULL WHERE id=$1 AND user_id=$2",
          [value.id, user.id, value.status],
        );
      if (value.action === "delete" || value.action === "status")
        await db.query(
          "UPDATE wheel_profile SET selected_id=CASE WHEN selected_id=$2 THEN NULL ELSE selected_id END,skipped=array_remove(skipped,$2::uuid) WHERE user_id=$1",
          [user.id, value.id],
        );
    }
    return readWheel(db, user);
  });
}
