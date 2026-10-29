import test from "node:test";
import assert from "node:assert/strict";
import { OZON_TRACKING_URL, ozonTrackingHint } from "../lib/delivery/tracking";
import { renderEmail } from "../lib/email/templates";

const orderUrl = "https://roota.moscow/order/test";
const template = {
  subject: "Заказ отправлен",
  body: "Ваш заказ передан в доставку.",
};

test("Ozon shipping email includes a tracking hyperlink, plain-text URL and login instructions", () => {
  for (const shipmentCreated of [true, false]) {
    const result = renderEmail(
      template,
      { tracking_hint: ozonTrackingHint(shipmentCreated) },
      orderUrl,
      "Открыть заказ",
      undefined,
      true,
    );

    assert.match(
      result.html,
      /<a href="https:\/\/www\.ozon\.ru\/delivery\?miniapp=cml"[^>]*>Ссылка для отслеживания<\/a>/,
    );
    assert.ok(
      result.plaintext.includes(`Ссылка для отслеживания: ${OZON_TRACKING_URL}`),
    );
    for (const message of [result.html, result.plaintext]) {
      assert.ok(message.includes("«Заказы» → «Получения»"));
      assert.ok(
        message.includes(
          "Отправление появится там после перехода в статус «Готов к отправке». Войдите с номером телефона, указанным в заказе.",
        ),
      );
    }
    assert.ok(result.html.includes(`href="${orderUrl}"`));
  }
});

test("emails without Ozon delivery and marketing messages do not show an Ozon tracking link", () => {
  for (const orderMessage of [true, false]) {
    const result = renderEmail(
      template,
      {},
      orderUrl,
      "Открыть заказ",
      undefined,
      orderMessage,
    );
    assert.ok(!result.html.includes(OZON_TRACKING_URL));
    assert.ok(!result.plaintext.includes(OZON_TRACKING_URL));
  }
});
