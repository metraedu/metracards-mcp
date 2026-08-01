import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runBrowserLogin } from './browser-login.ts';
import type { FirebaseConfig } from './types.ts';

const firebase: FirebaseConfig = {
  apiKey: 'key',
  authDomain: 'example.firebaseapp.com',
  projectId: 'example',
  storageBucket: 'example.appspot.com',
  messagingSenderId: '123',
  appId: '1:123:web:abc',
};

describe('runBrowserLogin', () => {
  it('resolves when callback posts valid payload', async () => {
    let openedUrl = '';
    const pageHtml = `<html><body>__FIREBASE_CONFIG____STATE____PROVIDER__</body></html>`;

    const loginPromise = runBrowserLogin({
      firebase,
      provider: 'google',
      timeoutMs: 5_000,
      pageHtml,
      openBrowser: async (url) => {
        openedUrl = url;
        const page = await fetch(url);
        assert.equal(page.status, 200);
        const html = await page.text();
        assert.match(html, /"apiKey":"key"/);

        const stateMatch = html.match(/"([a-f0-9]{32})"/);
        assert.ok(stateMatch);
        const state = stateMatch[1];

        const callback = await fetch(new URL('/callback', url), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state,
            provider: 'google',
            idToken: 'id-1',
            refreshToken: 'refresh-1',
            uid: 'uid-1',
            email: 'a@b.com',
            displayName: 'Ada',
            photoURL: null,
          }),
        });
        assert.equal(callback.status, 200);
      },
    });

    const result = await loginPromise;
    assert.equal(result.uid, 'uid-1');
    assert.equal(result.refreshToken, 'refresh-1');
    assert.equal(result.provider, 'google');
    assert.match(openedUrl, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  });
});
