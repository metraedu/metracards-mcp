import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AuthProvider,
  BrowserLoginResult,
  FirebaseConfig,
} from './types.ts';

const LOGIN_TIMEOUT_MS = 120_000;

export type OpenBrowser = (url: string) => Promise<void>;

export type BrowserLoginOptions = {
  firebase: FirebaseConfig;
  provider?: AuthProvider;
  timeoutMs?: number;
  openBrowser?: OpenBrowser;
  pageHtml?: string;
};

function defaultOpenBrowser(): OpenBrowser {
  return async (url: string) => {
    const platform = process.platform;
    if (platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
      return;
    }
    if (platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], {
        detached: true,
        stdio: 'ignore',
      }).unref();
      return;
    }
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  };
}

async function loadDefaultPageHtml(): Promise<string> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return readFile(path.join(here, 'login-page.html'), 'utf8');
}

function renderPage(
  template: string,
  firebase: FirebaseConfig,
  state: string,
  provider: AuthProvider | undefined,
): string {
  return template
    .replace('__FIREBASE_CONFIG__', JSON.stringify(firebase))
    .replace('__STATE__', JSON.stringify(state))
    .replace(
      '__PROVIDER__',
      provider ? JSON.stringify(provider) : 'null',
    );
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseLoginPayload(raw: unknown, expectedState: string): BrowserLoginResult {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid callback payload');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.state !== expectedState) {
    throw new Error('Invalid login state');
  }
  if (obj.provider !== 'google' && obj.provider !== 'apple') {
    throw new Error('Invalid provider');
  }
  if (
    typeof obj.refreshToken !== 'string' ||
    typeof obj.idToken !== 'string' ||
    typeof obj.uid !== 'string'
  ) {
    throw new Error('Callback missing tokens');
  }
  return {
    provider: obj.provider,
    refreshToken: obj.refreshToken,
    idToken: obj.idToken,
    uid: obj.uid,
    email: typeof obj.email === 'string' ? obj.email : null,
    displayName: typeof obj.displayName === 'string' ? obj.displayName : null,
    photoURL: typeof obj.photoURL === 'string' ? obj.photoURL : null,
  };
}

export async function runBrowserLogin(
  options: BrowserLoginOptions,
): Promise<BrowserLoginResult> {
  const state = randomBytes(16).toString('hex');
  const timeoutMs = options.timeoutMs ?? LOGIN_TIMEOUT_MS;
  const openBrowser = options.openBrowser ?? defaultOpenBrowser();
  const pageHtml = options.pageHtml ?? (await loadDefaultPageHtml());
  const html = renderPage(pageHtml, options.firebase, state, options.provider);

  return new Promise<BrowserLoginResult>((resolve, reject) => {
    let settled = false;
    let timeout: NodeJS.Timeout;

    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      server.close(() => fn());
    };

    const server = createServer(async (req, res) => {
      try {
        await handleRequest(req, res);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(message);
      }
    });

    async function handleRequest(
      req: IncomingMessage,
      res: ServerResponse,
    ): Promise<void> {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');

      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/callback') {
        const text = await readBody(req);
        let parsed: unknown;
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Invalid JSON');
          return;
        }

        try {
          const result = parseLoginPayload(parsed, state);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          finish(() => resolve(result));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(message);
        }
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }

    timeout = setTimeout(() => {
      finish(() =>
        reject(new Error('Login timed out. Call auth_login again.')),
      );
    }, timeoutMs);

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        finish(() => reject(new Error('Failed to bind login server')));
        return;
      }
      const loginUrl = `http://127.0.0.1:${address.port}/`;
      void openBrowser(loginUrl).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        finish(() =>
          reject(new Error(`Failed to open browser: ${message}`)),
        );
      });
    });
  });
}
