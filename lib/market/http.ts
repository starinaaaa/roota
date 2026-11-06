import "server-only";
import { getAdmin } from "@/lib/auth";
import { isTrustedRequestOrigin } from "@/lib/request-origin";

export const marketHeaders = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
};
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: marketHeaders });
}
export async function adminRequest() {
  return getAdmin();
}
export async function readMarketBody(request: Request) {
  if (
    !isTrustedRequestOrigin(request) ||
    !request.headers.get("content-type")?.startsWith("application/json")
  )
    throw new Error("Недопустимый запрос");
  // Bound actual bytes, including chunked requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Пустой запрос");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16384) {
      await reader.cancel();
      throw new Error("Слишком большой запрос");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function marketError(error: unknown) {
  if (
    error instanceof Error &&
    /[а-яё]/i.test(error.message) &&
    error.name !== "ZodError"
  )
    return json({ error: error.message }, 400);
  console.error("market_request_failed", {
    code: (error as { code?: string })?.code ?? "invalid_request",
  });
  return json(
    {
      error: "Не удалось выполнить действие. Проверьте соединение и повторите",
    },
    400,
  );
}
