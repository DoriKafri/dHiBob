import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';

const handler = NextAuth(authOptions);

// Rate-limit the credentials sign-in endpoint (POST only).
// 5 attempts per minute per IP to prevent brute-force.
async function rateLimitedPost(req: NextRequest, ctx: any) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const url = new URL(req.url);

  // Only rate-limit the credentials callback (not Google OAuth or session checks)
  if (url.pathname.includes('/callback/credentials')) {
    const result = rateLimit(`login:${ip}`, { maxAttempts: 5, windowMs: 60_000 });
    if (!result.success) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(result.retryAfter) } }
      );
    }
  }

  return handler(req, ctx);
}

export { handler as GET, rateLimitedPost as POST };
