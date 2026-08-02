export type AuthorizationServerMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  response_types_supported: ['code'];
  grant_types_supported: ['authorization_code', 'refresh_token'];
  code_challenge_methods_supported: ['S256'];
  token_endpoint_auth_methods_supported: ['none'];
};

export type ProtectedResourceMetadata = {
  resource: string;
  authorization_servers: string[];
  bearer_methods_supported: ['header'];
};

function normalizeIssuerUrl(issuerUrl: string): string {
  return issuerUrl.replace(/\/$/, '');
}

export function buildAuthorizationServerMetadata(
  issuerUrl: string,
): AuthorizationServerMetadata {
  const issuer = normalizeIssuerUrl(issuerUrl);

  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    registration_endpoint: `${issuer}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  };
}

export function buildProtectedResourceMetadata(
  resourceUrl: string,
  authorizationServers: string[],
): ProtectedResourceMetadata {
  return {
    resource: resourceUrl,
    authorization_servers: authorizationServers,
    bearer_methods_supported: ['header'],
  };
}
