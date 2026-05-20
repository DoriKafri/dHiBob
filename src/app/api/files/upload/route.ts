import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { storage } from '@/lib/storage';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/**
 * Generic file upload: writes bytes via the active StorageProvider
 * (S3 in prod, local disk in dev) and returns the storage key. Unlike
 * /api/documents/upload, this does NOT create a Document DB row — it's
 * used by profile fields (CV, bank doc, etc.) whose metadata lives
 * inside another model's JSON blob.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const folder = ((formData.get('folder') as string) || 'profile_docs').trim();

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const key = await storage.uploadFile(buffer, file.name, folder);
    return NextResponse.json({ key, name: file.name, size: file.size, mimeType: file.type });
  } catch (err) {
    console.error('[files/upload] storage error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
