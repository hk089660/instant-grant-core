/**
 * Shared API base URL resolver.
 *
 * Web:
 * - On deployed Pages/custom domains, use same-origin so /api and /v1 are proxied.
 * - On localhost web dev, prefer env base URL so Expo web can reach local API server.
 *
 * Native:
 * - Use env base URL directly.
 */

function trimBaseUrl(raw: string): string {
  return raw.trim().replace(/\/$/, '');
}

function getEnvApiBaseUrl(): string {
  return trimBaseUrl(
    process.env.EXPO_PUBLIC_SCHOOL_API_BASE_URL ??
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    ''
  );
}

function isLocalWebHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '0.0.0.0' ||
    normalized === '::1'
  );
}

export function resolveApiBaseUrl(options?: { required?: boolean }): string {
  const required = options?.required !== false;
  const envBase = getEnvApiBaseUrl();

  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = trimBaseUrl(window.location.origin);
    const hostname = window.location.hostname ?? '';
    if (isLocalWebHostname(hostname) && envBase) {
      return envBase;
    }
    if (origin) {
      return origin;
    }
  }

  if (envBase) return envBase;
  if (!required) return '';
  throw new Error('API base URL is required (set EXPO_PUBLIC_SCHOOL_API_BASE_URL or EXPO_PUBLIC_API_BASE_URL)');
}
