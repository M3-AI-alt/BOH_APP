/** Accounting review is deliberately separate from the cash and attendance stores. */
export const documentKinds = ['bill', 'payroll', 'refund', 'journal'] as const;
export type DocumentKind = (typeof documentKinds)[number];
export type ReviewState =
  | 'Draft'
  | 'Submitted'
  | 'Approved'
  | 'Posted'
  | 'Reversed'
  | 'Archived';
export type JournalLine = {
  account: string;
  debit: number;
  credit: number;
  note?: string;
};
export type FinancialDocument = {
  id: string;
  kind: DocumentKind;
  date: string;
  due_date: string | null;
  title: string;
  counterparty: string;
  amount: number;
  status: ReviewState;
  revision: number;
  notes: string;
  source_row_id: string | null;
  lines: JournalLine[];
  approved_by: string | null;
  approved_revision: number | null;
  reversal_of: string | null;
  paid?: number;
};
export type StagedRow = {
  externalId: string;
  date: string;
  amount: number;
  name: string;
  reference: string;
  category: string;
  direction: string;
  raw: Record<string, string>;
};
export function validateJournal(lines: JournalLine[]) {
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > 100)
    throw new Error('Enter between 2 and 100 journal lines.');
  let debit = 0,
    credit = 0;
  for (const line of lines) {
    if (
      !/^[0-9A-Za-z._-]{1,30}$/.test(line.account) ||
      !Number.isSafeInteger(line.debit) ||
      !Number.isSafeInteger(line.credit) ||
      line.debit < 0 ||
      line.credit < 0 ||
      line.debit > 0 === line.credit > 0
    )
      throw new Error(
        'Each line needs an account and either a debit or a credit in whole VND.',
      );
    debit += line.debit;
    credit += line.credit;
  }
  if (!Number.isSafeInteger(debit) || debit === 0 || debit !== credit)
    throw new Error('Journal debits and credits must balance.');
  return debit;
}
/** RFC4180-style CSV; identifiers and source cells remain strings, never evaluated. */
export function parseSourceCsv(csv: string) {
  if (csv.length > 1_000_000)
    throw new Error('Use a CSV file smaller than 1 MB.');
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  csv = csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || cell === '') quoted = !quoted;
      else cell += c;
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && csv[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('The CSV contains an unfinished quoted value.');
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  if (rows.length < 2 || rows.length > 501)
    throw new Error('Choose a CSV with a header and 1–500 data rows.');
  const headers = rows.shift()!.map((h) => h.trim());
  if (headers.some((h) => !h) || new Set(headers).size !== headers.length)
    throw new Error('Column names must be filled in and unique.');
  if (rows.some((r) => r.length !== headers.length))
    throw new Error('CSV rows have different numbers of columns.');
  return {
    headers,
    rows: rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]]))),
  };
}
export function sourceAmount(raw: string, convention: 'plain' | 'vn' | 'en') {
  let value = raw.trim();
  if (convention === 'vn') {
    if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,0+)?$/.test(value))
      throw new Error('Check the amount and number format.');
    value = value.replaceAll('.', '').replace(/,0+$/, '');
  } else if (convention === 'en') {
    if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0+)?$/.test(value))
      throw new Error('Check the amount and number format.');
    value = value.replaceAll(',', '').replace(/\.0+$/, '');
  } else if (!/^-?\d+$/.test(value))
    throw new Error('Check the amount and number format.');
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || Math.abs(amount) > 1e12)
    throw new Error('Check the amount and number format.');
  return amount;
}
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function csvCell(value: unknown) {
  const s = String(value ?? '');
  return (
    '"' + (/^[=+@\-\t\r]/.test(s) ? "'" : '') + s.replaceAll('"', '""') + '"'
  );
}
