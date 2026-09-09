import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const moduleUrl = (text) =>
  'data:text/javascript;base64,' +
  Buffer.from(
    ts.transpileModule(text, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    }).outputText,
  ).toString('base64');
const types = moduleUrl(readFileSync('lib/types.ts', 'utf8'));
const d = await import(
  moduleUrl(
    readFileSync('lib/domain.ts', 'utf8').replace(
      "from './types'",
      `from '${types}'`,
    ),
  )
);
const r = (kind, id, payload) => ({
  id,
  kind,
  payload,
  classId: payload.classId || '',
  studentId: payload.studentId || '',
  date: payload.date || '',
  revision: 1,
  updatedAt: '',
});
const base = [
  r('student', 's', { name: 'Test Student', status: 'Active', classId: 'c' }),
  r('class', 'c', { name: 'Test Class', weekdays: [0, 2], color: '#4269e1' }),
  r('membership', 'm', {
    studentId: 's',
    classId: 'c',
    schedule: 'Regular',
    forecast: true,
  }),
  r('package', 'p', {
    studentId: 's',
    classId: 'c',
    scope: 'all',
    imported: true,
    sessions: 24,
    sourceRemaining: 2,
    sourcePaid: 600,
    agreedFee: 600,
    startDate: '2026-08-01',
  }),
];
test('source balances are authoritative and not rewritten by historical marks', () => {
  assert.equal(
    d
      .getPackageBalances(
        [
          ...base,
          r('attendance', 'old', {
            studentId: 's',
            classId: 'c',
            date: '2026-09-01',
            mark: 'C',
            historical: true,
          }),
        ],
        '2026-09-08',
      )
      .remaining.get('p'),
    2,
  );
});
test('present and late consume; absence and support do not', () => {
  const events = ['P', 'T', 'A'].map((mark, i) =>
    r('attendance', 'a' + i, {
      studentId: 's',
      classId: 'c',
      date: '2026-09-' + (9 + i).toString().padStart(2, '0'),
      mark,
    }),
  );
  const b = d.getPackageBalances(
    [
      ...base,
      ...events,
      r('support', 'support', {
        studentId: 's',
        classId: 'c',
        date: '2026-09-10',
        status: 'Completed',
      }),
    ],
    '2026-09-15',
  );
  assert.equal(b.remaining.get('p'), 0);
  assert.equal(b.overrun.size, 0);
});
test('new absence makeup consumes once; historical L makeup not deducted twice', () => {
  const records = [
    ...base,
    r('attendance', 'absence', {
      studentId: 's',
      classId: 'c',
      date: '2026-09-09',
      mark: 'A',
    }),
    r('makeup', 'makeup:absence', {
      studentId: 's',
      classId: 'c',
      date: '2026-09-10',
      absenceId: 'absence',
      status: 'Completed',
    }),
    r('attendance', 'legacy', {
      studentId: 's',
      classId: 'c',
      date: '2026-09-01',
      mark: 'L',
      historical: true,
    }),
    r('makeup', 'makeup:legacy', {
      studentId: 's',
      classId: 'c',
      date: '2026-09-10',
      absenceId: 'legacy',
      status: 'Completed',
    }),
  ];
  assert.equal(
    d.getPackageBalances(records, '2026-09-10').remaining.get('p'),
    1,
  );
});
test('partial and later payments preserve historical balances', () => {
  const pkg = {
      id: 'new',
      studentId: 's',
      sessions: 24,
      agreedFee: 1000,
      startDate: '2026-08-01',
    },
    receipts = [
      { date: '2026-08-05', amount: 400, packageId: 'new' },
      { date: '2026-09-05', amount: 600, packageId: 'new' },
    ];
  assert.equal(d.packagePaid(pkg, receipts, '2026-08-31'), 400);
  assert.equal(d.packagePaid(pkg, receipts, '2026-09-30'), 1000);
});
test('family collection counted once with two identified students', () => {
  const records = [
    r('receipt', 'family', {
      date: '2026-09-09',
      month: '2026-09',
      amount: 1000,
      allocations: [
        { studentId: 's', packageId: 'p', amount: 400 },
        { studentId: 's2', packageId: 'p2', amount: 600 },
      ],
    }),
  ];
  assert.equal(d.cashSummary(records, '2026-09', '2026-09-30').collected, 1000);
  assert.equal(
    d.cashSummary(records, '2026-09', '2026-09-30').payerIds.length,
    2,
  );
});
test('advance-paid package is included in coverage, with no guessed price', () => {
  const records = [
    ...base,
    r('package', 'future', {
      studentId: 's',
      scope: 'all',
      sessions: 24,
      startDate: '2026-09-16',
      agreedDate: '2026-09-08',
      agreedFee: 600,
    }),
    r('receipt', 'prepay', {
      date: '2026-09-08',
      month: '2026-09',
      studentId: 's',
      packageId: 'future',
      amount: 600,
    }),
  ];
  const student = d.studentReview(records, '2026-09-08')[0];
  assert.equal(student.advanceCovered, true);
  assert.equal(student.packages.length, 2);
  assert.equal(student.due, 0);
  assert.ok(student.expectedDate > '2026-09-30');
});
test('a distant future package does not hide an earlier coverage gap', () => {
  const records = [
    ...base,
    r('package', 'future', {
      studentId: 's',
      scope: 'all',
      sessions: 24,
      startDate: '2026-11-01',
      agreedDate: '2026-09-08',
      agreedFee: 600,
    }),
  ];
  assert.equal(
    d.studentReview(records, '2026-09-08')[0].expectedDate,
    '2026-09-14',
  );
});
test('a class-specific package cannot cover another class', () => {
  const records = base.map((x) =>
    x.kind === 'package'
      ? r('package', 'p', { ...x.payload, scope: 'class', classId: 'another' })
      : x,
  );
  assert.equal(
    d.studentReview(records, '2026-09-08')[0].expectedDate,
    '2026-09-08',
  );
});
test('holidays and pauses change schedule without changing actual history', () => {
  const records = [
    ...base,
    r('calendar', 'holiday', { classId: 'c', date: '2026-09-09', open: false }),
  ];
  assert.deepEqual(
    d.scheduledDates(records, 'c', '2026-09-09', '2026-09-16', {
      pauseFrom: '2026-09-14',
      resumeDate: '2026-09-16',
    }),
    ['2026-09-16'],
  );
});
test('paused without resume date has no renewal prediction', () => {
  const records = base.map((x) =>
    x.kind === 'student'
      ? r('student', 's', { ...x.payload, status: 'Paused' })
      : x,
  );
  assert.equal(d.studentReview(records, '2026-09-08')[0].expectedDate, null);
});
test('TA response excludes money, payroll, leads and student contacts', () => {
  const actor = { role: 'TA', classIds: ['c'], active: true };
  const data = d.allowedRecords(actor, [
    ...base,
    r('payroll', 'pay', { name: 'Secret salary' }),
    r('lead', 'lead', { name: 'Private lead' }),
    r('student', 'other', { name: 'Other', classId: 'other' }),
    r('receipt', 'receipt', { amount: 1000 }),
  ]);
  assert.ok(
    !data.some((x) =>
      ['package', 'receipt', 'payroll', 'lead'].includes(x.kind),
    ),
  );
  assert.ok(!data.some((x) => x.id === 'other'));
  assert.equal(d.canWrite(actor, 'expense'), false);
  assert.equal(d.canWrite(actor, 'attendance', 'c'), true);
  assert.equal(d.canWrite(actor, 'attendance', 'other'), false);
});
test('Finance can manage payroll and tasks but not team or attendance', () => {
  const a = { role: 'Finance', classIds: [], active: true };
  assert.equal(d.canWrite(a, 'payroll'), true);
  assert.equal(d.canWrite(a, 'task'), true);
  assert.equal(d.canWrite(a, 'attendance', 'c'), false);
  assert.equal(
    d.allowedRecords(a, [r('lead', 'lead', { name: 'Lead' })]).length,
    0,
  );
});
test('pre-cutoff imported debt is unknown, never invented as overdue', () => {
  const student = d.studentReview(base, '2026-08-31')[0];
  assert.equal(student.packages[0].balance, null);
  assert.equal(student.status, 'Historical balance unavailable');
});
