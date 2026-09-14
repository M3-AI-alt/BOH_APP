// Read-only operational snapshot for accountant preparation. Never commits data.
// Keep the destination outside the checkout; it contains confidential records.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const destination = path.resolve(process.argv[2] || '');
if (!process.argv[2] || destination.startsWith(process.cwd() + path.sep))
  throw Error('Provide a private destination outside the checkout.');
const vars = Object.fromEntries(
  (await fs.readFile('.dev.vars', 'utf8'))
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [
      l.slice(0, l.indexOf('=')),
      l.slice(l.indexOf('=') + 1).replace(/^(["'])(.*)\1$/, '$2'),
    ]),
);
async function read(operation, args = {}) {
  const key = vars.SUPABASE_SECRET_KEY;
  const response = await fetch(
    vars.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/boh_store',
    {
      method: 'POST',
      headers: {
        apikey: key,
        'Content-Type': 'application/json',
        ...(key.startsWith('eyJ') ? { Authorization: 'Bearer ' + key } : {}),
      },
      body: JSON.stringify({ operation, args }),
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!response.ok)
    throw Error('Read-only snapshot request failed: ' + response.status);
  return response.json();
}
async function records() {
  const rows = [];
  for (let offset = 0; ; offset += 900) {
    const page = await read('list_records', { offset, limit: 900 });
    rows.push(...page);
    if (page.length < 900) return rows.sort((a, b) => a.id.localeCompare(b.id));
  }
}
// Two matching reads detect staff edits during a paginated snapshot.
const first = await records(),
  second = await records();
const digest = (rows) =>
  createHash('sha256').update(JSON.stringify(rows)).digest('hex');
if (digest(first) !== digest(second))
  throw Error('Records changed during snapshot. Retry; nothing was written.');
const snapshot = {
  version: 'BOH-PREP-1',
  capturedAt: new Date().toISOString(),
  fingerprint: digest(second),
  source: 'BOH operational database',
  records: second,
};
await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
await fs.writeFile(destination, JSON.stringify(snapshot), {
  mode: 0o600,
  flag: 'wx',
});
const counts = {},
  keys = {};
for (const row of second) {
  counts[row.kind] = (counts[row.kind] || 0) + 1;
  keys[row.kind] ||= new Set();
  Object.keys(row.payload).forEach((k) => keys[row.kind].add(k));
}
const sum = (kind, month) =>
  second
    .filter((r) => r.kind === kind && r.date?.startsWith(month))
    .reduce((a, r) => a + Number(r.payload.amount || 0), 0);
console.log(
  JSON.stringify(
    {
      capturedAt: snapshot.capturedAt,
      counts,
      keys: Object.fromEntries(
        Object.entries(keys).map(([k, v]) => [k, [...v]]),
      ),
      augustCollections: sum('receipt', '2026-08'),
      januaryToMayExpenses: [1, 2, 3, 4, 5].map((n) => [
        n,
        sum('expense', '2026-0' + n),
      ]),
    },
    null,
    2,
  ),
);
