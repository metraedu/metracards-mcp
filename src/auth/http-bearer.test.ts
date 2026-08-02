import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bearerAuthChallengeResponse,
  getOAuthProtectedResourceMetadataUrl,
  OAuthError,
  OAuthErrorCode,
  verifyBearerToken,
} from '@modelcontextprotocol/server';

describe('HTTP bearer gate helpers', () => {
  it('returns 401 challenge with resource_metadata when Authorization is missing', async () => {
    const resourceUrl = new URL('http://127.0.0.1:3000/mcp');
    const resourceMetadataUrl =
      getOAuthProtectedResourceMetadataUrl(resourceUrl);

    await assert.rejects(
      () =>
        verifyBearerToken(undefined, {
          verifier: {
            verifyAccessToken: async () => {
              throw new Error('should not verify');
            },
          },
          resourceMetadataUrl,
        }),
      OAuthError,
    );

    const response = bearerAuthChallengeResponse(
      new OAuthError(OAuthErrorCode.InvalidToken, 'Missing token'),
      { resourceMetadataUrl },
    );
    assert.equal(response.status, 401);
    const www = response.headers.get('WWW-Authenticate') ?? '';
    assert.match(www, /resource_metadata=/);
    assert.match(www, /oauth-protected-resource/);
  });

  it('forwards AuthInfo from a successful verifier', async () => {
    const auth = await verifyBearerToken('Bearer good', {
      verifier: {
        verifyAccessToken: async (token) => {
          assert.equal(token, 'good');
          return {
            token,
            clientId: 'uid-1',
            scopes: ['openid'],
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
          };
        },
      },
    });
    assert.equal(auth.clientId, 'uid-1');
    assert.equal(auth.token, 'good');
  });
});
