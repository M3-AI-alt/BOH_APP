// Synthetic concurrency check against our isolated Docker database only.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
const execute = promisify(execFile);
const database = 'boh_prep_defaults_20260913';
const actor = 'qa-prep-' + randomUUID();
const digest = createHash('sha256').update(actor).digest('hex');
async function sql(statement) {
  return (
    await execute(
      'docker',
      [
        'exec',
        'supabase_db_Ben-Oxford-Hub',
        'psql',
        '-U',
        'postgres',
        '-d',
        database,
        '-At',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        statement,
      ],
      { timeout: 20000 },
    )
  ).stdout;
}
try {
  await sql(`insert into public.boh_staff(id,user_id,email,name,role,active)
    values('${actor}','${actor}','${actor}@example.invalid','Synthetic preparation QA','Director',true)`);
  const args = JSON.stringify({
    actorId: actor,
    digest,
    fileHash: digest,
    fileName: 'synthetic.xlsx',
    payload: { financialChanges: 0, rows: [], counts: {} },
  });
  const results = await Promise.all(
    Array.from({ length: 6 }, () =>
      sql(
        `set role service_role; select public.boh_preparation('prep_stage','${args}'::jsonb)`,
      ),
    ),
  );
  assert.equal(
    Number(
      (
        await sql(
          `select count(*) from public.boh_preparation_reviews where digest='${digest}'`,
        )
      ).trim(),
    ),
    1,
  );
  const responses = results.map((r) => JSON.parse(r.trim().split('\n').at(-1)));
  assert.equal(new Set(responses.map((r) => r.id)).size, 1);
  assert.equal(responses.filter((r) => !r.reused).length, 1);
  console.log(
    'Six simultaneous preparation saves produced one immutable review and one shared result ID.',
  );
} finally {
  // Remove only this test's synthetic evidence and identity; never source data.
  await sql(
    `delete from public.boh_preparation_reviews where digest='${digest}'; delete from public.boh_staff where user_id='${actor}'`,
  );
}
