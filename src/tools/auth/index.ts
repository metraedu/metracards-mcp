import type { McpServer } from '@modelcontextprotocol/server';
import type { AuthToolDeps } from './deps.js';
import { registerAuthLogin } from './login.js';
import { registerAuthLogout } from './logout.js';
import { registerAuthStatus } from './status.js';

export type { AuthToolDeps } from './deps.js';

export function registerAuthTools(server: McpServer, deps: AuthToolDeps): void {
  registerAuthLogin(server, deps);
  registerAuthLogout(server, deps);
  registerAuthStatus(server, deps);
}
