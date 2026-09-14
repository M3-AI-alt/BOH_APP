import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';

const key = 'synthetic-preparation-server-signing-key';
const built = await build({
  stdin: {
    contents:
      "export * from './lib/preparation-server'; export * from './lib/preparation-schema.mjs'; export * from './lib/preparation-file';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  packages: 'external',
  plugins: [
    {
      name: 'synthetic-preparation-dependencies',
      setup(builder) {
        builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
          path: 'env',
          namespace: 'preparation-test',
        }));
        builder.onResolve({ filter: /^\.\/(server|storage)$/ }, (args) =>
          args.importer.endsWith('preparation-server.ts')
            ? { path: args.path.slice(2), namespace: 'preparation-test' }
            : undefined,
        );
        builder.onLoad(
          { filter: /.*/, namespace: 'preparation-test' },
          (args) => ({
            contents:
              args.path === 'env'
                ? `export const env={SUPABASE_SECRET_KEY:${JSON.stringify(key)}};`
                : args.path === 'server'
                  ? `export class AppError extends Error {constructor(message,status=400){super(message);this.status=status;}} export function requireRole(actor,roles){if(!actor.active||!roles.includes(actor.role))throw new AppError('Your role cannot perform this action.',403);}`
                  : `export async function listRecords(){globalThis.preparationServerQA.reads++;return globalThis.preparationServerQA.records;} export async function storeCall(operation,args){globalThis.preparationServerQA.calls.push({operation,args});return globalThis.preparationServerQA.store(operation,args);}`,
            loader: 'js',
          }),
        );
      },
    },
  ],
});
const testModule = { exports: {} };
// Execute only the locally bundled, trusted test subject; no user-supplied code.
// eslint-disable-next-line typescript/no-implied-eval
new Function('require', 'module', 'exports', built.outputFiles[0].text)(
  createRequire(import.meta.url),
  testModule,
  testModule.exports,
);
const p = testModule.exports;
const actor = { userId: 'test-director', active: true, role: 'Director' };
const records = [
  {
    id: 'test-student',
    kind: 'student',
    payload: { name: 'Test student', status: 'Active' },
    revision: 1,
    updatedAt: '2026-09-13T00:00:00Z',
    date: '',
    studentId: '',
    classId: '',
  },
];
const baseline = p.buildPreparation({
  records,
  capturedAt: '2026-09-13T00:00:00Z',
  fingerprint: 'synthetic-source',
});

async function file({ changed = false, tampered = false } = {}) {
  const workbook = new ExcelJS.Workbook();
  for (const definition of p.preparationModules) {
    const sheet = workbook.addWorksheet(definition.sheet),
      columns = p.prepColumns(definition);
    sheet.getRow(6).values = columns.map((column) => column.label);
    baseline.tables[definition.key].rows.forEach((row, index) => {
      sheet.getRow(index + 7).values = columns.map((column) =>
        column.key === '_ref'
          ? row.ref
          : column.key.startsWith('original.')
            ? (row.original[column.key.slice(9)] ?? '')
            : '',
      );
    });
    if (changed && definition.key === 'students')
      sheet.getCell(
        7,
        columns.findIndex((column) => column.key === 'reason') + 1,
      ).value = 'Different returned workbook';
  }
  const canonical = JSON.stringify(baseline),
    metadata = workbook.addWorksheet('_BOH_PREP');
  metadata.getCell('B1').value = baseline.version;
  metadata.getCell('B2').value = tampered
    ? '0'.repeat(64)
    : p.preparationSignature(canonical, key);
  metadata.getCell('B3').value = Math.ceil(canonical.length / 16000);
  for (let i = 0; i < canonical.length; i += 16000)
    metadata.getCell('A' + (4 + i / 16000)).value = canonical.slice(
      i,
      i + 16000,
    );
  return Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');
}
function setup() {
  const qa = {
    records: structuredClone(records),
    reads: 0,
    calls: [],
    saved: null,
    loseResponse: false,
  };
  qa.store = async (operation, args) => {
    if (operation === 'prep_retry')
      return qa.saved?.digest === args.digest &&
        qa.saved.file_hash === args.fileHash
        ? qa.saved
        : null;
    assert.equal(operation, 'prep_stage');
    qa.saved = {
      id: '00000000-0000-4000-8000-000000000001',
      digest: args.digest,
      file_hash: args.fileHash,
      payload: args.payload,
    };
    if (qa.loseResponse) {
      qa.loseResponse = false;
      throw Error('Synthetic response lost after commit');
    }
    return { id: qa.saved.id, saved: true, reused: false, financialChanges: 0 };
  };
  globalThis.preparationServerQA = qa;
  return qa;
}

test('lost response retry recovers the original saved report after source revisions change', async () => {
  const qa = setup(),
    xlsx = await file();
  const preview = await p.preparationCommand(actor, {
    action: 'preview',
    xlsx,
  });
  const command = {
    action: 'stage',
    xlsx,
    digest: preview.digest,
    fileName: 'test.xlsx',
  };
  qa.loseResponse = true;
  await assert.rejects(
    p.preparationCommand(actor, command),
    /response lost after commit/,
  );
  qa.records[0].revision = 2;
  const readsBeforeRetry = qa.reads;
  const recovered = await p.preparationCommand(actor, command);
  assert.equal(recovered.id, qa.saved.id);
  assert.equal(recovered.digest, preview.digest);
  assert.deepEqual(recovered.rows, preview.rows);
  assert.equal(recovered.saved, true);
  assert.equal(recovered.reused, true);
  assert.equal(recovered.financialChanges, 0);
  assert.equal(qa.reads, readsBeforeRetry);
  assert.equal(
    qa.calls.filter((call) => call.operation === 'prep_stage').length,
    1,
  );
  assert.equal(qa.calls.at(-1).args.actorId, actor.userId);
});

test('changed file cannot recover a saved batch with another file hash', async () => {
  const qa = setup(),
    xlsx = await file();
  const preview = await p.preparationCommand(actor, {
    action: 'preview',
    xlsx,
  });
  await p.preparationCommand(actor, {
    action: 'stage',
    xlsx,
    digest: preview.digest,
    fileName: 'test.xlsx',
  });
  await assert.rejects(
    p.preparationCommand(actor, {
      action: 'stage',
      xlsx: await file({ changed: true }),
      digest: preview.digest,
      fileName: 'test.xlsx',
    }),
    (error) => error.status === 409,
  );
  assert.notEqual(qa.calls.at(-1).args.fileHash, qa.saved.file_hash);
  assert.equal(
    qa.calls.filter((call) => call.operation === 'prep_stage').length,
    1,
  );
});

test('signature validation precedes retry lookup', async () => {
  const qa = setup();
  await assert.rejects(
    p.preparationCommand(actor, {
      action: 'stage',
      xlsx: await file({ tampered: true }),
      digest: 'a'.repeat(64),
      fileName: 'test.xlsx',
    }),
    /baseline was changed/,
  );
  assert.equal(qa.calls.length, 0);
  assert.equal(qa.reads, 0);
});

test('unauthorized or inactive roles are rejected before parsing or lookup', async () => {
  const qa = setup();
  for (const denied of [
    { ...actor, role: 'TA' },
    { ...actor, active: false },
  ]) {
    await assert.rejects(
      p.preparationCommand(denied, {
        action: 'stage',
        xlsx: 'not-an-excel-file',
        digest: 'a'.repeat(64),
      }),
      (error) => error.status === 403,
    );
  }
  assert.equal(qa.calls.length, 0);
  assert.equal(qa.reads, 0);
});
