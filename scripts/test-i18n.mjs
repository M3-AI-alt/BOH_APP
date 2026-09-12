import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import ts from 'typescript';

const require = createRequire(new URL('../package.json', import.meta.url));
const code = buildSync({
  stdin: {
    contents: `export * from './lib/i18n'; export * from './app/language'; export * from './app/ui'; export * from './app/views'; export * from './app/finance-work'; export * from './app/centre-settings'; export * from './app/accounting-workspace'; export {default as Welcome} from './app/welcome';`,
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
// Only evaluates this repository's bundled test entry; no remote or user input.
// oxlint-disable-next-line typescript/no-implied-eval
new Function('require', 'module', 'exports', code)(
  require,
  compiled,
  compiled.exports,
);
const i = compiled.exports;
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const render = (locale, component, props = {}) =>
  renderToStaticMarkup(
    React.createElement(
      i.LanguageProvider,
      { initialLocale: locale },
      React.createElement(component, props),
    ),
  );
const record = (kind, id, payload) => ({
  kind,
  id,
  payload,
  revision: 1,
  classId: payload.classId || '',
  studentId: payload.studentId || '',
  date: payload.date || '',
  updatedAt: '',
});
const records = [
  record('class', 'c1', {
    name: 'BOH Dewey 1',
    color: '#4269e1',
    weekdays: [0, 3],
  }),
  record('student', 's1', {
    name: 'Nguyễn Test',
    status: 'Active',
    classId: 'c1',
    parent: 'Test Parent',
  }),
  record('membership', 'm1', {
    studentId: 's1',
    classId: 'c1',
    forecast: true,
  }),
  record('package', 'p1', {
    studentId: 's1',
    classId: 'c1',
    scope: 'all',
    sessions: 48,
    sourceRemaining: 24,
    sourcePaid: 12000000,
    agreedFee: 12000000,
    imported: true,
    startDate: '2026-06-01',
    sessionBaselineDate: '2026-09-09',
  }),
  record('receipt', 'r1', {
    studentId: 's1',
    packageId: 'p1',
    name: 'Test Parent',
    amount: 12000000,
    date: '2026-09-01',
    account: 'Company BIDV',
    purpose: 'Tuition',
  }),
  record('expense', 'e1', {
    date: '2026-09-02',
    amount: 1000000,
    category: 'Rent',
    account: 'Company BIDV',
    description: 'Original description',
  }),
];
const props = {
  snapshot: {
    actor: {
      role: 'Director',
      userId: 'test',
      name: 'Test Director',
      email: 'director@example.test',
      active: true,
      classIds: [],
    },
    records,
    members: [],
    activity: [],
    manifest: {
      sourceRefresh: { checkedAt: '2026-09-10', dataDate: '2026-09-09' },
    },
    loadedAt: '2026-09-10T00:00:00Z',
  },
  month: '2026-09',
  reviewDate: '2026-09-10',
  search: '',
  classFilter: '',
  setClassFilter() {},
  open() {},
  detail() {},
  navigate() {},
  save: async () => {},
};

test('locale parsing is allowlisted and preferences do not contain identity or account data', () => {
  assert.equal(i.parseLocale('vi'), 'vi');
  for (const value of ['en', 'fr', 'vi; role=Director', undefined, null])
    assert.equal(i.parseLocale(value), 'en');
  assert.equal(i.LANGUAGE_COOKIE, 'boh-language');
  const provider = readFileSync('app/language.tsx', 'utf8');
  assert.doesNotMatch(
    provider,
    /fetch\(|location\.(?:assign|replace)|router\.refresh|key=\{locale\}/,
  );
  assert.match(provider, /Max-Age=31536000/);
  assert.match(provider, /document\.documentElement\.lang = locale/);
});
test('Attendance opens with current students only for Director and TA in both languages', () => {
  const extra = [
    record('student', 'stopped', {
      name: 'Stopped archive fixture',
      status: 'Stopped',
      classId: 'c1',
    }),
    record('membership', 'stopped-m', {
      studentId: 'stopped',
      classId: 'c1',
      forecast: true,
    }),
    record('student', 'historical', {
      name: 'Old roster fixture',
      status: 'Roster only',
      classId: 'c1',
    }),
    record('membership', 'history-m', {
      studentId: 'historical',
      classId: 'c1',
      forecast: false,
    }),
  ];
  const snapshot = { ...props.snapshot, records: [...records, ...extra] };
  const before = JSON.stringify(snapshot.records);
  for (const role of ['Director', 'TA'])
    for (const locale of ['en', 'vi']) {
      const html = render(locale, i.Attendance, {
        ...props,
        snapshot: {
          ...snapshot,
          actor: { ...snapshot.actor, role, allClasses: true },
        },
      });
      assert.match(html, /Nguyễn Test/);
      assert.doesNotMatch(html, /Stopped archive fixture|Old roster fixture/);
      assert.match(
        html,
        locale === 'en' ? /Current students/ : /Học viên hiện tại/,
      );
    }
  assert.equal(JSON.stringify(snapshot.records), before);
});

test('Vietnamese messages preserve interpolation, whitespace and unknown original text', () => {
  assert.equal(
    i.translate('vi', '{count} students', { count: 5 }),
    '5 học viên',
  );
  assert.equal(i.translate('vi', ' students'), ' học viên');
  assert.equal(i.translate('en', 'Payment date / Ngày thu'), 'Payment date');
  assert.equal(
    i.translateMessage('vi', 'Please complete Student name / Họ tên.'),
    'Vui lòng điền: Họ và tên học viên.',
  );
  assert.equal(
    i.translateMessage('vi', 'Check amount.'),
    'Vui lòng kiểm tra số tiền.',
  );
  assert.equal(i.translate('vi', 'Nguyễn Test'), 'Nguyễn Test');
  assert.equal(
    i.translate('vi', 'Original custom note'),
    'Original custom note',
  );
  assert.equal(
    i.translate('vi', '{name} is required.', {
      name: '<script>example</script>',
    }),
    'Vui lòng nhập <script>example</script>.',
  );
});

test('cash formatting and package labels change presentation, not records or values', () => {
  assert.equal(i.formatMoney('en', 12000000), '12,000,000');
  assert.equal(i.formatMoney('vi', 12000000), '12.000.000');
  assert.equal(
    i.formatPackage('vi', { sessions: 48 }),
    '48 buổi học · 6 tháng',
  );
  assert.equal(
    i.formatPackage('en', { sessions: 48 }),
    '48 sessions · 6 months',
  );
  assert.match(i.formatMonth('vi', '2026-09'), /9.*2026/);
  assert.equal(i.formatMoney('vi', null), '—');
  const form = readFileSync('app/record-form.tsx', 'utf8');
  assert.match(form, /label: v \+ ' sessions'/);
  const sf = ts.createSourceFile('form.tsx', form, 99, true, ts.ScriptKind.TSX);
  function checkSetters(n) {
    if (ts.isCallExpression(n) && n.expression.getText(sf) === 'setData')
      assert.ok(
        !/\bt\(/.test(n.getText(sf)),
        'Translation must not enter a draft payload',
      );
    ts.forEachChild(n, checkSetters);
  }
  checkSetters(sf);
});

test('login and language controls render completely in either language', () => {
  const en = render('en', i.Welcome),
    vi = render('vi', i.Welcome);
  assert.match(en, /Work email/);
  assert.match(en, /Sign in to your workspace/);
  assert.match(vi, /Mật khẩu/);
  assert.doesNotMatch(vi, />Work email</);
  for (const html of [en, vi]) {
    assert.match(html, /English/);
    assert.match(html, /Tiếng Việt/);
    assert.match(html, /boh-navy\.svg/);
  }
  assert.match(vi, /lang="vi" aria-pressed="true"/);
});

test('badge colour and original student/class identity are identical in both languages', () => {
  for (const [status, tone] of [
    ['Overdue', 'red'],
    ['Paid', 'green'],
    ['Partial payment', 'amber'],
    ['Planned', 'blue'],
  ]) {
    assert.match(
      render('vi', i.Badge, { children: status }),
      new RegExp('badge ' + tone),
    );
    assert.match(
      render('en', i.Badge, { children: status }),
      new RegExp('badge ' + tone),
    );
  }
  assert.match(
    render('vi', i.ClassTag, { cl: { name: 'BOH Dewey 1', color: '#4269e1' } }),
    /Dewey 1/,
  );
  assert.match(
    render('vi', i.Picker, {
      value: 's1',
      label: 'Student',
      onChange() {},
      options: [{ id: 's1', label: 'Nguyễn Test' }],
    }),
    /Nguyễn Test/,
  );
});

test('every working screen renders in English and Vietnamese without mutating source data', () => {
  const before = JSON.stringify(props);
  for (const locale of ['en', 'vi'])
    for (const name of [
      'Overview',
      'Attendance',
      'Students',
      'Finance',
      'Renewals',
      'Packages',
      'Leads',
      'Team',
      'SourceRecords',
      'Payroll',
      'AccountantTasks',
      'CentreSettings',
      'Accounting',
    ]) {
      const html = render(locale, i[name], props);
      assert.ok(html.length > 100, name + ' ' + locale);
      assert.doesNotMatch(
        html,
        /\{p[1-9]\}|\{count\}/,
        name + ' unresolved interpolation',
      );
    }
  const student = render('vi', i.Students, props);
  assert.match(student, /Nguyễn Test/);
  assert.match(student, /48 buổi học · 6 tháng/);
  assert.doesNotMatch(
    student,
    />Current students<|>Student directory<|shown · balances/,
  );
  assert.equal(JSON.stringify(props), before);
});

test('all explicit UI translation keys have Vietnamese entries', () => {
  const dictionary = JSON.parse(readFileSync('lib/locales/vi.json', 'utf8'));
  const allowed = new Set([
    ' VND',
    'VND',
    'you@example.com',
    'BEN OXFORD HUB',
    'BOH',
    'Ben Oxford Hub',
  ]);
  const files = [
    ...readdirSync('app')
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => 'app/' + f),
    'app/change-password/page.tsx',
    ...['sidebar', 'sheet', 'dialog', 'combobox'].map(
      (f) => 'components/ui/' + f + '.tsx',
    ),
  ];
  const missing = [];
  for (const file of files) {
    const sf = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      99,
      true,
      ts.ScriptKind.TSX,
    );
    function walk(n) {
      if (
        ts.isCallExpression(n) &&
        n.expression.getText(sf) === 't' &&
        n.arguments[0] &&
        ts.isStringLiteral(n.arguments[0])
      ) {
        const key = n.arguments[0].text;
        if (
          !(key in dictionary) &&
          !(key.trim() in dictionary) &&
          !allowed.has(key)
        )
          missing.push(file + ': ' + key);
      }
      ts.forEachChild(n, walk);
    }
    walk(sf);
  }
  assert.deepEqual(missing, []);
  for (const [key, value] of Object.entries(dictionary))
    assert.deepEqual(
      [...key.matchAll(/\{(\w+)\}/g)]
        .map((m) => m[1])
        .sort((a, b) => a.localeCompare(b)),
      [...value.matchAll(/\{(\w+)\}/g)]
        .map((m) => m[1])
        .sort((a, b) => a.localeCompare(b)),
      'placeholder parity: ' + key,
    );
});
