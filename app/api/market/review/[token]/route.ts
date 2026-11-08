import { storage } from "@/lib/storage";
import {
  readMarketReviewMultipart,
  saveMarketReviewPhotos,
} from "@/lib/market/review-photos";
import { getPool, transaction } from "@/lib/db/pool";
import { json, marketError, readMarketBody } from "@/lib/market/http";
import { marketReviewState, submitMarketReview } from "@/lib/market/reviews";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const state = await marketReviewState(
      getPool(),
      (await context.params).token,
    );
    return state
      ? json(state)
      : json(
          { error: "Отзыв доступен по персональной ссылке после покупки" },
          404,
        );
  } catch (e) {
    return marketError(e);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const { token } = await context.params;
    if (
      request.headers.get("content-type")?.startsWith("multipart/form-data;")
    ) {
      const { body, photos } = await readMarketReviewMultipart(request);
      return json(
        await saveMarketReviewPhotos(token, body, photos, {
          db: getPool(),
          transaction,
          store: storage.from("review-photos"),
        }),
      );
    }
    const body = await readMarketBody(request);
    return json(await transaction((db) => submitMarketReview(db, token, body)));
  } catch (e) {
    return marketError(e);
  }
}
