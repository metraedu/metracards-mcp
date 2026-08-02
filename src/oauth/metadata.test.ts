import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
} from './metadata.ts';

describe('buildAuthorizationServerMetadata', () => {
  const issuerUrl = 'http://127.0.0.1:3000';

  it('builds required AS metadata fields from issuerUrl', () => {
    const metadata = buildAuthorizationServerMetadata(issuerUrl);

    assert.equal(metadata.issuer, issuerUrl);
    assert.equal(metadata.authorization_endpoint, `${issuerUrl}/authorize`);
    assert.equal(metadata.token_endpoint, `${issuerUrl}/token`);
    assert.equal(metadata.registration_endpoint, `${issuerUrl}/register`);
    assert.deepEqual(metadata.response_types_supported, ['code']);
    assert.deepEqual(metadata.grant_types_supported, [
      'authorization_code',
      'refresh_token',
    ]);
    assert.deepEqual(metadata.code_challenge_methods_supported, ['S256']);
    assert.deepEqual(metadata.token_endpoint_auth_methods_supported, ['none']);
  });

  it('strips trailing slash from issuerUrl', () => {
    const metadata = buildAuthorizationServerMetadata(`${issuerUrl}/`);

    assert.equal(metadata.issuer, issuerUrl);
    assert.equal(metadata.authorization_endpoint, `${issuerUrl}/authorize`);
  });
});

describe('buildProtectedResourceMetadata', () => {
  const resourceUrl = 'http://127.0.0.1:3000/mcp';
  const authorizationServers = ['http://127.0.0.1:3000'];

  it('builds required PRM fields', () => {
    const metadata = buildProtectedResourceMetadata(
      resourceUrl,
      authorizationServers,
    );

    assert.equal(metadata.resource, resourceUrl);
    assert.deepEqual(metadata.authorization_servers, authorizationServers);
    assert.deepEqual(metadata.bearer_methods_supported, ['header']);
  });

  it('preserves multiple authorization servers', () => {
    const servers = [
      'http://127.0.0.1:3000',
      'https://auth.example.com',
    ];
    const metadata = buildProtectedResourceMetadata(resourceUrl, servers);

    assert.deepEqual(metadata.authorization_servers, servers);
  });
});
