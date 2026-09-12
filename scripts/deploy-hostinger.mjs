// Publish only the committed, sanitized BOH source to the existing Hostinger app.
// Credentials are resolved by the Hostinger CLI and never written or printed.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const cli = process.env.HOSTINGER_CLI || 'hostinger';
const domain = 'benoxfordhub.online',
  username = 'u436347803';
const run = (file, args) =>
  execFileSync(file, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const sha = run('git', ['rev-parse', 'HEAD']).trim();
const tracked = run('git', ['ls-tree', '-r', '--name-only', 'HEAD'])
  .trim()
  .split('\n');
const forbidden = tracked.filter(
  (f) =>
    /^private-data\/|^db\/import\.json$|(^|\/)(\.dev\.vars|\.env)(\.|$)|\.(xlsx?|csv|sqlite3?|pem)$/.test(
      f,
    ) && f !== '.env.example',
);
if (forbidden.length)
  throw Error('Refusing to publish private or generated source files.');
if (!process.argv.includes('--publish')) {
  console.log(JSON.stringify({ domain, commit: sha, dryRun: true }));
  process.exit(0);
}
if (run('git', ['status', '--porcelain', '--untracked-files=no']).trim())
  throw Error('Commit and validate tracked changes before publishing.');
const folder = mkdtempSync(join(tmpdir(), 'boh-release-')),
  fileName = 'boh-release-' + sha.slice(0, 12) + '.tar.gz',
  archive = join(folder, fileName);
run('git', ['archive', '--format=tar.gz', '--output', archive, 'HEAD']);
const auth = JSON.parse(
  run(cli, [
    'hosting',
    'files',
    'generate-upload-url',
    '--username',
    username,
    '--domain',
    domain,
    '--format',
    'json',
  ]),
);
if (!auth.url || !auth.auth_key || !auth.rest_auth_key)
  throw Error('Upload credentials were not returned.');
const url = new URL(auth.url.replace(/\/$/, '') + '/' + fileName);
if (url.protocol !== 'https:') throw Error('HTTPS upload required.');
url.searchParams.set('override', 'true');
const headers = {
  'X-Auth': auth.auth_key,
  'X-Auth-Rest': auth.rest_auth_key,
  'Tus-Resumable': '1.0.0',
  'Upload-Offset': '0',
};
const created = await fetch(url, {
  method: 'POST',
  headers: { ...headers, 'Upload-Length': String(statSync(archive).size) },
  signal: AbortSignal.timeout(30000),
});
if (created.status !== 201)
  throw Error('Upload preparation failed with status ' + created.status);
const uploaded = await fetch(url, {
  method: 'PATCH',
  headers: { ...headers, 'Content-Type': 'application/offset+octet-stream' },
  body: readFileSync(archive),
  signal: AbortSignal.timeout(60000),
});
if (
  uploaded.status !== 204 ||
  Number(uploaded.headers.get('Upload-Offset')) !== statSync(archive).size
)
  throw Error('Upload did not confirm the complete archive.');
const build = JSON.parse(
  run(cli, [
    'hosting',
    'nodejs',
    'start-build',
    username,
    domain,
    '--source-type',
    'archive',
    '--source-options',
    JSON.stringify({ archive_path: fileName }),
    '--app-type',
    'other',
    '--node-version',
    '24',
    '--package-manager',
    'npm',
    '--root-directory',
    '.',
    '--build-script',
    'build:hostinger',
    '--entry-file',
    'dist/standalone/hostinger-server.mjs',
    '--output-directory',
    'dist/standalone',
    '--format',
    'json',
  ]),
);
console.log(
  JSON.stringify({
    domain,
    commit: sha,
    buildId: build.uuid || build.data?.uuid,
    state: build.state || build.data?.state,
    archive,
  }),
);
