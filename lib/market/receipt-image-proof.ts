import { createHash } from "node:crypto";
import sharp from "sharp";
import jsQR from "jsqr";
import { createWorker } from "tesseract.js";
import russian from "@tesseract.js-data/rus";
import { fetchReceiptDocument } from "./verify-receipt";

export type ImageReceiptPlan = {
  date: string;
  total: number;
  rows: { name: string; kopecks: number }[];
};
const normalized = (s: string) =>
  s
    .normalize("NFC")
    .replace(/[«»„“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
const cents = (s: string) => {
  const clean = s.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+\.\d{2}$/.test(clean))
    throw new Error("Не удалось однозначно прочитать сумму чека");
  const [r, k] = clean.split(".");
  const n = Number(r) * 100 + Number(k);
  if (!Number.isSafeInteger(n)) throw new Error("Недопустимая сумма чека");
  return n;
};

/** Strict OCR parsing; no fuzzy names, invented timestamps, or matching history by amount. */
export function parseReceiptText(text: string, plan: ImageReceiptPlan) {
  if (/аннулир|отмен[её]н|недействител/i.test(text))
    throw new Error(
      "Чек аннулирован или недействителен; нужна сверка продавца",
    );
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const times = [
    ...text.matchAll(
      /\b(\d{2})\.(\d{2})\.(\d{2}|\d{4})\s+(\d{2}):(\d{2})\s*\(\s*(\+03:00)\s*\)/g,
    ),
  ];
  const totals = lines
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => /^Итого\s*:/i.test(s));
  if (times.length !== 1 || totals.length !== 1)
    throw new Error("В чеке нет однозначных даты, времени и итога");
  const [, day, month, y, hour, minute, offset] = times[0];
  const year = y.length === 2 ? "20" + y : y;
  const date = `${year}-${month}-${day}`,
    iso = `${date}T${hour}:${minute}:00${offset}`,
    time = new Date(iso);
  if (
    !Number.isFinite(time.getTime()) ||
    date !== plan.date ||
    Number(month) < 1 ||
    Number(month) > 12 ||
    Number(day) < 1 ||
    Number(day) > new Date(Number(year), Number(month), 0).getDate() ||
    Number(hour) > 23 ||
    Number(minute) > 59
  )
    throw new Error("Дата чека не совпадает с датой расчёта");
  const totalMatches = [...totals[0].s.matchAll(/\d[\d\s]*[,.]\d{2}/g)];
  if (totalMatches.length !== 1 || cents(totalMatches[0][0]) !== plan.total)
    throw new Error("Итог выданного чека не совпадает с покупкой");
  const rows: string[] = [];
  for (const line of lines.slice(0, totals[0].i)) {
    const start = /^(\d{1,3})\.\s+(.+)$/.exec(line);
    if (start) {
      if (Number(start[1]) !== rows.length + 1)
        throw new Error("Нумерация позиций чека неоднозначна");
      rows.push(start[2]);
    } else if (rows.length) rows[rows.length - 1] += " " + line;
  }
  if (rows.length !== plan.rows.length)
    throw new Error("Число позиций выданного чека не совпадает с покупкой");
  rows.forEach((row, i) => {
    const amounts = [...row.matchAll(/\d[\d\s]*[,.]\d{2}/g)];
    if (amounts.length !== 1 || cents(amounts[0][0]) !== plan.rows[i].kopecks)
      throw new Error("Цена позиции чека не совпадает с покупкой");
    const name = row
      .replace(amounts[0][0], "")
      .replace(/\s*[₽РВB]\s*$/u, "")
      .trim();
    if (normalized(name) !== normalized(plan.rows[i].name))
      throw new Error(
        "Наименование в выданном чеке не совпадает со снимком продажи",
      );
  });
  return { registeredAt: time.toISOString(), total: plan.total };
}

let occupied = false;
const cache = new Map<string, { registeredAt: string; total: number }>();
export async function verifyReceiptImage(
  url: string,
  pixelHash: string,
  plan: ImageReceiptPlan,
  notBefore?: Date | null,
  fetcher: typeof fetch = fetch,
) {
  if (!/^[a-f0-9]{64}$/.test(pixelHash))
    throw new Error("Нет отпечатка изображения выданного чека");
  const key = createHash("sha256")
    .update(JSON.stringify({ url, pixelHash, plan }))
    .digest("hex");
  let parsed = cache.get(key);
  if (occupied)
    throw new Error(
      "Сверка другого чека ещё выполняется. Повторите сохранение результата",
    );
  occupied = true;
  try {
    const { bytes, contentType } = await fetchReceiptDocument(url, fetcher);
    if (!/^image\/(png|jpeg|webp)/i.test(contentType))
      throw new Error("ФНС изменила формат изображения чека");
    const { data, info } = await sharp(bytes, { limitInputPixels: 4000000 })
      .flatten({ background: "#fff" })
      .toColourspace("srgb")
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (createHash("sha256").update(data).digest("hex") !== pixelHash)
      throw new Error(
        "Документ ФНС не совпадает с изображением в исходной вкладке",
      );
    const qr = jsQR(new Uint8ClampedArray(data), info.width, info.height, {
      inversionAttempts: "dontInvert",
    });
    if (!qr || qr.data.replace(/\/$/, "") !== url.replace(/\/$/, ""))
      throw new Error("QR изображения не подтверждает оригинальную ссылку ФНС");
    if (!parsed) {
      const bottom =
        Math.floor(
          Math.min(qr.location.topLeftCorner.y, qr.location.topRightCorner.y),
        ) - 8;
      if (bottom < 150 || bottom >= info.height)
        throw new Error("Разметка изображения чека изменилась");
      const image = await sharp(bytes)
        .extract({ left: 0, top: 0, width: info.width, height: bottom })
        .flatten({ background: "#fff" })
        .resize({ width: 1320 })
        .png()
        .toBuffer();
      const worker = await createWorker("rus", 1, {
        langPath: russian.langPath,
        gzip: true,
        cacheMethod: "none",
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          worker.recognize(image),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Error("Не удалось распознать чек за отведённое время"),
                ),
              18000,
            );
          }),
        ]);
        parsed = parseReceiptText(result.data.text, plan);
      } finally {
        clearTimeout(timer);
        await worker.terminate();
      }
      if (cache.size >= 16) cache.delete(cache.keys().next().value!);
      cache.set(key, parsed);
    }
    const registeredAt = new Date(parsed.registeredAt);
    if (
      registeredAt.getTime() > Date.now() + 60000 ||
      (notBefore && registeredAt.getTime() < notBefore.getTime() - 60000)
    )
      throw new Error(
        "Время чека не подтверждает эту отправку. Нужна сверка продавца",
      );
    return {
      url: url.replace(/\/$/, ""),
      registeredAt: parsed.registeredAt,
      verifiedAt: new Date().toISOString(),
      pixelHash,
      total: parsed.total,
    };
  } finally {
    occupied = false;
  }
}
