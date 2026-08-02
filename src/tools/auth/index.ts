import type { McpServer } from '@modelcontextprotocol/server';
import type { AuthToolDeps } from './deps.js';
import { registerAuthStatus } from './status.js';

export type { AuthToolDeps } from './deps.js';

export function registerAuthTools(server: McpServer, deps: AuthToolDeps): void {
  registerAuthStatus(server, deps);
}
