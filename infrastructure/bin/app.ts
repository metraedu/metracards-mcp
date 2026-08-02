#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { loadMcpConfig } from '../lib/config/env';
import { McpStack } from '../lib/stacks/mcp-stack';

const app = new cdk.App();
const config = loadMcpConfig(app);

cdk.Tags.of(app).add('Project', 'metracards-mcp');
cdk.Tags.of(app).add('ManagedBy', 'cdk');

new McpStack(app, 'MetraCardsMcpStack', {
  env: config.env,
  description: 'MetraCards MCP server (Lambda + HTTP API + custom domain)',
  config,
});

app.synth();
