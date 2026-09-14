import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';

const require = createRequire(new URL('../package.json', import.meta.url));
const code = buildSync({
  stdin: {
    contents: `export * from './app/entry-actions'; export * from './app/bulk-workspace'; export * from './app/language'; export * from './app/views'; export * from './app/centre-settings'; export * from './app/finance-work'; export * from './lib/bulk'; export { AccountingWorksheetValues } from './app/accounting-worksheet-entry';`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  logLevel: 'silent',
}).outputFiles[0].text;
const compiled = { exports: {} };
// Only evaluates this repository's bundled test entry.
// oxlint-disable-next-line typescript/no-implied-eval
new Function('require', 'module', 'exports', code)(
  require,
  compiled,
  compiled.exports,
);
const ui = compiled.exports;
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const actor = (role, active = true) => ({
  userId: 'synthetic-entry-tests',
  email: 'synthetic@example.test',
  name: 'Synthetic account',
  role,
  active,
  classIds: [],
});
const record = (kind, id, payload) => ({
  kind,
  id,
  payload,
  revision: 1,
  updatedAt: '',
  classId: payload.classId || '',
  studentId: payload.studentId || '',
  date: payload.date || '',
});
const records = [
  record('class', 'class-test', {
    name: 'Synthetic class',
    weekdays: [0, 3],
    color: '#4269e1',
  }),
  record('student', 'student-test', {
    name: 'Synthetic student',
    status: 'Active',
    classId: 'class-test',
  }),
  record('membership', 'membership-test', {
    studentId: 'student-test',
    classId: 'class-test',
    forecast: true,
  }),
];
const props = (role = 'Director') => ({
  snapshot: {
    actor: actor(role),
    records,
    members: [],
    activity: [],
    manifest: {},
    loadedAt: '',
  },
  month: '2026-09',
  reviewDate: '2026-09-14',
  search: '',
  classFilter: 'class-test',
  open() {},
  detail() {},
  navigate() {},
  setClassFilter() {},
  save: async () => {},
});
const render = (component, input = {}) =>
  renderToStaticMarkup(
    React.createElement(
      ui.LanguageProvider,
      { initialLocale: 'en' },
      React.createElement(component, { ...props(), ...input }),
    ),
  );

test('all 16 supported tasks expose manual entry, their own Excel sample and reviewed import', () => {
  assert.equal(Object.keys(ui.bulkTasks).length, 16);
  for (const kind of Object.keys(ui.bulkTasks)) {
    const html = render(ui.EntryActions, { kind });
    assert.match(html, new RegExp(`/templates/BOH-${kind}\\.xlsx`), kind);
    assert.match(html, /Download worksheet sample/, kind);
    assert.match(html, /Import completed worksheet/, kind);
    assert.match(html, /Add manually/, kind);
    assert.doesNotMatch(html, /\/api\/preparation|\/api\/accounting/, kind);
  }
});

test('contextual controls use current role permissions, including inactive and unknown tasks', () => {
  for (const role of ['Director', 'Finance', 'TA']) {
    for (const kind of Object.keys(ui.bulkTasks)) {
      const html = render(ui.EntryActions, { ...props(role), kind });
      assert.equal(
        html.includes('Download worksheet sample'),
        ui.canImport(actor(role), kind),
        `${role}:${kind}`,
      );
    }
  }
  assert.equal(render(ui.EntryActions, { kind: 'staff' }), '');
  const inactive = props();
  inactive.snapshot.actor.active = false;
  assert.equal(render(ui.EntryActions, { ...inactive, kind: 'receipt' }), '');
});

test('focused importer keeps the chosen worksheet and does not mix preparation evidence with daily entry', () => {
  for (const focusedTask of ['receipt', 'payroll', 'attendance']) {
    const html = render(ui.BulkWorkspace, { focusedTask });
    assert.match(html, new RegExp(`/templates/BOH-${focusedTask}\\.xlsx`));
    assert.match(html, /1\. Download a template/);
    assert.match(html, /2\. Upload and review/);
    assert.match(html, /Preview import/);
    assert.doesNotMatch(
      html,
      /Choose a task|Export saved records|Accounting documents and source reconciliation/,
    );
    assert.doesNotMatch(
      html,
      /Preparation workbook|Preparation review|Bắt đầu/,
    );
  }
  const denied = render(ui.BulkWorkspace, {
    ...props('TA'),
    focusedTask: 'receipt',
  });
  assert.match(denied, /read-only access/);
  assert.doesNotMatch(denied, /templates\/BOH-|Preview import/);
});

test('working pages place the matching entry choices beside their own records', () => {
  for (const [component, expected] of [
    [ui.Students, ['student']],
    [ui.Leads, ['lead']],
    [ui.Packages, ['package']],
    [ui.Renewals, ['package']],
    [ui.CentreSettings, ['class', 'catalogue']],
    [ui.Finance, ['receipt']],
    [ui.Payroll, ['payroll']],
    [ui.AccountantTasks, ['task']],
    [ui.Attendance, ['attendance', 'membership']],
  ]) {
    const html = render(component);
    for (const kind of expected)
      assert.match(
        html,
        new RegExp(`/templates/BOH-${kind}\\.xlsx`),
        `${component.name}:${kind}`,
      );
  }
  assert.doesNotMatch(
    render(ui.Students, props('Finance')),
    /Download worksheet sample/,
  );
  assert.match(
    render(ui.Attendance, props('TA')),
    /templates\/BOH-attendance\.xlsx/,
  );
  assert.doesNotMatch(
    render(ui.Attendance, props('TA')),
    /templates\/BOH-membership\.xlsx/,
  );
});

test('import panel preserves page state and protects unfinished or in-flight work', () => {
  const entry = readFileSync('app/entry-actions.tsx', 'utf8');
  const bulk = readFileSync('app/bulk-workspace.tsx', 'utf8');
  assert.match(entry, /<Sheet open=\{open\}/);
  assert.doesNotMatch(
    entry,
    /p\.navigate\(|location\.|localStorage|sessionStorage/,
  );
  assert.match(entry, /!next && state\.busy/);
  assert.match(entry, /state\.pending[\s\S]*window\.confirm/);
  assert.match(entry, /focusedTask=\{kind\}/);
  assert.match(bulk, /beforeunload/);
  assert.match(
    bulk,
    /Switch task\? The unsaved import review will be discarded/,
  );
  assert.match(bulk, /if \(!canExport\(a, value\) \|\| busy\) return/);
});

test('accounting review shows document dates, type, counterparty and every journal line', () => {
  const html = render(ui.AccountingWorksheetValues, {
    kind: 'documents',
    row: {
      row: 2,
      key: 'QA-JOURNAL-1',
      status: 'Ready',
      label: 'QA journal',
      payload: {
        kind: 'journal',
        date: '2026-09-14',
        title: 'QA journal',
        counterparty: 'QA supplier',
        amount: 150000,
        dueDate: '2026-09-30',
        notes: 'QA explanation',
        lines: [
          { account: '1111', debit: 150000, credit: 0, note: 'QA debit note' },
          { account: '331', debit: 0, credit: 150000, note: 'QA credit note' },
        ],
      },
    },
  });
  for (const value of [
    'View values',
    '2026-09-14',
    '2026-09-30',
    'journal',
    'QA supplier',
    'QA explanation',
    '1111',
    '331',
    'QA debit note',
    'QA credit note',
  ])
    assert.ok(html.includes(value), value);
  assert.match(html, /<details/);
});

test('source review includes reference and direction while escaping original names', () => {
  const html = render(ui.AccountingWorksheetValues, {
    kind: 'source',
    row: {
      row: 2,
      key: 'BANK-1',
      status: 'Ready',
      label: 'QA source',
      payload: {
        externalId: 'BANK-1',
        date: '2026-09-14',
        amount: -200000,
        name: '<script>not executable</script>',
        direction: 'Money paid out',
        category: 'QA rent',
        reference: 'BANK-REF-001',
      },
    },
  });
  assert.match(html, /BANK-REF-001/);
  assert.match(html, /Money paid out/);
  assert.match(html, /&lt;script&gt;not executable&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

function browserFixture() {
  const window = {
    fetch: () => {
      throw Error('Unexpected network request in synthetic test');
    },
  };
  runInNewContext(
    readFileSync('scripts/browser-workspace-fixture.js', 'utf8'),
    {
      window,
      location: { hostname: 'localhost', origin: 'http://localhost:3000' },
      Response,
      URL,
      crypto: webcrypto,
      TextEncoder,
      structuredClone,
      setTimeout,
    },
  );
  return {
    qa: window.__bohQA,
    request: async (path, body) => {
      const response = await window.fetch(
        path,
        body ? { method: 'POST', body: JSON.stringify(body) } : {},
      );
      return { status: response.status, data: await response.json() };
    },
  };
}

test('synthetic browser fixture supports source preview, save, period filters and retry without cash changes', async () => {
  const { qa, request } = browserFixture();
  const recordsBefore = JSON.stringify(qa.state.records);
  const input = {
    operation: 'preview',
    kind: 'source',
    csv: 'entryKey,date,amount,name,category,direction,reference\r\n"BANK-001","2026-09-14","-100000","Nguyễn, QA","Rent","Paid","REF-1"',
    metadata: {
      source: 'Bank',
      dataset: 'QA dataset',
      period: '2026-09',
      view: 'Manual entry',
      fileName: 'manual-entry.csv',
    },
  };
  assert.equal(
    (await request('/api/accounting?tab=imports&month=2026-09')).data.total,
    0,
  );
  const preview = await request('/api/accounting-worksheets', input);
  assert.equal(preview.data.rows[0].payload.name, 'Nguyễn, QA');
  assert.equal(preview.data.rows[0].payload.amount, -100000);
  assert.equal(qa.accountingSources.length, 0);
  const saved = await request('/api/accounting-worksheets', {
    ...input,
    operation: 'commit',
    digest: preview.data.digest,
  });
  assert.equal(saved.data.saved, 1);
  assert.equal(
    (await request('/api/accounting?tab=imports&month=2026-09')).data.total,
    1,
  );
  assert.equal(
    (await request('/api/accounting?tab=imports&month=2026-08')).data.total,
    0,
  );
  const retry = await request('/api/accounting-worksheets', {
    ...input,
    operation: 'commit',
    digest: preview.data.digest,
  });
  assert.equal(retry.data.skipped, 1);
  assert.equal(qa.accountingSources.length, 1);
  assert.equal(JSON.stringify(qa.state.records), recordsBefore);
});

test('synthetic worksheet harness models lost responses and refuses unknown requests without network fallback', async () => {
  const { qa, request } = browserFixture();
  const input = {
    operation: 'preview',
    kind: 'documents',
    csv: 'entryKey,kind,date,title,counterparty,amount\r\nQA-BILL-1,bill,2026-09-14,QA worksheet bill,QA supplier,250000',
  };
  const preview = await request('/api/accounting-worksheets', input);
  qa.failWorksheetAfterCommit = true;
  await assert.rejects(
    request('/api/accounting-worksheets', {
      ...input,
      operation: 'commit',
      digest: preview.data.digest,
    }),
    /lost worksheet response/,
  );
  assert.equal(qa.accountingDocuments.length, 2);
  assert.equal(
    (
      await request('/api/accounting-worksheets', {
        ...input,
        operation: 'commit',
        digest: preview.data.digest,
      })
    ).data.skipped,
    1,
  );
  assert.equal(qa.accountingDocuments.length, 2);
  assert.equal(
    (
      await request('/api/accounting-worksheets', {
        ...input,
        operation: 'commit',
        digest: 'wrong',
      })
    ).status,
    409,
  );
  assert.equal((await request('/api/unsupported', {})).status, 400);
});
