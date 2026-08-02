import * as cdk from 'aws-cdk-lib';

export interface McpEnvContext {
  readonly account: string;
  readonly region: string;
}

export interface McpDomainContext {
  readonly domainName: string;
  readonly certificateArn: string;
  readonly route53?: {
    readonly hostedZoneId: string;
    readonly hostedZoneName: string;
  };
}

export interface McpFirebaseContext {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly storageBucket: string;
  readonly messagingSenderId: string;
  readonly appId: string;
}

export interface McpConfig {
  readonly env: McpEnvContext;
  readonly domain: McpDomainContext;
  readonly firebase: McpFirebaseContext;
  readonly apiUrl: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid config: ${name} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Missing required config: ${name}`);
  }

  return trimmed;
}

function requireObject(value: unknown, name: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new Error(`Missing or invalid config object: ${name}`);
  }

  return value;
}

export function loadMcpConfig(app: cdk.App): McpConfig {
  const env = requireObject(app.node.tryGetContext('metracards-mcp:env'), 'metracards-mcp:env');
  const domain = requireObject(
    app.node.tryGetContext('metracards-mcp:domain'),
    'metracards-mcp:domain',
  );
  const firebase = requireObject(
    app.node.tryGetContext('metracards-mcp:firebase'),
    'metracards-mcp:firebase',
  );

  return {
    env: {
      account: requireString(env.account, 'env.account'),
      region: requireString(env.region, 'env.region'),
    },
    domain: {
      domainName: requireString(domain.domainName, 'domain.domainName'),
      certificateArn: requireString(domain.certificateArn, 'domain.certificateArn'),
      route53: isPlainObject(domain.route53)
        ? {
            hostedZoneId: requireString(domain.route53.hostedZoneId, 'domain.route53.hostedZoneId'),
            hostedZoneName: requireString(
              domain.route53.hostedZoneName,
              'domain.route53.hostedZoneName',
            ),
          }
        : undefined,
    },
    firebase: {
      apiKey: requireString(firebase.apiKey, 'firebase.apiKey'),
      authDomain: requireString(firebase.authDomain, 'firebase.authDomain'),
      projectId: requireString(firebase.projectId, 'firebase.projectId'),
      storageBucket: requireString(firebase.storageBucket, 'firebase.storageBucket'),
      messagingSenderId: requireString(
        firebase.messagingSenderId,
        'firebase.messagingSenderId',
      ),
      appId: requireString(firebase.appId, 'firebase.appId'),
    },
    apiUrl: requireString(app.node.tryGetContext('metracards-mcp:apiUrl'), 'metracards-mcp:apiUrl'),
  };
}
