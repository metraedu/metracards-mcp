import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  InMemoryTransport,
  McpServer,
  type JSONRPCMessage,
} from '@modelcontextprotocol/server';
import type { TokenProvider } from '../../auth/token-provider.ts';
import { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { registerCardsUploadMedia } from './upload-media.ts';

const tokenProvider: TokenProvider = {
  canPersistCredentials: false,
  getIdToken: async () => 'token',
  getUid: async () => 'uid1',
  getProfile: async () => null,
  clearCache: () => undefined,
};

function registeredServer(): McpServer {
  const server = new McpServer({ name: 'test', version: '1.0.0' });
  registerCardsUploadMedia(
    server,
    new MetraCardsApiClient('https://api.example', tokenProvider),
    { tokenProvider },
  );
  return server;
}

describe('cards_upload_media', () => {
  it('exposes only the required local file path contract', () => {
    const schema = registeredServer().toolInputSchemaJson('cards_upload_media');
    assert.ok(schema);
    assert.deepEqual(Object.keys(schema.properties as object).sort(), [
      'file_path',
      'flashcard_id',
      'kind',
      'side',
    ]);
    assert.deepEqual([...(schema.required as string[])].sort(), [
      'file_path',
      'flashcard_id',
      'kind',
      'side',
    ]);
    assert.equal(schema.additionalProperties, false);
  });

  it('rejects removed base64 inputs before running the handler', async () => {
    const server = registeredServer();
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
      await clientTransport.send({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });
      await clientTransport.send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'cards_upload_media',
          arguments: {
            flashcard_id: '00000000-0000-4000-8000-000000000001',
            side: 'front',
            kind: 'image',
            file_path: '/tmp/card.png',
            content_base64: 'YWJj',
          },
        },
      });
      await new Promise((resolve) => setImmediate(resolve));

      const response = messages.find(
        (message) => 'id' in message && message.id === 2 && 'result' in message,
      );
      assert.ok(response && 'result' in response);
      const result = response.result as {
        isError?: boolean;
        content?: Array<{ type: string; text?: string }>;
      };
      assert.equal(result.isError, true);
      assert.match(
        JSON.stringify(result.content),
        /unrecognized key: ..content_base64/i,
      );
    } finally {
      await server.close();
    }
  });
});
