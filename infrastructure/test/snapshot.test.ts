import { describe, it } from 'node:test';
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import type { McpConfig } from '../lib/config/env';
import { McpStack } from '../lib/stacks/mcp-stack';

const fixtureConfig: McpConfig = {
  env: { account: '111111111111', region: 'us-east-1' },
  domain: {
    domainName: 'mcp.example.invalid',
    certificateArn:
      'arn:aws:acm:us-east-1:111111111111:certificate/00000000-0000-0000-0000-000000000000',
  },
  firebase: {
    apiKey: 'placeholder-api-key',
    authDomain: 'placeholder.firebaseapp.com',
    projectId: 'placeholder-project',
    storageBucket: 'placeholder.appspot.com',
    messagingSenderId: '000000000000',
    appId: '1:000000000000:web:0000000000000000000000',
  },
  apiUrl: 'https://api.example.invalid',
};

describe('McpStack template', () => {
  it('synthesizes the OAuth table, configured Lambda, and HTTP API domain', () => {
    const app = new cdk.App();
    const stack = new McpStack(app, 'MetraCardsMcpStack', {
      env: fixtureConfig.env,
      config: fixtureConfig,
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TimeToLiveSpecification: {
        AttributeName: 'expiresAt',
        Enabled: true,
      },
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Timeout: 120,
      MemorySize: 1024,
      Environment: {
        Variables: Match.objectLike({
          METRACARDS_MCP_OAUTH_TABLE: Match.anyValue(),
          METRACARDS_MCP_RESOURCE_URL: 'https://mcp.example.invalid/mcp',
        }),
      },
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      ProtocolType: 'HTTP',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::DomainName', {
      DomainName: 'mcp.example.invalid',
    });
    template.resourceCountIs('AWS::ApiGatewayV2::ApiMapping', 1);
  });
});
