import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { getPool, transaction } from "@/lib/db/pool";
import { allowedAdminEmail } from "@/lib/auth";
import { getWheelAuth, getWheelOwnerAuth, nameEmail } from "@/lib/wheel/auth";
import {
  changeWheel,
  identityRequired,
  readWheel,
  WheelError,
  wheelTransaction,
  uuid,
} from "@/lib/wheel/server";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function reply(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
function failure(error: unknown) {
  if (error instanceof WheelError)
    return reply({ error: error.message }, error.status);
  console.error("wheel_request_failed");
  return reply(
    {
      error:
        "Не удалось сохранить. Попробуйте ещё раз — введённый текст остаётся на экране.",
    },
    503,
  );
}
export async function GET(request: NextRequest) {
  try {
    const user = await identityRequired();
    const target = request.nextUrl.searchParams.get("person") || user.id;
    if (!uuid.safeParse(target).success)
      throw new WheelError("Профиль не найден.", 404);
    return reply(
      await wheelTransaction(user, (db) => readWheel(db, user, target)),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    // Reject cross-origin writes, including direct calls to the login wrapper.
    const origin = request.headers.get("origin");
    const expected = new URL(process.env.BETTER_AUTH_URL || request.url).origin;
    if (!origin || origin !== expected)
      throw new WheelError("Запрос отклонён. Откройте страницу заново.", 403);
    if (Number(request.headers.get("content-length")) > 50000)
      throw new WheelError("Слишком много текста.", 413);
    const raw = await request.text();
    if (raw.length > 50000) throw new WheelError("Слишком много текста.", 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new WheelError("Неверный запрос.");
    }
    if (["login", "register", "owner-login"].includes(body?.action)) {
      const parsed = z
        .object({
          name: z.string().trim().min(3).max(120),
          password: z.string().min(12).max(128),
          invite: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
        })
        .safeParse(body);
      if (!parsed.success)
        throw new WheelError(
          "Укажите имя и фамилию и пароль от 12 до 128 символов.",
        );
      const { name, password, invite } = parsed.data;
      // Shared database throttle also applies to server-side Better Auth calls.
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown";
      for (const key of [
        hash("wheel-ip:" + ip),
        hash("wheel-name:" + nameEmail(name)),
      ]) {
        const result = await getPool().query(
          "INSERT INTO wheel_login_limit(key,count,reset_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN wheel_login_limit.reset_at<now() THEN 1 ELSE wheel_login_limit.count+1 END,reset_at=CASE WHEN wheel_login_limit.reset_at<now() THEN now()+interval '15 minutes' ELSE wheel_login_limit.reset_at END RETURNING count",
          [key],
        );
        if (result.rows[0].count > 15)
          throw new WheelError(
            "Слишком много попыток. Попробуйте через 15 минут.",
            429,
          );
      }
      try {
        if (body.action === "owner-login") {
          if (!allowedAdminEmail(name))
            throw new WheelError("Не удалось войти. Проверьте данные.", 401);
          await getWheelOwnerAuth().api.signInEmail({
            body: { email: name, password },
            headers: request.headers,
          });
          // Require the same verified/allowlisted session as the existing owner mechanism.
        } else if (body.action === "register") {
          if (!invite || name.split(/\s+/).length < 2)
            throw new WheelError(
              "Нужны имя, фамилия и действующее приглашение.",
            );
          await transaction(async (db) => {
            const invitation = (
              await db.query(
                "SELECT token_hash FROM wheel_invite WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE",
                [hash(invite)],
              )
            ).rows[0];
            if (!invitation)
              throw new WheelError(
                "Приглашение уже использовано или истекло. Попросите новое.",
              );
            await getWheelAuth().api.signUpEmail({
              body: { email: nameEmail(name), name, password },
              headers: request.headers,
            });
            await db.query(
              "UPDATE wheel_invite SET used_at=now() WHERE token_hash=$1",
              [hash(invite)],
            );
          });
        } else
          await getWheelAuth().api.signInEmail({
            body: { email: nameEmail(name), password },
            headers: request.headers,
          });
      } catch (e) {
        if (e instanceof WheelError) throw e;
        throw new WheelError(
          body.action === "register"
            ? "Не удалось создать профиль. Возможно, это имя уже занято."
            : "Не удалось войти. Проверьте данные.",
          401,
        );
      }
      return reply({ ok: true });
    }
    if (body?.action === "logout") {
      await getWheelAuth().api.signOut({ headers: request.headers });
      await getWheelOwnerAuth().api.signOut({ headers: request.headers });
      // Both cookies are scoped to /wheel; store sessions remain independent.
      return reply({ ok: true });
    }
    if (body?.action === "invite") {
      const user = await identityRequired();
      if (!user.owner)
        throw new WheelError("Приглашать может только владелец.", 403);
      const token = randomBytes(32).toString("hex");
      await getPool().query(
        "INSERT INTO wheel_invite(token_hash,created_by) VALUES($1,$2)",
        [hash(token), user.id],
      );
      return reply({ url: expected + "/wheel#invite=" + token });
    }
    return reply(await changeWheel(body));
  } catch (e) {
    return failure(e);
  }
}
