// Opt-in integration test. Only the named, restored, local QA database is allowed.
// Synthetic committed fixtures are removed in finally; live databases are never targeted.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const database = 'boh_company_restore_20260913';
const container = 'supabase_db_Ben-Oxford-Hub';
const runId = crypto.randomUUID();
const actor = 'qa-concurrent-' + runId;
const bills = [crypto.randomUUID(), crypto.randomUUID()];
const same = crypto.randomUUID(),
  other = [crypto.randomUUID(), crypto.randomUUID()],
  entry = crypto.randomUUID();
const quote = (v) => "'" + String(v).replaceAll("'", "''") + "'";
function sql(query) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', [
      'exec',
      '-i',
      container,
      'sh',
      '-c',
      'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -h 127.0.0.1 -X -qAt -U supabase_admin -d ' +
        database +
        ' -v ON_ERROR_STOP=1',
    ]);
    let out = '',
      err = '';
    child.stdout.on('data', (b) => (out += b));
    child.stderr.on('data', (b) => (err += b));
    child.on('error', reject);
    child.on('close', (code) =>
      code ? reject(Error(err)) : resolve(out.trim()),
    );
    child.stdin.end(
      `do $$ begin if current_database()<>${quote(database)} then raise exception 'Isolated QA database required'; end if; end $$;\n` +
        query,
    );
  });
}
const day = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
}).format(new Date());
const pay = (id, commandId, amount) => ({
  actorId: actor,
  commandId,
  id,
  revision: 1,
  payload: {
    date: day,
    amount,
    account: 'Company BIDV',
    name: 'Synthetic recipient',
    recipientBank: 'Example bank',
    recipientAccount: '00123456789',
    category: 'Rent',
    evidence: 'Synthetic concurrency check',
  },
});
const invoke = (operation, args) =>
  sql(
    `begin;set local role service_role;select public.${operation.startsWith('fin_') ? 'boh_finance_workspace' : 'boh_entry_command'}(${quote(operation)},${quote(JSON.stringify(args))}::jsonb);select pg_sleep(0.2);commit;`,
  );
try {
  await sql(`insert into public.boh_staff(id,user_id,email,name,role) values(${quote(actor)},${quote(actor)},${quote(actor + '@example.invalid')},'QA only','Director');
    insert into public.boh_fin_documents(id,kind,date,title,amount,status,approved_by,approved_revision,created_by) values
    ${bills.map((id) => `(${quote(id)},'bill',${quote(day)},'Synthetic concurrent bill',100,'Approved',${quote(actor)},1,${quote(actor)})`).join(',')};`);
  await Promise.all([
    invoke('fin_pay', pay(bills[0], same, 60)),
    invoke('fin_pay', pay(bills[0], same, 60)),
  ]);
  assert.equal(
    await sql(
      `select count(*)||':'||sum(amount) from public.boh_fin_settlements where document_id=${quote(bills[0])};`,
    ),
    '1:60',
  );
  process.stdout.write('PASS identical concurrent bill payment records once\n');
  const competing = await Promise.allSettled(
    other.map((id) => invoke('fin_pay', pay(bills[1], id, 70))),
  );
  assert.equal(competing.filter((r) => r.status === 'fulfilled').length, 1);
  assert.match(
    competing.find((r) => r.status === 'rejected').reason.message,
    /Record changed|exceeds/,
  );
  assert.equal(
    await sql(
      `select count(*)||':'||sum(amount) from public.boh_fin_settlements where document_id=${quote(bills[1])};`,
    ),
    '1:70',
  );
  process.stdout.write('PASS competing payments cannot overspend a bill\n');
  const args = {
    actorId: actor,
    commandId: entry,
    kind: 'expense',
    requestHash: 'a'.repeat(64),
    command: {
      actorId: actor,
      expectedRevision: null,
      record: {
        id: entry,
        kind: 'expense',
        date: day,
        payload: {
          date: day,
          month: day.slice(0, 7),
          amount: 5,
          description: 'Synthetic entry',
          account: 'Company BIDV',
        },
      },
    },
  };
  await Promise.all([
    invoke('entry_commit', args),
    invoke('entry_commit', args),
  ]);
  assert.equal(
    await sql(
      `select count(*) from public.boh_records where id=${quote(entry)};`,
    ),
    '1',
  );
  process.stdout.write(
    'PASS identical concurrent form submission records once\n',
  );
} finally {
  await sql(`begin;
    delete from public.boh_fin_settlements where document_id in (${bills.map(quote).join(',')});
    delete from public.boh_records where id in (${[entry, ...[same, ...other].map((id) => 'expense:bill:' + id)].map(quote).join(',')});
    delete from public.boh_fin_documents where id in (${bills.map(quote).join(',')});
    delete from public.boh_fin_commands where actor_id=${quote(actor)};
    delete from public.boh_activity where actor_id=${quote(actor)};
    delete from public.boh_staff where user_id=${quote(actor)};commit;`);
  process.stdout.write(
    'Synthetic concurrency fixtures removed from isolated QA database.\n',
  );
}
