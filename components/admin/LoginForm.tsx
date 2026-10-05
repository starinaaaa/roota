"use client";
import { useActionState } from "react";
import { login } from "@/lib/actions/auth";
export default function LoginForm() {
  const [state, action, pending] = useActionState(login, { error: "" });
  return (
    <div className="min-h-screen pt-32 px-6">
      <form
        action={action}
        className="mx-auto max-w-md space-y-6 border border-stone-200 bg-white p-7"
      >
        <p className="text-xs tracking-widest uppercase text-stone-500">
          Roota ceramics
        </p>
        <h1 className="text-2xl">Вход в админку</h1>
        <label className="block">
          Email
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            className="admin-input"
          />
        </label>
        <label className="block">
          Пароль
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="admin-input"
          />
        </label>
        {state.error && (
          <p role="alert" className="text-red-700">
            {state.error}
          </p>
        )}
        <button disabled={pending} className="admin-button w-full">
          {pending ? "Вхожу…" : "Войти"}
        </button>
        <p className="text-sm text-stone-600">
          Доступ предоставляется владелицей студии.
        </p>
      </form>
    </div>
  );
}
