"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheck,
  Copy,
  Hourglass,
  LockKeyhole,
  LogOut,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  eligibleTasks,
  landingRotation,
  parseTasks,
  type WheelData,
  type WheelTask,
} from "@/lib/wheel/model";

const colors = [
  "#b19aee",
  "#e0ed83",
  "#ffab91",
  "#9bd1c4",
  "#f1d579",
  "#c5b6ee",
  "#a4cbe5",
  "#efb8cf",
];
async function api(body?: unknown, person?: string) {
  const response = await fetch(
    "/wheel/api" + (person ? "?person=" + encodeURIComponent(person) : ""),
    {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(result.error || "Не удалось загрузить. Попробуйте ещё раз."),
      { status: response.status },
    );
  return result;
}

function Mark() {
  return (
    <span className="w-mark" aria-hidden="true">
      ✳
    </span>
  );
}
function Wheel({
  tasks,
  rotation,
  spinning,
}: {
  tasks: WheelTask[];
  rotation: number;
  spinning: boolean;
}) {
  const slices = tasks.length
    ? tasks
    : [
        "Один шаг",
        "Без спешки",
        "Ты справишься",
        "Начнём?",
        "По чуть-чуть",
        "Всё получится",
      ].map((title, i) => ({ id: String(i), title }));
  const count = slices.length;
  return (
    <div className={"w-wheel-wrap" + (spinning ? " is-spinning" : "")}>
      <span className="w-orbit w-orbit-one" aria-hidden="true">
        ✧
      </span>
      <span className="w-orbit w-orbit-two" aria-hidden="true">
        ✳
      </span>
      <div className="w-pointer" aria-hidden="true" />
      <div className="w-disc" style={{ transform: `rotate(${rotation}deg)` }}>
        <svg
          viewBox="0 0 480 480"
          role="img"
          aria-label={
            tasks.length
              ? `Колесо: ${tasks.length} задач с равной вероятностью`
              : "Колесо ждёт ваши задачи"
          }
        >
          {slices.map((t, i) => {
            const a = (i * Math.PI * 2) / count - Math.PI / 2,
              b = ((i + 1) * Math.PI * 2) / count - Math.PI / 2;
            const x1 = 240 + 232 * Math.cos(a),
              y1 = 240 + 232 * Math.sin(a),
              x2 = 240 + 232 * Math.cos(b),
              y2 = 240 + 232 * Math.sin(b);
            const angle = ((i + 0.5) * 360) / count;
            return (
              <g key={t.id}>
                {count === 1 ? (
                  <circle cx="240" cy="240" r="232" fill={colors[0]} />
                ) : (
                  <path
                    d={`M240,240 L${x1},${y1} A232,232 0 ${count === 2 ? 0 : b - a > Math.PI ? 1 : 0},1 ${x2},${y2} Z`}
                    fill={colors[i % colors.length]}
                    stroke="#f5f2ea"
                    strokeWidth="2"
                  />
                )}
                {count <= 20 && (
                  <text
                    transform={`rotate(${angle} 240 240)`}
                    x="240"
                    y={count > 12 ? 72 : 65}
                    textAnchor="middle"
                    fill="#292735"
                    fontSize={count > 12 ? 12 : 15}
                    fontWeight="650"
                  >
                    {t.title.length > (count > 12 ? 12 : 19)
                      ? t.title.slice(0, count > 12 ? 11 : 18) + "…"
                      : t.title}
                  </text>
                )}
              </g>
            );
          })}
          <circle
            cx="240"
            cy="240"
            r="231"
            fill="none"
            stroke="#292735"
            strokeWidth="3"
          />
        </svg>
      </div>
      <div className="w-hub" aria-hidden="true">
        ✳
      </div>
      {count > 20 && (
        <span className="w-wheel-count">{count} задач · равные шансы</span>
      )}
    </div>
  );
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [owner, setOwner] = useState(false),
    [invite, setInvite] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  useEffect(() => {
    const match = window.location.hash.match(/^#invite=([a-f0-9]{64})$/);
    if (match) {
      setInvite(match[1]);
      window.history.replaceState(null, "", "/wheel");
    }
  }, []);
  return (
    <div className="w-login-layout">
      <div className="w-login-intro">
        <span className="w-eyebrow">КОГДА СЛОЖНО ВЫБРАТЬ</span>
        <h1>
          Одно дело.
          <br />
          <span>И ты в движении.</span>
        </h1>
        <p>
          Выгрузи мысли. Крути колесо.
          <br />
          Начни с того, что выпадет.
        </p>
        <div className="w-login-art" aria-hidden="true">
          <div>
            начни
            <br />с малого <span>↗</span>
          </div>
          <span>✳</span>
        </div>
      </div>
      <section className="w-login-card">
        <span className="w-mini-icon">
          <LockKeyhole size={21} />
        </span>
        <h2>{invite ? "Твоё место здесь" : "Твои дела ждут"}</h2>
        <p>
          {invite
            ? "Создай личный профиль по приглашению."
            : "Войди в свой личный список."}
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busyRef.current) return;
            busyRef.current = true;
            setBusy(true);
            setError("");
            const form = new FormData(event.currentTarget);
            try {
              await api({
                action: owner ? "owner-login" : invite ? "register" : "login",
                name: form.get("name"),
                password: form.get("password"),
                ...(invite ? { invite } : {}),
              });
              onLogin();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              busyRef.current = false;
              setBusy(false);
            }
          }}
        >
          <label htmlFor="wheel-name">
            {owner ? "Email владельца" : "Имя и фамилия"}
          </label>
          <input
            id="wheel-name"
            name="name"
            autoComplete="username"
            type={owner ? "email" : "text"}
            required
            maxLength={120}
            placeholder={owner ? "Ваш email" : "Например, Саша Иванова"}
          />
          <label htmlFor="wheel-password">Пароль</label>
          <input
            id="wheel-password"
            name="password"
            type="password"
            autoComplete={invite ? "new-password" : "current-password"}
            minLength={12}
            maxLength={128}
            required
            placeholder={invite ? "Не меньше 12 символов" : "Ваш пароль"}
          />
          {error && (
            <p className="w-error" role="alert">
              {error}
            </p>
          )}
          <button className="w-primary" disabled={busy}>
            {busy ? "Один момент…" : invite ? "Создать профиль" : "Войти"}
            <ArrowRight size={20} />
          </button>
        </form>
        {!invite && (
          <button
            className="w-text-button w-owner-login"
            onClick={() => {
              setOwner(!owner);
              setError("");
            }}
          >
            {owner ? "Войти по имени и фамилии" : "Вход владельца"}
          </button>
        )}
        <p className="w-privacy">
          <ShieldCheck size={16} />{" "}
          {invite
            ? "Ваш список виден вам и владельцу пространства."
            : "Личный список. Новые профили — по приглашению."}
        </p>
        {owner && (
          <p className="w-small">
            Используйте существующий вход владельца. Сессия рулетки отдельная.
          </p>
        )}
      </section>
    </div>
  );
}

function TaskRow({
  task,
  disabled,
  onChange,
}: {
  task: WheelTask;
  disabled: boolean;
  onChange: (body: unknown) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(task.title);
  const editLock = useRef(false);
  async function save() {
    if (editLock.current) return;
    editLock.current = true;
    try {
      if (
        draft.trim() &&
        (draft.trim() === task.title ||
          (await onChange({ action: "edit", id: task.id, title: draft })))
      )
        setEditing(false);
    } finally {
      editLock.current = false;
    }
  }
  return (
    <div
      className={"w-task-row" + (task.status === "done" ? " w-task-done" : "")}
    >
      <button
        className="w-check"
        aria-label={
          task.status === "done"
            ? `Вернуть: ${task.title}`
            : `Выполнить: ${task.title}`
        }
        disabled={disabled}
        onClick={() =>
          void onChange({
            action: "status",
            id: task.id,
            status: task.status === "done" ? "active" : "done",
          })
        }
      >
        {task.status === "done" && <Check size={16} />}
      </button>
      {editing ? (
        <input
          className="w-edit"
          aria-label="Название задачи"
          autoFocus
          value={draft}
          maxLength={240}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
            if (e.key === "Escape") {
              setDraft(task.title);
              setEditing(false);
            }
          }}
        />
      ) : (
        <span className="w-task-title">
          {task.title}
          {task.started_at && task.status === "active" && (
            <small>В процессе</small>
          )}
        </span>
      )}
      <div className="w-row-actions">
        {task.status === "deferred" ? (
          <button
            className="w-icon-button"
            aria-label={`Вернуть в колесо: ${task.title}`}
            title="Вернуть в колесо"
            disabled={disabled}
            onClick={() =>
              void onChange({ action: "status", id: task.id, status: "active" })
            }
          >
            <RotateCcw size={17} />
          </button>
        ) : (
          task.status === "active" && (
            <button
              className="w-icon-button"
              aria-label={`Отложить: ${task.title}`}
              title="Отложить"
              disabled={disabled}
              onClick={() =>
                void onChange({
                  action: "status",
                  id: task.id,
                  status: "deferred",
                })
              }
            >
              <Hourglass size={16} />
            </button>
          )
        )}
        <button
          className="w-icon-button"
          aria-label={`Изменить: ${task.title}`}
          title="Изменить"
          disabled={disabled}
          onClick={() => {
            setDraft(task.title);
            setEditing(true);
          }}
        >
          <Pencil size={16} />
        </button>
        <button
          className="w-icon-button"
          aria-label={`Удалить: ${task.title}`}
          title="Удалить"
          disabled={disabled}
          onClick={() => void onChange({ action: "delete", id: task.id })}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

export default function WheelApp() {
  const [data, setData] = useState<WheelData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [spinning, setSpinning] = useState(false),
    [rotation, setRotation] = useState(0),
    [spinTasks, setSpinTasks] = useState<WheelTask[] | null>(null);
  const [text, setText] = useState(""),
    [bulk, setBulk] = useState(false),
    [tab, setTab] = useState<"active" | "done" | "deferred">("active"),
    [listOpen, setListOpen] = useState(false);
  const [notice, setNotice] = useState(""),
    [inviteUrl, setInviteUrl] = useState(""),
    [peopleOpen, setPeopleOpen] = useState(false);
  const lock = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    resultHeading = useRef<HTMLHeadingElement>(null),
    input = useRef<HTMLInputElement>(null),
    requestId = useRef("");
  async function load(person?: string) {
    if (lock.current) return;
    setLoading(true);
    setError("");
    try {
      setData(await api(undefined, person));
    } catch (e) {
      if ((e as { status?: number }).status === 401) setData(null);
      else setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  async function change(body: unknown) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      setData(await api(body));
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const active = data?.tasks.filter((t) => t.status === "active") || [],
    done = data?.tasks.filter((t) => t.status === "done") || [],
    deferred = data?.tasks.filter((t) => t.status === "deferred") || [];
  const candidates = data
    ? eligibleTasks(data.tasks, data.profile.skipped)
    : [];
  const selected = data?.tasks.find(
    (t) => t.id === data.profile.selected_id && t.status === "active",
  );
  async function spin(reroll = false) {
    if (!data || lock.current || data.readonly) return;
    lock.current = true;
    setBusy(true);
    setSpinning(true);
    setError("");
    setNotice("");
    const visible = eligibleTasks(
      data.tasks,
      reroll && selected
        ? [...data.profile.skipped, selected.id]
        : data.profile.skipped,
    );
    setSpinTasks(visible);
    try {
      const next: WheelData = await api({ action: "spin", reroll });
      const index = visible.findIndex((t) => t.id === next.profile.selected_id);
      if (!next.profile.selected_id || index < 0) {
        setData(next);
        setSpinning(false);
        setSpinTasks(null);
        setBusy(false);
        lock.current = false;
        return;
      }
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      requestAnimationFrame(() =>
        setRotation((value) => landingRotation(value, index, visible.length)),
      );
      timer.current = setTimeout(
        () => {
          setData(next);
          setSpinning(false);
          setSpinTasks(null);
          setBusy(false);
          lock.current = false;
          resultHeading.current?.focus();
        },
        reduced ? 180 : 4150,
      );
    } catch (e) {
      setError((e as Error).message);
      setSpinning(false);
      setSpinTasks(null);
      setBusy(false);
      lock.current = false;
    }
  }
  async function add(event: React.FormEvent) {
    event.preventDefault();
    requestId.current ||= crypto.randomUUID();
    if (await change({ action: "add", text, requestId: requestId.current })) {
      setText("");
      requestId.current = "";
      setTab("active");
      setNotice("Сохранено. Теперь можно отпустить выбор.");
      input.current?.focus();
    }
  }
  const shown =
    tab === "active" ? active : tab === "done" ? [...done].reverse() : deferred;
  return (
    <div className="wheel-app">
      <header className="w-header">
        <div className="w-brand">
          <Mark />
          <span>
            рулетка дел<span className="w-brand-dot">.</span>
          </span>
        </div>
        <div className="w-header-right">
          <span className="w-private">
            <LockKeyhole size={13} /> Личное пространство
          </span>
          {data && (
            <button
              className="w-profile-button"
              disabled={busy || loading}
              onClick={() => setPeopleOpen(!peopleOpen)}
              aria-expanded={peopleOpen}
            >
              <span className="w-avatar">
                {data.user.name[0]?.toUpperCase()}
              </span>
              <span>{data.user.name.split(" ")[0]}</span>
              <ChevronDown size={14} />
            </button>
          )}
        </div>
      </header>
      {peopleOpen && data && (
        <aside className="w-account-panel" aria-label="Профиль">
          <div className="w-panel-heading">
            <strong>{data.user.name}</strong>
            <button
              className="w-icon-button"
              aria-label="Закрыть профиль"
              onClick={() => setPeopleOpen(false)}
            >
              <X size={19} />
            </button>
          </div>
          {data.user.owner && (
            <>
              <p className="w-small">
                <Users size={15} /> Списки участников · только просмотр
              </p>
              {data.people.map((person) => (
                <button
                  className="w-person"
                  disabled={busy || loading}
                  key={person.user_id}
                  onClick={() => {
                    setPeopleOpen(false);
                    void load(person.user_id);
                  }}
                >
                  {person.name}
                  {person.user_id === data.user.id && <small>Мой список</small>}
                  <ArrowRight size={16} />
                </button>
              ))}
              <button
                className="w-secondary"
                disabled={busy}
                onClick={async () => {
                  try {
                    const result = await api({ action: "invite" });
                    setInviteUrl(result.url);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <Plus size={16} /> Пригласить участника
              </button>
              {inviteUrl && (
                <div className="w-invite">
                  <label htmlFor="wheel-invite">
                    Личная ссылка · на 7 дней, для одного человека
                  </label>
                  <input
                    id="wheel-invite"
                    readOnly
                    value={inviteUrl}
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    className="w-text-button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteUrl);
                        setNotice("Ссылка скопирована");
                      } catch {
                        setNotice("Выделите и скопируйте ссылку вручную");
                      }
                    }}
                  >
                    <Copy size={14} /> Скопировать
                  </button>
                </div>
              )}
            </>
          )}
          <button
            className="w-person"
            disabled={busy || loading}
            onClick={async () => {
              try {
                await api({ action: "logout" });
                setData(null);
                setPeopleOpen(false);
                setInviteUrl("");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <LogOut size={16} /> Выйти
          </button>
        </aside>
      )}
      {loading ? (
        <div className="w-loading" role="status">
          <Mark />
          <p>Освобождаем место для одного дела…</p>
        </div>
      ) : !data ? (
        <>
          {error && (
            <div className="w-top-error" role="alert">
              {error}
              <button className="w-text-button" onClick={() => void load()}>
                Повторить
              </button>
            </div>
          )}
          <Login onLogin={() => void load()} />
        </>
      ) : (
        <main className="w-main">
          {data.readonly && (
            <div className="w-readonly">
              <ShieldCheck size={18} />
              <span>Задачи {data.profile.name} · только просмотр</span>
              <button className="w-text-button" onClick={() => void load()}>
                К моим делам <ArrowRight size={15} />
              </button>
            </div>
          )}
          <section className="w-intro">
            <div className="w-eyebrow">
              <span className="w-status-dot" /> МАЛЕНЬКИЙ ШАГ — ТОЖЕ ШАГ
            </div>
            <h1>
              Не выбирай.
              <br />
              <span>Просто начни.</span>
              <span className="w-heading-star" aria-hidden="true">
                ✧
              </span>
            </h1>
            <p>
              Тебе не нужно делать всё сразу.
              <br />
              Пусть колесо выберет одно дело за тебя.
            </p>
            <div className="w-intro-note">
              <span>↗</span> Даже две минуты считаются
            </div>
          </section>
          <section
            className="w-playground"
            aria-label="Колесо выбора задачи"
            aria-busy={spinning}
          >
            {selected && !spinning ? (
              <div
                className={"w-result" + (selected.started_at ? " w-focus" : "")}
              >
                <span className="w-result-sticker" aria-hidden="true">
                  {selected.started_at ? "↗" : "✳"}
                </span>
                <span className="w-eyebrow">
                  {selected.started_at
                    ? "СЕЙЧАС ТОЛЬКО ЭТО"
                    : "ВОТ ТВОЙ ПЕРВЫЙ ШАГ"}
                </span>
                <h2 ref={resultHeading} tabIndex={-1}>
                  {selected.title}
                </h2>
                <p>
                  {selected.started_at
                    ? "Можно начать с двух минут. Не идеально — как получится."
                    : "Не нужно заканчивать всё сразу. Просто начни."}
                </p>
                {!data.readonly && (
                  <>
                    <button
                      className="w-primary"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          await change({
                            action: selected.started_at ? "status" : "start",
                            id: selected.id,
                            ...(selected.started_at ? { status: "done" } : {}),
                          })
                        ) {
                          if (selected.started_at)
                            setNotice("Есть! Ещё один маленький шаг ✳");
                        }
                      }}
                    >
                      {selected.started_at ? (
                        <>
                          <Check size={22} /> Готово
                        </>
                      ) : (
                        <>
                          Начать <ArrowRight size={22} />
                        </>
                      )}
                    </button>
                    <div className="w-result-alternatives">
                      <button
                        className="w-text-button"
                        disabled={busy}
                        onClick={() => void spin(true)}
                      >
                        <RotateCcw size={15} /> Перекрутить
                      </button>
                      <button
                        className="w-text-button"
                        disabled={busy}
                        onClick={() =>
                          void change({
                            action: "status",
                            id: selected.id,
                            status: "deferred",
                          })
                        }
                      >
                        Отложить
                      </button>
                    </div>
                    <small>
                      При перекрутке эта задача не повторится в текущем круге.
                    </small>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="w-wheel-caption">
                  <span>РЕШАЕТ СЛУЧАЙ. НАЧИНАЕШЬ ТЫ.</span>
                  <span>{candidates.length} в колесе</span>
                </div>
                <Wheel
                  tasks={spinTasks || candidates}
                  rotation={rotation}
                  spinning={spinning}
                />
                <div className="w-spin-area">
                  {data.readonly ? (
                    <p className="w-small">
                      Выбирать и менять задачи может их автор.
                    </p>
                  ) : candidates.length ? (
                    <button
                      className="w-primary w-spin"
                      disabled={busy}
                      onClick={() => void spin()}
                    >
                      <Sparkles size={21} />
                      {spinning ? "Выбираем одно дело…" : "Крутить колесо"}
                      <ArrowRight size={21} />
                    </button>
                  ) : active.length ? (
                    <>
                      <p>
                        Все задачи этого круга уже выпадали. Можно начать
                        заново.
                      </p>
                      <button
                        className="w-primary"
                        disabled={busy}
                        onClick={() => void change({ action: "reset" })}
                      >
                        <RotateCcw size={19} /> Новый круг
                      </button>
                    </>
                  ) : (
                    <>
                      <p>
                        {done.length
                          ? "Всё сделано? Побудь в этом моменте."
                          : "Добавь первое дело. Можно совсем маленькое."}
                      </p>
                      <button
                        className="w-primary"
                        onClick={() => {
                          setListOpen(true);
                          requestAnimationFrame(() => input.current?.focus());
                        }}
                      >
                        Добавить дело <ArrowDown size={20} />
                      </button>
                    </>
                  )}
                  <span className="w-spin-note">
                    {spinning
                      ? "Выбор уже сделан. Сейчас колесо остановится."
                      : candidates.length
                        ? "У каждого дела одинаковый шанс. Никакого давления."
                        : "Список сохраняется автоматически."}
                  </span>
                </div>
              </>
            )}
          </section>
          <section className="w-list-section" aria-label="Список задач">
            <div className="w-list-heading">
              <div>
                <span className="w-eyebrow">ВЫГРУЗИ ИЗ ГОЛОВЫ</span>
                <h2>
                  Твои дела <span>{active.length}</span>
                </h2>
              </div>
              <button
                className="w-text-button w-list-toggle"
                aria-expanded={listOpen}
                onClick={() => setListOpen(!listOpen)}
              >
                {listOpen ? "Свернуть" : "Показать список"}
                <ChevronDown size={17} className={listOpen ? "w-up" : ""} />
              </button>
            </div>
            {!data.readonly && (
              <form className="w-add-form" onSubmit={add}>
                {bulk ? (
                  <textarea
                    aria-label="Задачи, по одной на строку"
                    placeholder={
                      "Разобрать один ящик\nОтветить на письмо\nВыйти на 10 минут"
                    }
                    value={text}
                    maxLength={30000}
                    onChange={(e) => {
                      setText(e.target.value);
                      requestId.current = "";
                    }}
                    disabled={busy}
                    rows={4}
                  />
                ) : (
                  <input
                    ref={input}
                    aria-label="Новое дело"
                    placeholder="Что крутится в голове?"
                    value={text}
                    maxLength={240}
                    onChange={(e) => {
                      setText(e.target.value);
                      requestId.current = "";
                    }}
                    onPaste={(e) => {
                      const paste = e.clipboardData.getData("text");
                      if (paste.includes("\n")) {
                        e.preventDefault();
                        setBulk(true);
                        setText(text + paste);
                        requestId.current = "";
                      }
                    }}
                    disabled={busy}
                  />
                )}
                <button
                  className="w-add-button"
                  title="Добавить"
                  aria-label={
                    bulk
                      ? `Добавить задачи (${parseTasks(text).length})`
                      : "Добавить задачу"
                  }
                  disabled={busy || !text.trim()}
                >
                  <Plus size={23} />
                </button>
                <div className="w-add-under">
                  <span>
                    <ShieldCheck size={13} />
                    {busy ? "Сохраняем…" : "Сохранено в личном списке"}
                  </span>
                  <button
                    className="w-text-button"
                    type="button"
                    onClick={() => setBulk(!bulk)}
                    disabled={busy}
                  >
                    {bulk ? "По одному" : "Вставить списком"}
                  </button>
                </div>
              </form>
            )}
            <div className={"w-task-panel" + (listOpen ? " is-open" : "")}>
              <div className="w-tabs" role="tablist" aria-label="Статус задач">
                {(
                  [
                    ["active", "В колесе", active.length],
                    ["done", "Сделано", done.length],
                    ["deferred", "Отложено", deferred.length],
                  ] as const
                ).map(([id, label, count]) => (
                  <button
                    role="tab"
                    id={`w-tab-${id}`}
                    aria-selected={tab === id}
                    aria-controls="w-task-tabpanel"
                    tabIndex={tab === id ? 0 : -1}
                    key={id}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                        const ids = ["active", "done", "deferred"] as const;
                        const next =
                          ids[
                            (ids.indexOf(id) +
                              (e.key === "ArrowRight" ? 1 : 2)) %
                              3
                          ];
                        setTab(next);
                        document.getElementById(`w-tab-${next}`)?.focus();
                      }
                    }}
                    onClick={() => setTab(id)}
                  >
                    {label}
                    <span>{count}</span>
                  </button>
                ))}
              </div>
              <div
                role="tabpanel"
                id="w-task-tabpanel"
                aria-labelledby={`w-tab-${tab}`}
                className="w-task-rows"
              >
                {shown.length ? (
                  shown.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      disabled={busy || data.readonly}
                      onChange={change}
                    />
                  ))
                ) : (
                  <p className="w-empty">
                    {tab === "done"
                      ? "Здесь будут маленькие победы. Без планов и оценок."
                      : tab === "deferred"
                        ? "Здесь появятся дела, которым нужно подождать."
                        : "Пока пусто. Первое дело может быть очень простым."}
                  </p>
                )}
              </div>
              {data.profile.skipped.length > 0 && !data.readonly && (
                <button
                  className="w-text-button w-reset"
                  disabled={busy}
                  onClick={() => void change({ action: "reset" })}
                >
                  <RotateCcw size={14} /> Вернуть пропущенные в колесо ·{" "}
                  {data.profile.skipped.length}
                </button>
              )}
            </div>
          </section>
          <div className="w-feedback" aria-live="polite">
            {error ? (
              <p className="w-error" role="alert">
                {error}
                <button
                  className="w-text-button"
                  disabled={busy}
                  onClick={() => void load(data.profile.user_id)}
                >
                  Обновить список
                </button>
              </p>
            ) : notice ? (
              <p className="w-notice">
                <CircleCheck size={18} /> {notice}
              </p>
            ) : (
              <p className="w-bottom-note">
                Не весь список. Только следующий шаг.
              </p>
            )}
          </div>
        </main>
      )}
      <footer className="w-footer">
        <span>Сначала маленький шаг. Потом всё остальное.</span>
        <span>
          <LockKeyhole size={12} /> Без ИИ. Без лишнего шума.
        </span>
      </footer>
    </div>
  );
}
