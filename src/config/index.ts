import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FirebaseConfig } from '../auth/types.js';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
loadDotenv({ path: path.join(packageRoot, '.env'), quiet: true });
loadDotenv({ quiet: true });

export type HttpConfig = {
  host: string;
  port: number;
  resourceUrl: string;
  issuerUrl: string;
  authServers: string[];
  allowedHosts: string[];
};

export type AppConfig = {
  apiUrl: string;
  firebase: FirebaseConfig | null;
  http: HttpConfig;
  maxMediaBytes: number;
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

function parseCsv(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function readHttpConfig(): HttpConfig {
  const host =
    process.env.METRACARDS_MCP_HTTP_HOST?.trim() || '127.0.0.1';
  const port = Number(process.env.METRACARDS_MCP_HTTP_PORT?.trim() || '3000');
  const resourceUrl =
    process.env.METRACARDS_MCP_RESOURCE_URL?.trim() ||
    'http://127.0.0.1:3000/mcp';
  const issuerOverride = process.env.METRACARDS_MCP_ISSUER_URL?.trim();
  const issuerUrl = issuerOverride
    ? new URL(issuerOverride).origin
    : new URL(resourceUrl).origin;
  const authServersFromEnv = parseCsv(process.env.METRACARDS_MCP_AUTH_SERVERS);
  const authServers =
    authServersFromEnv.length > 0 ? authServersFromEnv : [issuerUrl];
  const allowedFromEnv = parseCsv(process.env.METRACARDS_MCP_ALLOWED_HOSTS);
  let resourceHost = '127.0.0.1';
  try {
    resourceHost = new URL(resourceUrl).hostname;
  } catch {
    // keep default
  }
  const allowedHosts =
    allowedFromEnv.length > 0 ? allowedFromEnv : [resourceHost];

  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 3000,
    resourceUrl,
    issuerUrl,
    authServers,
    allowedHosts,
  };
}

export function loadConfig(): AppConfig {
  const apiUrl =
    process.env.METRACARDS_API_URL?.trim() ||
    'https://1wcwb3my4l.execute-api.us-east-1.amazonaws.com/prod';
  const maxMediaBytes = Number(
    process.env.METRACARDS_MCP_MAX_MEDIA_BYTES?.trim() || '10485760',
  );

  return {
    apiUrl: apiUrl.replace(/\/$/, ''),
    firebase: readFirebaseConfig(),
    http: readHttpConfig(),
    maxMediaBytes:
      Number.isFinite(maxMediaBytes) && maxMediaBytes > 0
        ? maxMediaBytes
        : 10_485_760,
  };
}

export const config = loadConfig();
