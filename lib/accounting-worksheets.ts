import {
  accountingImportSources,
  csvCell,
  documentKinds,
  parseSourceCsv,
  sourceAmount,
  validDate,
  validateJournal,
  type JournalLine,
} from './accounting';

export const accountingWorksheetKinds = ['source', 'documents'] as const;
export type AccountingWorksheetKind = (typeof accountingWorksheetKinds)[number];
export const accountingWorksheetColumns = {
  source: [
    'entryKey',
    'date',
    'amount',
    'name',
    'category',
    'direction',
    'reference',
  ],
  documents: [
    'entryKey',
    'kind',
    'date',
    'title',
    'counterparty',
    'amount',
    'dueDate',
    'notes',
  ],
} as const;
export const accountingJournalColumns = [
  'entryKey',
  'account',
  'debit',
  'credit',
  'description',
] as const;
export const accountingWorksheetLimits = {
  entryRows: 200,
  journalRows: 500,
  linesPerJournal: 100,
} as const;
export const accountingWorksheetRequired = {
  source: ['entryKey', 'date', 'amount'],
  documents: ['entryKey', 'kind', 'date', 'title', 'amount'],
} as const;
export type AccountingWorksheetMetadata = {
  source: string;
  dataset: string;
  period: string;
  view: string;
  fileName: string;
};
export type AccountingWorksheetRow = {
  row: number;
  key: string;
  label: string;
  status:
    | 'Ready'
    | 'Already imported'
    | 'Needs correction'
    | 'Saved'
    | 'Failed';
  error?: string;
  id?: string;
  payload?: Record<string, any>;
};

export function accountingWorksheetKind(
  value: unknown,
): AccountingWorksheetKind {
  if (!accountingWorksheetKinds.includes(value as AccountingWorksheetKind))
    throw Error('Choose an accounting worksheet.');
  return value as AccountingWorksheetKind;
}
export function accountingWorksheetTemplate(kind: AccountingWorksheetKind) {
  return (
    '\uFEFF' + accountingWorksheetColumns[kind].map(csvCell).join(',') + '\r\n'
  );
}
function text(value: unknown, max: number, label: string, required = false) {
  const v = String(value ?? '').trim();
  if ((required && !v) || v.length > max) throw Error('Check ' + label + '.');
  if (/^[=+@]/.test(v) || /^-\D/.test(v))
    throw Error('Use plain values, not formulas: ' + label + '.');
  return v;
}
export function accountingEntryKey(value: unknown) {
  const key = text(value, 120, 'entry reference', true);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(key))
    throw Error(
      'Entry reference: use letters, numbers, dots, hyphens or underscores.',
    );
  return key;
}
export function accountingMetadata(raw: any): AccountingWorksheetMetadata {
  if (!raw || !accountingImportSources.includes(raw.source))
    throw Error('Choose Bank, Spreadsheet or Top ID as the source.');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw.period))
    throw Error('Choose a valid period.');
  return {
    source: raw.source,
    dataset: text(raw.dataset, 200, 'dataset', true),
    view: text(raw.view, 160, 'source category', true),
    period: raw.period,
    fileName: text(raw.fileName, 250, 'file name', true),
  };
}
export function accountingCsvRows(
  csv: string,
  columns: readonly string[],
  required: readonly string[],
  max = 200,
) {
  const parsed = parseSourceCsv(csv);
  if (parsed.rows.length > max) throw Error('Use up to 200 rows per import.');
  const unknown = parsed.headers.filter((h) => !columns.includes(h));
  if (unknown.length) throw Error('Unknown columns: ' + unknown.join(', '));
  for (const key of required)
    if (!parsed.headers.includes(key)) throw Error('Missing column: ' + key);
  return parsed.rows;
}
export function accountingEntry(
  kind: AccountingWorksheetKind,
  raw: Record<string, string>,
  lines: JournalLine[] = [],
) {
  const key = accountingEntryKey(raw.entryKey);
  if (!validDate(raw.date)) throw Error('Check the document dates.');
  const amount = sourceAmount(raw.amount || '', 'plain');
  if (kind === 'source')
    return {
      key,
      payload: {
        externalId: key,
        date: raw.date,
        amount,
        name: text(raw.name, 300, 'name'),
        category: text(raw.category, 200, 'category'),
        direction: text(raw.direction, 100, 'direction'),
        reference: text(raw.reference, 1000, 'reference'),
        raw,
      },
    };
  if (!documentKinds.includes(raw.kind as any))
    throw Error('Choose a document type.');
  if (amount < 0) throw Error('Enter an amount in whole VND.');
  if (raw.dueDate && !validDate(raw.dueDate))
    throw Error('Check the document dates.');
  if (raw.kind === 'journal' || lines.length) {
    const total = validateJournal(lines);
    if (total !== amount)
      throw Error('Journal total must equal the document amount.');
  }
  return {
    key,
    payload: {
      kind: raw.kind,
      date: raw.date,
      title: text(raw.title, 250, 'title', true),
      counterparty: text(raw.counterparty, 250, 'counterparty'),
      amount,
      dueDate: raw.dueDate || '',
      notes: text(raw.notes, 5000, 'notes'),
      lines,
    },
  };
}
export function accountingJournalLine(raw: Record<string, string>) {
  return {
    key: accountingEntryKey(raw.entryKey),
    line: {
      account: text(raw.account, 30, 'account', true),
      debit: sourceAmount(raw.debit || '0', 'plain'),
      credit: sourceAmount(raw.credit || '0', 'plain'),
      note: text(raw.description, 1000, 'description'),
    },
  };
}
