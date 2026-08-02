#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config/index.js';
import { createHttpApp } from './http/create-http-app.js';
import { createOAuthStoreFromEnv } from './oauth/create-store.js';

if (!config.firebase) {
  console.error(
    'Complete Firebase web configuration is required to start the HTTP transport.',
  );
  process.exit(1);
}

const projectId =
  config.firebase?.projectId?.trim() ||
  process.env.FIREBASE_PROJECT_ID?.trim() ||
  '';

if (!projectId) {
  console.error(
    'FIREBASE_PROJECT_ID is required to start the HTTP transport (JWT audience).',
  );
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const loginPageHtml = readFileSync(
  path.join(here, 'auth', 'oauth-login-page.html'),
  'utf8',
);
const oauthStore = createOAuthStoreFromEnv();
const { app, close } = createHttpApp({
  config,
  oauthStore,
  projectId,
  loginPageHtml,
});

const server = app.listen(config.http.port, config.http.host, () => {
  console.error(
    `metracards-mcp HTTP listening on http://${config.http.host}:${config.http.port}/mcp (resource=${config.http.resourceUrl})`,
  );
});

function shutdown(signal: string): void {
  console.error(`Received ${signal}, shutting down HTTP MCP…`);
  void close()
    .catch((err: unknown) => {
      console.error('Error closing MCP handler:', err);
    })
    .finally(() => {
      server.close(() => process.exit(0));
    });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
