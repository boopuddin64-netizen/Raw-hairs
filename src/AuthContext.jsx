import { createContext, useContext, useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithRedirect,
  setPersistence,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth, firebaseConfigured } from './firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [profileStatus, setProfileStatus] = useState('idle');
  const [loading, setLoading] = useState(true);
  const [redirectError, setRedirectError] = useState('');

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return undefined;
    }

    let active = true;

    getRedirectResult(auth).then((result) => {
      if (active && result?.user) setRedirectError('');
    }).catch((error) => {
      if (active) setRedirectError(error.code || 'auth/redirect-failed');
    });

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!active) return;
      setUser(nextUser);
      setCustomer(null);

      if (!nextUser) {
        setProfileStatus('idle');
        setLoading(false);
        return;
      }

      setProfileStatus('syncing');
      try {
        const idToken = await nextUser.getIdToken();
        const response = await fetch('/api/me', {
          method: 'GET',
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Account profile sync failed.');
        if (active) {
          setCustomer(data.customer || null);
          setProfileStatus('synced');
        }
      } catch (error) {
        if (active) setProfileStatus('error');
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = {
    user,
    customer,
    profileStatus,
    loading,
    configured: firebaseConfigured,
    redirectError,
    async register(email, password, displayName) {
      if (!auth) throw new Error('Firebase is not configured for this deployment.');
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (displayName.trim()) await updateProfile(credential.user, { displayName: displayName.trim() });
      return credential.user;
    },
    async login(email, password) {
      if (!auth) throw new Error('Firebase is not configured for this deployment.');
      return (await signInWithEmailAndPassword(auth, email.trim(), password)).user;
    },
    async loginWithGoogle() {
      if (!auth) throw new Error('Firebase is not configured for this deployment.');
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await setPersistence(auth, browserLocalPersistence);
      await signInWithRedirect(auth, provider);
    },
    async resetPassword(email) {
      if (!auth) throw new Error('Firebase is not configured for this deployment.');
      return sendPasswordResetEmail(auth, email.trim());
    },
    async logout() {
      if (auth) await signOut(auth);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
