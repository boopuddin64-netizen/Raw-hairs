import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const uid = process.env.OWNER_UID;
if (!uid) {
  console.error('Set OWNER_UID to the Firebase Authentication UID of the owner.');
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });

const auth = getAuth();
const user = await auth.getUser(uid);
const existingClaims = user.customClaims || {};

await auth.setCustomUserClaims(uid, { ...existingClaims, owner: true });
await auth.revokeRefreshTokens(uid);

console.log('Owner claim assigned to ' + uid + '. The owner must sign in again to refresh the ID token.');
