import fs from 'fs/promises';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface StorageProvider {
  uploadFile(file: Buffer, fileName: string, folder: string): Promise<string>;
  readFile(filePath: string): Promise<Buffer>;
  getDownloadUrl(filePath: string): Promise<string>;
  deleteFile(filePath: string): Promise<void>;
}

// Single path segment — no slashes allowed. Used for filenames.
function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9.-]/g, '_');
}

// A multi-segment path — split on /, sanitize each segment, rejoin.
// Used for folder values like "people/john-doe-abcd1234/profile_docs".
// Throws on `..` segments to make path traversal explicit.
function sanitizeFolderPath(value: string): string {
  const parts = value.split('/').map(s => s.trim()).filter(s => s.length > 0);
  if (parts.some(s => s === '..' || s === '.')) {
    throw new Error('Path traversal attempt detected');
  }
  return parts.map(sanitizeSegment).join('/');
}

export class LocalStorageProvider implements StorageProvider {
  private uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));

  private ensureInUploadDir(resolvedPath: string) {
    const relative = path.relative(this.uploadDir, resolvedPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Path traversal attempt detected');
    }
  }

  async uploadFile(file: Buffer, fileName: string, folder: string): Promise<string> {
    const sanitizedFolder = sanitizeFolderPath(folder);
    const sanitizedFileName = sanitizeSegment(fileName);

    if (!sanitizedFileName || sanitizedFileName === '.' || sanitizedFileName === '..') {
      throw new Error('Invalid filename');
    }

    const targetDir = path.resolve(this.uploadDir, sanitizedFolder);
    this.ensureInUploadDir(targetDir);

    await fs.mkdir(targetDir, { recursive: true });

    const timestamp = Date.now();
    const safeName = `${timestamp}-${sanitizedFileName}`;
    const filePath = path.resolve(targetDir, safeName);
    this.ensureInUploadDir(filePath);

    await fs.writeFile(filePath, file);
    return path.relative(this.uploadDir, filePath);
  }

  async readFile(filePath: string): Promise<Buffer> {
    const fullPath = path.resolve(this.uploadDir, filePath);
    this.ensureInUploadDir(fullPath);
    return fs.readFile(fullPath);
  }

  async getDownloadUrl(filePath: string): Promise<string> {
    return `/api/files/download?path=${encodeURIComponent(filePath)}`;
  }

  async deleteFile(filePath: string): Promise<void> {
    const fullPath = path.resolve(this.uploadDir, filePath);
    this.ensureInUploadDir(fullPath);

    try {
      await fs.unlink(fullPath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

export class S3StorageProvider implements StorageProvider {
  private bucket: string;
  private client: S3Client;
  private urlTtlSeconds = 300; // 5-minute presigned URLs

  constructor() {
    const bucket = process.env.S3_BUCKET;
    const region = process.env.AWS_REGION || 'us-east-1';
    if (!bucket) {
      throw new Error('STORAGE_DRIVER=s3 but S3_BUCKET is not set');
    }
    this.bucket = bucket;

    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    this.client = new S3Client({
      region,
      // Explicit credentials when IAM user keys are provided; otherwise the SDK
      // falls back to the default provider chain (env / EC2 instance profile).
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  }

  async uploadFile(file: Buffer, fileName: string, folder: string): Promise<string> {
    const sanitizedFolder = sanitizeFolderPath(folder);
    const sanitizedFileName = sanitizeSegment(fileName);
    if (!sanitizedFileName || sanitizedFileName === '.' || sanitizedFileName === '..') {
      throw new Error('Invalid filename');
    }
    const key = `${sanitizedFolder}/${Date.now()}-${sanitizedFileName}`;

    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file,
      ContentType: guessContentType(sanitizedFileName),
    }));

    return key;
  }

  async readFile(filePath: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: filePath }),
    );
    const stream = response.Body as any;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async getDownloadUrl(filePath: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: filePath }),
      { expiresIn: this.urlTtlSeconds },
    );
  }

  async deleteFile(filePath: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: filePath }));
  }
}

function guessContentType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return map[ext] || 'application/octet-stream';
}

export const storage: StorageProvider =
  process.env.STORAGE_DRIVER === 's3' ? new S3StorageProvider() : new LocalStorageProvider();

// Data URL helpers — callers accept base64 data URLs from the browser
// and persist the bytes to the storage provider, returning the new key.

export function isDataUrl(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith('data:');
}

/**
 * Decode a `data:<mime>;base64,<payload>` URL and upload the bytes via the
 * active storage provider. Returns the storage key. If the input isn't a
 * data URL, returns null — callers can treat that as a no-op.
 */
export async function uploadDataUrl(
  dataUrl: string,
  fileName: string,
  folder: string,
): Promise<string | null> {
  if (!isDataUrl(dataUrl)) return null;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  const payload = dataUrl.slice(comma + 1);
  const buffer = Buffer.from(payload, 'base64');
  return storage.uploadFile(buffer, fileName || 'file', folder);
}

/**
 * Resolve a downloadable URL for a stored file. Prefers the storage key (S3
 * presigned URL or local proxy). Falls back to the legacy base64 data URL
 * when the row hasn't been backfilled yet. Returns null if neither exists.
 */
export async function resolveDownloadUrl(
  storageKey: string | null | undefined,
  legacyBase64: string | null | undefined,
): Promise<string | null> {
  if (storageKey) return storage.getDownloadUrl(storageKey);
  if (legacyBase64) return legacyBase64; // already a data: URL; browser renders it directly
  return null;
}
