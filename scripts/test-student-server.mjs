import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
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
const types = moduleUrl(fs.readFileSync('lib/types.ts', 'utf8'));
const domain = moduleUrl(
  fs
    .readFileSync('lib/domain.ts', 'utf8')
    .replaceAll("from './types'", `from '${types}'`),
);
const storage = moduleUrl(
  `export class StorageError extends Error{};export const findRecord=async id=>globalThis.__serverQA.records.find(r=>r.id===id)||null;export const listRecords=async()=>globalThis.__serverQA.records;export const decodeRecord=r=>r;export const storeCall=async(op,args)=>{globalThis.__serverQA.calls.push({op,args});if(op==='commit_record')return {...args.record,revision:2};if(op==='list_records')return (globalThis.__serverQA.sourceRows||[]).slice(args.offset||0,(args.offset||0)+args.limit);if(op==='get_setting')return JSON.stringify({dataDate:'2026-09-09'});return {ok:true};};`,
);
const code = fs
  .readFileSync('lib/server.ts', 'utf8')
  .replaceAll("from './types'", `from '${types}'`)
  .replaceAll("from './domain'", `from '${domain}'`)
  .replaceAll("from './storage'", `from '${storage}'`)
  .replace("import { env } from 'cloudflare:workers';", 'const env={};')
  .replace(
    "import { getChatGPTUser } from '@/app/chatgpt-auth';",
    'const getChatGPTUser=async()=>null;',
  )
  .replace(
    "import imported from '@boh/private-import';",
    'const imported={manifest:{},records:[]};',
  );
const server = await import(moduleUrl(code));
const actor = {
  userId: 'test',
  role: 'Director',
  active: true,
  classIds: [],
  name: 'Test',
  email: 'test@example.test',
};
const st = {
  id: 'student-test',
  kind: 'student',
  classId: '',
  studentId: '',
  date: '',
  revision: 1,
  payload: {
    name: 'Test Student',
    status: 'Active',
    classId: 'c1',
    source: 'original source',
  },
  updatedAt: '',
};
const setup = () =>
  (globalThis.__serverQA = {
    records: [
      structuredClone(st),
      {
        id: 'c1',
        kind: 'class',
        classId: 'c1',
        payload: { name: 'Test class' },
      },
    ],
    calls: [],
  });
test('source version filtering happens before the result limit and source data is denied to TAs', async () => {
  const state = setup();
  state.sourceRows = Array.from({ length: 905 }, (_, i) => ({
    id: String(i),
    payload: { book: i < 900 ? 'Old.xlsx' : 'Latest.xlsx' },
  }));
  const rows = await server.sourceRows(actor, 'Class', 'Latest.xlsx');
  assert.equal(rows.length, 5);
  assert.equal(state.calls.filter((c) => c.op === 'list_records').length, 2);
  await assert.rejects(
    server.sourceRows({ ...actor, role: 'TA' }, '', 'Latest.xlsx'),
    /role|access|allowed/i,
  );
});
test('existing package ownership and class membership identity cannot be reassigned', async () => {
  for (const kind of ['package', 'membership']) {
    const state = setup();
    const old = {
      id: 'record',
      kind,
      studentId: st.id,
      classId: 'c1',
      date: '',
      revision: 1,
      payload: { studentId: st.id, classId: 'c1' },
    };
    state.records.push(old, { ...st, id: 'other' });
    await assert.rejects(
      server.saveRecord(actor, {
        kind,
        id: 'record',
        revision: 1,
        payload: { studentId: 'other' },
      }),
      /cannot|reassigned/,
    );
    assert.equal(state.calls.length, 0);
  }
});
test('source lesson linking is Director-only and forwards only bounded identifiers', async () => {
  setup();
  for (const role of ['Finance', 'TA'])
    await assert.rejects(
      server.linkStudentRecord(
        { ...actor, role },
        {
          id: 'source',
          studentId: st.id,
          revision: 1,
          reason: 'Verified roster',
        },
      ),
      (e) => e.status === 403,
    );
  await server.linkStudentRecord(actor, {
    id: 'source',
    studentId: st.id,
    revision: 1,
    reason: 'Verified roster',
    amount: 999,
    actorId: 'forged',
  });
  const call = globalThis.__serverQA.calls.at(-1);
  assert.equal(call.op, 'link_student_record');
  assert.equal(call.args.actorId, actor.userId);
  assert.equal(call.args.amount, undefined);
});
test('profile saves added contact/learning fields, preserves source and does not create false transfer', async () => {
  setup();
  const result = await server.saveRecord(actor, {
    kind: 'student',
    id: st.id,
    revision: 1,
    payload: {
      ...st.payload,
      preferredName: 'Star',
      birthDate: '2017-02-02',
      parentEmail: 'parent@example.test',
      secondPhone: '0900000000',
      learningGoals: 'Speaking confidence',
      role: 'Director',
      source: 'forged',
    },
  });
  assert.equal(result.payload.preferredName, 'Star');
  assert.equal(result.payload.learningGoals, 'Speaking confidence');
  assert.equal(result.payload.source, 'original source');
  assert.equal(result.payload.role, undefined);
  assert.equal(globalThis.__serverQA.calls.at(-1).args.transferDate, null);
});
test('invalid contact fields and direct lifecycle bypass are rejected', async () => {
  for (const payload of [
    { parentEmail: 'bad-email' },
    { birthDate: '2099-01-01' },
    { pauseFrom: '2026-09-20', resumeDate: '2026-09-15' },
    { status: 'Archived' },
  ]) {
    setup();
    await assert.rejects(
      server.saveRecord(actor, {
        kind: 'student',
        id: st.id,
        revision: 1,
        payload: { ...st.payload, ...payload },
      }),
    );
    assert.equal(globalThis.__serverQA.calls.length, 0);
  }
});
test('finance and TA cannot edit profiles or call lifecycle operations', async () => {
  for (const role of ['Finance', 'TA']) {
    setup();
    await assert.rejects(
      server.saveRecord(
        { ...actor, role },
        { kind: 'student', id: st.id, revision: 1, payload: st.payload },
      ),
      (e) => e.status === 403,
    );
    await assert.rejects(
      server.studentAction(
        { ...actor, role },
        { id: st.id, action: 'archive', revision: 1, reason: 'Test' },
      ),
      (e) => e.status === 403,
    );
  }
});
test('lifecycle needs a reason and revision and passes a bounded command to the store', async () => {
  setup();
  await assert.rejects(
    server.studentAction(actor, {
      id: st.id,
      action: 'archive',
      revision: 1,
      reason: '',
    }),
  );
  await assert.rejects(
    server.studentAction(actor, {
      id: st.id,
      action: 'delete',
      reason: 'Test',
    }),
  );
  await server.studentAction(actor, {
    id: st.id,
    action: 'archive',
    revision: 1,
    reason: 'Test',
  });
  assert.equal(globalThis.__serverQA.calls.at(-1).op, 'student_action');
  assert.equal(globalThis.__serverQA.calls.at(-1).args.expectedRevision, 1);
});
