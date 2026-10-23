import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  browserIconSizes,
  browserIconUrl,
  renderBrowserIcon,
} from "../lib/browser-icon";

const artwork = Buffer.from(
  '<svg width="240" height="240"><rect width="240" height="240" fill="white"/><path d="M100 160V80h40v80z" fill="none" stroke="#333" stroke-width="3"/></svg>',
);

test("tab icons remove empty margins and preserve a square padded tile at each advertised size", async () => {
  for (const size of browserIconSizes) {
    const output = await renderBrowserIcon(artwork, size);
    const { data, info } = await sharp(output)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(info.width, size);
    assert.equal(info.height, size);
    assert.ok(data[3] < 128, "rounded corner fades to transparent");
    let minY: number = size,
      maxY = -1;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        if (data[i + 3] > 100 && data[i] < 200) {
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    assert.ok(
      maxY - minY >= size * 0.65,
      "drawing fills most of the icon instead of retaining large source margins",
    );
    assert.ok(minY > 0 && maxY < size - 1, "drawing has safe padding");
  }
});

test("coloured artwork keeps its colour and blank uploads do not fail", async () => {
  const source = Buffer.from(
    '<svg width="80" height="80"><rect width="80" height="80" fill="white"/><rect x="20" y="10" width="40" height="60" fill="#ef4444"/></svg>',
  );
  const { data } = await sharp(await renderBrowserIcon(source, 32))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const center = (16 * 32 + 16) * 3;
  assert.ok(
    data[center] > 200 && data[center + 1] < 100 && data[center + 2] < 100,
  );
  const blank = await sharp({
    create: { width: 80, height: 80, channels: 3, background: "#fff" },
  })
    .png()
    .toBuffer();
  assert.equal(
    (await sharp(await renderBrowserIcon(blank, 16)).metadata()).width,
    16,
  );
});

test("advertised icon URLs are versioned and unsupported output sizes fail", async () => {
  assert.equal(
    browserIconUrl("/site-media/example", 32),
    "/site-media/example?format=png&iconSize=32&iconVersion=2",
  );
  await assert.rejects(
    renderBrowserIcon(artwork, 2048 as 32),
    /INVALID_ICON_SIZE/,
  );
});
