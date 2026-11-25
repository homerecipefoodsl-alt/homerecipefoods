import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  setPersistence,
} from 'firebase/auth';
import { Database, getDatabase } from 'firebase/database';
import {
  Firestore,
  doc,
  getDocFromServer,
  getFirestore,
} from 'firebase/firestore';
import firebaseAppletConfig from '../../firebase-applet-config.json';

export const EXPECTED_FIREBASE_PROJECT_ID = 'homerecipefoods';

const rawDatabaseUrl = (import.meta.env?.VITE_FIREBASE_DATABASE_URL || '').trim();
const isValidRealtimeDbUrl = (() => {
  if (!rawDatabaseUrl) return false;
  try {
    const parsed = new URL(rawDatabaseUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    return parsed.hostname.toLowerCase().includes(EXPECTED_FIREBASE_PROJECT_ID);
  } catch {
    return false;
  }
})();

if (rawDatabaseUrl && !isValidRealtimeDbUrl) {
  console.warn(
    `Ignoring VITE_FIREBASE_DATABASE_URL that does not match project ${EXPECTED_FIREBASE_PROJECT_ID}.`
  );
}

const appletProjectId = (firebaseAppletConfig.projectId || '').trim();
const useAppletConfigFirst = appletProjectId === EXPECTED_FIREBASE_PROJECT_ID;
const envDbId = (import.meta.env?.VITE_FIREBASE_FIRESTORE_DATABASE_ID || '').trim();
const appletDbId = (firebaseAppletConfig.firestoreDatabaseId || '').trim();

const rawConfig = {
  apiKey: (
    (useAppletConfigFirst ? firebaseAppletConfig.apiKey : '') ||
    import.meta.env?.VITE_FIREBASE_API_KEY ||
    firebaseAppletConfig.apiKey ||
    ''
  ).trim(),
  authDomain: (
    (useAppletConfigFirst ? firebaseAppletConfig.authDomain : '') ||
    import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN ||
    firebaseAppletConfig.authDomain ||
    ''
  ).trim(),
  projectId: (
    (useAppletConfigFirst ? firebaseAppletConfig.projectId : '') ||
    import.meta.env?.VITE_FIREBASE_PROJECT_ID ||
    firebaseAppletConfig.projectId ||
    ''
  ).trim(),
  messagingSenderId: (
    (useAppletConfigFirst ? firebaseAppletConfig.messagingSenderId : '') ||
    import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    firebaseAppletConfig.messagingSenderId ||
    ''
  ).trim(),
  appId: (
    (useAppletConfigFirst ? firebaseAppletConfig.appId : '') ||
    import.meta.env?.VITE_FIREBASE_APP_ID ||
    firebaseAppletConfig.appId ||
    ''
  ).trim(),
  databaseURL: isValidRealtimeDbUrl ? rawDatabaseUrl : '',
  firestoreDatabaseId: (
    (useAppletConfigFirst && appletDbId && appletDbId !== '(default)'
      ? appletDbId
      : envDbId && envDbId !== '(default)'
      ? envDbId
      : appletDbId || envDbId || '(default)')
  ).trim(),
};

export const firebaseMissingFields: string[] = [
  ...(!rawConfig.apiKey ? ['VITE_FIREBASE_API_KEY'] : []),
  ...(!rawConfig.authDomain ? ['VITE_FIREBASE_AUTH_DOMAIN'] : []),
  ...(!rawConfig.projectId ? ['VITE_FIREBASE_PROJECT_ID'] : []),
  ...(!rawConfig.messagingSenderId ? ['VITE_FIREBASE_MESSAGING_SENDER_ID'] : []),
  ...(!rawConfig.appId ? ['VITE_FIREBASE_APP_ID'] : []),
];

export type FirebaseConnectionStatus =
  | 'connected'
  | 'unconfigured'
  | 'project_mismatch';

export const firebaseConnectionStatus: FirebaseConnectionStatus =
  firebaseMissingFields.length > 0
    ? 'unconfigured'
    : rawConfig.projectId !== EXPECTED_FIREBASE_PROJECT_ID
    ? 'project_mismatch'
    : 'connected';

export const isFirebaseConfigured = firebaseConnectionStatus === 'connected';

export const firebasePublicInfo = {
  expectedProjectId: EXPECTED_FIREBASE_PROJECT_ID,
  projectId: rawConfig.projectId || '(not set)',
  authDomain: rawConfig.authDomain || '(not set)',
  firestoreDatabaseId: rawConfig.firestoreDatabaseId || '(default)',
  hasRealtimeDatabase: Boolean(rawConfig.databaseURL),
};

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let rtdbInstance: Database | null = null;

if (isFirebaseConfigured) {
  const firebaseOptions = {
    apiKey: rawConfig.apiKey,
    authDomain: rawConfig.authDomain,
    projectId: rawConfig.projectId,
    messagingSenderId: rawConfig.messagingSenderId,
    appId: rawConfig.appId,
    ...(rawConfig.databaseURL ? { databaseURL: rawConfig.databaseURL } : {}),
  };

  appInstance =
    getApps().length > 0 ? getApps()[0] : initializeApp(firebaseOptions);

  dbInstance =
    rawConfig.firestoreDatabaseId &&
    rawConfig.firestoreDatabaseId !== '(default)'
      ? getFirestore(appInstance, rawConfig.firestoreDatabaseId)
      : getFirestore(appInstance);

  authInstance = getAuth(appInstance);
  if (rawConfig.databaseURL) {
    try {
      rtdbInstance = getDatabase(appInstance);
    } catch (err) {
      console.warn('Realtime Database initialization skipped:', err);
      rtdbInstance = null;
    }
  }
}

export const app = appInstance;
export const db = dbInstance;
export const auth = authInstance;
export const rtdb = rtdbInstance;

export async function applyAuthPersistence(rememberSession: boolean): Promise<void> {
  if (!authInstance) return;
  try {
    await setPersistence(
      authInstance,
      rememberSession ? browserLocalPersistence : browserSessionPersistence
    );
  } catch (err) {
    console.warn('Firebase Auth persistence fallback:', err);
  }
}

export function requireDb(): Firestore {
  if (!dbInstance) {
    throw new Error(
      'Firebase Firestore is not configured for project homerecipefoods.'
    );
  }
  return dbInstance;
}

export function requireAuth(): Auth {
  if (!authInstance) {
    throw new Error(
      'Firebase Auth is not configured for project homerecipefoods.'
    );
  }
  return authInstance;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: authInstance?.currentUser?.uid,
      email: authInstance?.currentUser?.email,
      emailVerified: authInstance?.currentUser?.emailVerified,
      isAnonymous: authInstance?.currentUser?.isAnonymous,
      tenantId: authInstance?.currentUser?.tenantId,
      providerInfo:
        authInstance?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  if (!dbInstance) return false;
  try {
    await getDocFromServer(doc(dbInstance, 'site_settings', 'main'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    return true;
  }
}

if (isFirebaseConfigured) {
  testFirestoreConnection();
}
