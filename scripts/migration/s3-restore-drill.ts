import {
  S3Client,
  GetBucketVersioningCommand,
  PutBucketVersioningCommand,
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectVersionsCommand,
  DeleteObjectsCommand,
  type LifecycleRule,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { required, directory, hash } from "./common";
const dir = await directory(process.argv[2]);
if (
  required("S3_ENDPOINT") !== "https://s3.twcstorage.ru" ||
  required("S3_BUCKET") !== "edf40ed2-aaa8-4d8c-88e5-ddb30d2c5260"
)
  throw Error("EXPECTED_TIMEWEB_TARGET_REQUIRED");
const Bucket = required("S3_BUCKET");
const s3 = new S3Client({
  endpoint: required("S3_ENDPOINT"),
  region: required("S3_REGION"),
  forcePathStyle: true,
  credentials: {
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
  },
});
const Key = "migration-restore-proof/" + randomUUID() + ".txt";
let uploaded = false;
try {
  if (process.argv.includes("--enable-versioning")) {
    let rules: LifecycleRule[] = [];
    try {
      rules =
        (await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket })))
          .Rules ?? [];
    } catch (error) {
      if ((error as Error).name !== "NoSuchLifecycleConfiguration") throw error;
    }
    await s3.send(
      new PutBucketVersioningCommand({
        Bucket,
        VersioningConfiguration: { Status: "Enabled" },
      }),
    );
    const ID = "roota-noncurrent-30-days";
    await s3.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket,
        LifecycleConfiguration: {
          Rules: [
            ...rules.filter((r) => r.ID !== ID),
            {
              ID,
              Status: "Enabled",
              Filter: { Prefix: "" },
              NoncurrentVersionExpiration: { NoncurrentDays: 30 },
              AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
            },
          ],
        },
      }),
    );
  }
  if (
    (await s3.send(new GetBucketVersioningCommand({ Bucket }))).Status !==
    "Enabled"
  )
    throw Error("VERSIONING_NOT_ENABLED");
  const rules =
    (await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket })))
      .Rules ?? [];
  if (
    !rules.some(
      (r) =>
        r.ID === "roota-noncurrent-30-days" &&
        r.Status === "Enabled" &&
        r.NoncurrentVersionExpiration?.NoncurrentDays === 30 &&
        !r.Expiration,
    )
  )
    throw Error("RETENTION_NOT_VERIFIED");
  const original = Buffer.from("roota restore probe v1 " + randomUUID());
  const first = await s3.send(
    new PutObjectCommand({
      Bucket,
      Key,
      Body: original,
      ContentType: "text/plain",
    }),
  );
  uploaded = true;
  if (!first.VersionId || first.VersionId === "null")
    throw Error("VERSION_ID_REQUIRED");
  await s3.send(
    new PutObjectCommand({
      Bucket,
      Key,
      Body: Buffer.from("replacement v2"),
      ContentType: "text/plain",
    }),
  );
  await s3.send(new DeleteObjectCommand({ Bucket, Key }));
  let deleted = false;
  try {
    await s3.send(new GetObjectCommand({ Bucket, Key }));
  } catch (error) {
    deleted = ["NoSuchKey", "NotFound"].includes((error as Error).name);
  }
  if (!deleted) throw Error("DELETE_MARKER_NOT_VERIFIED");
  const historical = await s3.send(
    new GetObjectCommand({ Bucket, Key, VersionId: first.VersionId }),
  );
  const restored = Buffer.from(await historical.Body!.transformToByteArray());
  if (hash(restored) !== hash(original))
    throw Error("HISTORICAL_CHECKSUM_MISMATCH");
  await s3.send(
    new PutObjectCommand({
      Bucket,
      Key,
      Body: restored,
      ContentType: "text/plain",
    }),
  );
  const current = await s3.send(new GetObjectCommand({ Bucket, Key }));
  if (
    hash(Buffer.from(await current.Body!.transformToByteArray())) !==
    hash(original)
  )
    throw Error("RESTORED_CHECKSUM_MISMATCH");
  await writeFile(
    path.join(dir, "s3-restore-verified.json"),
    JSON.stringify({
      verifiedAt: new Date().toISOString(),
      bucket: Bucket,
      versioning: "Enabled",
      noncurrentRetentionDays: 30,
      overwriteDeleteRestoreVerified: true,
      sha256: hash(original),
    }),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      versioning: "Enabled",
      noncurrentRetentionDays: 30,
      overwriteDeleteRestoreVerified: true,
    }),
  );
} catch (error) {
  console.error("S3_RESTORE_DRILL_FAILED", (error as Error).name);
  process.exitCode = 1;
} finally {
  if (uploaded) {
    const versions = await s3.send(
      new ListObjectVersionsCommand({ Bucket, Prefix: Key }),
    );
    const objects = [
      ...(versions.Versions ?? []),
      ...(versions.DeleteMarkers ?? []),
    ];
    if (versions.IsTruncated || objects.some((o) => o.Key !== Key))
      throw Error("PROBE_CLEANUP_SCOPE_MISMATCH");
    if (objects.length) {
      const cleanup = await s3.send(
        new DeleteObjectsCommand({
          Bucket,
          Delete: {
            Objects: objects.map((o) => ({
              Key: o.Key!,
              VersionId: o.VersionId!,
            })),
            Quiet: true,
          },
        }),
      );
      if (cleanup.Errors?.length) throw Error("PROBE_CLEANUP_FAILED");
    }
  }
  s3.destroy();
}
