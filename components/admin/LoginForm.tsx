"use client";
import { useActionState } from "react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
async function login(form: FormData) {
  try {
    const { error } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (!error) return { error: "" };
  } catch { /* Uniform response for unknown accounts and wrong passwords. */ }
  return { error: "Не удалось войти. Проверьте данные и доступ к админке." };
}
export default function LoginForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (_previous: {error:string}, form:FormData) => {
    const result=await login(form);
    if (!result.error) { router.push("/admin"); router.refresh(); }
    return result;
  }, { error: "" });
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
