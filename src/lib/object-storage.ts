import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export interface ObjectStorageConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  publicUrl?: string;
}

let _s3Client: S3Client | null = null;

function getConfig(): ObjectStorageConfig | null {
  const endpoint = process.env.R2_ENDPOINT || process.env.S3_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET || process.env.S3_BUCKET || "narrative-assets";
  const region = process.env.R2_REGION || process.env.S3_REGION || "auto";
  const publicUrl = process.env.R2_PUBLIC_URL || process.env.S3_PUBLIC_URL;

  if (!endpoint || !accessKeyId || !secretAccessKey) return null;

  return { endpoint, accessKeyId, secretAccessKey, bucket, region, publicUrl };
}

function getS3Client(): S3Client {
  if (_s3Client) return _s3Client;

  const config = getConfig();
  if (!config) throw new Error("Object storage not configured");

  _s3Client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  });

  return _s3Client;
}

export function isObjectStorageConfigured(): boolean {
  return getConfig() !== null;
}

export async function uploadToStorage(
  key: string,
  body: Buffer | ArrayBuffer | ReadableStream,
  contentType: string = "image/png"
): Promise<string> {
  const config = getConfig();
  if (!config) throw new Error("Object storage not configured");

  const client = getS3Client();

  let bodyBytes: Uint8Array;
  if (body instanceof ReadableStream) {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    bodyBytes = Buffer.concat(chunks);
  } else if (body instanceof ArrayBuffer) {
    bodyBytes = new Uint8Array(body);
  } else {
    bodyBytes = body;
  }

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: bodyBytes,
      ContentType: contentType,
    })
  );

  if (config.publicUrl) {
    return `${config.publicUrl}/${key}`;
  }

  return `${config.endpoint}/${config.bucket}/${key}`;
}

export async function downloadAndStore(
  remoteUrl: string,
  storageKey: string
): Promise<string> {
  const config = getConfig();
  if (!config) return remoteUrl;

  try {
    const downloadRes = await fetch(remoteUrl);
    if (!downloadRes.ok) {
      console.warn(`[Storage] Failed to download ${remoteUrl}: ${downloadRes.status}`);
      return remoteUrl;
    }

    const contentType = downloadRes.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await downloadRes.arrayBuffer());

    const storedUrl = await uploadToStorage(storageKey, buffer, contentType);
    console.log(`[Storage] Stored ${storageKey} (${buffer.length} bytes)`);
    return storedUrl;
  } catch (err) {
    console.warn(`[Storage] downloadAndStore failed, using remote URL:`, err instanceof Error ? err.message : err);
    return remoteUrl;
  }
}

export function buildAssetKey(sessionId: string, sceneId: string, version: number = 1): string {
  const date = new Date().toISOString().slice(0, 10);
  return `assets/${date}/${sessionId}/${sceneId}/v${version}.png`;
}
