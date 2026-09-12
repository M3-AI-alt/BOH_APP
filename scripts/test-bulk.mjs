import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const fake = `export class StorageError extends Error{};
export const findRecord=async id=>globalThis.__bulk.records.find(r=>r.id===id)||null;
export const listRecords=async()=>globalThis.__bulk.records;
export const decodeRecord=r=>r;
export const storeCall=async(op,args)=>{
 if(op==='get_setting')return JSON.stringify({dataDate:'2026-09-09'});
 if(op!=='commit_record')throw Error('Unexpected write '+op);
 if(globalThis.__bulk.records.some(r=>r.id===args.record.id))throw Error('Record changed');
 if(globalThis.__bulk.fail===args.record.payload.entryKey)throw Error('Simulated interruption');
 const r={...args.record,revision:1,updatedAt:'test'};globalThis.__bulk.records.push(r);globalThis.__bulk.saved++;return r;
};`;
const built = await build({
  stdin: {
    contents:
      "export * from './lib/bulk';export * from './lib/bulk-server';export * from './lib/worksheet-file';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  packages: 'external',
  plugins: [
    {
      name: 'test-dependencies',
      setup(b) {
        b.onResolve(
          { filter: /^(cloudflare:workers|@boh\/private-import)$/ },
          (a) => ({ path: a.path, namespace: 'fake' }),
        );
        b.onResolve({ filter: /^\.\/storage$/ }, () => ({
          path: 'storage',
          namespace: 'fake',
        }));
        b.onResolve({ filter: /^\.\/password-auth$/ }, () => ({
          path: 'auth',
          namespace: 'fake',
        }));
        b.onLoad({ filter: /.*/, namespace: 'fake' }, (a) => ({
          contents:
            a.path === 'storage'
              ? fake
              : a.path === 'auth'
                ? 'export class AuthError extends Error{}; export const passwordActor=()=>{};'
                : a.path === 'cloudflare:workers'
                  ? 'export const env={};'
                  : 'export default {manifest:{},records:[]};',
          loader: 'js',
        }));
      },
    },
  ],
});
const module = { exports: {} };
const require = createRequire(import.meta.url);
new Function('require', 'module', 'exports', built.outputFiles[0].text)(
  require,
  module,
  module.exports,
);
const b = module.exports;
const actor = {
  userId: 'test',
  role: 'Director',
  active: true,
  classIds: [],
  allClasses: true,
};
const record = (kind, id, payload) => ({
  id,
  kind,
  payload,
  classId: payload.classId || '',
  studentId: payload.studentId || '',
  date: payload.date || '',
  revision: 1,
  updatedAt: '',
});
const setup = () =>
  (globalThis.__bulk = {
    saved: 0,
    records: [
      record('class', 'c1', {
        name: 'Class A',
        classId: 'c1',
        weekdays: [0, 3],
      }),
      record('student', 's1', {
        name: 'Student A',
        status: 'Active',
        classId: 'c1',
      }),
      record('membership', 'm1', {
        studentId: 's1',
        classId: 'c1',
        from: '2026-09-10',
        schedule: 'Regular',
      }),
      record('package', 'p1', {
        label: '48 sessions',
        studentId: 's1',
        sessions: 48,
        agreedFee: 12000000,
        startDate: '2026-09-10',
      }),
    ],
  });
const csv = (kind, items) => {
  const keys = b.bulkFields(kind).map((f) => f.key);
  return [keys, ...items.map((item) => keys.map((k) => item[k] ?? ''))]
    .map((r) =>
      r.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(','),
    )
    .join('\n');
};
const receipt = (key = 'cash-1') => ({
  entryKey: key,
  date: '2026-09-10',
  name: 'Parent',
  studentId: 'Student A',
  packageId: '48 sessions',
  amount: '1000000',
  account: 'Cash',
});
test('bulk preview validates real record rules and makes no writes', async () => {
  setup();
  const p = await b.bulkPreview(actor, 'receipt', csv('receipt', [receipt()]));
  assert.equal(p.rows[0].status, 'Ready');
  assert.equal(p.rows[0].payload.packageId, 'p1');
  assert.equal(globalThis.__bulk.saved, 0);
});
test('repeat and concurrent imports create each receipt only once', async () => {
  setup();
  const data = csv('receipt', [receipt()]);
  const p = await b.bulkPreview(actor, 'receipt', data);
  await Promise.all([
    b.bulkCommit(actor, 'receipt', data, p.digest),
    b.bulkCommit(actor, 'receipt', data, p.digest),
  ]);
  assert.equal(globalThis.__bulk.saved, 1);
  const again = await b.bulkPreview(actor, 'receipt', data);
  assert.equal(again.rows[0].status, 'Already imported');
});
test('changed content under an existing import reference cannot overwrite', async () => {
  setup();
  const data = csv('receipt', [receipt()]);
  const p = await b.bulkPreview(actor, 'receipt', data);
  await b.bulkCommit(actor, 'receipt', data, p.digest);
  const p2 = await b.bulkPreview(
    actor,
    'receipt',
    csv('receipt', [{ ...receipt(), amount: '2000000' }]),
  );
  assert.equal(p2.rows[0].status, 'Needs correction');
  assert.equal(globalThis.__bulk.saved, 1);
});
test('partial interruption exposes failed rows and retry skips saved rows', async () => {
  setup();
  const data = csv('receipt', [receipt('one'), receipt('two')]);
  const p = await b.bulkPreview(actor, 'receipt', data);
  globalThis.__bulk.fail = 'two';
  const result = await b.bulkCommit(actor, 'receipt', data, p.digest);
  assert.deepEqual(
    result.rows.map((r) => r.status),
    ['Saved', 'Needs correction'],
  );
  globalThis.__bulk.fail = '';
  await b.bulkCommit(actor, 'receipt', data, p.digest);
  assert.equal(globalThis.__bulk.saved, 2);
});
test('TA and finance import/export authorization fails closed', async () => {
  setup();
  for (const role of ['TA', 'Finance'])
    await assert.rejects(
      b.bulkPreview({ ...actor, role }, 'student', csv('student', [])),
      /role/,
    );
  await assert.rejects(
    b.exportRecords({ ...actor, role: 'TA' }, 'receipt'),
    /role/,
  );
  await assert.rejects(
    b.bulkPreview({ ...actor, active: false }, 'receipt', ''),
    /role/,
  );
  const refs = await b.referenceCsv({ ...actor, role: 'TA' });
  assert.ok(!refs.includes('48 sessions'));
});
test('unknown fields, formula cells, ambiguous amounts, invalid dates and payroll approval are blocked', () => {
  for (const item of [
    { ...receipt(), amount: '1,000,000' },
    { ...receipt(), date: '2026-02-30' },
    { ...receipt(), name: '=HYPERLINK("bad")' },
  ])
    assert.throws(() => b.parseEntry('receipt', item));
  assert.throws(
    () => b.worksheetRows('entryKey,name,admin\nx,Test,true', 'student'),
    /Unknown/,
  );
  assert.throws(
    () =>
      b.parseEntry('payroll', {
        entryKey: 'a',
        month: '2026-09',
        name: 'Teacher',
        gross: '1',
        deductions: '0',
        status: 'Approved',
      }),
    /Draft/,
  );
});
test('closed month rejects through shared server checks', async () => {
  setup();
  globalThis.__bulk.records.push(
    record('close', 'close:2026-09', { status: 'Closed' }),
  );
  const p = await b.bulkPreview(actor, 'receipt', csv('receipt', [receipt()]));
  assert.equal(p.rows[0].status, 'Needs correction');
  assert.match(p.rows[0].error, /closed/);
});
test('duplicate worksheet references and edited preview digest block commits', async () => {
  setup();
  const data = csv('receipt', [receipt(), receipt()]);
  const p = await b.bulkPreview(actor, 'receipt', data);
  assert.equal(p.rows[1].status, 'Needs correction');
  await b.bulkCommit(actor, 'receipt', data, p.digest);
  assert.equal(globalThis.__bulk.saved, 0);
  await assert.rejects(
    b.bulkCommit(actor, 'receipt', data, 'forged'),
    /changed/,
  );
});
test('attendance resolves membership and preserves stopped-student guard', async () => {
  setup();
  const row = {
    entryKey: 'lesson',
    studentId: 's1',
    classId: 'c1',
    date: '2026-09-10',
    mark: 'P',
  };
  let p = await b.bulkPreview(
    { ...actor, role: 'TA' },
    'attendance',
    csv('attendance', [row]),
  );
  assert.equal(p.rows[0].status, 'Ready');
  globalThis.__bulk.records.find((r) => r.id === 's1').payload.status =
    'Stopped';
  p = await b.bulkPreview(
    { ...actor, role: 'TA' },
    'attendance',
    csv('attendance', [row]),
  );
  assert.equal(p.rows[0].status, 'Needs correction');
});
test('exports use safe CSV text and include all permitted records', async () => {
  setup();
  globalThis.__bulk.records.push(
    record('lead', 'l', { name: '=bad', status: 'New' }),
  );
  const text = await b.exportRecords(actor, 'lead');
  assert.ok(text.includes("'=bad"));
  assert.ok(text.includes('revision'));
});
test('Excel template headers match live fields; samples are not in Entry', async () => {
  for (const kind of Object.keys(b.bulkTasks)) {
    const path = 'public/templates/BOH-' + kind + '.xlsx';
    assert.ok(fs.existsSync(path), path);
    // Read-only exercise of the production decoder with an empty template.
    const text = await b.readWorksheet(
      fs.readFileSync(path).toString('base64'),
    );
    assert.equal(
      text,
      b
        .bulkFields(kind)
        .map((f) => '"' + f.key + '"')
        .join(','),
    );
    assert.ok(!text.includes('EXAMPLE-001'));
  }
});
test('invalid and oversized Excel archives are rejected', () => {
  assert.throws(() => b.checkXlsxArchive(Buffer.alloc(22)), /Invalid/);
  assert.throws(() => b.checkXlsxArchive(Buffer.alloc(2000001)), /smaller/);
});
test('filled Excel template retains Unicode, amounts and text dates', async () => {
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(
    fs.readFileSync('public/templates/BOH-receipt.xlsx'),
  );
  const path = 'xl/worksheets/sheet1.xml';
  let xml = await zip.file(path).async('string');
  for (const [col, value] of Object.entries({
    A: 'TEST-001',
    B: '2026-09-10',
    C: 'Nguyễn Test',
    G: '12000000',
  })) {
    xml = xml.replace(
      new RegExp(`<x:c r="${col}2"[^>]*/>`),
      `<x:c r="${col}2" t="str"><x:v>${value}</x:v></x:c>`,
    );
  }
  zip.file(path, xml);
  const text = await b.readWorksheet(
    await zip.generateAsync({ type: 'base64' }),
  );
  const rows = b.worksheetRows(text, 'receipt');
  assert.equal(rows[0].name, 'Nguyễn Test');
  assert.equal(rows[0].amount, '12000000');
  assert.equal(rows[0].date, '2026-09-10');
});
