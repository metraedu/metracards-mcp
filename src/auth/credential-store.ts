import { mkdir, readFile, unlink, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import type { AuthProvider, StoredCredentials } from './types.js';

function isAuthProvider(value: unknown): value is AuthProvider {
  return value === 'google' || value === 'apple';
}

function parseCredentials(raw: unknown): StoredCredentials | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.refreshToken !== 'string' ||
    typeof obj.uid !== 'string' ||
    typeof obj.updatedAt !== 'string' ||
    !isAuthProvider(obj.provider)
  ) {
    return null;
  }
  return {
    refreshToken: obj.refreshToken,
    uid: obj.uid,
    email: typeof obj.email === 'string' ? obj.email : null,
    displayName: typeof obj.displayName === 'string' ? obj.displayName : null,
    photoURL: typeof obj.photoURL === 'string' ? obj.photoURL : null,
    provider: obj.provider,
    updatedAt: obj.updatedAt,
  };
}

export class CredentialStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async load(): Promise<StoredCredentials | null> {
    let text: string;
    try {
      text = await readFile(this.filePath, 'utf8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return null;
      }
      throw err;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return null;
    }
    return parseCredentials(parsed);
  }

  async save(credentials: StoredCredentials): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(credentials, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await chmod(this.filePath, 0o600);
  }

  async clear(): Promise<void> {
    try {
      await unlink(this.filePath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        throw err;
      }
    }
  }
}
