import { POST as submitReview } from "../../review/[token]/route";
import { reviewUploadRejection } from "@/lib/review-upload";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const rejected = reviewUploadRejection(request);
  return rejected ?? submitReview(request, context);
}
