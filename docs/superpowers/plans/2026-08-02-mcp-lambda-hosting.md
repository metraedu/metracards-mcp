# MetraCards MCP Lambda Hosting (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the HTTP MCP (OAuth Connect + Bearer) to Lambda behind `https://mcp.metraedu.com.br` with a DynamoDB-backed OAuth store, via CDK in this repo.

**Architecture:** Keep Express + Lambda Web Adapter. Persist DCR clients, auth codes, and authorize-pending state in a single DynamoDB table (on-demand, TTL). Local `npm start` keeps the in-memory store when `METRACARDS_MCP_OAUTH_TABLE` is unset. CDK owns Lambda, HTTP API, custom domain, Route53, and the table.

**Tech Stack:** Node 20+, TypeScript, Express, `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb`, AWS CDK v2, API Gateway HTTP API, Lambda Web Adapter layer, DynamoDB.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-02-mcp-lambda-hosting-design.md`
- Depends on Phase 2 OAuth (`src/oauth/*`, `src/index.ts` HTTP entry)
- Tool names/schemas unchanged
- Domain: `mcp.metraedu.com.br`; DNS via Route53 in same account as API
- Env table name: `METRACARDS_MCP_OAUTH_TABLE`
- Lambda: timeout 120s, memory 1024 MB, Node 20
- Tests: `npm test` → `node --experimental-strip-types --test src/**/*.test.ts`
- Prefer `import type` for type-only imports so strip-types tests resolve
- Skip git commit steps unless the user asked to commit
- Do not add CI/CD deploy pipeline in this plan

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/oauth/store.ts` | `OAuthStore` interface (async) + pending types; `createMemoryOAuthStore` |
| `src/oauth/dynamo-store.ts` | `createDynamoOAuthStore` |
| `src/oauth/dynamo-store.test.ts` | Unit tests with mock Dynamo document client |
| `src/oauth/create-store.ts` | Factory: Dynamo if table env set, else memory |
| `src/oauth/authorize.ts` | Use store pending APIs (remove local `Map`) |
| `src/http/create-http-app.ts` | Build Express app (routes, OAuth, `/mcp`) without `listen` |
| `src/index.ts` | Load config/store, `createHttpApp`, `listen` (local + Adapter) |
| `src/config/index.ts` | Optional: document oauth table env (no required shape change) |
| `infrastructure/` | CDK app: stack, context config, snapshot test |
| `run.sh` | Lambda Web Adapter entry (`exec node …`) |
| `README.md` / `.env.example` | Deploy + Firebase authorized domain |

---

### Task 1: Async `OAuthStore` + pending APIs (memory)

**Files:**
- Modify: `src/oauth/store.ts`
- Modify: `src/oauth/store.test.ts`
- Modify: `src/oauth/dcr.ts`
- Modify: `src/oauth/dcr.test.ts`
- Modify: `src/oauth/token.ts`
- Modify: `src/oauth/token.test.ts`
- Modify: `src/oauth/authorize.ts`
- Modify: `src/oauth/authorize.test.ts`
- Modify: `src/index.ts` (import rename only if needed)

**Interfaces:**
- Produces:

```ts
export type PendingAuthorizeRequest = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  createdAtMs: number;
};

export type OAuthStore = {
  saveClient(client: RegisteredClient): Promise<void>;
  getClient(clientId: string): Promise<RegisteredClient | undefined>;
  saveAuthCode(code: string, record: AuthCodeRecord): Promise<void>;
  consumeAuthCode(code: string): Promise<AuthCodeRecord | undefined>;
  savePendingAuthorize(
    loginState: string,
    record: PendingAuthorizeRequest,
  ): Promise<void>;
  consumePendingAuthorize(
    loginState: string,
  ): Promise<PendingAuthorizeRequest | undefined>;
};

export function createMemoryOAuthStore(options?: {
  codeTtlMs?: number;
  pendingTtlMs?: number;
  now?: () => number;
}): OAuthStore;
```

- Keep `createOAuthStore` as deprecated alias → `createMemoryOAuthStore` **or** rename and update all imports to `createMemoryOAuthStore` (prefer rename for clarity).

- [ ] **Step 1: Update `store.test.ts` for async + pending (fail until impl)**

Add/adjust tests so store methods are awaited. Include:

```ts
it('consumes pending authorize once within TTL', async () => {
  let nowMs = 1_000;
  const store = createMemoryOAuthStore({
    pendingTtlMs: 100,
    now: () => nowMs,
  });
  await store.savePendingAuthorize('login-1', {
    clientId: 'c1',
    redirectUri: 'https://client.example/cb',
    codeChallenge: 'challenge',
    state: 's',
    createdAtMs: nowMs,
  });
  const first = await store.consumePendingAuthorize('login-1');
  assert.equal(first?.clientId, 'c1');
  assert.equal(await store.consumePendingAuthorize('login-1'), undefined);
});

it('rejects expired pending authorize', async () => {
  let nowMs = 1_000;
  const store = createMemoryOAuthStore({
    pendingTtlMs: 50,
    now: () => nowMs,
  });
  await store.savePendingAuthorize('login-2', {
    clientId: 'c1',
    redirectUri: 'https://client.example/cb',
    codeChallenge: 'challenge',
    createdAtMs: nowMs,
  });
  nowMs = 1_100;
  assert.equal(await store.consumePendingAuthorize('login-2'), undefined);
});
```

Update existing client/code tests to `await` every store call.

- [ ] **Step 2: Run store tests — expect FAIL (sync API / missing pending)**

Run: `node --experimental-strip-types --test src/oauth/store.test.ts`  
Expected: FAIL (missing exports / not async)

- [ ] **Step 3: Implement async memory store + pending in `store.ts`**

- Move `PendingAuthorizeRequest` here (remove duplicate from `authorize.ts`).
- Default `pendingTtlMs = 600_000` (10 min), `codeTtlMs = 120_000`.
- `consumePendingAuthorize`: delete-then-check TTL (same pattern as auth codes).
- All methods return `Promise`.

- [ ] **Step 4: Update DCR / token / authorize callers to await store**

In `dcr.ts` `POST /register` handler: `await store.saveClient(...)`.  
In `dcr.ts` any `getClient`: `await store.getClient(...)`.  
In `token.ts`: `await deps.store.consumeAuthCode(code)`.  
In `authorize.ts`:
- Remove local `pendingRequests` `Map` and `getPendingRequest`.
- `GET /authorize`: after validation, `await deps.store.savePendingAuthorize(loginState, { ... })`.
- `POST /authorize/callback`: `const pending = await deps.store.consumePendingAuthorize(loginState)`.
- `await deps.store.saveAuthCode(...)`.
- Drop `pendingTtlMs` from authorize deps (TTL owned by store); keep `now` only if still needed elsewhere (otherwise remove).

Mark route handlers `async` where they await.

- [ ] **Step 5: Fix unit tests (dcr/token/authorize/store) for async**

Any mock `OAuthStore` in tests must implement pending methods (can throw if unused) and return Promises.

- [ ] **Step 6: Run oauth tests**

Run: `node --experimental-strip-types --test src/oauth/**/*.test.ts`  
Expected: PASS

- [ ] **Step 7: Commit (only if user asked)**

```bash
git add src/oauth/store.ts src/oauth/store.test.ts src/oauth/dcr.ts src/oauth/dcr.test.ts src/oauth/token.ts src/oauth/token.test.ts src/oauth/authorize.ts src/oauth/authorize.test.ts src/index.ts
git commit -m "$(cat <<'EOF'
refactor(oauth): async store and persist pending authorize in store

EOF
)"
```

---

### Task 2: DynamoDB OAuth store

**Files:**
- Create: `src/oauth/dynamo-store.ts`
- Create: `src/oauth/dynamo-store.test.ts`
- Modify: `package.json` (add `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`)

**Interfaces:**
- Consumes: `OAuthStore`, `RegisteredClient`, `AuthCodeRecord`, `PendingAuthorizeRequest` from `store.ts`
- Produces:

```ts
export type DynamoOAuthStoreDeps = {
  tableName: string;
  docClient: {
    send(command: unknown): Promise<unknown>;
  };
  codeTtlMs?: number;
  pendingTtlMs?: number;
  now?: () => number;
};

export function createDynamoOAuthStore(deps: DynamoOAuthStoreDeps): OAuthStore;
```

Item shape (single-table):

| Entity | `pk` | `sk` | attrs | `expiresAt` (epoch sec, TTL) |
|--------|------|------|-------|------------------------------|
| Client | `CLIENT#<id>` | `META` | `client` JSON / fields | omit |
| Code | `CODE#<code>` | `META` | auth code fields | `floor((now+codeTtl)/1000)` |
| Pending | `PENDING#<loginState>` | `META` | pending fields | `floor((now+pendingTtl)/1000)` |

Use `PutCommand`, `GetCommand` (ConsistentRead for consume), `DeleteCommand`.

Consume algorithm (code and pending):
1. `Get` with `ConsistentRead: true`
2. If missing → `undefined`
3. `Delete`
4. If `expiresAt * 1000 <= now()` → `undefined`
5. Else map item → record

(Alternatively Delete with condition — Get+Delete is fine for this volume.)

- [ ] **Step 1: Add AWS SDK deps**

```bash
cd /Users/gabriel/projects/metracards-mcp && npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

- [ ] **Step 2: Write failing `dynamo-store.test.ts`**

Use a fake `docClient` that records commands and returns canned responses. Cover:
- `saveClient` / `getClient`
- `saveAuthCode` / `consumeAuthCode` success
- double consume → undefined
- expired code → undefined after get
- pending save/consume/expire

Example fake pattern:

```ts
const calls: unknown[] = [];
const docClient = {
  async send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
    calls.push(command);
    // branch on command.constructor.name + input.Key
  },
};
```

Prefer inspecting `command.input` rather than brittle constructor names if using plain objects — wrap with a tiny in-memory map fake:

```ts
function createFakeDoc() {
  const items = new Map<string, Record<string, unknown>>();
  const keyOf = (pk: string, sk: string) => `${pk}|${sk}`;
  return {
    items,
    docClient: {
      async send(command: {
        input: {
          TableName?: string;
          Item?: Record<string, unknown>;
          Key?: { pk: string; sk: string };
          ConsistentRead?: boolean;
        };
      }) {
        const { Item, Key } = command.input;
        if (Item && typeof Item.pk === 'string' && typeof Item.sk === 'string') {
          items.set(keyOf(Item.pk, Item.sk), { ...Item });
          return {};
        }
        if (Key) {
          const found = items.get(keyOf(Key.pk, Key.sk));
          if (command.input.ConsistentRead !== undefined || found) {
            // Get
            if (Item === undefined && found && command.constructor?.name !== 'DeleteCommand') {
              // distinguish Get vs Delete via a tag on the fake commands
            }
          }
        }
        return {};
      },
    },
  };
}
```

Simpler approach for the plan implementer: define `FakeDynamo` class with `put`, `get`, `delete` methods and pass a `docClient.send` that switches on `command.name` where `createDynamoOAuthStore` uses a thin wrapper — **or** inject repository functions. Preferred: inject `DynamoDBDocumentClient`-compatible `send` and in tests use real `PutCommand`/`GetCommand`/`DeleteCommand` from `@aws-sdk/lib-dynamodb` against an in-memory map keyed by `pk|sk`.

- [ ] **Step 3: Run test — expect FAIL**

Run: `node --experimental-strip-types --test src/oauth/dynamo-store.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 4: Implement `dynamo-store.ts`**

```ts
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type {
  AuthCodeRecord,
  OAuthStore,
  PendingAuthorizeRequest,
  RegisteredClient,
} from './store.ts';

export function createDynamoOAuthStore(deps: {
  tableName: string;
  docClient: DynamoDBDocumentClient;
  codeTtlMs?: number;
  pendingTtlMs?: number;
  now?: () => number;
}): OAuthStore {
  const codeTtlMs = deps.codeTtlMs ?? 120_000;
  const pendingTtlMs = deps.pendingTtlMs ?? 600_000;
  const now = deps.now ?? (() => Date.now());
  // implement OAuthStore methods with Put/Get/Delete as specified
}
```

Do not put raw ID tokens in logs.

- [ ] **Step 5: Run dynamo + oauth tests**

Run: `node --experimental-strip-types --test src/oauth/**/*.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit (only if user asked)**

```bash
git add package.json package-lock.json src/oauth/dynamo-store.ts src/oauth/dynamo-store.test.ts
git commit -m "$(cat <<'EOF'
feat(oauth): add DynamoDB-backed OAuth store

EOF
)"
```

---

### Task 3: Store factory + extract `createHttpApp`

**Files:**
- Create: `src/oauth/create-store.ts`
- Create: `src/http/create-http-app.ts`
- Modify: `src/index.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces:

```ts
// create-store.ts
export function createOAuthStoreFromEnv(env?: NodeJS.ProcessEnv): OAuthStore;

// create-http-app.ts
export type CreateHttpAppDeps = {
  config: AppConfig;
  oauthStore: OAuthStore;
  projectId: string;
  loginPageHtml: string;
};

export function createHttpApp(deps: CreateHttpAppDeps): express.Express;
```

`createOAuthStoreFromEnv`:
- If `env.METRACARDS_MCP_OAUTH_TABLE` (or `process.env`) is non-empty → `DynamoDBClient` + `DynamoDBDocumentClient.from` + `createDynamoOAuthStore`
- Else → `createMemoryOAuthStore()`

- [ ] **Step 1: Implement `create-store.ts`**

```ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createDynamoOAuthStore } from './dynamo-store.ts';
import { createMemoryOAuthStore, type OAuthStore } from './store.ts';

export function createOAuthStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): OAuthStore {
  const tableName = env.METRACARDS_MCP_OAUTH_TABLE?.trim();
  if (!tableName) {
    return createMemoryOAuthStore();
  }
  const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  return createDynamoOAuthStore({ tableName, docClient });
}
```

- [ ] **Step 2: Move Express wiring from `index.ts` into `createHttpApp`**

Cut from current `src/index.ts` everything that builds `app` (CORS, well-known, DCR, authorize, token, `/mcp`) into `createHttpApp`.  
`createHttpApp` must `await`-friendly: store calls already async inside routers.

Keep verifier / `mcpHandler` / `nodeHandler` construction inside `createHttpApp`.

- [ ] **Step 3: Slim `index.ts`**

```ts
const oauthStore = createOAuthStoreFromEnv();
// validate firebase + projectId as today
const app = createHttpApp({
  config,
  oauthStore,
  projectId,
  loginPageHtml,
});
const server = app.listen(config.http.port, config.http.host, () => {
  console.error(`metracards-mcp HTTP listening on http://${config.http.host}:${config.http.port}/mcp ...`);
});
// keep SIGINT/SIGTERM shutdown calling mcpHandler.close — export close hook from createHttpApp if needed
```

If `mcpHandler.close` is required on shutdown, return `{ app, close }` from `createHttpApp` instead of only `Express`:

```ts
export type HttpApp = {
  app: express.Express;
  close(): Promise<void>;
};
```

- [ ] **Step 4: Document env in `.env.example`**

```bash
# Set in Lambda via CDK; leave unset for local in-memory OAuth store
# METRACARDS_MCP_OAUTH_TABLE=
```

- [ ] **Step 5: Run full unit tests**

Run: `npm test`  
Expected: PASS

- [ ] **Step 6: Smoke local server**

Run: `npm run build && npm start`  
Expected: listens; `GET /health` not required — `GET /.well-known/oauth-authorization-server` returns JSON

- [ ] **Step 7: Commit (only if user asked)**

```bash
git add src/oauth/create-store.ts src/http/create-http-app.ts src/index.ts .env.example
git commit -m "$(cat <<'EOF'
refactor(http): extract createHttpApp and env-based OAuth store factory

EOF
)"
```

---

### Task 4: CDK app skeleton + Dynamo table

**Files:**
- Create: `infrastructure/package.json`
- Create: `infrastructure/tsconfig.json`
- Create: `infrastructure/cdk.json`
- Create: `infrastructure/bin/app.ts`
- Create: `infrastructure/lib/config/env.ts`
- Create: `infrastructure/lib/stacks/mcp-stack.ts` (table only first, or full stack in Task 5 — prefer scaffold here with table + stub outputs)
- Create: `package.json` root scripts `synth` / `deploy` optional
- Create: `tsconfig.cdk.json` at repo root if mirroring API
- Create: `cdk.json` at repo root pointing at infrastructure app (match `metracards_api` layout closely)

**Interfaces:**
- Context keys (from spec):
  - `metracards-mcp:env` → `{ account, region }`
  - `metracards-mcp:domain` → `{ domainName, certificateArn, route53?: { hostedZoneId, hostedZoneName } }`
  - `metracards-mcp:firebase` → web config fields
  - `metracards-mcp:apiUrl` → string

- [ ] **Step 1: Scaffold CDK package**

Mirror `metracards_api` patterns:
- Root `cdk.json` → `npx ts-node --prefer-ts-exts infrastructure/bin/app.ts` (or compiled)
- `infrastructure/lib/config/env.ts` with `requireString` / `loadMcpConfig(app)`
- `bin/app.ts` instantiates `McpStack` with env from context

Minimum `package.json` deps at **repo root** (like API): `aws-cdk-lib`, `constructs`, `aws-cdk`, `esbuild`, `typescript` as needed. Prefer adding CDK deps to root `devDependencies` and keep `infrastructure/package.json` scripts thin.

- [ ] **Step 2: Create DynamoDB table in `McpStack`**

```ts
const table = new dynamodb.Table(this, 'OAuthStore', {
  partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: cdk.RemovalPolicy.DESTROY, // low-volume MCP; document; use RETAIN if preferred for prod later
  timeToLiveAttribute: 'expiresAt',
});
```

- [ ] **Step 3: `cdk synth` with a test context file**

Create `infrastructure/cdk.context.example.json` **or** document `-c` flags. For synth in CI/local without secrets, use placeholder ARNs in a `infrastructure/test/fixture-context.ts` loaded only by tests.

Run: `npx cdk synth -c metracards-mcp:env.account=111111111111 -c ...`  
(or write `cdk.context.json` gitignored + example committed)

Expected: template includes DynamoDB table with TTL.

- [ ] **Step 4: Commit (only if user asked)**

---

### Task 5: Lambda + Web Adapter + HTTP API + custom domain

**Files:**
- Modify: `infrastructure/lib/stacks/mcp-stack.ts`
- Create: `run.sh` (repo root)
- Modify: `src/index.ts` if host must be `0.0.0.0` when `AWS_LAMBDA_EXEC_WRAPPER` or `AWS_LWA_PORT` is set

**Lambda packaging**

Use `NodejsFunction` **or** `lambda.Function` + bundling that emits:

1. Bundled `index.js` (ESM or CJS) that calls `listen`
2. `run.sh`:

```bash
#!/bin/bash
set -euo pipefail
exec node index.js
```

Handler: `run.sh`  
Layer (x86_64, pin a current published version):

`arn:aws:lambda:${region}:753240598075:layer:LambdaAdapterLayerX86:25`

Environment:

```ts
{
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
}
```

Function props: `timeout: Duration.seconds(120)`, `memorySize: 1024`, `runtime: NODEJS_20_X`.

Grant: `table.grantReadWriteData(fn)`.

Ensure `run.sh` is executable in the asset (`chmod +x` in bundling `commandHooks`).

**HTTP API**

```ts
const httpApi = new apigwv2.HttpApi(this, 'McpHttpApi', {
  apiName: 'metracards-mcp',
});
httpApi.addRoutes({
  path: '/{proxy+}',
  methods: [apigwv2.HttpMethod.ANY],
  integration: new HttpLambdaIntegration('McpIntegration', fn),
});
httpApi.addRoutes({
  path: '/',
  methods: [apigwv2.HttpMethod.ANY],
  integration: new HttpLambdaIntegration('McpRootIntegration', fn),
});
```

**Custom domain**

Follow API stack pattern:
- `acm.Certificate.fromCertificateArn`
- `new apigwv2.DomainName` / `ApiMapping` for HTTP API (use `HttpApi` + `DomainName` + `ApiMapping` from `aws-cdk-lib/aws-apigatewayv2`)
- Route53 `ARecord` alias → that domain name when `route53` present in context

Validate `domainName === 'mcp.metraedu.com.br'` against context (or accept whatever context provides; default docs use this host).

**Outputs**

```ts
new cdk.CfnOutput(this, 'McpUrl', {
  value: `https://${domainName}/mcp`,
});
```

- [ ] **Step 1: Implement Lambda + Adapter wiring in stack**

- [ ] **Step 2: Implement HTTP API + domain + Route53**

- [ ] **Step 3: Ensure login HTML is included in the bundle**

`createHttpApp` / index reads `oauth-login-page.html` from disk relative to the compiled file. With `NodejsFunction` bundling, add:

```ts
bundling: {
  commandHooks: {
    beforeBundling() { return []; },
    afterBundling(inputDir, outputDir) {
      return [
        `cp ${inputDir}/src/auth/oauth-login-page.html ${outputDir}/`,
        // adjust path so readFileSync in runtime finds it — OR embed HTML as string import
      ];
    },
    beforeInstall() { return []; },
  },
}
```

**Preferred robust approach:** change HTML load to `import loginPageHtml from './auth/oauth-login-page.html' with { type: 'text' }` only if toolchain supports it; otherwise copy next to bundle and fix path in `createHttpApp` via `fileURLToPath` + known filename `oauth-login-page.html` beside `index.js`.

- [ ] **Step 4: Synth**

Run: `npx cdk synth` with full context  
Expected: template has Lambda, Layer, HTTP API, DomainName, Table, IAM policy

- [ ] **Step 5: Commit (only if user asked)**

---

### Task 6: CDK snapshot test

**Files:**
- Create: `infrastructure/test/snapshot.test.ts`
- Modify: root `package.json` test script **or** separate `npm run test:infra`

Follow `metracards_api/infrastructure/test/snapshot.test.ts` style: instantiate stack with fixture context, `Template.fromStack`, assert table TTL, Lambda env keys, domain name.

- [ ] **Step 1: Write snapshot / assertions test**

Assert at least:
- `AWS::DynamoDB::Table` with `TimeToLiveSpecification`
- `AWS::Lambda::Function` Timeout 120, Memory 1024
- Env includes `METRACARDS_MCP_OAUTH_TABLE`, `METRACARDS_MCP_RESOURCE_URL`
- HTTP API / domain resources exist

- [ ] **Step 2: Run infra test**

Run: (whatever script you added, e.g. `npm run test:infra`)  
Expected: PASS

- [ ] **Step 3: Commit (only if user asked)**

---

### Task 7: README + deploy notes

**Files:**
- Modify: `README.md`
- Modify: `.env.example` (if anything left)

- [ ] **Step 1: Document**

Sections:
1. Architecture one-liner (Lambda + HTTP API + Dynamo + domain)
2. CDK context keys (table from example)
3. `npm run synth` / `npx cdk deploy`
4. Post-deploy: Firebase Authorized domains → add `mcp.metraedu.com.br`
5. Local: leave `METRACARDS_MCP_OAUTH_TABLE` unset
6. Manual smoke checklist from the spec

- [ ] **Step 2: Commit (only if user asked)**

---

### Task 8: Deploy smoke (manual, operator)

**Not automated.** After `cdk deploy` with real context:

1. `curl -sS https://mcp.metraedu.com.br/.well-known/oauth-protected-resource | jq .`
2. `curl -sS https://mcp.metraedu.com.br/.well-known/oauth-authorization-server | jq .`
3. Bearer `POST https://mcp.metraedu.com.br/mcp` with Firebase ID token → `health_check` / `decks_list`
4. Optional: full Connect DCR → authorize → token on a second cold invoke (wait >10m or force new instance) to confirm Dynamo durability

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Lambda + Web Adapter + Express | 5 |
| HTTP API + `mcp.metraedu.com.br` + ACM + Route53 | 5 |
| CDK in `metracards-mcp/infrastructure/` | 4–6 |
| Dynamo OAuth store (clients, codes, pending) | 1–2 |
| `METRACARDS_MCP_OAUTH_TABLE` selection | 3 |
| Memory store local | 1, 3 |
| Timeout 120 / memory 1024 | 5 |
| Unit tests Dynamo + memory regression | 1–2 |
| CDK snapshot | 6 |
| README + Firebase domain | 7 |
| Manual smoke | 8 |
| No CI/CD / no tool changes | respected |

## Placeholder / consistency check

- Env name consistent: `METRACARDS_MCP_OAUTH_TABLE`
- Pending TTL 10m / code TTL 2m aligned with Phase 2
- Async store throughout Tasks 1–3
- HTML asset bundling explicitly handled in Task 5
