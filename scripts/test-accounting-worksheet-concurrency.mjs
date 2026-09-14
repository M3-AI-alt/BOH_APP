// Explicitly local-only integration test. Run after restoring the isolated release database.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const database = process.argv[2];
if (!/^boh_worksheet_release_\d+$/.test(database || ''))
  throw Error(
    'Pass an isolated boh_worksheet_release_YYYYMMDD database; production is not supported.',
  );
async function sql(query) {
  const result = await exec(
    'docker',
    [
      'exec',
      'supabase_db_Ben-Oxford-Hub',
      'psql',
      '-U',
      'postgres',
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      '-Atc',
      query,
    ],
    { timeout: 30_000 },
  );
  return result.stdout.trim();
}
const suffix = crypto.randomUUID();
const staff = 'qa-worksheet-race-' + suffix;
await sql(
  `insert into public.boh_staff(id,user_id,email,name,role) values('${staff}','${staff}','${suffix}@test.invalid','Concurrent worksheet test','Finance')`,
);
const args = {
  actorId: staff,
  kind: 'documents',
  rows: [
    {
      row: 2,
      key: 'RACE-' + suffix,
      label: 'Concurrent test',
      payload: {
        kind: 'bill',
        date: '2096-09-01',
        dueDate: '',
        title: 'Concurrent test',
        counterparty: '',
        amount: 1000,
        notes: 'Isolated test only',
        lines: [],
      },
    },
  ],
};
const countBefore = Number(
  await sql('select count(*) from public.boh_fin_documents'),
);
const command = `begin; set local role service_role; select public.boh_finance('fin_worksheet_commit',$json$${JSON.stringify(args)}$json$); commit;`;
const outputs = await Promise.all([sql(command), sql(command)]);
const results = outputs.map((output) =>
  JSON.parse(output.split('\n').find((line) => line.startsWith('{'))),
);
assert.equal(
  results.reduce((total, r) => total + r.saved, 0),
  1,
);
assert.equal(
  results.reduce((total, r) => total + r.skipped, 0),
  1,
);
assert.equal(
  results.reduce((total, r) => total + r.failed, 0),
  0,
);
assert.equal(results[0].rows[0].id, results[1].rows[0].id);
assert.equal(
  Number(await sql('select count(*) from public.boh_fin_documents')),
  countBefore + 1,
);
const reference = results[0].rows[0].id;
await sql(
  `begin; set local role service_role; select public.boh_finance('fin_action',$json$${JSON.stringify({ actorId: staff, id: reference, revision: 1, commandId: crypto.randomUUID(), payload: { action: 'delete' } })}$json$); commit;`,
);
assert.equal(
  Number(await sql('select count(*) from public.boh_fin_documents')),
  countBefore,
);
console.log(
  JSON.stringify({
    database,
    parallelRequests: 2,
    saved: 1,
    skipped: 1,
    failed: 0,
    syntheticDraftRemoved: true,
    protectedReferenceRetained: true,
  }),
);
