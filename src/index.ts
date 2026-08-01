#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server/create-server.js';
import { config } from './config/index.js';

console.error(`metracards-mcp listening on stdio (API: ${config.apiUrl})`);

serveStdio(() => createServer());
