import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';
import { createMcpFunctionCode } from '../lambda/mcp-function-code';
import type { McpConfig } from '../config/env';

// Published Lambda Web Adapter layer (x86_64), verified current as of
// 2026-08 via https://github.com/awslabs/aws-lambda-web-adapter and
// https://aws.github.io/aws-lambda-web-adapter/getting-started/zip-packages.html
const LAMBDA_WEB_ADAPTER_LAYER_VERSION = 28;

export interface McpStackProps extends cdk.StackProps {
  readonly config: McpConfig;
}

function dnsRelativeName(fqdn: string, zoneName: string): string {
  const fq = fqdn.replace(/\.$/, '');
  const zn = zoneName.replace(/\.$/, '');
  if (fq === zn) {
    return '';
  }
  if (!fq.endsWith(`.${zn}`)) {
    throw new Error(
      `Custom domain "${fqdn}" must be equal to or a subdomain of Route53 zone "${zoneName}"`,
    );
  }
  return fq.slice(0, -(zn.length + 1));
}

export class McpStack extends cdk.Stack {
  public constructor(scope: Construct, id: string, props: McpStackProps) {
    super(scope, id, props);

    const { domain, firebase, apiUrl } = props.config;
    const { domainName } = domain;

    const table = new dynamodb.Table(this, 'OAuthStore', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'expiresAt',
    });

    const webAdapterLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      'LambdaWebAdapterLayer',
      `arn:aws:lambda:${this.region}:753240598075:layer:LambdaAdapterLayerX86:${LAMBDA_WEB_ADAPTER_LAYER_VERSION}`,
    );

    const fn = new lambda.Function(this, 'McpServerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: createMcpFunctionCode(),
      handler: 'run.sh',
      layers: [webAdapterLayer],
      timeout: cdk.Duration.seconds(120),
      memorySize: 1024,
      environment: {
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/bootstrap',
        AWS_LWA_PORT: '3000',
        PORT: '3000',
        METRACARDS_MCP_HTTP_HOST: '0.0.0.0',
        METRACARDS_MCP_HTTP_PORT: '3000',
        METRACARDS_MCP_RESOURCE_URL: `https://${domainName}/mcp`,
        METRACARDS_MCP_ISSUER_URL: `https://${domainName}`,
        METRACARDS_MCP_ALLOWED_HOSTS: domainName,
        METRACARDS_MCP_OAUTH_TABLE: table.tableName,
        METRACARDS_API_URL: apiUrl,
        FIREBASE_API_KEY: firebase.apiKey,
        FIREBASE_AUTH_DOMAIN: firebase.authDomain,
        FIREBASE_PROJECT_ID: firebase.projectId,
        FIREBASE_STORAGE_BUCKET: firebase.storageBucket,
        FIREBASE_MESSAGING_SENDER_ID: firebase.messagingSenderId,
        FIREBASE_APP_ID: firebase.appId,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      },
    });

    table.grantReadWriteData(fn);

    const httpApi = new apigwv2.HttpApi(this, 'McpHttpApi', {
      apiName: 'metracards-mcp',
    });

    const integration = new HttpLambdaIntegration('McpIntegration', fn);
    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigwv2.HttpMethod.ANY],
      integration,
    });
    httpApi.addRoutes({
      path: '/',
      methods: [apigwv2.HttpMethod.ANY],
      integration: new HttpLambdaIntegration('McpRootIntegration', fn),
    });

    const certificate = acm.Certificate.fromCertificateArn(
      this,
      'McpTlsCertificate',
      domain.certificateArn,
    );

    const customDomain = new apigwv2.DomainName(this, 'McpCustomDomain', {
      domainName,
      certificate,
    });

    new apigwv2.ApiMapping(this, 'McpCustomDomainMapping', {
      api: httpApi,
      domainName: customDomain,
    });

    if (domain.route53) {
      const { hostedZoneId, hostedZoneName } = domain.route53;
      const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'McpHostedZone', {
        hostedZoneId,
        zoneName: hostedZoneName,
      });

      new route53.ARecord(this, 'McpCustomDomainAlias', {
        zone,
        recordName: dnsRelativeName(domainName, hostedZoneName),
        target: route53.RecordTarget.fromAlias(
          new route53targets.ApiGatewayv2DomainProperties(
            customDomain.regionalDomainName,
            customDomain.regionalHostedZoneId,
          ),
        ),
      });
    }

    new cdk.CfnOutput(this, 'OAuthStoreTableName', {
      value: table.tableName,
    });

    new cdk.CfnOutput(this, 'McpUrl', {
      value: `https://${domainName}/mcp`,
    });
  }
}
