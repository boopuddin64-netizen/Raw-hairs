const AUTH_CODES = new Set(['invalid_credentials', 'invalid_grant', 'user_not_found']);
const NETWORK_CODES = new Set(['fetch_error', 'network_error']);

export function userFacingError(error, fallback = 'We couldn’t complete that request. Please try again.') {
  const status = Number(error?.status || error?.statusCode || 0);
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();

  if (AUTH_CODES.has(code) || /invalid login credentials|invalid email or password|email not confirmed/.test(message)) {
    return 'The email or password is incorrect. Check your details and try again.';
  }
  if (status === 401 || status === 403 || /session.*(expired|missing)|not authorized|unauthorized/.test(message)) {
    return 'Your session may have expired or you may not have access. Please sign in again.';
  }
  if (status === 404) return 'We couldn’t find what you requested. Refresh and try again.';
  if (status === 409) return 'This information has changed. Refresh the page and try again.';
  if (status === 413) return 'This file is too large. Choose a smaller file and try again.';
  if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (NETWORK_CODES.has(code) || error instanceof TypeError || /failed to fetch|network request failed|load failed/.test(message)) {
    return 'We couldn’t connect. Check your internet connection and try again.';
  }
  if (status >= 500 || /database|supabase|postgres|sql|rpc|api route|environment variable|service role|not configured|internal server/.test(message)) {
    return fallback;
  }
  return fallback;
}
