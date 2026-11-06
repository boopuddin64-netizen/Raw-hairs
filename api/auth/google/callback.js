import { appOrigin, consumeGoogleState, createSession, exchangeGoogleCode, flushCookies, upsertGoogleUser } from '../../../_lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed.');
  try {
    const { state: expectedState, nonce } = consumeGoogleState(req);
    const state = typeof req.query?.state === 'string' ? req.query.state : '';
    if (!state || state !== expectedState) throw Object.assign(new Error('Google sign-in state did not match.'), { statusCode: 400 });
    if (req.query?.error) throw Object.assign(new Error('Google sign-in was cancelled.'), { statusCode: 400 });
    const code = typeof req.query?.code === 'string' ? req.query.code : '';
    if (!code) throw Object.assign(new Error('Google did not return an authorization code.'), { statusCode: 400 });
    const identity = await exchangeGoogleCode(req, code, nonce);
    const userId = await upsertGoogleUser(identity);
    await createSession(req, res, userId);
    return res.redirect(302, `${appOrigin(req)}/#/account`);
  } catch (error) {
    flushCookies(req, res);
    console.error('RAW HAIRS Google OAuth callback:', error.message);
    const origin = process.env.APP_ORIGIN || appOrigin(req);
    return res.redirect(302, `${origin}/#/account?auth_error=google`);
  }
}
