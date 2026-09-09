// Run locally with server credentials in ignored .dev.vars. Never check in data.
import { readFileSync } from 'node:fs';
const vars = Object.fromEntries(
  readFileSync('.dev.vars', 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const seed = JSON.parse(readFileSync('db/import.json', 'utf8'));
async function rpc(operation, args = {}) {
  const r = await fetch(vars.SUPABASE_URL + '/rest/v1/rpc/boh_store', {
    method: 'POST',
    headers: {
      apikey: vars.SUPABASE_SECRET_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ operation, args }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || 'Import failed');
  return j;
}
if (await rpc('get_setting', { key: 'import-complete' })) {
  console.log('Existing import is complete. No records were overwritten.');
  process.exit(0);
}
let cursor = Number((await rpc('get_setting', { key: 'import-cursor' })) ?? 0);
while (cursor < seed.records.length) {
  const rows = seed.records.slice(cursor, cursor + 100),
    next = cursor + rows.length;
  const r = await rpc('import_chunk', {
    cursor,
    next,
    records: rows,
    done: next >= seed.records.length,
    version: seed.manifest.version,
    manifest: seed.manifest,
  });
  if (r.retry) {
    cursor = Number(await rpc('get_setting', { key: 'import-cursor' }));
    continue;
  }
  cursor = next;
  if (cursor % 1000 === 0 || cursor === seed.records.length)
    console.log('Imported', cursor, 'of', seed.records.length);
}
console.log('Private import complete. Original record IDs retained.');
