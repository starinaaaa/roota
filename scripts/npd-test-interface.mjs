// Loopback fixture only. No FNS credentials, network integration or real income.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import QRCode from "qrcode";
import { fixtureHtml } from "../extensions/roota-npd/test-fixture.mjs";
let lost = false;
const docs = new Map();
const xml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
async function receipt(body) {
  if (
    !Array.isArray(body.rows) ||
    !body.rows.length ||
    body.rows.length > 100 ||
    !/^\d{2}\.\d{2}\.\d{4}$/.test(body.date)
  )
    throw Error("FIXTURE_INPUT");
  const id = randomUUID(),
    url =
      "https://lknpd.nalog.ru/api/v1/receipt/773212983545/roota-helper-local-fixture-" +
      id +
      "/print";
  let y = 140,
    total = 0;
  const texts = [
    `<text x="24" y="32" font-weight="bold">Чек №fixture</text>`,
    `<text x="24" y="62">${body.date.slice(0, 6) + body.date.slice(-2)} ${new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date())}(+03:00)</text>`,
    `<text x="24" y="106">Наименование</text><text x="376" y="106" text-anchor="end">Сумма</text>`,
  ];
  body.rows.forEach((r, i) => {
    if (
      typeof r.name !== "string" ||
      r.name.length > 128 ||
      !/^\d+(\.\d{1,2})?$/.test(r.price)
    )
      throw Error("FIXTURE_ROW");
    const n = Math.round(Number(r.price) * 100);
    total += n;
    const words = r.name.split(" "),
      lines = [""];
    for (const word of words) {
      if ((lines.at(-1) + " " + word).trim().length > 26) lines.push(word);
      else lines[lines.length - 1] = (lines.at(-1) + " " + word).trim();
    }
    texts.push(
      `<text x="24" y="${y}">${i + 1}.</text><text x="376" y="${y}" text-anchor="end">${(n / 100).toFixed(2).replace(".", ",")}</text>`,
    );
    for (const line of lines) {
      texts.push(`<text x="48" y="${y}">${xml(line)}</text>`);
      y += 22;
    }
    y += 12;
  });
  y += 20;
  texts.push(
    `<text x="24" y="${y}" font-weight="bold">Итого:</text><text x="376" y="${y}" text-anchor="end">${(total / 100).toFixed(2).replace(".", ",")}</text>`,
  );
  y += 35;
  texts.push(`<text x="24" y="${y}">Режим НО НПД</text>`);
  y += 28;
  texts.push(`<text x="24" y="${y}">ИНН 773212983545</text>`);
  y += 35;
  const svg = Buffer.from(
    `<svg width="400" height="${y + 170}"><rect width="400" height="${y + 170}" fill="white"/><g font-family="Arial" font-size="14" fill="black">${texts.join("")}</g></svg>`,
  );
  const qr = await QRCode.toBuffer(url, { width: 145, margin: 2 });
  const png = await sharp(svg)
    .composite([{ input: qr, left: 127, top: y }])
    .png()
    .toBuffer();
  docs.set(id, png);
  if (docs.size > 100) docs.delete(docs.keys().next().value);
  return { png, id, url };
}
createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/fixture-mode")) {
      lost =
        new URL(req.url, "http://127.0.0.1:3161").searchParams.get("lost") ===
        "1";
      res.end("fixture mode set");
      return;
    }
    if (req.url.startsWith("/document/")) {
      const png = docs.get(req.url.slice("/document/".length));
      if (!png) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.setHeader("content-type", "image/png");
      res.end(png);
      return;
    }
    if (req.url === "/fixture-receipt" && req.method === "POST") {
      let raw = "";
      for await (const b of req) {
        raw += b;
        if (raw.length > 32768) throw Error("FIXTURE_BODY");
      }
      const result = await receipt(JSON.parse(raw));
      res.setHeader("content-type", "image/png");
      res.setHeader("x-fixture-id", result.id);
      res.setHeader("x-fixture-url", result.url);
      res.end(result.png);
      return;
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(
      lost
        ? fixtureHtml.replace(
            "window.testIssueCount++;",
            "window.testIssueCount++;return;",
          )
        : fixtureHtml,
    );
  } catch {
    res.writeHead(400);
    res.end("Local fixture error");
  }
}).listen(3161, "127.0.0.1", () =>
  console.log("NPD fixture on 127.0.0.1:3161; no FNS income"),
);
