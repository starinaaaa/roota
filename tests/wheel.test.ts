import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  eligibleTasks,
  landingRotation,
  normalizeName,
  parseTasks,
  type WheelTask,
} from "../lib/wheel/model";

test("wheel excludes done, deferred and all previously rerolled tasks", () => {
  const tasks = ["active", "done", "deferred", "active", "active"].map(
    (status, i) => ({
      id: String(i),
      status,
      title: String(i),
      started_at: null,
      completed_at: null,
    }),
  ) as WheelTask[];
  assert.deepEqual(
    eligibleTasks(tasks, ["0", "3"]).map((t) => t.id),
    ["4"],
  );
  assert.deepEqual(eligibleTasks(tasks, ["0", "3", "4"]), []);
  assert.deepEqual(
    eligibleTasks(tasks, []).map((t) => t.id),
    ["0", "3", "4"],
  );
});
test("pointer lands on the exact equally sized selected sector after six turns", () => {
  for (const count of [1, 2, 3, 7, 23, 1000])
    for (let index = 0; index < count; index++) {
      const rotation = landingRotation(2329.5, index, count);
      assert.ok(rotation - 2329.5 >= 2160);
      assert.ok(
        Math.abs((rotation + ((index + 0.5) * 360) / count) % 360) < 0.000001 ||
          Math.abs(((rotation + ((index + 0.5) * 360) / count) % 360) - 360) <
            0.000001,
      );
    }
});
test("bulk paste handles blank lines, CRLF and normalized login names", () => {
  assert.deepEqual(parseTasks("  Дело один\r\n\r\n Дело два \n"), [
    "Дело один",
    "Дело два",
  ]);
  assert.equal(
    normalizeName("  Саша   Иванова "),
    normalizeName("сАША Иванова"),
  );
});
test("database RLS isolates participants and permits only owner read access", async () => {
  const db = new PGlite();
  const a = "10000000-0000-4000-8000-000000000001",
    b = "10000000-0000-4000-8000-000000000002";
  try {
    await db.exec("CREATE ROLE roota_app NOLOGIN NOSUPERUSER NOBYPASSRLS");
    await db.exec(
      await readFile(
        new URL(
          "../database/migrations/20261024_private_wheel.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      `SET ROLE roota_app; SELECT set_config('wheel.user_id','${a}',false),set_config('wheel.is_owner','false',false); INSERT INTO wheel_profile(user_id,name) VALUES('${a}','Человек А'); INSERT INTO wheel_task(user_id,title) VALUES('${a}','Секрет А');`,
    );
    await db.exec(
      `SELECT set_config('wheel.user_id','${b}',false); INSERT INTO wheel_profile(user_id,name) VALUES('${b}','Человек Б'); INSERT INTO wheel_task(user_id,title) VALUES('${b}','Секрет Б');`,
    );
    assert.deepEqual((await db.query("SELECT title FROM wheel_task")).rows, [
      { title: "Секрет Б" },
    ]);
    assert.equal(
      (await db.query(`SELECT * FROM wheel_profile WHERE user_id='${a}'`)).rows
        .length,
      0,
    );
    assert.equal(
      (
        await db.query(
          `UPDATE wheel_task SET title='Чужая правка' WHERE user_id='${a}' RETURNING id`,
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.exec(`UPDATE wheel_task SET user_id='${a}' WHERE user_id='${b}'`),
      /row-level security/,
    );
    await assert.rejects(
      db.exec(`INSERT INTO wheel_task(user_id,title) VALUES('${a}','Подмена')`),
      /row-level security/,
    );
    await db.exec("SELECT set_config('wheel.is_owner','true',false)");
    assert.equal(
      (await db.query("SELECT title FROM wheel_task")).rows.length,
      2,
    );
    assert.equal(
      (
        await db.query(
          `UPDATE wheel_task SET title='Правка владельца' WHERE user_id='${a}' RETURNING id`,
        )
      ).rows.length,
      0,
    );
    await db.exec(
      "SELECT set_config('wheel.user_id','',false),set_config('wheel.is_owner','false',false)",
    );
    assert.equal((await db.query("SELECT * FROM wheel_task")).rows.length, 0);
    await assert.rejects(
      db.exec("DELETE FROM wheel_task"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
