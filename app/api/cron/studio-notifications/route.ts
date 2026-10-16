import { getPool } from "@/lib/db/pool";
import { processStudioNotifications } from "@/lib/email/studio-notifications";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return Response.json({ error: "Доступ запрещён" }, { status: 401 });
  try {
    return Response.json(await processStudioNotifications(getPool()));
  } catch {
    return Response.json({ error: "Задание не выполнено" }, { status: 503 });
  }
}
