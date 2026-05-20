import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { storage } from '@/lib/storage';

/**
 * Delete a file from the storage provider by key. Auth-checked — only
 * logged-in users can delete. The caller is responsible for also
 * removing the key reference from the DB row.
 */
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const key = req.nextUrl.searchParams.get('key');
  if (!key) {
    return NextResponse.json({ error: 'key param required' }, { status: 400 });
  }

  try {
    await storage.deleteFile(key);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[files/delete] error:', err);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
