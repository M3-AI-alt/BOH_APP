// Isolated PostgreSQL tests; never point at the live service.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const db = process.env.BOH_QA_DATABASE || 'boh_upgrade_final_20260912';
if (!/^boh_upgrade_[a-z0-9_]+$/.test(db))
  throw Error('Only isolated boh_upgrade_ databases are permitted.');
function sql(input) {
  return new Promise((resolve, reject) => {
    const p = spawn('docker', [
      'exec',
      '-i',
      'supabase_db_Ben-Oxford-Hub',
      'sh',
      '-c',
      `PGPASSWORD="$POSTGRES_PASSWORD" psql -w -h 127.0.0.1 -U supabase_admin -d ${db} -v ON_ERROR_STOP=1 -Atq`,
    ]);
    let out = '',
      err = '';
    p.stdout.on('data', (x) => (out += x));
    p.stderr.on('data', (x) => (err += x));
    p.on('error', reject);
    p.on('exit', (code) => resolve({ code, out, err }));
    p.stdin.end(input);
  });
}
const director = 'qa-concurrency-director',
  doc = 'be3a7606-bb68-4e58-aaf7-0526f761705d';
const setup =
  await sql(`insert into public.boh_staff(id,user_id,email,name,role) values('${director}','${director}','concurrency@upgrade.invalid','Synthetic director','Director');
insert into public.boh_fin_documents(id,kind,date,title,amount,status,created_by) values('${doc}','bill','2026-09-12','Concurrent test',100,'Submitted','${director}');`);
assert.equal(setup.code, 0, setup.err);
// Hold the same lock used by save_staff. Approval must see the committed revocation.
const demotion = sql(
  `begin;select pg_advisory_xact_lock(683920261);update public.boh_staff set active=false where user_id='${director}';select pg_sleep(2);commit;`,
);
await new Promise((r) => setTimeout(r, 400));
const approval = sql(
  `set role service_role;select public.boh_finance('fin_action','{"actorId":"${director}","commandId":"746a1d3f-28a2-421f-8954-799c7dfe71b8","id":"${doc}","revision":1,"payload":{"action":"approve"}}');`,
);
assert.equal((await demotion).code, 0);
const denied = await approval;
assert.notEqual(denied.code, 0);
assert.match(denied.err, /insufficient/);
let r = await sql(
  `select status from public.boh_fin_documents where id='${doc}';update public.boh_staff set active=true where user_id='${director}';`,
);
assert.equal(r.out.trim(), 'Submitted');
console.log(
  'PASS: queued approval rechecks access after concurrent revocation',
);
const payload = JSON.stringify({
  actorId: director,
  commandId: '746a1d3f-28a2-421f-8954-799c7dfe71b9',
  id: doc,
  revision: 1,
  payload: { action: 'approve' },
});
const results = await Promise.all([
  sql(
    `set role service_role;select public.boh_finance('fin_action','${payload}');`,
  ),
  sql(
    `set role service_role;select public.boh_finance('fin_action','${payload}');`,
  ),
]);
for (const result of results) assert.equal(result.code, 0, result.err);
assert.equal(results[0].out, results[1].out);
r = await sql(
  `select revision from public.boh_fin_documents where id='${doc}';`,
);
assert.equal(r.out.trim(), '2');
console.log(
  'PASS: concurrent repeated command approves once and returns the same result',
);
// Cleanup only this test's exact records, after successful checks.
r = await sql(
  `delete from public.boh_fin_commands where actor_id='${director}';delete from public.boh_activity where actor_id='${director}';delete from public.boh_fin_documents where id='${doc}';delete from public.boh_staff where user_id='${director}';`,
);
assert.equal(r.code, 0, r.err);
