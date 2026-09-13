import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const code = buildSync({
  stdin: {
    contents:
      "export * from './lib/entry-experience';export * from './lib/record-filters';",
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
} = compiled.exports;
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
