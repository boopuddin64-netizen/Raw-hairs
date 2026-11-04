import { createContext, useContext, useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth, firebaseConfigured } from './firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [redirectError, setRedirectError] = useState('');

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return undefined;
    }

    getRedirectResult(auth).catch((error) => {
      setRedirectError(error.code || 'auth/redirect-failed');
    });

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  const value = {
    user,
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
      await signInWithRedirect(auth, new GoogleAuthProvider());
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
