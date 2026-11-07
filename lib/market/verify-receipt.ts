import { validReceiptUrl } from "./model";
import { officialReceiptPdf } from "./pdf";

/** Fetch only an original FNS document. Neither a syntactically valid URL nor HTML is a receipt. */
export async function verifyReceipt(
  url: string,
  registeredAt: string,
  fetcher: typeof fetch = fetch,
) {
  if (!validReceiptUrl(url))
    throw new Error("Нужна ссылка на оригинальный чек ФНС");
  url = url.replace(/\/$/, "");
  const time = new Date(registeredAt);
  if (!Number.isFinite(time.getTime()) || time.getTime() > Date.now() + 60000)
    throw new Error("Укажите время регистрации из чека");
  await fetchReceiptPdf(url, fetcher);
  return {
    url,
    registeredAt: time.toISOString(),
    verifiedAt: new Date().toISOString(),
  };
}

export async function fetchReceiptPdf(
  url: string,
  fetcher: typeof fetch = fetch,
) {
  if (!validReceiptUrl(url))
    throw new Error("Нужна ссылка на оригинальный чек ФНС");
  const result = await fetcher(url, {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!result.ok)
    throw new Error("ФНС не подтвердила чек. Проверьте ссылку и повторите");
  const reader = result.body?.getReader();
  if (!reader) throw new Error("ФНС вернула пустой чек");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("Размер чека слишком большой");
    }
    chunks.push(value);
  }
  if (!size) throw new Error("ФНС вернула пустой чек");
  return officialReceiptPdf(
    Buffer.concat(chunks),
    result.headers.get("content-type") ?? "",
  );
}
