import type { McpServer } from '@modelcontextprotocol/server';
import type { AuthToolDeps } from './deps.ts';
import { registerAuthLogin } from './login.ts';
import { registerAuthLogout } from './logout.ts';
import { registerAuthStatus } from './status.ts';

export type { AuthToolDeps } from './deps.ts';

export function registerAuthTools(server: McpServer, deps: AuthToolDeps): void {
  registerAuthLogin(server, deps);
  registerAuthLogout(server, deps);
  registerAuthStatus(server, deps);
}
