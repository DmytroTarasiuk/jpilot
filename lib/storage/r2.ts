import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Environment } from "../env/server";

let r2Client: S3Client | undefined;

function getR2Client() {
  if (r2Client) return r2Client;
  const environment = getR2Environment();
  r2Client = new S3Client({
    region: "auto",
    endpoint: environment.R2_ENDPOINT,
    credentials: {
      accessKeyId: environment.R2_ACCESS_KEY_ID,
      secretAccessKey: environment.R2_SECRET_ACCESS_KEY,
    },
  });
  return r2Client;
}

export async function createPrivateUploadUrl(input: {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
}) {
  const { R2_BUCKET_NAME } = getR2Environment();
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: input.objectKey,
    ContentType: input.contentType,
    ContentLength: input.sizeBytes,
  });
  return getSignedUrl(getR2Client(), command, { expiresIn: 10 * 60 });
}

export async function createPrivateDownloadUrl(objectKey: string) {
  const { R2_BUCKET_NAME } = getR2Environment();
  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: objectKey }),
    { expiresIn: 5 * 60 },
  );
}

export async function inspectPrivateObject(objectKey: string) {
  const { R2_BUCKET_NAME } = getR2Environment();
  return getR2Client().send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: objectKey }));
}

export async function downloadPrivateObject(objectKey: string) {
  const { R2_BUCKET_NAME } = getR2Environment();
  const response = await getR2Client().send(
    new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: objectKey }),
  );
  if (!response.Body) throw new Error("The private object has no body.");
  return Buffer.from(await response.Body.transformToByteArray());
}

export async function deletePrivateObject(objectKey: string) {
  const { R2_BUCKET_NAME } = getR2Environment();
  await getR2Client().send(
    new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: objectKey }),
  );
}
