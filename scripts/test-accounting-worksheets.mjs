import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
import ExcelJS from 'exceljs';
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
const accountingURL = url(fs.readFileSync('lib/accounting.ts', 'utf8'));
const schemaURL = url(
  fs
    .readFileSync('lib/accounting-worksheets.ts', 'utf8')
    .replaceAll("from './accounting'", `from '${accountingURL}'`),
);
const schema = await import(schemaURL);
const fileURL = url(
  fs
    .readFileSync('lib/worksheet-file.ts', 'utf8')
    .replaceAll("from 'exceljs'", `from '${import.meta.resolve('exceljs')}'`)
    .replaceAll("from 'jszip'", `from '${import.meta.resolve('jszip')}'`),
);
const { loadBoundedWorkbook } = await import(fileURL);
const guardURL = url(
  "export class AppError extends Error{constructor(m,s=400){super(m);this.status=s}};export function requireRole(a,roles){if(!a?.active||!roles.includes(a.role))throw new AppError('Access denied',403)}",
);
const storageURL = url(
  "export async function storeCall(op,args){globalThis.__worksheetCalls.push({op,args});return globalThis.__worksheetResult??{rows:args.rows.map(r=>({row:r.row,key:r.key,label:r.label,status:op==='fin_worksheet_commit'?'Saved':'Ready'})),saved:op==='fin_worksheet_commit'?args.rows.length:0,skipped:0,failed:0}};",
);
const api = await import(
  url(
    fs
      .readFileSync('lib/accounting-worksheet-server.ts', 'utf8')
      .replaceAll("from './server'", `from '${guardURL}'`)
      .replaceAll("from './storage'", `from '${storageURL}'`)
      .replaceAll("from './worksheet-file'", `from '${fileURL}'`)
      .replaceAll("from './accounting-worksheets'", `from '${schemaURL}'`),
  )
);
const actor = { userId: 'test-finance', role: 'Finance', active: true };
const metadata = {
  source: 'Spreadsheet',
  dataset: 'QA only',
  period: '2026-09',
  view: 'Internal evidence',
  fileName: 'qa.xlsx',
};
const source = {
  kind: 'source',
  operation: 'preview',
  metadata,
  csv: 'entryKey,date,amount,name,category,direction,reference\nSRC-1,2026-09-01,-1000,Nguyễn Văn A,Books,Out,REF-1',
};
const document = {
  kind: 'documents',
  operation: 'preview',
  csv: 'entryKey,kind,date,title,counterparty,amount,dueDate,notes\nBILL-1,bill,2026-09-01,Test bill,Sample supplier,1000,2026-09-30,QA only',
};
async function xlsx(rows, lines) {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Entry').addRows(rows);
  if (lines) wb.addWorksheet('JournalLines').addRows(lines);
  wb.addWorksheet('Examples').addRows([['Do not import'], ['Example only']]);
  return Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
}
test('Accounting templates have stable keys and separate source/document semantics', () => {
  assert.match(
    schema.accountingWorksheetTemplate('source'),
    /entryKey.*date.*amount/,
  );
  assert.deepEqual(schema.accountingWorksheetLimits, {
    entryRows: 200,
    journalRows: 500,
    linesPerJournal: 100,
  });
  const p = schema.accountingEntry('source', {
    entryKey: 'SRC-1',
    date: '2026-09-01',
    amount: '-1000',
  });
  assert.equal(p.payload.amount, -1000);
  assert.throws(() =>
    schema.accountingEntry('documents', {
      entryKey: 'BILL-1',
      kind: 'bill',
      date: '2026-09-01',
      title: 'Test',
      amount: '-1',
    }),
  );
  for (const key of ['=1', 'bad key', '@formula', 'x'.repeat(121)])
    assert.throws(() => schema.accountingEntryKey(key));
  assert.throws(() =>
    schema.accountingMetadata({ ...metadata, source: 'MISA' }),
  );
});
test('Preview returns field errors by row and writes no cash/documents', async () => {
  globalThis.__worksheetCalls = [];
  const result = await api.accountingWorksheet(actor, {
    ...source,
    csv:
      source.csv +
      '\nSRC-2,2026-02-30,100,Invalid date,,,\nSRC-1,2026-09-01,1,Duplicate,,,',
  });
  assert.deepEqual(
    result.rows.map((r) => r.status),
    ['Ready', 'Needs correction', 'Needs correction'],
  );
  assert.deepEqual(
    globalThis.__worksheetCalls.map((c) => c.op),
    ['fin_worksheet_preview'],
  );
  assert.equal(globalThis.__worksheetCalls[0].args.rows.length, 1);
  assert.equal(result.rows[0].payload.raw.reference, 'REF-1');
});
test('Commit reparses, verifies digest and uses only private guarded accounting operations', async () => {
  globalThis.__worksheetCalls = [];
  const preview = await api.accountingWorksheet(actor, document);
  await assert.rejects(
    api.accountingWorksheet(actor, {
      ...document,
      operation: 'commit',
      digest: 'wrong',
    }),
    (e) => e.status === 409,
  );
  const saved = await api.accountingWorksheet(actor, {
    ...document,
    operation: 'commit',
    digest: preview.digest,
  });
  assert.equal(saved.saved, 1);
  assert.equal(saved.committed, true);
  assert.equal(saved.rows[0].payload.amount, 1000);
  assert.equal(saved.rows[0].payload.date, '2026-09-01');
  assert.ok(
    globalThis.__worksheetCalls.every((c) =>
      ['fin_worksheet_preview', 'fin_worksheet_commit'].includes(c.op),
    ),
  );
  assert.equal(
    globalThis.__worksheetCalls.at(-1).args.rows[0].payload.status,
    undefined,
  );
});
test('Database conflicts remain visible and block bulk commit', async () => {
  globalThis.__worksheetCalls = [];
  globalThis.__worksheetResult = {
    rows: [{ row: 2, status: 'Needs correction', error: 'Month is closed.' }],
  };
  const preview = await api.accountingWorksheet(actor, document);
  assert.equal(preview.rows[0].error, 'Month is closed.');
  await assert.rejects(
    api.accountingWorksheet(actor, {
      ...document,
      operation: 'commit',
      digest: preview.digest,
    }),
    /highlighted rows/,
  );
  assert.ok(
    globalThis.__worksheetCalls.every((c) => c.op === 'fin_worksheet_preview'),
  );
  delete globalThis.__worksheetResult;
});
test('XLSX journals use JournalLines, ignore examples and enforce balanced totals', async () => {
  globalThis.__worksheetCalls = [];
  const entries = [
    schema.accountingWorksheetColumns.documents,
    ['J-1', 'journal', '2026-09-01', 'QA journal', '', 1000, '', ''],
  ];
  const lines = [
    schema.accountingJournalColumns,
    ['J-1', '111', 1000, 0, 'Debit'],
    ['J-1', '131', 0, 1000, 'Credit'],
  ];
  const data = await xlsx(entries, lines);
  const good = await api.accountingWorksheet(actor, {
    kind: 'documents',
    operation: 'preview',
    xlsx: data,
  });
  assert.equal(good.rows.length, 1);
  assert.equal(good.rows[0].status, 'Ready');
  assert.equal(good.rows[0].payload.lines[1].note, 'Credit');
  const unbalanced = await api.accountingWorksheet(actor, {
    kind: 'documents',
    operation: 'preview',
    xlsx: await xlsx(entries, [
      lines[0],
      lines[1],
      ['J-1', '131', 0, 999, 'Mismatch'],
    ]),
  });
  assert.equal(unbalanced.rows[0].status, 'Needs correction');
  await assert.rejects(
    api.accountingWorksheet(actor, {
      kind: 'documents',
      operation: 'preview',
      xlsx: await xlsx(entries, [lines[0], ['OTHER', '111', 1, 0, 'Orphan']]),
    }),
    /no matching Entry/,
  );
});
test('XLSX rejects formulas, accountant preparation files, and unsupported formats', async () => {
  globalThis.__worksheetCalls = [];
  const malformed = await xlsx([
    schema.accountingWorksheetColumns.source,
    ['SRC-1', '2026-09-01', { formula: '1+1' }, '', '', '', ''],
  ]);
  await assert.rejects(
    api.accountingWorksheet(actor, {
      ...source,
      csv: undefined,
      xlsx: malformed,
    }),
    /plain values/,
  );
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('_BOH_PREP');
  const data = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
  await assert.rejects(
    api.accountingWorksheet(actor, { ...source, csv: undefined, xlsx: data }),
    /Accountant preparation review/,
  );
  await assert.rejects(
    api.accountingWorksheet(actor, {
      ...document,
      csv: undefined,
      xlsx: 'not a zip',
    }),
  );
  await assert.rejects(
    api.accountingWorksheet(actor, { ...document, kind: 'invoice' }),
    /Choose an accounting worksheet/,
  );
  assert.equal(globalThis.__worksheetCalls.length, 0);
});
test('Role and account status checks run before parsing or database calls', async () => {
  globalThis.__worksheetCalls = [];
  for (const account of [
    { ...actor, role: 'TA' },
    { ...actor, active: false },
  ])
    await assert.rejects(
      api.accountingWorksheet(account, document),
      (e) => e.status === 403,
    );
  assert.equal(globalThis.__worksheetCalls.length, 0);
});
test('The actual downloadable XLSX templates round-trip filled rows without importing examples', async () => {
  globalThis.__worksheetCalls = [];
  for (const kind of ['source', 'documents']) {
    const wb = await loadBoundedWorkbook(
      fs
        .readFileSync('public/templates/BOH-accounting-' + kind + '.xlsx')
        .toString('base64'),
    );
    const sheet = wb.getWorksheet('Entry');
    assert.ok(sheet);
    const values =
      kind === 'source'
        ? [
            'DOWNLOAD-SRC-1',
            new Date('2026-09-01T00:00:00Z'),
            -1000,
            'Nguyễn Văn An',
            'Books',
            'Out',
            'QA',
          ]
        : [
            'DOWNLOAD-DOC-1',
            'bill',
            new Date('2026-09-01T00:00:00Z'),
            'Sample bill',
            'Sample supplier',
            1000,
            '',
            'QA',
          ];
    sheet.getRow(2).values = values;
    const result = await api.accountingWorksheet(actor, {
      kind,
      operation: 'preview',
      metadata,
      xlsx: Buffer.from(await wb.xlsx.writeBuffer()).toString('base64'),
    });
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].status, 'Ready');
    assert.equal(result.rows[0].payload.date, '2026-09-01');
  }
});
