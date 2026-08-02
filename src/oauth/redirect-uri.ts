export function isAllowedRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      !parsed.hash
    );
  } catch {
    return false;
  }
}
