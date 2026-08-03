export type AuthProvider = 'google' | 'apple';

export type StoredCredentials = {
  refreshToken: string;
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  provider: AuthProvider;
  updatedAt: string;
};

export type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

export type BrowserLoginResult = {
  refreshToken: string;
  idToken: string;
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  provider: AuthProvider;
};
