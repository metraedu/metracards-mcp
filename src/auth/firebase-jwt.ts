import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTVerifyResult,
  type JWTPayload,
} from 'jose';

const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

export type VerifiedFirebaseIdToken = {
  uid: string;
  idToken: string;
  exp: number;
};

export type FirebaseJwtVerifyFn = (
  token: string,
  keyOrSecret: JWTVerifyGetKey,
  options: {
    issuer: string;
    audience: string;
  },
) => Promise<JWTVerifyResult<JWTPayload>>;

export class FirebaseJwtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FirebaseJwtError';
  }
}

let defaultJwks: JWTVerifyGetKey | null = null;

function getDefaultJwks(): JWTVerifyGetKey {
  if (!defaultJwks) {
    defaultJwks = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));
  }
  return defaultJwks;
}

export async function verifyFirebaseIdToken(
  token: string,
  projectId: string,
  options?: {
    jwks?: JWTVerifyGetKey;
    verify?: FirebaseJwtVerifyFn;
  },
): Promise<VerifiedFirebaseIdToken> {
  const trimmedProjectId = projectId.trim();
  if (!trimmedProjectId) {
    throw new FirebaseJwtError('FIREBASE_PROJECT_ID is required');
  }
  if (!token.trim()) {
    throw new FirebaseJwtError('Token is empty');
  }

  const verify = options?.verify ?? jwtVerify;
  const jwks = options?.jwks ?? getDefaultJwks();

  let result: JWTVerifyResult<JWTPayload>;
  try {
    result = await verify(token, jwks, {
      issuer: `https://securetoken.google.com/${trimmedProjectId}`,
      audience: trimmedProjectId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new FirebaseJwtError(`Invalid Firebase ID token: ${message}`);
  }

  const uid = result.payload.sub;
  const exp = result.payload.exp;
  if (typeof uid !== 'string' || !uid) {
    throw new FirebaseJwtError('Firebase ID token missing sub');
  }
  if (typeof exp !== 'number') {
    throw new FirebaseJwtError('Firebase ID token missing exp');
  }

  return { uid, idToken: token, exp };
}
