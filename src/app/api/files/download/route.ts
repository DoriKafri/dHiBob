import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import fs from 'fs/promises';
import path from 'path';

/**
 * Streams a file from the local uploads directory. Called by
 * LocalStorageProvider.getDownloadUrl() — the S3 path never hits this
 * endpoint because presigned URLs point straight at S3.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const key = req.nextUrl.searchParams.get('path');
  if (!key) {
    return NextResponse.json({ error: 'path param required' }, { status: 400 });
  }

  const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
  const fullPath = path.resolve(uploadDir, key);

  // Prevent path traversal — the resolved path must live under uploadDir
  const relative = path.relative(uploadDir, fullPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  let buf: Buffer;
  try {
    buf = await fs.readFile(fullPath);
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Read failed' }, { status: 500 });
  }

  const ext = path.extname(fullPath).toLowerCase();
  const contentType = mimeFromExt(ext);
  const download = req.nextUrl.searchParams.get('download') === '1';

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Length': buf.length.toString(),
    'Cache-Control': 'private, max-age=60',
  };
  if (download) {
    headers['Content-Disposition'] = `attachment; filename="${path.basename(fullPath)}"`;
  }

  return new NextResponse(new Uint8Array(buf), { status: 200, headers });
}

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return map[ext] || 'application/octet-stream';
}
