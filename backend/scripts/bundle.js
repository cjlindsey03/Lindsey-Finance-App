// Bundles each Lambda (with its ../../shared imports) into dist/<LogicalId>/index.js.
// SAM then ships those folders directly, so deployment artifacts stay small and
// contain only code — no node_modules, no env.local.json.
const { build } = require('esbuild');
const { readdirSync, mkdirSync, rmSync } = require('fs');
const path = require('path');

const FUNCTIONS_DIR = path.join(__dirname, '..', 'functions');
const DIST_DIR = path.join(__dirname, '..', 'dist');

// functions/plaid-link-create -> PlaidLinkCreateFunction
const toLogicalId = (dir) =>
  dir.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('') + 'Function';

async function main() {
  rmSync(DIST_DIR, { recursive: true, force: true });
  const dirs = readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const dir of dirs) {
    const outdir = path.join(DIST_DIR, toLogicalId(dir));
    mkdirSync(outdir, { recursive: true });
    await build({
      entryPoints: [path.join(FUNCTIONS_DIR, dir, 'index.js')],
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'cjs',
      outfile: path.join(outdir, 'index.js'),
      // The Lambda runtime ships the DynamoDB/SNS clients, but not the S3
      // ones — those get bundled so the report Lambdas actually have them.
      external: ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb', '@aws-sdk/client-sns'],
      logLevel: 'warning',
    });
    console.log(`bundled ${dir} -> dist/${toLogicalId(dir)}/index.js`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
