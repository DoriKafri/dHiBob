/**
 * Validate required environment variables at startup.
 * Import this module early (e.g. in instrumentation.ts) to fail fast
 * instead of crashing mid-request with cryptic errors.
 */

const REQUIRED = ['DATABASE_URL', 'NEXTAUTH_SECRET'] as const;
const RECOMMENDED = ['REDIS_URL', 'FIELD_ENCRYPTION_KEY'] as const;

export function validateEnv() {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const key of REQUIRED) {
    if (!process.env[key]) missing.push(key);
  }

  for (const key of RECOMMENDED) {
    if (!process.env[key]) warnings.push(key);
  }

  if (warnings.length > 0) {
    console.warn(`[env] Missing recommended env vars: ${warnings.join(', ')}`);
  }

  if (missing.length > 0) {
    throw new Error(`[env] Missing required env vars: ${missing.join(', ')}. App cannot start.`);
  }
}
