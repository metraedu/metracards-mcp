import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  InMemoryTransport,
  type JSONRPCMessage,
} from '@modelcontextprotocol/server';
import { CredentialStore } from '../auth/credential-store.ts';
import type { TokenProvider } from '../auth/token-provider.ts';
import { MetraCardsApiClient } from '../clients/metracards-api.ts';
import { createServer } from './create-server.ts';

const tokenProvider: TokenProvider = {
  canPersistCredentials: false,
  getIdToken: async () => 'token',
  getUid: async () => 'uid1',
  getProfile: async () => null,
  clearCache: () => undefined,
};

describe('createServer', () => {
  it('publishes safe media passthrough instructions during initialization', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'metracards-mcp-server-'));
    const server = createServer({
      client: new MetraCardsApiClient('https://api.example', tokenProvider),
      tokenProvider,
      store: new CredentialStore(path.join(dir, 'credentials.json')),
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const messages: JSONRPCMessage[] = [];
    clientTransport.onmessage = (message) => messages.push(message);

    try {
      await clientTransport.start();
      await server.connect(serverTransport);
      await clientTransport.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      });
      await new Promise((resolve) => setImmediate(resolve));

      const response = messages.find(
        (message) => 'id' in message && message.id === 1 && 'result' in message,
      );
      assert.ok(response && 'result' in response);
      const instructions =
        (response.result as { instructions?: string }).instructions ?? '';
      assert.match(
        instructions,
        /do not read, inspect, decode, transcribe, or convert/i,
      );
      assert.match(instructions, /explicitly asks for content analysis/i);
      assert.match(instructions, /path, extension, MIME type, and byte size/i);
      assert.match(instructions, /cards_media_presign/i);
      assert.match(instructions, /direct PUT/i);
      assert.match(instructions, /cards_update/i);
      assert.match(instructions, /never log, display, repeat, or disclose/i);
    } finally {
      await server.close();
    }
  });
});
