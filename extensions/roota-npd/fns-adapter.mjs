/** Runs in an isolated Chrome scripting world. DOM-only; no fetch, cookies or storage. */
export async function fnsTask(request) {
  const fail = (message, code = "LAYOUT_CHANGED") => ({
    ok: false,
    error: message,
    code,
  });
  const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();
  const visible = (e) =>
    !!e.getClientRects().length && getComputedStyle(e).visibility !== "hidden";
  const exact = (selector, text) =>
    Array.from(document.querySelectorAll(selector)).filter(
      (e) => visible(e) && clean(e.textContent) === text,
    );
  const cents = (value) => {
    const s = clean(value)
      .replace(/[₽\s\u00a0]/g, "")
      .replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(s))
      throw Error("Нельзя прочитать сумму формы");
    const [r, k = ""] = s.split(".");
    return Number(r) * 100 + Number(k.padEnd(2, "0"));
  };
  const value = (el, text) => {
    const proto =
      el.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const money = (n) =>
    `${Math.floor(n / 100)}.${String(n % 100).padStart(2, "0")}`;
  // Labels form a strict contract. No fuzzy matching, positional guesses or internal React state.
  const inputsFor = (label) => {
    const result = [];
    for (const el of document.querySelectorAll(
      "input:not([type=password]):not([type=hidden]),textarea",
    )) {
      if (!visible(el)) continue;
      const labels = [
        el.getAttribute("aria-label"),
        ...Array.from(el.labels ?? []).map((l) => clean(l.textContent)),
      ];
      if (labels.some((v) => clean(v) === label)) result.push(el);
    }
    return result;
  };
  try {
    if (
      location.pathname.startsWith("/auth/") ||
      document.querySelector("input[type=password]")
    )
      return fail(
        "Войдите в Мой налог самостоятельно в Chrome",
        "LOGIN_REQUIRED",
      );
    if (["result", "inspect"].includes(request.action)) {
      const marker = globalThis.__rootaNpdSubmission;
      if (
        request.action === "result" &&
        (!marker ||
          marker.key !== request.submissionKey ||
          marker.plan !== JSON.stringify(request.plan))
      )
        return fail(
          "Нет подтверждения исходной отправки в этой вкладке. Требуется сверка продавца",
          "UNCERTAIN",
        );
      const images = Array.from(
        document.querySelectorAll('img[alt="Чек"]'),
      ).filter(visible);
      const download = Array.from(document.querySelectorAll("a[href]")).filter(
        (e) =>
          visible(e) &&
          clean(e.textContent) === "Скачать" &&
          e.href.startsWith("blob:" + location.origin + "/"),
      );
      if (
        exact("h2", "Чек").length !== 1 ||
        exact("button", "Скопировать ссылку в буфер").length !== 1 ||
        images.length !== 1 ||
        download.length !== 1
      )
        return fail(
          "ФНС не показала однозначное изображение выданного чека",
          "UNCERTAIN",
        );
      const img = images[0];
      if (
        !img.complete ||
        !img.naturalWidth ||
        img.naturalWidth * img.naturalHeight > 4000000 ||
        !img.src.startsWith("blob:" + location.origin + "/")
      )
        return fail(
          "Изображение чека ещё не готово или его формат изменился",
          "UNCERTAIN",
        );
      if (typeof globalThis.jsQR !== "function")
        return fail("Не загружен локальный декодер QR", "UNCERTAIN");
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const qr = globalThis.jsQR(pixels, canvas.width, canvas.height, {
        inversionAttempts: "dontInvert",
      });
      if (
        !qr ||
        !/^https:\/\/lknpd\.nalog\.ru\/api\/v1\/receipt\/\d{12}\/[a-zA-Z0-9-]+\/print\/?$/.test(
          qr.data,
        )
      )
        return fail(
          "QR выданного чека не содержит оригинальную ссылку ФНС",
          "UNCERTAIN",
        );
      const digest = await crypto.subtle.digest("SHA-256", pixels);
      const pixelHash = Array.from(new Uint8Array(digest), (v) =>
        v.toString(16).padStart(2, "0"),
      ).join("");
      return { ok: true, url: qr.data.replace(/\/$/, ""), pixelHash };
    }
    if (location.pathname !== "/sales/create")
      return fail("Откройте форму новой продажи Моего налога");
    if (
      exact("h2", "Чек").length ||
      Array.from(document.querySelectorAll('img[alt="Чек"]')).some(visible)
    )
      return fail(
        "Вкладка уже показывает выданный чек. Новая отправка запрещена",
      );
    if (exact("h1,h2", "Новая продажа").length !== 1)
      return fail("Заголовок формы ФНС изменился; требуется обновить адаптер");
    const dates = inputsFor("Дата продажи"),
      names = inputsFor("Наименование товара/услуги"),
      prices = inputsFor("Стоимость в рублях");
    const buyers = Array.from(
      document.querySelectorAll("input[type=radio]"),
    ).filter(
      (e) =>
        visible(e) &&
        Array.from(e.labels ?? []).some(
          (l) => clean(l.textContent) === "Физическое лицо",
        ),
    );
    const add = exact("button", "Добавить позицию"),
      submit = exact("button", "Выдать чек");
    const totals = Array.from(document.querySelectorAll("div")).filter(
      (e) =>
        visible(e) &&
        Array.from(e.childNodes).some(
          (n) => n.nodeType === 3 && clean(n.textContent) === "Итого:",
        ) &&
        e.children.length === 1 &&
        e.firstElementChild.tagName === "SPAN",
    );
    const totalElement =
      totals.length === 1 ? totals[0].firstElementChild : null;
    if (
      dates.length !== 1 ||
      !names.length ||
      names.length !== prices.length ||
      buyers.length !== 1 ||
      add.length !== 1 ||
      submit.length !== 1 ||
      !totalElement
    )
      return fail(
        "Структура формы ФНС не соответствует проверенному контракту. Выдача остановлена",
      );
    if (request.action === "inspect") return { ok: true, rows: names.length };
    const plan = request.plan;
    if (plan.buyer !== "individual")
      return fail("Сценарий для организаций не поддерживается");
    if (request.action === "fill") {
      if (names.length !== 1 || clean(names[0].value) || clean(prices[0].value))
        return fail("В форме уже есть данные. Не заменяю черновик продавца");
      if (
        dates[0].type !== "text" ||
        dates[0].id !== "date" ||
        dates[0].getAttribute("placeholder") !== "__.__.____"
      )
        return fail("Формат поля даты изменился");
      const [y, m, d] = plan.date.split("-");
      value(dates[0], `${d}.${m}.${y}`);
      buyers[0].click();
      for (let i = 0; i < plan.rows.length; i++) {
        if (i) {
          add[0].click();
          await new Promise((r) => setTimeout(r, 50));
        }
        const ns = inputsFor("Наименование товара/услуги"),
          ps = inputsFor("Стоимость в рублях");
        if (ns.length !== i + 1 || ps.length !== ns.length)
          return fail("ФНС не добавила ожидаемую строку");
        value(ns[i], plan.rows[i].name);
        value(ps[i], money(plan.rows[i].kopecks));
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    const ns = inputsFor("Наименование товара/услуги"),
      ps = inputsFor("Стоимость в рублях");
    if (
      ns.length !== plan.rows.length ||
      ps.length !== plan.rows.length ||
      dates[0].value !== plan.date.split("-").reverse().join(".") ||
      !buyers[0].checked
    )
      return fail("Дата, покупатель или число строк не совпадают");
    for (let i = 0; i < ns.length; i++)
      if (
        ns[i].value !== plan.rows[i].name ||
        cents(ps[i].value) !== plan.rows[i].kopecks
      )
        return fail("Состав формы не совпадает со снимком продажи");
    const total = cents(totalElement.textContent);
    if (total !== plan.total) return fail("Итог ФНС не совпадает с оплатой");
    if (request.safe && ["fill", "verify"].includes(request.action)) {
      if (!globalThis.__rootaSafeDraftGuard) {
        const guard = (e) => {
          const b = e.target.closest?.("button");
          if (
            e.type === "submit" ||
            (b && ["Выдать чек", "Выдать счет"].includes(clean(b.textContent)))
          ) {
            e.preventDefault();
            e.stopImmediatePropagation();
          }
        };
        document.addEventListener("submit", guard, true);
        document.addEventListener("click", guard, true);
        globalThis.__rootaSafeDraftGuard = true;
      }
      submit[0].disabled = true;
      for (const b of exact("button", "Выдать счет")) b.disabled = true;
      if (!document.getElementById("roota-npd-safe-warning")) {
        const notice = document.createElement("p");
        notice.id = "roota-npd-safe-warning";
        notice.textContent =
          "Roota: БЕЗОПАСНАЯ ПРОВЕРКА. Доход не зарегистрирован. Закройте этот черновик без выдачи чека.";
        notice.setAttribute("role", "status");
        notice.style.cssText =
          "padding:16px;background:#fff3c4;color:#292524;border:2px solid #b45309;font:16px system-ui";
        document.body.prepend(notice);
      }
    }
    if (request.action === "submit") {
      if (!request.liveCertified)
        return fail(
          "Рабочий адаптер не сертифицирован; доступна только проверка",
        );
      if (submit[0].disabled) return fail("ФНС не разрешает выдачу чека");
      if (!request.submissionKey || globalThis.__rootaNpdSubmission)
        return fail(
          "В этой вкладке отправка уже могла произойти. Повтор запрещён",
          "UNCERTAIN",
        );
      globalThis.__rootaNpdSubmission = {
        key: request.submissionKey,
        plan: JSON.stringify(plan),
        startedAt: Date.now(),
      };
      submit[0].click();
    }
    return { ok: true, total };
  } catch (e) {
    return fail(e.message);
  }
}
