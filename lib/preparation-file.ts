import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { loadBoundedWorkbook } from './worksheet-file';
import {
  preparationModules,
  preparationVersion,
  prepColumns,
} from './preparation-schema.mjs';
import type {
  PreparationBaseline,
  PreparationField,
  PreparationScalar,
  PreparationSourceRow,
  PreparationSubmission,
  PreparationSubmissions,
  PreparationValues,
} from './preparation-types';
export function preparationSignature(canonical: string, key: string) {
  return createHmac('sha256', key)
    .update('BOH preparation baseline v1\n' + canonical)
    .digest('hex');
}
function plain(value: unknown): PreparationScalar {
  if (value == null) return '';
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw Error('Invalid date.');
    return value.toISOString().slice(0, 10);
  }
  if (!['string', 'number', 'boolean'].includes(typeof value))
    throw Error(
      'Use plain values, not formulas or links, in the entry tables.',
    );
  if (typeof value === 'string') {
    // Entry cells may contain normal whitespace, but not hidden control bytes.
    // oxlint-disable-next-line no-control-regex
    const controls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
    if (value.length > 16000 || controls.test(value))
      throw Error('An entry is too long or contains control characters.');
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  throw Error('Use plain values, not formulas or links, in the entry tables.');
}
export async function parsePreparationFile(xlsx: string, key: string) {
  if (!key)
    throw Error('The private preparation connection is not configured.');
  const workbook = await loadBoundedWorkbook(xlsx);
  const meta = workbook.getWorksheet('_BOH_PREP');
  if (!meta || meta.getCell('B1').value !== preparationVersion)
    throw Error('Choose the BOH accountant preparation workbook.');
  const n = meta.getCell('B3').value;
  if (!Number.isSafeInteger(n) || Number(n) < 1 || Number(n) > 150)
    throw Error('Invalid preparation baseline.');
  let canonical = '';
  for (let i = 0; i < Number(n); i++) {
    const value = meta.getCell('A' + (i + 4)).value;
    if (typeof value !== 'string' || value.length > 16000)
      throw Error('Invalid preparation baseline.');
    canonical += value;
  }
  const signature = meta.getCell('B2').value;
  if (
    typeof signature !== 'string' ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    !timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(preparationSignature(canonical, key), 'hex'),
    )
  )
    throw Error(
      'The source baseline was changed or its signing key has rotated. Obtain a fresh workbook; do not re-import this as new data.',
    );
  // The HMAC authenticates this versioned structure emitted by our own builder.
  const baseline = JSON.parse(canonical) as PreparationBaseline;
  if (baseline.version !== preparationVersion)
    throw Error('Unsupported preparation version.');
  const submissions: PreparationSubmissions = {};
  for (const m of preparationModules) {
    const sheet = workbook.getWorksheet(m.sheet),
      table = baseline.tables[m.key],
      columns: PreparationField[] = prepColumns(m);
    if (!sheet || !table)
      throw Error('A required preparation sheet is missing: ' + m.sheet);
    if (sheet.columnCount > columns.length || sheet.rowCount > 1000)
      throw Error(
        'Keep the template columns and reserved entry rows: ' + m.sheet,
      );
    columns.forEach((f, i) => {
      if (plain(sheet.getCell(6, i + 1).value) !== f.label)
        throw Error('A column heading was changed: ' + m.sheet);
    });
    const known = new Map<string, PreparationSourceRow>(
      table.rows.map((r) => [r.ref, r]),
    );
    const seen = new Set<string>();
    const rows: PreparationSubmission[] = [];
    for (let line = 7; line <= sheet.rowCount; line++) {
      const values = columns.map((_, i) =>
        plain(sheet.getCell(line, i + 1).value),
      );
      if (values.every((v) => v === '')) continue;
      const reference = String(values[0]);
      const original = known.get(reference);
      if (!original || seen.has(reference))
        throw Error(
          'Unknown or duplicate row reference: ' + m.sheet + ' row ' + line,
        );
      seen.add(reference);
      const cells: PreparationValues = {};
      columns.slice(1).forEach((f, i) => {
        const v = values[i + 1];
        if (f.key.startsWith('original.')) {
          const expected = original.original[f.key.slice(9)] ?? '';
          if (v !== expected)
            throw Error(
              'A protected source value changed: ' +
                m.sheet +
                ' / ' +
                reference +
                '. Restore it and use the yellow correction fields.',
            );
        } else cells[f.key] = v;
      });
      rows.push({ ref: reference, line, cells });
    }
    if (seen.size !== known.size)
      throw Error(
        'Rows were removed: ' +
          m.sheet +
          '. Blank cells never mean deletion. Restore the original rows.',
      );
    submissions[m.key] = rows;
  }
  return {
    baseline,
    submissions,
    fileHash: createHash('sha256')
      .update(Buffer.from(xlsx, 'base64'))
      .digest('hex'),
  };
}
