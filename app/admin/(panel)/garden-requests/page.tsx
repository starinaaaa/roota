import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/db";
import {
  gardenConfigurationSchema,
  gardenName,
  gardenSummary,
} from "@/lib/garden";
import { uuid } from "@/lib/validation";
import SubmitButton from "@/components/ui/SubmitButton";

async function updateRequest(form: FormData) {
  "use server";
  await requireAdmin();
  const id = uuid.parse(form.get("id"));
  const status = form.get("status");
  if (status !== "new" && status !== "contacted" && status !== "closed")
    throw new Error("Некорректный статус");
  const { error } = await createServerClient()
    .from("garden_requests")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error("Не удалось сохранить статус");
  revalidatePath("/admin/garden-requests");
}
export default async function GardenRequestsPage() {
  await requireAdmin();
  const { data, error } = await createServerClient()
    .from("garden_requests")
    .select("id,name,contact,wishes,configuration,status,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("Не удалось загрузить заявки");
  return (
    <div className="space-y-6">
      <h2 className="text-2xl">Помочь выбрать Сад</h2>
      <p className="text-sm text-stone-600">
        Покупатели оставили контакты, чтобы выбрать формы и цвета вместе с
        Дашей. Это заявки на подбор, без оплаты.
      </p>
      {!data?.length && <p>Новых заявок пока нет.</p>}
      {data?.map((row) => {
        const c = gardenConfigurationSchema.safeParse(row.configuration);
        return (
          <article
            key={row.id}
            className="space-y-3 rounded-lg border border-stone-200 p-5"
          >
            <p className="text-lg">{row.name}</p>
            <p className="whitespace-pre-wrap break-words">{row.contact}</p>
            <p className="text-xs text-stone-500">
              {new Date(row.created_at).toLocaleString("ru-RU", {
                timeZone: "Europe/Moscow",
              })}
            </p>
            {c.success && (
              <p className="text-sm">
                {gardenName(c.data)} · {gardenSummary(c.data)}
              </p>
            )}
            <p className="whitespace-pre-wrap break-words text-sm">
              {row.wishes || "Без дополнительных пожеланий"}
            </p>
            <form
              action={updateRequest}
              className="flex flex-wrap items-center gap-3"
            >
              <input type="hidden" name="id" value={row.id} />
              <select
                name="status"
                aria-label="Статус заявки"
                defaultValue={row.status}
                className="admin-input"
              >
                <option value="new">Новая</option>
                <option value="contacted">Связались</option>
                <option value="closed">Закрыта</option>
              </select>
              <SubmitButton className="admin-secondary">Сохранить</SubmitButton>
            </form>
          </article>
        );
      })}
    </div>
  );
}
