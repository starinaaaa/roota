import "server-only";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client: S3Client | undefined;
export function s3Client() {
  if (client) return client;
  const endpoint = process.env.S3_ENDPOINT;
  if (!endpoint || new URL(endpoint).protocol !== "https:") throw new Error("S3_CONFIG");
  if (!process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY || !process.env.S3_BUCKET)
    throw new Error("S3_CONFIG");
  client = new S3Client({
    endpoint,
    region: process.env.S3_REGION || "ru-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });
  return client;
}

export function objectKey(bucket: string, path: string) {
  if (!["products", "product-drafts", "review-photos"].includes(bucket) ||
      !path || path.startsWith("/") || path.includes("\\") ||
      path.split("/").some((part) => !part || part === "." || part === ".."))
    throw new Error("INVALID_OBJECT_KEY");
  return `${bucket}/${path}`;
}

export const storage = {
  from(bucket: string) {
    const input = (path: string) => ({ Bucket: process.env.S3_BUCKET!, Key: objectKey(bucket, path) });
    return {
      async download(path: string) {
        try {
          const result = await s3Client().send(new GetObjectCommand(input(path)));
          if (!result.Body) throw new Error("MISSING_OBJECT");
          return { data: new Blob([new Uint8Array(await result.Body.transformToByteArray())], { type: result.ContentType }), error: null };
        } catch { return { data: null, error: { message: "STORAGE_READ_FAILED" } }; }
      },
      async upload(path: string, body: Buffer, options?: { contentType?: string; upsert?: boolean }) {
        try {
          await s3Client().send(new PutObjectCommand({ ...input(path), Body: body,
            ContentType: options?.contentType, ...(!options?.upsert ? { IfNoneMatch: "*" } : {}),
          }));
          return { data: { path }, error: null };
        } catch { return { data: null, error: { message: "STORAGE_WRITE_FAILED" } }; }
      },
      async remove(paths: string[]) {
        try {
          for (const path of paths) await s3Client().send(new DeleteObjectCommand(input(path)));
          return { data: [], error: null };
        } catch { return { data: null, error: { message: "STORAGE_DELETE_FAILED" } }; }
      },
      async createSignedUrl(path: string, expiresIn: number) {
        try {
          const signedUrl = await getSignedUrl(s3Client(), new GetObjectCommand(input(path)), { expiresIn: Math.min(expiresIn, 3600) });
          return { data: { signedUrl }, error: null };
        } catch { return { data: null, error: { message: "STORAGE_SIGN_FAILED" } }; }
      },
    };
  },
};
