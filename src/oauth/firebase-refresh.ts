type FirebaseRefreshResponse = {
  id_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  error?: string | { message?: unknown };
};

export async function refreshFirebaseIdToken(
  apiKey: string,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ idToken: string; refreshToken: string; expiresInSec: number }> {
  const response = await fetchImpl(
    `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    },
  );
  const text = await response.text();
  let parsed: FirebaseRefreshResponse;

  try {
    parsed = JSON.parse(text) as FirebaseRefreshResponse;
  } catch {
    throw new Error('Firebase token refresh returned invalid JSON');
  }

  if (!response.ok || typeof parsed.id_token !== 'string') {
    const detail =
      typeof parsed.error === 'string'
        ? parsed.error
        : typeof parsed.error?.message === 'string'
          ? parsed.error.message
          : `HTTP ${response.status}`;
    throw new Error(`Firebase token refresh failed (${detail})`);
  }

  const expiresInSec = Number(parsed.expires_in);
  if (!Number.isFinite(expiresInSec) || expiresInSec < 0) {
    throw new Error('Firebase token refresh returned an invalid expiration');
  }

  return {
    idToken: parsed.id_token,
    refreshToken:
      typeof parsed.refresh_token === 'string'
        ? parsed.refresh_token
        : refreshToken,
    expiresInSec,
  };
}
