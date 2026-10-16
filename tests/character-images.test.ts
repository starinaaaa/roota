import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import manifest from "../lib/character-image-manifest.json";

const boxes = {
  skater: [176, 224],
  resting: [256, 192],
  flower: [256, 256],
  walker: [96, 160],
  watering: [176, 160],
} as const;
test("character cutouts retain resized visible RGB and exact alpha at Retina 3x", async () => {
  for (const [name, [width, height]] of Object.entries(boxes)) {
    const original = await readFile(`public/images/characters/${name}.png`);
    const file = await readFile(
      `public${manifest[name as keyof typeof manifest]}`,
    );
    assert.ok(file.length < original.length * 0.25, name);
    const reference = await sharp(original)
      .resize({
        width: width * 3,
        height: height * 3,
        fit: "inside",
        withoutEnlargement: true,
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const actual = await sharp(file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(actual.info.width, reference.info.width);
    assert.equal(actual.info.height, reference.info.height);
    let translucent = false;
    for (let index = 0; index < actual.data.length; index += 4) {
      const alpha = reference.data[index + 3];
      assert.equal(actual.data[index + 3], alpha, `${name}: alpha`);
      if (alpha > 0 && alpha < 255) translucent = true;
      if (alpha > 0)
        for (let channel = 0; channel < 3; channel++)
          assert.equal(
            actual.data[index + channel],
            reference.data[index + channel],
            `${name}: visible RGB`,
          );
    }
    assert.ok(translucent, `${name}: soft transparent edges`);
  }
});
