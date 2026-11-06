import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function getFirebaseAdmin() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    const error = new Error('Firebase Admin is not configured on this deployment.');
    error.statusCode = 503;
    throw error;
  }

  const app = getApps()[0] || initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });

  return getAuth(app);
}

export async function requireFirebaseUser(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const error = new Error('A Firebase ID token is required.');
    error.statusCode = 401;
    throw error;
  }

  try {
    return await getFirebaseAdmin().verifyIdToken(match[1], true);
  } catch {
    const error = new Error('Your session is invalid or has expired. Sign in again.');
    error.statusCode = 401;
    throw error;
  }
}
