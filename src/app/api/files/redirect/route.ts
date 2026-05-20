import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { storage } from '@/lib/storage';

/**
 * Auth-checks the session, resolves a fresh download URL for the given
 * storage key (presigned URL in S3, local proxy in dev), and 302s to it.
 *
 * Why not let the client hold the URL directly? S3 presigned URLs expire
 * (5-minute TTL here), so a URL saved into the DB would break. Generating
 * a new one per click keeps the link always fresh and the auth check
 * keeps private files private.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const key = req.nextUrl.searchParams.get('key');
  if (!key) {
    return NextResponse.json({ error: 'key param required' }, { status: 400 });
  }

  try {
    const url = await storage.getDownloadUrl(key);
    return NextResponse.redirect(url, { status: 302 });
  } catch (err) {
    console.error('[files/redirect] resolve error:', err);
    return NextResponse.json({ error: 'Failed to resolve file' }, { status: 500 });
  }
}
