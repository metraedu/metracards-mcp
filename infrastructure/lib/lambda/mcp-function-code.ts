import { copyFileSync, chmodSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { buildSync } from 'esbuild';
import * as lambda from 'aws-cdk-lib/aws-lambda';

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const SRC_DIR = path.join(REPO_ROOT, 'src');
const ENTRY_FILE = path.join(SRC_DIR, 'index.ts');
const RUN_SCRIPT = path.join(REPO_ROOT, 'run.sh');
const LOGIN_PAGE_HTML = path.join(SRC_DIR, 'auth', 'oauth-login-page.html');

// The bundle output must stay ESM: source uses `import.meta.url` (login page
// and dotenv path resolution) which esbuild only preserves for the "esm"
// format. The file is named `index.mjs` (not `index.js`) so Node treats it
// as ESM even though the Lambda package ships no `package.json`.
// CommonJS dependencies (e.g. dotenv) pulled into the ESM bundle call
// `require`, which doesn't exist under ESM by default, hence the banner.
const REQUIRE_SHIM_BANNER =
  "import { createRequire as __mcpCreateRequire } from 'node:module'; " +
  'const require = __mcpCreateRequire(import.meta.url);';

function bundleMcpServer(outputDir: string): void {
  buildSync({
    entryPoints: [ENTRY_FILE],
    outfile: path.join(outputDir, 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    sourcemap: false,
    banner: { js: REQUIRE_SHIM_BANNER },
  });

  copyFileSync(RUN_SCRIPT, path.join(outputDir, 'run.sh'));
  chmodSync(path.join(outputDir, 'run.sh'), 0o755);

  mkdirSync(path.join(outputDir, 'auth'), { recursive: true });
  copyFileSync(LOGIN_PAGE_HTML, path.join(outputDir, 'auth', 'oauth-login-page.html'));
}

export function createMcpFunctionCode(): lambda.Code {
  return lambda.Code.fromAsset(SRC_DIR, {
    exclude: ['**/*.test.ts'],
    bundling: {
      image: lambda.Runtime.NODEJS_20_X.bundlingImage,
      local: {
        tryBundle(outputDir: string): boolean {
          bundleMcpServer(outputDir);
          return true;
        },
      },
    },
  });
}
