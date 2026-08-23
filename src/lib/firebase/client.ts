'use client';

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * Point the SDK at the local emulators instead of a real project. Lets the
 * whole flow be exercised end to end with `npm run emu` and no cloud project.
 */
export const useEmulators =
  process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === 'true';

/**
 * True when the deployment actually has Firebase credentials. The UI uses this
 * to show a setup screen instead of throwing an opaque SDK error, so a fresh
 * clone with no .env.local still renders something useful.
 */
export const isFirebaseConfigured =
  useEmulators || Boolean(config.apiKey && config.projectId && config.appId);

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

function app(): FirebaseApp {
  if (!isFirebaseConfigured) {
    throw new Error(
      'Firebase is not configured. Copy .env.local.example to .env.local and fill in your project keys.',
    );
  }
  if (!_app) {
    _app = getApps().length
      ? getApp()
      : initializeApp(
          useEmulators
            ? {
                // The emulators validate none of this; only projectId matters,
                // and it must match the one the emulator was started with.
                apiKey: config.apiKey || 'demo-key',
                projectId: config.projectId || 'demo-sportzfight',
                appId: config.appId || 'demo-app',
                authDomain: config.authDomain || 'localhost',
              }
            : config,
        );
  }
  return _app;
}

export function auth(): Auth {
  if (!_auth) {
    _auth = getAuth(app());
    if (useEmulators) {
      connectAuthEmulator(_auth, 'http://127.0.0.1:9099', {
        disableWarnings: true,
      });
    }
  }
  return _auth;
}

export function db(): Firestore {
  if (!_db) {
    _db = getFirestore(app());
    if (useEmulators) connectFirestoreEmulator(_db, '127.0.0.1', 8080);
  }
  return _db;
}
