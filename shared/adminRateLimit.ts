const ADMIN_RATE_LIMIT_WINDOW_MS = 60_000;
const ADMIN_RATE_LIMIT_MAX_REQUESTS = 20;

interface AdminRateLimitBucket {
  count: number;
  resetAt: number;
}

const adminRateBuckets = new Map<string, AdminRateLimitBucket>();

function pruneExpiredBuckets(now: number) {
  if (adminRateBuckets.size < 250) return;
  for (const [key, bucket] of adminRateBuckets.entries()) {
    if (now >= bucket.resetAt) {
      adminRateBuckets.delete(key);
    }
  }
}

export type AdminRateLimitResult =
  | { allowed: true }
  | {
      allowed: false;
      status: 429;
      code: 'RATE_LIMIT_EXCEEDED';
      message: string;
      retryAfterSec: number;
    };

export function checkAdminRateLimit(rawKey: string): AdminRateLimitResult {
  const key = (rawKey || 'anonymous').slice(0, 160);
  const now = Date.now();
  pruneExpiredBuckets(now);

  const existing = adminRateBuckets.get(key);
  if (!existing || now >= existing.resetAt) {
    adminRateBuckets.set(key, {
      count: 1,
      resetAt: now + ADMIN_RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true };
  }

  if (existing.count >= ADMIN_RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return {
      allowed: false,
      status: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Too many admin user management requests. Please wait ${retryAfterSec}s and try again.`,
      retryAfterSec,
    };
  }

  existing.count += 1;
  return { allowed: true };
}
