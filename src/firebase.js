import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Firebase Web SDK settings are public client configuration, not privileged secrets.
// Never add Firebase Admin credentials, database URLs or payment secrets to this file.
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId
);

const app = firebaseConfigured
  ? (getApps().length ? getApp() : initializeApp(config))
  : null;

export const auth = app ? getAuth(app) : null;
