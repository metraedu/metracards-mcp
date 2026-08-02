import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { verifyS256 } from './pkce.ts';

function challengeS256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

describe('verifyS256', () => {
  it('accepts matching verifier', () => {
    const verifier = randomBytes(32).toString('base64url');
    assert.equal(verifyS256(verifier, challengeS256(verifier)), true);
  });
  it('rejects mismatch', () => {
    assert.equal(verifyS256('a', challengeS256('b')), false);
  });
});
