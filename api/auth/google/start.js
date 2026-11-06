import { appOrigin, createGoogleState, flushCookies } from '../../_lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed.');
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId || !process.env.GOOGLE_CLIENT_SECRET || !process.env.APP_ORIGIN) return res.status(503).send('Google sign-in is not configured.');
    const { state, nonce } = createGoogleState(req);
    flushCookies(req, res);
    const redirectUri = `${appOrigin(req)}/api/auth/google/callback`;
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
      scope: 'openid email profile', state, nonce, prompt: 'select_account',
    }).toString();
    return res.redirect(302, url.toString());
  } catch (error) {
    return res.status(error.statusCode || 500).send(error.statusCode ? error.message : 'Unable to start Google sign-in.');
  }
}
