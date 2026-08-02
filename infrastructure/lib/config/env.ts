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

function requireString(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required config: ${name}`);
  }

  return value;
}

function requireObject<T>(value: T | undefined, name: string): T {
  if (!value) {
    throw new Error(`Missing required config object: ${name}`);
  }

  return value;
}

export function loadMcpConfig(app: cdk.App): McpConfig {
  const env = requireObject(
    app.node.tryGetContext('metracards-mcp:env') as McpEnvContext | undefined,
    'metracards-mcp:env',
  );
  const domain = requireObject(
    app.node.tryGetContext('metracards-mcp:domain') as McpDomainContext | undefined,
    'metracards-mcp:domain',
  );
  const firebase = requireObject(
    app.node.tryGetContext('metracards-mcp:firebase') as McpFirebaseContext | undefined,
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
      route53: domain.route53
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
    apiUrl: requireString(
      app.node.tryGetContext('metracards-mcp:apiUrl') as string | undefined,
      'metracards-mcp:apiUrl',
    ),
  };
}
