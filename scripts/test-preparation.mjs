import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';
import fs from 'node:fs';
const built = await build({
  stdin: {
    contents:
      "export * from './lib/preparation-schema.mjs'; export * from './lib/preparation-review';export * from './lib/preparation-file';export * from './lib/worksheet-file';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  packages: 'external',
});
const mod = { exports: {} };
// Execute only the locally bundled, trusted test subject; no user-supplied code.
// eslint-disable-next-line typescript/no-implied-eval
new Function('require', 'module', 'exports', built.outputFiles[0].text)(
  createRequire(import.meta.url),
  mod,
  mod.exports,
);
const p = mod.exports;
const key = 'TEST-ONLY-not-a-real-key';
const record = (kind, id, payload) => ({
  kind,
  id,
  payload,
  revision: 1,
  updatedAt: '2026-09-13T00:00:00Z',
  date: payload.date || '',
  studentId: payload.studentId || '',
  classId: '',
});
const records = [
  record('student', 's1', { name: 'NGUYỄN AN', status: 'Active' }),
  record('receipt', 'r1', {
    name: 'Family A',
    date: '2026-08-01',
    amount: 100,
    account: 'Company BIDV',
  }),
  record('class', 'c1', { name: 'BOH Class' }),
];
const baseline = () =>
  p.buildPreparation({
    records,
    capturedAt: '2026-09-13T00:00:00Z',
    fingerprint: 'test',
  });
const submissions = (b) =>
  Object.fromEntries(
    p.preparationModules.map((m) => [
      m.key,
      b.tables[m.key].rows.map((r, i) => ({
        ref: r.ref,
        line: 7 + i,
        cells: {},
      })),
    ]),
  );
function workbook(b) {
  const w = new ExcelJS.Workbook();
  for (const m of p.preparationModules) {
    const s = w.addWorksheet(m.sheet);
    const f = p.prepColumns(m);
    s.getRow(6).values = f.map((f) => f.label);
    b.tables[m.key].rows.forEach((r, i) => {
      s.getRow(i + 7).values = f.map((f) =>
        f.key === '_ref'
          ? r.ref
          : f.key.startsWith('original.')
            ? (r.original[f.key.slice(9)] ?? '')
            : '',
      );
    });
  }
  const canonical = JSON.stringify(b),
    meta = w.addWorksheet('_BOH_PREP');
  meta.getCell('B1').value = b.version;
  meta.getCell('B2').value = p.preparationSignature(canonical, key);
  meta.getCell('B3').value = Math.ceil(canonical.length / 16000);
  for (let i = 0; i < canonical.length; i += 16000)
    meta.getCell('A' + (4 + i / 16000)).value = canonical.slice(i, i + 16000);
  return w;
}
const encode = async (w) =>
  Buffer.from(await w.xlsx.writeBuffer()).toString('base64');
test('prefill preserves existing identities, amounts and bank evidence', () => {
  const b = baseline();
  assert.equal(b.tables.students.rows[0].recordId, 's1');
  assert.equal(b.tables.receipts.rows[0].original.amount, 100);
  assert.equal(b.controlTotals.augustCollections, 100);
  assert.equal(b.tables.students.rows[0].original.name, 'NGUYỄN AN');
});
test('new preparation setup is internal-only and old signed labels stay readable', async () => {
  const b = baseline();
  const labels = b.tables.company.rows
    .map((r) => r.original.name || '')
    .join('\n');
  assert.doesNotMatch(labels, /MISA|API|XML|ký số|khai thuế/iu);
  // Historical signed workbooks remain evidence; never rewrite their protected cells.
  b.tables.company.rows[0].original.name = 'Nguồn dữ liệu MISA / kỳ còn thiếu';
  const parsed = await p.parsePreparationFile(await encode(workbook(b)), key);
  assert.equal(
    parsed.baseline.tables.company.rows[0].original.name,
    b.tables.company.rows[0].original.name,
  );
  assert.equal(
    p.reviewPreparation(parsed.baseline, parsed.submissions, records)
      .financialChanges,
    0,
  );
});
test('blank cells never delete, zero or create records', () => {
  const b = baseline(),
    before = JSON.stringify(records),
    r = p.reviewPreparation(b, submissions(b), records);
  assert.equal(r.counts.Addition, undefined);
  assert.equal(r.financialChanges, 0);
  assert.ok(r.unreviewed > 0);
  assert.equal(JSON.stringify(records), before);
});
test('corrections remain proposals and require an explanation', () => {
  const b = baseline(),
    s = submissions(b);
  s.receipts[0].cells = { review: 'Bổ sung / đề nghị sửa', amount: 90 };
  let r = p
    .reviewPreparation(b, s, records)
    .rows.find((r) => r.recordId === 'r1');
  assert.equal(r.status, 'Needs information');
  s.receipts[0].cells.reason = 'Source typo';
  r = p.reviewPreparation(b, s, records).rows.find((r) => r.recordId === 'r1');
  assert.equal(r.status, 'Proposed correction');
  assert.equal(r.original.amount, 100);
});
test('unchanged and deleted source records detect revision conflicts', () => {
  const b = baseline();
  let r = p.reviewPreparation(
    b,
    submissions(b),
    records.map((r) => (r.id === 'r1' ? { ...r, revision: 2 } : r)),
  );
  assert.equal(r.rows.find((r) => r.recordId === 'r1').status, 'Conflict');
  r = p.reviewPreparation(
    b,
    submissions(b),
    records.filter((r) => r.id !== 'r1'),
  );
  assert.equal(r.rows.find((r) => r.recordId === 'r1').status, 'Conflict');
});
test('zero is explicit, unknown is not silently zero', () => {
  const b = baseline(),
    s = submissions(b);
  s.budgets[0].cells = {
    review: 'Chưa rõ',
    month: '2026-09',
    category: 'Rent',
  };
  let r = p
    .reviewPreparation(b, s, records)
    .rows.find((r) => r.module === 'budgets');
  assert.equal(r.status, 'Needs information');
  assert.equal(r.proposed.amount, undefined);
  s.budgets[0].cells = {
    review: 'Bổ sung / đề nghị sửa',
    month: '2026-09',
    category: 'Rent',
    amount: 0,
  };
  r = p
    .reviewPreparation(b, s, records)
    .rows.find((r) => r.module === 'budgets');
  assert.equal(r.status, 'Addition');
  assert.equal(r.proposed.amount, 0);
});
test('invalid dates, personal source accounts and numeric bank IDs are flagged', () => {
  const b = baseline(),
    s = submissions(b);
  s.receipts[1].cells = {
    review: 'Bổ sung / đề nghị sửa',
    name: 'Parent',
    date: '2026-02-30',
    amount: 50,
    account: 'Thao personal VCB',
  };
  s.accounts[2].cells = { review: 'Bổ sung / đề nghị sửa', number: 123456 };
  const r = p.reviewPreparation(b, s, records);
  assert.equal(
    r.rows.find((r) => r.ref === s.receipts[1].ref).status,
    'Invalid',
  );
  assert.equal(
    r.rows.find((r) => r.ref === s.accounts[2].ref).status,
    'Invalid',
  );
});
test('family allocation cannot exceed the one receipt', () => {
  const b = baseline(),
    s = submissions(b);
  s.allocations[0].cells = {
    review: 'Bổ sung / đề nghị sửa',
    receiptRef: s.receipts[0].ref,
    studentRef: s.students[0].ref,
    amount: 70,
    purpose: 'Học phí',
  };
  s.allocations[1].cells = { ...s.allocations[0].cells, amount: 60 };
  const r = p.reviewPreparation(b, s, records);
  assert.equal(
    r.rows.filter((r) => r.module === 'allocations' && r.status === 'Invalid')
      .length,
    2,
  );
  assert.equal(r.financialChanges, 0);
});
test('unused reference slots cannot masquerade as families or employees', () => {
  const b = baseline(),
    s = submissions(b);
  s.students[0].cells = {
    review: 'Bổ sung / đề nghị sửa',
    familyRef: s.families[0].ref,
    reason: 'New family link',
  };
  const r = p.reviewPreparation(b, s, records);
  assert.equal(
    r.rows.find((r) => r.recordId === 's1').status,
    'Needs information',
  );
});
test('allocation review includes existing allocations and cannot discard them with Not applicable', () => {
  const source = records.map((r) =>
    r.id === 'r1'
      ? {
          ...r,
          payload: {
            ...r.payload,
            allocations: [{ studentId: 's1', amount: 80 }],
          },
        }
      : r,
  );
  const b = p.buildPreparation({
      records: source,
      capturedAt: '2026-09-13T00:00:00Z',
      fingerprint: 'test',
    }),
    s = submissions(b);
  s.allocations[1].cells = {
    review: 'Bổ sung / đề nghị sửa',
    receiptRef: s.receipts[0].ref,
    studentRef: s.students[0].ref,
    amount: 50,
    purpose: 'Học phí',
  };
  let r = p.reviewPreparation(b, s, source);
  assert.equal(
    r.rows.find((r) => r.ref === s.allocations[1].ref).status,
    'Invalid',
  );
  s.allocations[0].cells = { review: 'Không áp dụng' };
  r = p.reviewPreparation(b, s, source);
  assert.equal(
    r.rows.find((r) => r.ref === s.allocations[1].ref).status,
    'Invalid',
  );
  s.allocations[1].cells.amount = 20;
  r = p.reviewPreparation(b, s, source);
  assert.equal(
    r.rows.find((r) => r.ref === s.allocations[1].ref).status,
    'Addition',
  );
});
test('signed XLSX parses with all original rows and excludes example sheets', async () => {
  const b = baseline(),
    w = workbook(b);
  w.addWorksheet('Ví dụ').getCell('A1').value = 'Example only';
  const parsed = await p.parsePreparationFile(await encode(w), key);
  assert.equal(parsed.baseline.sourceFingerprint, 'test');
  assert.equal(
    parsed.submissions.students.length,
    b.tables.students.rows.length,
  );
});
test('changed baseline, original value, duplicated or removed rows fail closed', async () => {
  let w = workbook(baseline());
  w.getWorksheet('_BOH_PREP').getCell('B2').value = '0'.repeat(64);
  await assert.rejects(
    p.parsePreparationFile(await encode(w), key),
    /baseline was changed/,
  );
  w = workbook(baseline());
  w.getWorksheet('Thu tiền').getCell('D7').value = 999;
  await assert.rejects(
    p.parsePreparationFile(await encode(w), key),
    /protected source/,
  );
  w = workbook(baseline());
  w.getWorksheet('Thu tiền').getCell('A8').value = w
    .getWorksheet('Thu tiền')
    .getCell('A7').value;
  await assert.rejects(
    p.parsePreparationFile(await encode(w), key),
    /duplicate/,
  );
  w = workbook(baseline());
  w.getWorksheet('Thu tiền').spliceRows(7, 1);
  await assert.rejects(p.parsePreparationFile(await encode(w), key), /removed/);
});
test('formula entry and the add-only import path reject prefilled workbooks', async () => {
  const w = workbook(baseline());
  await assert.rejects(
    p.readWorksheet(await encode(w)),
    /Accountant preparation review/,
  );
  const m = p.preparationModules.find((m) => m.key === 'receipts'),
    index = p.prepColumns(m).findIndex((f) => f.key === 'amount') + 1;
  w.getWorksheet(m.sheet).getCell(8, index).value = {
    formula: '1+1',
    result: 2,
  };
  await assert.rejects(
    p.parsePreparationFile(await encode(w), key),
    /plain values/,
  );
});
if (process.env.BOH_PREPARATION_FILE)
  test('actual handover workbook signature, source cells, protections and choices round trip', async () => {
    const vars = Object.fromEntries(
      fs
        .readFileSync('.dev.vars', 'utf8')
        .split(/\r?\n/)
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [
          l.slice(0, l.indexOf('=')),
          l.slice(l.indexOf('=') + 1).replace(/^(["'])(.*)\1$/, '$2'),
        ]),
    );
    const bytes = fs.readFileSync(process.env.BOH_PREPARATION_FILE),
      base64 = bytes.toString('base64');
    const parsed = await p.parsePreparationFile(
      base64,
      vars.SUPABASE_SECRET_KEY,
    );
    assert.equal(parsed.baseline.tables.students.existingCount, 205);
    assert.equal(parsed.baseline.controlTotals.augustCollections, 200295000);
    const w = await p.loadBoundedWorkbook(base64);
    assert.equal(w.getWorksheet('_BOH_PREP').state, 'veryHidden');
    for (const m of p.preparationModules) {
      const sheet = w.getWorksheet(m.sheet),
        cols = p.prepColumns(m),
        i = cols.findIndex((f) => f.key === 'review') + 1;
      assert.equal(sheet.sheetProtection.sheet, true, m.sheet);
      assert.equal(
        sheet.getCell(7, i).protection.locked,
        false,
        m.sheet + ' review cell must be editable',
      );
      assert.notEqual(
        sheet.getCell('A7').protection?.locked,
        false,
        m.sheet + ' stable reference must stay locked',
      );
      assert.equal(sheet.getCell(7, i).dataValidation.type, 'list');
    }
  });
