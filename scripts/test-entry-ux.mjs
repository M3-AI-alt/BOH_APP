import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const code = buildSync({
  stdin: {
    contents:
      "export * from './lib/entry-experience';export * from './lib/record-filters';export * from './lib/receipt-accounts';export * from './lib/workspace-navigation';export * from './lib/drafts';export * from './lib/bulk';export * from './lib/domain';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
}).outputFiles[0].text;
const compiled = { exports: {} };
new Function('require', 'module', 'exports', code)(
  require,
  compiled,
  compiled.exports,
);
const {
  parseVnd,
  entryErrors,
  entryFields,
  visibleField,
  matchesFilters,
  emptyFilters,
  validateFilters,
  moduleAllowed,
  numericTotal,
  COMPANY_RECEIVING_ACCOUNTS,
  receiptAccountError,
  receivingAccountChoices,
  expenseAccountError,
  payingAccountChoices,
  recipientErrors,
  allowedViews,
  draftKinds,
  bulkTasks,
  canImport,
  canExport,
  canWrite,
} = compiled.exports;
void test('internal accounting UI has no vendor connection warning or tax filing task', () => {
  const source = readFileSync('app/accounting-workspace.tsx', 'utf8');
  assert.doesNotMatch(source, /MISA|API registration|officialActivation/);
  assert.match(source, /Internal accounting/);
  assert.match(source, /accountingImportSources\.map/);
  assert.equal(
    entryFields('task')
      .find((f) => f.key === 'category')
      .options.includes('Tax filing'),
    false,
  );
});
void test('expense source and recipient fields are distinct, optional and validated', () => {
  assert.deepEqual(
    payingAccountChoices().map((x) => x.id),
    COMPANY_RECEIVING_ACCOUNTS,
  );
  const fields = entryFields('expense');
  assert.deepEqual(
    fields.find((f) => f.key === 'account').options,
    COMPANY_RECEIVING_ACCOUNTS,
  );
  assert.notEqual(
    fields.find((f) => f.key === 'account').control,
    'suggestion',
  );
  for (const key of ['name', 'recipientBank', 'recipientAccount'])
    assert.ok(fields.find((f) => f.key === key));
  const data = {
    account: 'Company BIDV',
    name: 'Sample recipient',
    recipientBank: 'Example bank',
    recipientAccount: '00123456789',
  };
  assert.equal(expenseAccountError(data), undefined);
  assert.deepEqual(recipientErrors(data), {});
  assert.deepEqual(recipientErrors({}), {});
  assert.ok(recipientErrors({ ...data, name: '' }).name);
  assert.ok(
    recipientErrors({ ...data, recipientAccount: 1234 }).recipientAccount,
  );
  assert.ok(expenseAccountError({ ...data, account: 'Thao personal BIDV' }));
  const old = {
    ...data,
    account: 'Thao personal BIDV',
    amount: 100,
    date: '2026-02-28',
  };
  assert.equal(
    expenseAccountError({ ...old, reconciled: true }, old),
    undefined,
  );
  assert.ok(expenseAccountError({ ...old, amount: 101 }, old));
  assert.ok(
    payingAccountChoices(old).find((x) => x.id === old.account).disabledReason,
  );
});
void test('new receiving-account options never come from historical personal accounts', () => {
  assert.deepEqual(COMPANY_RECEIVING_ACCOUNTS, ['Company BIDV', 'Company VCB']);
  assert.deepEqual(
    receivingAccountChoices().map((x) => x.id),
    COMPANY_RECEIVING_ACCOUNTS,
  );
  const field = entryFields('receipt').find((f) => f.key === 'account');
  assert.equal(field.type, 'select');
  assert.notEqual(field.control, 'suggestion');
  assert.deepEqual(field.options, COMPANY_RECEIVING_ACCOUNTS);
  const cash = {
    account: 'Thao personal BIDV',
    amount: 100,
    date: '2026-09-01',
  };
  for (const account of [
    'Thao personal BIDV',
    'Thao personal MBB',
    'Thao personal VCB',
    'Thảo',
    'Company',
    'Cash',
    'New bank',
    '',
  ])
    assert.ok(receiptAccountError({ ...cash, account }), account);
  for (const account of COMPANY_RECEIVING_ACCOUNTS)
    assert.equal(receiptAccountError({ ...cash, account }), undefined);
  assert.equal(
    receiptAccountError({ ...cash, reconciled: true }, cash),
    undefined,
  );
  assert.ok(receiptAccountError({ ...cash, amount: 101 }, cash));
  assert.ok(receiptAccountError({ ...cash, date: '2026-09-13' }, cash));
  const legacy = receivingAccountChoices(cash).find(
    (x) => x.id === cash.account,
  );
  assert.ok(legacy.disabledReason);
});
void test('Director includes every Finance navigation, entry, worksheet, draft and filter capability', () => {
  const actor = (role) => ({
    role,
    userId: role,
    name: role,
    email: role + '@example.invalid',
    active: true,
    classIds: [],
  });
  for (const view of allowedViews('Finance'))
    assert.ok(allowedViews('Director').includes(view), view);
  for (const kind of draftKinds('Finance'))
    assert.ok(draftKinds('Director').includes(kind), kind);
  for (const kind of [...Object.keys(bulkTasks), 'close']) {
    if (canWrite(actor('Finance'), kind, 'test'))
      assert.ok(canWrite(actor('Director'), kind, 'test'), kind);
    if (canImport(actor('Finance'), kind))
      assert.ok(canImport(actor('Director'), kind), kind);
    if (canExport(actor('Finance'), kind))
      assert.ok(canExport(actor('Director'), kind), kind);
  }
  for (const module of [
    'receipts',
    'expenses',
    'attendance',
    'students',
    'payroll',
    'tasks',
  ]) {
    assert.ok(moduleAllowed(module, 'Finance'));
    assert.ok(moduleAllowed(module, 'Director'));
  }
});
test('VND input accepts whole amounts in both languages and never coerces malformed text', () => {
  for (const text of ['10000', '10,000', '10.000', '10 000'])
    assert.equal(parseVnd(text), 10000);
  for (const text of [
    '1.0000',
    '1,0000',
    '1.5',
    '1.234,567',
    '1,234.567',
    '1e6',
    '9007199254740992',
  ]) {
    const value = parseVnd(text);
    assert.equal(typeof value, 'string');
    assert.ok(
      entryErrors('receipt', {
        name: 'Family',
        account: 'Cash',
        date: '2026-09-13',
        amount: value,
      }).amount,
    );
  }
  assert.equal(
    entryErrors('receipt', {
      name: 'Family',
      account: 'Cash',
      date: '2026-09-13',
      amount: 10000,
    }).amount,
    undefined,
  );
  assert.ok(entryErrors('receipt', { amount: 0 }).amount);
});
test('conditional inputs preserve pause history and require a class only for restricted agreements', () => {
  const date = entryFields('student').find((f) => f.key === 'resumeDate');
  assert.equal(visibleField(date, { status: 'Active' }), false);
  assert.equal(
    visibleField(date, { status: 'Active', pauseFrom: '2026-09-01' }),
    true,
  );
  assert.ok(
    entryErrors('student', { status: 'Active', pauseFrom: '2026-09-01' })
      .resumeDate,
  );
  assert.equal(entryErrors('package', { scope: 'all' }).classId, undefined);
  assert.ok(entryErrors('package', { scope: 'class' }).classId);
});
test('split receipts require complete positive exact allocations', () => {
  const data = {
    amount: 100,
    allocations: [
      { packageId: 'a', amount: 60 },
      { packageId: 'b', amount: 40 },
    ],
  };
  assert.equal(entryErrors('receipt', data).allocations, undefined);
  for (const amount of [41, 0, '40'])
    assert.ok(
      entryErrors('receipt', {
        ...data,
        allocations: [data.allocations[0], { packageId: 'b', amount }],
      }).allocations,
    );
});
test('shared filter specification is accent insensitive, OR within facets and AND across facets', () => {
  const spec = validateFilters('receipts', {
    query: 'nguyen đuc',
    facets: { account: ['Cash', 'Bank'], reconciliation: ['unmatched'] },
    columns: ['amount'],
  });
  const rows = [
    {
      account: 'Cash',
      reconciliation: 'unmatched',
      name: 'Nguyễn Đức',
      amount: 100,
    },
    {
      account: 'Bank',
      reconciliation: 'unmatched',
      name: 'Nguyễn Đức',
      amount: 200,
    },
    {
      account: 'Bank',
      reconciliation: 'matched',
      name: 'Nguyễn Đức',
      amount: 300,
    },
  ];
  const selected = rows.filter((r) => matchesFilters(spec, r, [r.name]));
  assert.equal(selected.length, 2);
  assert.equal(numericTotal(selected), 300);
  assert.equal(numericTotal([{ amount: 'unconfirmed' }, { amount: 10 }]), 10);
  assert.ok(
    matchesFilters(
      { ...emptyFilters(), facets: { classId: ['c'] } },
      { classId: ['c', 'd'] },
      [],
    ),
  );
});
test('saved-view modules and fields fail closed', () => {
  assert.equal(moduleAllowed('receipts', 'TA'), false);
  assert.equal(moduleAllowed('attendance', 'TA'), true);
  assert.equal(moduleAllowed('leads', 'Finance'), false);
  assert.equal(moduleAllowed('anything', 'Director'), false);
  assert.throws(() =>
    validateFilters('expenses', {
      ...emptyFilters(),
      facets: { classId: ['x'] },
    }),
  );
  assert.throws(() =>
    validateFilters('receipts', { ...emptyFilters(), columns: [null] }),
  );
  assert.throws(() =>
    validateFilters('attendance', {
      ...emptyFilters(),
      facets: { date: Array(51).fill('2026-09-13') },
    }),
  );
});
test('UX metadata and validation messages have Vietnamese translations', () => {
  const dictionary = JSON.parse(readFileSync('lib/locales/vi.json', 'utf8'));
  for (const kind of [
    'student',
    'receipt',
    'expense',
    'package',
    'lead',
    'payroll',
  ])
    for (const f of entryFields(kind)) {
      assert.ok(dictionary[f.section], f.section);
      if (f.help) assert.ok(dictionary[f.help], f.help);
    }
});
