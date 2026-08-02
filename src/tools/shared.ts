import { AuthRequiredError } from '../auth/token-provider.js';
import { MetraCardsApiError } from '../clients/metracards-api.js';
import { MediaUploadError } from '../media/upload.js';

export function textResult(payload: unknown, isError = false) {
  return {
    isError,
    content: [
      { type: 'text' as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

export function mapToolError(
  err: unknown,
  options?: { authHint?: string },
) {
  if (err instanceof AuthRequiredError) {
    return textResult(
      {
        ok: false,
        error: err.message || 'Not authenticated',
        hint:
          options?.authHint ??
          'Call auth_login to sign in before using this tool.',
      },
      true,
    );
  }
  if (err instanceof MetraCardsApiError) {
    return textResult(
      {
        ok: false,
        error: err.message,
        statusCode: err.statusCode ?? null,
        body: err.body ?? null,
      },
      true,
    );
  }
  if (err instanceof MediaUploadError) {
    return textResult(
      {
        ok: false,
        error: err.message,
        statusCode: err.statusCode ?? null,
      },
      true,
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return textResult({ ok: false, error: message }, true);
}
