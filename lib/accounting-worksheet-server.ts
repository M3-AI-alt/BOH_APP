import type ExcelJS from 'exceljs';
import { AppError, requireRole } from './server';
import { storeCall } from './storage';
import { loadBoundedWorkbook } from './worksheet-file';
import {
  accountingCsvRows,
  accountingEntry,
  accountingJournalColumns,
  accountingJournalLine,
  accountingMetadata,
  accountingWorksheetColumns,
  accountingWorksheetKind,
  accountingWorksheetLimits,
  accountingWorksheetRequired,
  type AccountingWorksheetRow,
} from './accounting-worksheets';
import type { JournalLine } from './accounting';
import type { Actor } from './types';

function sheetCsv(sheet: ExcelJS.Worksheet, maxRows: number) {
  if (sheet.rowCount > maxRows + 1 || sheet.columnCount > 12)
    throw Error('Use the downloaded worksheet without extra rows or columns.');
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const cells = Array.from({ length: sheet.columnCount }, (_, i) => {
      const value = row.getCell(i + 1).value;
      if (value == null) return '';
      if (value instanceof Date) return value.toISOString().slice(0, 10);
      if (typeof value === 'object')
        throw Error(
          'Use plain values, not formulas or links, in the Entry worksheet.',
        );
      return String(value);
    });
    if (cells.some((v) => v !== '')) rows.push(cells);
  });
  return rows
    .map((row) => row.map((v) => '"' + v.replaceAll('"', '""') + '"').join(','))
    .join('\r\n');
}
async function hash(value: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}
async function prepare(input: any) {
  const kind = accountingWorksheetKind(input.kind);
  let csv: string,
    journalCsv = '';
  if (input.xlsx && input.csv) throw Error('Choose one worksheet file.');
  if (input.xlsx) {
    const workbook = await loadBoundedWorkbook(String(input.xlsx));
    if (workbook.getWorksheet('_BOH_PREP'))
      throw Error(
        'Use Accountant preparation review for this prefilled workbook. It must not be imported as new entries.',
      );
    const entry = workbook.getWorksheet('Entry');
    if (!entry)
      throw Error('Use the Entry worksheet in the downloaded BOH template.');
    csv = sheetCsv(entry, accountingWorksheetLimits.entryRows);
    const journal = workbook.getWorksheet('JournalLines');
    if (journal) {
      if (kind !== 'documents')
        throw Error(
          'Journal lines belong in the accounting documents worksheet.',
        );
      journalCsv = sheetCsv(journal, accountingWorksheetLimits.journalRows);
      // A blank template contains a header only; examples live on a different sheet.
      if (!/[\r\n]/.test(journalCsv)) journalCsv = '';
    }
  } else {
    if (typeof input.csv !== 'string')
      throw Error('Choose a filled worksheet.');
    csv = input.csv;
  }
  const rawRows = accountingCsvRows(
    csv,
    accountingWorksheetColumns[kind],
    accountingWorksheetRequired[kind],
    accountingWorksheetLimits.entryRows,
  );
  const metadata =
    kind === 'source' ? accountingMetadata(input.metadata) : undefined;
  const lines = new Map<string, JournalLine[]>(),
    lineErrors = new Map<string, string>();
  if (journalCsv) {
    for (const raw of accountingCsvRows(
      journalCsv,
      accountingJournalColumns,
      ['entryKey', 'account', 'debit', 'credit'],
      accountingWorksheetLimits.journalRows,
    )) {
      const key = raw.entryKey?.trim();
      if (!rawRows.some((r) => r.entryKey?.trim() === key))
        throw Error('Journal line has no matching Entry reference: ' + key);
      try {
        const parsed = accountingJournalLine(raw);
        lines.set(parsed.key, [...(lines.get(parsed.key) || []), parsed.line]);
      } catch (e) {
        lineErrors.set(
          key,
          e instanceof Error ? e.message : 'Check journal lines.',
        );
      }
    }
  }
  const keys = new Set<string>();
  const rows: AccountingWorksheetRow[] = rawRows.map((raw, index) => {
    const base = {
      row: index + 2,
      key: raw.entryKey || '',
      label: raw.title || raw.name || raw.entryKey || '',
    };
    try {
      if (keys.has(raw.entryKey.trim()))
        throw Error('Duplicate entry reference in this worksheet.');
      keys.add(raw.entryKey.trim());
      if (lineErrors.has(raw.entryKey.trim()))
        throw Error(lineErrors.get(raw.entryKey.trim()));
      const parsed = accountingEntry(
        kind,
        raw,
        lines.get(raw.entryKey.trim()) || [],
      );
      return { ...base, ...parsed, status: 'Ready' };
    } catch (e) {
      return {
        ...base,
        status: 'Needs correction',
        error: e instanceof Error ? e.message : 'Check this row.',
      };
    }
  });
  return {
    kind,
    metadata,
    rows,
    count: rows.length,
    digest: await hash(JSON.stringify({ kind, csv, journalCsv, metadata })),
  };
}

/** Preview and commit share parsing and database validation; no posted or cash writes. */
export async function accountingWorksheet(a: Actor, input: any) {
  requireRole(a, ['Director', 'Finance']);
  if (!input || !['preview', 'commit'].includes(input.operation))
    throw new AppError('Choose preview or commit.');
  let preview;
  try {
    preview = await prepare(input);
  } catch (e) {
    throw new AppError(e instanceof Error ? e.message : 'Invalid worksheet.');
  }
  if (input.operation === 'commit' && input.digest !== preview.digest)
    throw new AppError('The worksheet changed. Preview it again.', 409);
  const ready = preview.rows.filter((row) => row.status === 'Ready');
  const checked = ready.length
    ? await storeCall('fin_worksheet_preview', {
        actorId: a.userId,
        kind: preview.kind,
        metadata: preview.metadata,
        rows: ready,
      })
    : { rows: [] };
  const resultByRow = new Map<number, any>(
    (checked.rows || []).map((row: any) => [row.row, row]),
  );
  preview.rows = preview.rows.map((row) =>
    resultByRow.has(row.row) ? { ...row, ...resultByRow.get(row.row) } : row,
  );
  if (input.operation === 'preview') return preview;
  if (preview.rows.some((row) => row.status === 'Needs correction'))
    throw new AppError('Fix the highlighted rows before importing.');
  const result = await storeCall('fin_worksheet_commit', {
    actorId: a.userId,
    kind: preview.kind,
    metadata: preview.metadata,
    rows: ready,
  });
  const committedByRow = new Map<number, any>(
    (result.rows || []).map((row: any) => [row.row, row]),
  );
  return {
    ...preview,
    ...result,
    rows: preview.rows.map((row) => ({
      ...row,
      ...committedByRow.get(row.row),
    })),
    committed: true,
  };
}
