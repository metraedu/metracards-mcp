#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config/index.ts';
import { createHttpApp } from './http/create-http-app.ts';
import { createOAuthStoreFromEnv } from './oauth/create-store.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const loginPageHtml = readFileSync(
  path.join(here, 'auth', 'oauth-login-page.html'),
  'utf8',
);
const oauthStore = createOAuthStoreFromEnv();
const { app, close } = createHttpApp({
  config,
  oauthStore,
  projectId: config.firebase.projectId,
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
