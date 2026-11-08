import { saveReview } from "@/lib/actions/reviews";
import { reviewUploadRejection } from "@/lib/review-upload";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
  };
  const rejected = reviewUploadRejection(request);
  if (rejected) return rejected;
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;"))
    return Response.json(
      { error: "Недопустимый запрос" },
      { status: 400, headers },
    );
  try {
    const { token } = await params;
    const form = await request.formData();
    form.set("token", token);
    const result = await saveReview(form);
    return Response.json(result.error ? result : { saved: true }, {
      status: result.error ? 400 : 200,
      headers,
    });
  } catch {
    return Response.json(
      {
        error:
          "Не удалось сохранить отзыв. Ваш текст и фото остались в форме. Повторите отправку.",
      },
      { status: 400, headers },
    );
  }
}
