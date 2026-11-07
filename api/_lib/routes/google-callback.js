import { createSessionCookie, flushAuthCookies } from '../firebase.js';
import { appOrigin, consumeGoogleState, exchangeGoogleCode } from '../session.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed.');
  try {
    const { state: expectedState, nonce } = consumeGoogleState(req);
    const state = typeof req.query?.state === 'string' ? req.query.state : '';
    if (!state || state !== expectedState) throw new Error('Google sign-in state did not match.');
    if (req.query?.error) throw new Error('Google sign-in was cancelled.');
    const code = typeof req.query?.code === 'string' ? req.query.code : '';
    if (!code) throw new Error('Google did not return an authorization code.');
    const idToken = await exchangeGoogleCode(req, code, nonce);
    await createSessionCookie(req, res, idToken);
    flushAuthCookies(req, res);
    return res.redirect(302, `${appOrigin(req)}/#/account`);
  } catch (error) {
    flushAuthCookies(req, res);
    console.error('RAW HAIRS Google OAuth callback:', error.message);
    const origin = process.env.APP_ORIGIN || appOrigin(req);
    return res.redirect(302, `${origin}/#/account?auth_error=google`);
  }
}
