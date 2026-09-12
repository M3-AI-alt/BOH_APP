import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
const url = (code) =>
  'data:text/javascript;base64,' +
  Buffer.from(
    ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    }).outputText,
  ).toString('base64');
const domainURL = url(fs.readFileSync('lib/accounting.ts', 'utf8'));
const domain = await import(domainURL);
const guardURL = url(
  "export class AppError extends Error{constructor(m,s=400){super(m);this.status=s;}};export function requireRole(a,roles){if(!a.active||!roles.includes(a.role))throw new AppError('Access denied',403);}",
);
const storeURL = url(
  'export async function storeCall(op,args){globalThis.__accountingCalls.push({op,args});return {ok:true};}',
);
const api = await import(
  url(
    fs
      .readFileSync('lib/accounting-server.ts', 'utf8')
      .replaceAll("from './server'", `from '${guardURL}'`)
      .replaceAll("from './storage'", `from '${storeURL}'`)
      .replaceAll("from './accounting'", `from '${domainURL}'`),
  )
);
const director = { userId: 'qa-director', role: 'Director', active: true },
  finance = { userId: 'qa-finance', role: 'Finance', active: true };
const payload = {
  source: 'MISA',
  dataset: 'QA only',
  view: 'Bank',
  period: '2026-08',
  fileName: 'sample.csv',
  numberFormat: 'vn',
  dateFormat: 'dmy',
  csv: 'ID,Date,Amount,Name\r\nBR001,31/08/2026,1.200.000,Test',
  mapping: { externalId: 'ID', date: 'Date', amount: 'Amount', name: 'Name' },
};
const command = (operation, fields = {}) => ({
  operation,
  commandId: crypto.randomUUID(),
  id: crypto.randomUUID(),
  ...fields,
});
test('CSV retains IDs, embedded quotes, Unicode and source text without evaluation', () => {
  const r = domain.parseSourceCsv(
    '\uFEFFID,Name,Note\r\n001,"Bảo, Ngọc","Line one\n""Line two"""\r\n002,Test,=1+1',
  );
  assert.equal(r.rows[0].ID, '001');
  assert.equal(r.rows[0].Name, 'Bảo, Ngọc');
  assert.equal(r.rows[0].Note, 'Line one\n"Line two"');
  assert.equal(r.rows[1].Note, '=1+1');
  for (const csv of [
    'A,A\n1,2',
    'A,B\n1',
    'A,B\n"unfinished,2',
    'A\n',
    'A\n' + Array(501).fill('1').join('\n'),
  ])
    assert.throws(() => domain.parseSourceCsv(csv));
});
test('Explicit VND conventions reject ambiguous grouping, fractions and overflows', () => {
  assert.equal(domain.sourceAmount('1.200.000', 'vn'), 1200000);
  assert.equal(domain.sourceAmount('1,200,000.00', 'en'), 1200000);
  assert.equal(domain.sourceAmount('-1200', 'plain'), -1200);
  for (const [v, f] of [
    ['1,200,000', 'vn'],
    ['1.20.000', 'vn'],
    ['1,200.50', 'en'],
    ['NaN', 'plain'],
    ['1000000000001', 'plain'],
  ])
    assert.throws(() => domain.sourceAmount(v, f));
  assert.equal(domain.validDate('2026-02-30'), false);
  assert.equal(domain.validDate('2024-02-29'), true);
  assert.equal(domain.csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
});
test('Journal validation balances whole VND and uses supported account codes', () => {
  const lines = [
    { account: '111', debit: 100, credit: 0 },
    { account: '131', debit: 0, credit: 100 },
  ];
  assert.equal(domain.validateJournal(lines), 100);
  for (const changed of [
    [lines[0]],
    [lines[0], { ...lines[1], credit: 99 }],
    [lines[0], { ...lines[1], account: '<script>' }],
    [{ ...lines[0], credit: 1 }, lines[1]],
  ])
    assert.throws(() => domain.validateJournal(changed));
});
test('Import preview parses on server, preserves raw provenance and reports period/ID exceptions', () => {
  const r = api.previewSource({
    ...payload,
    csv: payload.csv + '\r\nBR001,01/09/2026,500.000,Test',
  });
  assert.equal(r.rows[0].amount, 1200000);
  assert.equal(r.rows[0].raw.Amount, '1.200.000');
  assert.equal(r.outsidePeriod, 1);
  assert.equal(r.duplicateIds, 1);
  assert.throws(
    () =>
      api.previewSource({
        ...payload,
        csv: 'ID,Date,Amount\n1,31/02/2026,100',
      }),
    /Row 2/,
  );
  assert.throws(() => api.previewSource({ ...payload, mapping: {} }), /Map/);
});
test('TA and inactive accounts cannot list, import, approve or inspect accounting history', async () => {
  for (const a of [
    { ...director, role: 'TA' },
    { ...director, active: false },
  ]) {
    await assert.rejects(
      api.listAccounting(a, new URLSearchParams()),
      (e) => e.status === 403,
    );
    for (const op of [
      'preview',
      'stage',
      'save',
      'action',
      'settle',
      'history',
    ])
      await assert.rejects(
        api.accountingCommand(a, command(op, { payload })),
        (e) => e.status === 403,
      );
  }
});
test('Import commands hash original CSV server-side and ignore caller actor/source overrides', async () => {
  globalThis.__accountingCalls = [];
  await api.accountingCommand(
    finance,
    command('stage', {
      actorId: 'qa-director',
      payload: { ...payload, fileHash: 'forged', rows: [{ amount: 999 }] },
    }),
  );
  const call = globalThis.__accountingCalls[0];
  assert.equal(call.op, 'fin_stage');
  assert.equal(call.args.actorId, finance.userId);
  assert.match(call.args.payload.fileHash, /^[a-f0-9]{64}$/);
  assert.equal(call.args.payload.rows[0].amount, 1200000);
});
test('Financial save strips approval metadata and never writes the cash store', async () => {
  globalThis.__accountingCalls = [];
  await api.accountingCommand(
    finance,
    command('save', {
      payload: {
        kind: 'bill',
        date: '2026-09-12',
        title: 'Rent',
        amount: 100,
        status: 'Approved',
        approvedBy: 'forged',
        lines: [],
      },
    }),
  );
  assert.equal(globalThis.__accountingCalls[0].op, 'fin_save');
  assert.equal(globalThis.__accountingCalls[0].args.payload.status, undefined);
  await assert.rejects(
    api.accountingCommand(
      finance,
      command('action', { payload: { action: 'approve' } }),
    ),
    (e) => e.status === 403,
  );
  await assert.rejects(
    api.accountingCommand(
      finance,
      command('settle', {
        payload: { amount: 0, cashRecordId: 'x', evidence: 'x' },
      }),
    ),
    /whole VND/,
  );
  await assert.rejects(
    api.accountingCommand(
      director,
      command('save', {
        payload: {
          kind: 'bill',
          date: '2026-09-12',
          title: 'Rent',
          amount: 1.2,
        },
      }),
    ),
    /whole VND/,
  );
});
test('Accounting pagination is bounded and does not accept mutation actions via listing', async () => {
  globalThis.__accountingCalls = [];
  await api.listAccounting(
    finance,
    new URLSearchParams('offset=50&tab=imports'),
  );
  assert.equal(globalThis.__accountingCalls[0].args.offset, 50);
  await assert.rejects(
    api.listAccounting(finance, new URLSearchParams('offset=-1')),
    /Invalid page/,
  );
});
