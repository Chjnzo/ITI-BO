interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

export const checkRateLimit = (
  key: string,
  limit = 5,
  windowMs = 15 * 60 * 1000
): boolean => {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (entry.count < limit) {
    entry.count++;
    return true;
  }

  return false;
};

export const getRateLimitResetTime = (key: string): number | null => {
  const entry = rateLimitMap.get(key);
  return entry ? entry.resetTime : null;
};
