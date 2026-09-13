import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const moduleUrl = (code) =>
  'data:text/javascript;base64,' +
  Buffer.from(
    ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    }).outputText,
  ).toString('base64');
const types = moduleUrl(readFileSync('lib/types.ts', 'utf8'));
const domain = moduleUrl(
  readFileSync('lib/domain.ts', 'utf8').replace(
    "from './types'",
    `from '${types}'`,
  ),
);
const { dailyWork } = await import(
  moduleUrl(
    readFileSync('lib/workspace-tasks.ts', 'utf8').replace(
      "from './domain'",
      `from '${domain}'`,
    ),
  )
);
const { allowedViews, workspaceAreas, areaFor } = await import(
  moduleUrl(readFileSync('lib/workspace-navigation.ts', 'utf8'))
);
const drafts = moduleUrl(readFileSync('lib/drafts.ts', 'utf8'));
const guard = moduleUrl(
  "export class AppError extends Error {constructor(m,status=400){super(m);this.status=status}}; export function requireRole(a,r){if(!a.active || !r.includes(a.role))throw new AppError('Denied',403)}",
);
const store = moduleUrl(
  'export async function storeCall(op,args){return {op,args}}',
);
const api = await import(
  moduleUrl(
    readFileSync('lib/drafts-server.ts', 'utf8')
      .replace("from './server'", `from '${guard}'`)
      .replace("from './storage'", `from '${store}'`)
      .replace("from './drafts'", `from '${drafts}'`),
  )
);
const r = (kind, id, payload) => ({
  kind,
  id,
  payload,
  revision: 1,
  date: payload.date || '',
  classId: payload.classId || '',
  studentId: payload.studentId || '',
  updatedAt: '',
});
const director = {
  role: 'Director',
  active: true,
  userId: 'director',
  name: 'Director',
  classIds: [],
};
test('five areas have unique views and fail-closed role destinations', () => {
  assert.deepEqual(
    workspaceAreas.map((a) => a.label),
    ['Today', 'People', 'Classes', 'Money', 'More'],
  );
  const all = workspaceAreas.flatMap((a) => [...a.views]);
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual(allowedViews('TA'), [
    'Today',
    'Attendance',
    'Import & export',
  ]);
  assert.equal(allowedViews('Finance').includes('Leads'), false);
  assert.equal(allowedViews('Finance').includes('My drafts'), true);
  assert.deepEqual(allowedViews('bogus'), []);
  assert.equal(areaFor('Accounting'), 'Money');
});
test('Today uses the current attendance membership, not a historical row for the same student', () => {
  const records = [
    r('class', 'c', { name: 'QA class', weekdays: [0, 3] }),
    r('student', 's', { name: 'QA student', status: 'Active' }),
    r('membership', 'm', {
      studentId: 's',
      classId: 'c',
      from: '2026-09-01',
      forecast: true,
    }),
    r('attendance', 'a', {
      studentId: 's',
      classId: 'c',
      membershipId: 'old',
      date: '2026-09-14',
      mark: 'P',
    }),
  ];
  const before = JSON.stringify(records);
  assert.equal(dailyWork(records, director, '2026-09-14')[0].count, 1);
  records[3].payload.membershipId = 'm';
  assert.equal(dailyWork(records, director, '2026-09-14')[0].count, 0);
  records[1].payload.status = 'Stopped';
  assert.deepEqual(dailyWork(records, director, '2026-09-14'), []);
  records[1].payload.status = 'Active';
  records[3].payload.membershipId = 'old';
  assert.equal(JSON.stringify(records), before);
  assert.deepEqual(
    dailyWork(records, { ...director, role: 'TA' }, '2026-09-14'),
    [],
  );
  assert.equal(
    dailyWork(
      records,
      { ...director, role: 'TA', allClasses: true },
      '2026-09-14',
    ).length,
    1,
  );
  assert.deepEqual(
    dailyWork(records, { ...director, active: false }, '2026-09-14'),
    [],
  );
});
test('older cash and payroll confirmation stay actionable, future and completed tasks do not', () => {
  const records = [
    r('expense', 'e', { date: '2026-08-31', amount: 100 }),
    r('receipt', 'f', { date: '2026-10-01', amount: 1 }),
    r('payroll', 'p', {
      month: '2026-09',
      name: 'QA payroll',
      status: 'Needs confirmation',
    }),
    r('task', 't', { title: 'Future', dueDate: '2026-10-01' }),
    r('task', 'd', { title: 'Done', status: 'Done' }),
    r('lead', 'l', {
      name: 'QA inquiry',
      status: 'New',
      followUp: '2026-09-01',
    }),
  ];
  const items = dailyWork(records, director, '2026-09-14');
  assert.equal(items.length, 3);
  assert.equal(
    items.find((i) => i.category === 'Reconciliation').target.month,
    '2026-08',
  );
  assert.equal(
    items.find((i) => i.category === 'Payroll').target.tab,
    'payroll',
  );
  assert.equal(
    dailyWork(records, { ...director, role: 'Finance' }, '2026-09-14').length,
    2,
  );
  assert.equal(
    dailyWork(records, { ...director, role: 'TA' }, '2026-09-14').length,
    0,
  );
});
test('draft API binds owner, scopes kinds and validates revisions without altering operational records', async () => {
  const input = {
    operation: 'save',
    id: crypto.randomUUID(),
    kind: 'receipt',
    payload: { data: { name: 'Unfinished' }, reason: '' },
    actorId: 'forged',
  };
  const result = await api.draftCommand(director, input);
  assert.equal(result.args.actorId, 'director');
  assert.equal(result.op, 'draft_save');
  for (const a of [
    { ...director, active: false },
    { ...director, role: 'TA' },
  ])
    assert.throws(
      () => api.draftCommand(a, input),
      (e) => e.status === 403,
    );
  assert.throws(
    () =>
      api.draftCommand(
        { ...director, role: 'Finance' },
        { ...input, kind: 'student' },
      ),
    (e) => e.status === 403,
  );
  for (const change of [
    { revision: 0 },
    { id: 'bad' },
    { recordRevision: -1 },
    { payload: { data: [], reason: '' } },
    { payload: { data: {}, reason: '', retry: { key: 'x', id: 'bad' } } },
  ])
    assert.throws(() => api.draftCommand(director, { ...input, ...change }));
  assert.equal((await api.listDrafts(director)).args.actorId, 'director');
});
