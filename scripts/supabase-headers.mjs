/**
 * Build headers for Supabase Data API requests.
 *
 * New `sb_secret_...` keys are opaque values, not JWTs. Supabase requires
 * those keys to be sent through `apikey` only; legacy `service_role` keys
 * still use the Bearer header as well so they continue to bypass RLS.
 */
export function getSupabaseHeaders(key, extraHeaders = {}) {
  const normalizedKey = String(key || '').trim();
  const headers = {
    ...extraHeaders,
    apikey: normalizedKey,
  };

  if (normalizedKey.startsWith('sb_secret_')) {
    delete headers.authorization;
    delete headers.Authorization;
  } else {
    headers.authorization = `Bearer ${normalizedKey}`;
  }

  return headers;
}
