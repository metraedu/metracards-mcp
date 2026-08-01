import { config as loadDotenv } from 'dotenv';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FirebaseConfig } from '../auth/types.js';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
loadDotenv({ path: path.join(packageRoot, '.env') });
loadDotenv();

export type AppConfig = {
  apiUrl: string;
  credentialsPath: string;
  firebase: FirebaseConfig | null;
};

function readFirebaseConfig(): FirebaseConfig | null {
  const apiKey = process.env.FIREBASE_API_KEY?.trim() ?? '';
  const authDomain = process.env.FIREBASE_AUTH_DOMAIN?.trim() ?? '';
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() ?? '';
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET?.trim() ?? '';
  const messagingSenderId =
    process.env.FIREBASE_MESSAGING_SENDER_ID?.trim() ?? '';
  const appId = process.env.FIREBASE_APP_ID?.trim() ?? '';

  if (
    !apiKey ||
    !authDomain ||
    !projectId ||
    !storageBucket ||
    !messagingSenderId ||
    !appId
  ) {
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  };
}

export function defaultCredentialsPath(): string {
  return path.join(
    os.homedir(),
    '.config',
    'metracards-mcp',
    'credentials.json',
  );
}

export function loadConfig(): AppConfig {
  const apiUrl =
    process.env.METRACARDS_API_URL?.trim() || 'http://127.0.0.1:3001';
  const credentialsPath =
    process.env.METRACARDS_MCP_CREDENTIALS_PATH?.trim() ||
    defaultCredentialsPath();

  return {
    apiUrl: apiUrl.replace(/\/$/, ''),
    credentialsPath,
    firebase: readFirebaseConfig(),
  };
}

export const config = loadConfig();
