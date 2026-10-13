import { processEmailQueue } from "@/lib/email/queue";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return Response.json({ error: "Доступ запрещён" }, { status: 401 });
  try {
    return Response.json(await processEmailQueue());
  } catch {
    return Response.json(
      { error: "Не удалось обработать почту" },
      { status: 503 },
    );
  }
}
