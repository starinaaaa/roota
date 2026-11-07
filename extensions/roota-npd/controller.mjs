import {
  receiptPlan,
  planDigest,
  receiptLink,
  recoveryDecision,
} from "./core.mjs";
export function createController(io) {
  let running;
  const single =
    (fn) =>
    (...args) => {
      if (running) return running;
      running = Promise.resolve()
        .then(() => fn(...args))
        .finally(() => {
          running = null;
        });
      return running;
    };
  const report = async (status, detail, safe = true) =>
    io.api({ action: "heartbeat", status, detail, safe });
  const save = async (active) => {
    await io.save({ active });
    return active;
  };
  const done = async (active) => {
    await save({ ...active, phase: "completed" });
    await report("connected", "Чек подтверждён и сохранён в Roota", false);
  };
  async function deliver(active) {
    if (
      !receiptLink(active.evidence.url) ||
      !/^[a-f0-9]{64}$/.test(active.evidence.pixelHash ?? "")
    )
      throw new Error("Нет оригинальной ссылки ФНС");
    await io.api({
      action: "result",
      id: active.job.sale_id,
      token: active.job.claim_token,
      digest: active.digest,
      ...active.evidence,
    });
    await done(active);
    return { state: "registered" };
  }
  async function uncertain(active, detail) {
    await save({ ...active, phase: "uncertain", detail });
    try {
      await io.api({
        action: "error",
        id: active.job.sale_id,
        token: active.job.claim_token,
        status: "uncertain",
        detail,
      });
    } catch {
      /* Keep the durable local fence even if Roota is offline. */
    }
    try {
      await report("uncertain", detail, false);
    } catch {}
    throw new Error(detail);
  }
  async function start({ safe = true, mode = "test" } = {}) {
    const stored = await io.load();
    if (
      stored.active &&
      !["completed", "cleared"].includes(stored.active.phase)
    )
      throw new Error(
        "Есть незавершённая задача. Сначала восстановите или закройте её",
      );
    if (!safe && (!io.liveCertified || !stored.armed))
      throw new Error(
        "Рабочий режим заблокирован до проверки реального интерфейса и явного включения",
      );
    const { job, liveAllowed } = await io.api({ action: "claim", mode, safe });
    if (!job) {
      await report("connected", "Нет задач на чек", safe);
      return { state: "idle" };
    }
    let plan, digest;
    try {
      plan = receiptPlan(job);
      digest = await planDigest(plan);
    } catch (e) {
      await io.api({
        action: "error",
        id: job.sale_id,
        token: job.claim_token,
        detail: e.message,
      });
      await report("error", e.message, safe);
      throw e;
    }
    let active = await save({ job, plan, digest, safe, phase: "claimed" });
    if (job.state !== "claimed")
      return uncertain(
        active,
        "У задачи уже есть отправка или неизвестный результат. Проверьте чек у продавца",
      );
    try {
      if (!safe && (!liveAllowed || job.operation_mode !== "live"))
        throw new Error("Сервер не разрешил рабочую выдачу");
      await report(
        "busy",
        safe ? "Заполняем форму без регистрации дохода" : "Готовим чек",
        safe,
      );
      const tabId = await io.ui.openForm();
      active = await save({ ...active, tabId, phase: "filling" });
      const filled = await io.ui.fill(tabId, plan);
      if (filled.total !== plan.total)
        throw new Error("Итог формы не совпадает с покупкой");
      await io.ui.verify(tabId, plan);
      active = await save({ ...active, phase: "filled" });
      if (safe) {
        await io.api({
          action: "preview",
          id: job.sale_id,
          token: job.claim_token,
          digest,
        });
        await save({ ...active, phase: "preview_ready" });
        await report(
          "preview_ready",
          "Состав и сумма сверены. Доход НЕ зарегистрирован",
          true,
        );
        return { state: "preview_ready" };
      }
      // Persist before both the server fence and the irreversible UI click.
      active = await save({ ...active, phase: "fencing" });
      const permit = await io.api({
        action: "submit",
        id: job.sale_id,
        token: job.claim_token,
        digest,
      });
      if (permit.maySubmit !== true)
        throw new Error("Нет разрешения на отправку");
      active = await save({ ...active, phase: "fenced" });
      await io.ui.verify(tabId, plan);
      const stillAllowed = await io.api({
        action: "heartbeat",
        status: "busy",
        safe: false,
      });
      if (!stillAllowed.liveAllowed)
        throw new Error("Доступ к рабочей выдаче отозван");
      active = await save({ ...active, phase: "clicking" });
      await io.ui.submit(tabId, plan);
      active = await save({ ...active, phase: "submitted" });
      const evidence = await io.ui.result(tabId, plan);
      if (
        !evidence ||
        !receiptLink(evidence.url) ||
        !/^[a-f0-9]{64}$/.test(evidence.pixelHash ?? "")
      )
        throw new Error(
          "ФНС не вернула однозначное подтверждение и оригинальный чек",
        );
      active = await save({
        ...active,
        phase: "result_pending",
        evidence: { url: evidence.url, pixelHash: evidence.pixelHash },
      });
      return await deliver(active);
    } catch (error) {
      if (
        ["fencing", "fenced", "clicking", "submitted", "uncertain"].includes(
          active.phase,
        )
      )
        return uncertain(
          active,
          "Отправка могла состояться. Повторная выдача запрещена: сверьте чек в Моём налоге",
        );
      if (active.phase === "result_pending") {
        try {
          await report(
            "uncertain",
            "Оригинальный чек найден. Нужно повторить только сохранение результата",
            false,
          );
        } catch {}
        throw error;
      }
      const login = error.code === "LOGIN_REQUIRED";
      try {
        await io.api({
          action: login ? "release" : "error",
          id: job.sale_id,
          token: job.claim_token,
          status: login ? "login_required" : "error",
          detail: error.message,
        });
      } catch {}
      await save({
        ...active,
        phase: login ? "cleared" : "error",
        detail: error.message,
      });
      try {
        await report(login ? "login_required" : "error", error.message, safe);
      } catch {}
      throw error;
    }
  }
  async function recover() {
    let { active } = await io.load();
    if (active && active.phase !== "completed") {
      const saved = await io.api({
        action: "registered-status",
        id: active.job.sale_id,
      });
      if (saved.registered === true && receiptLink(saved.url)) {
        if (
          active.evidence?.url &&
          active.evidence.url.replace(/\/$/, "") !==
            saved.url.replace(/\/$/, "")
        )
          return uncertain(
            active,
            "В Roota сохранён другой чек. Сверьте оба документа с продавцом",
          );
        await done({
          ...active,
          evidence: {
            ...active.evidence,
            url: saved.url,
            registeredAt: saved.registeredAt,
          },
        });
        return { state: "registered" };
      }
    }
    if (!active) {
      const r = await io.api({ action: "recover" });
      if (!r.job) return { state: "idle" };
      active = await save({
        job: r.job,
        plan: receiptPlan(r.job),
        digest: await planDigest(receiptPlan(r.job)),
        safe: r.job.operation_mode !== "live",
        phase: ["claimed", "failed"].includes(r.job.state)
          ? "claimed"
          : "uncertain",
      });
    }
    const decision = recoveryDecision(active.phase);
    if (decision === "resend_result") return deliver(active);
    if (decision === "reconcile") {
      // Only read the original result tab; never navigate to or submit a new sale.
      try {
        const found = active.tabId
          ? await io.ui.result(active.tabId, active.plan)
          : null;
        if (
          found &&
          receiptLink(found.url) &&
          /^[a-f0-9]{64}$/.test(found.pixelHash ?? "")
        ) {
          active = await save({
            ...active,
            phase: "result_pending",
            evidence: { url: found.url, pixelHash: found.pixelHash },
          });
          return deliver(active);
        }
      } catch {}
      return uncertain(
        active,
        "Однозначный чек не найден в исходной вкладке. Продавец должен сверить историю ФНС и привязать существующий чек; новый доход не создавать",
      );
    }
    await report(
      "error",
      "Отправки не было. Форма могла остаться заполненной. Закройте её без выдачи и верните задачу в очередь",
      active.safe,
    );
    return { state: "stopped_before_submission" };
  }
  async function clear() {
    const { active } = await io.load();
    if (!active) return;
    if (
      recoveryDecision(active.phase) !== "stop_before_submission" &&
      active.phase !== "completed"
    )
      throw new Error(
        "После возможной отправки можно только сверить результат",
      );
    if (!["preview_ready", "completed", "cleared"].includes(active.phase)) {
      const recovered = await io.api({ action: "recover" });
      if (recovered.job?.sale_id === active.job.sale_id)
        await io.api({
          action: "release",
          id: active.job.sale_id,
          token: active.job.claim_token,
        });
    }
    await save({ ...active, phase: "cleared" });
    await report("connected", "Можно подготовить следующую задачу", true);
  }
  return {
    start: single(start),
    recover: single(recover),
    clear: single(clear),
  };
}
