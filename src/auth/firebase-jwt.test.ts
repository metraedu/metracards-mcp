import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FirebaseJwtError,
  verifyFirebaseIdToken,
  type FirebaseJwtVerifyFn,
} from './firebase-jwt.ts';

describe('verifyFirebaseIdToken', () => {
  it('returns uid and exp from a valid payload', async () => {
    const verify: FirebaseJwtVerifyFn = async () => ({
      payload: { sub: 'uid-1', exp: 1_700_000_000, aud: 'proj', iss: 'x' },
      protectedHeader: { alg: 'RS256' },
      key: new Uint8Array(),
    });

    const result = await verifyFirebaseIdToken('raw-token', 'proj', { verify });
    assert.deepEqual(result, {
      uid: 'uid-1',
      idToken: 'raw-token',
      exp: 1_700_000_000,
    });
  });

  it('rejects missing sub', async () => {
    const verify: FirebaseJwtVerifyFn = async () => ({
      payload: { exp: 1_700_000_000 },
      protectedHeader: { alg: 'RS256' },
      key: new Uint8Array(),
    });

    await assert.rejects(
      () => verifyFirebaseIdToken('tok', 'proj', { verify }),
      FirebaseJwtError,
    );
  });

  it('rejects verify failures', async () => {
    const verify: FirebaseJwtVerifyFn = async () => {
      throw new Error('signature mismatch');
    };

    await assert.rejects(
      () => verifyFirebaseIdToken('tok', 'proj', { verify }),
      (err: unknown) =>
        err instanceof FirebaseJwtError &&
        err.message.includes('signature mismatch'),
    );
  });

  it('rejects empty project id', async () => {
    await assert.rejects(
      () => verifyFirebaseIdToken('tok', '  '),
      FirebaseJwtError,
    );
  });
});
