import { fields, type Field } from './entry-fields';
import { parseSourceCsv, csvCell } from './accounting';
import type { Actor } from './types';

/** Worksheet columns and manual forms share their field definitions. */
export const bulkTasks: Record<string, { label: string; group: string }> = {
  student: { label: 'Students', group: 'Students' },
  lead: { label: 'Leads', group: 'Students' },
  class: { label: 'Classes', group: 'Teaching' },
  membership: { label: 'Class memberships', group: 'Teaching' },
  calendar: { label: 'Holidays and extra lessons', group: 'Teaching' },
  attendance: { label: 'Attendance', group: 'Teaching' },
  makeup: { label: 'Makeup lessons', group: 'Teaching' },
  support: { label: 'Free support', group: 'Teaching' },
  catalogue: { label: 'Package catalogue', group: 'Finance' },
  package: { label: 'Student packages', group: 'Finance' },
  receipt: { label: 'Money collected', group: 'Finance' },
  expense: { label: 'Expenses paid', group: 'Finance' },
  commitment: { label: 'Recurring expenses', group: 'Finance' },
  payroll: { label: 'Payroll drafts', group: 'Finance' },
  reconciliation: { label: 'Account reconciliation', group: 'Finance' },
  task: { label: 'Accountant tasks', group: 'Finance' },
};
export function bulkFields(kind: string): Field[] {
  if (!Object.hasOwn(bulkTasks, kind)) throw Error('Unsupported worksheet.');
  const extra: Record<string, Field[]> = {
    attendance: [
      { key: 'studentId', label: 'Student', type: 'student', required: true },
      { key: 'classId', label: 'Class', type: 'class', required: true },
      { key: 'date', label: 'Lesson date', type: 'date', required: true },
      {
        key: 'mark',
        label: 'Attendance mark',
        options: ['P', 'T', 'A', 'N'],
        required: true,
      },
    ],
    reconciliation: [
      { key: 'month', label: 'Month', type: 'month', required: true },
    ],
    package: [{ key: 'label', label: 'Package name', required: true }],
    expense: [{ key: 'payrollId', label: 'Approved payroll record ID' }],
  };
  return [
    { key: 'entryKey', label: 'Unique entry reference', required: true },
    ...(extra[kind] || []),
    ...(fields[kind] || []).map((f) => ({
      ...f,
      ...(f.key === 'status' && kind === 'payroll'
        ? { options: ['Draft', 'Needs confirmation'] }
        : {}),
      ...(f.key === 'sessions' ? { type: 'number', required: true } : {}),
    })),
  ];
}
export function canImport(a: Actor, kind: string) {
  if (!a.active || !Object.hasOwn(bulkTasks, kind)) return false;
  if (a.role === 'Director') return true;
  if (a.role === 'TA')
    return ['attendance', 'makeup', 'support'].includes(kind);
  return bulkTasks[kind].group === 'Finance';
}
export function canExport(a: Actor, kind: string) {
  return (
    canImport(a, kind) ||
    (a.active &&
      a.role === 'Finance' &&
      ['student', 'class', 'membership'].includes(kind))
  );
}
export function templateCsv(kind: string) {
  return (
    '\uFEFF' +
    bulkFields(kind)
      .map((f) => csvCell(f.key))
      .join(',') +
    '\r\n'
  );
}
export function worksheetRows(csv: string, kind: string) {
  const parsed = parseSourceCsv(csv);
  const definitions = bulkFields(kind);
  const keys = definitions.map((f) => f.key);
  const unknown = parsed.headers.filter((h) => !keys.includes(h));
  if (unknown.length) throw Error('Unknown columns: ' + unknown.join(', '));
  for (const f of definitions.filter((f) => f.required))
    if (!parsed.headers.includes(f.key))
      throw Error('Missing column: ' + f.key);
  if (parsed.rows.length > 200) throw Error('Use up to 200 rows per import.');
  return parsed.rows;
}
export function parseEntry(kind: string, raw: Record<string, string>) {
  const payload: Record<string, any> = {};
  for (const field of bulkFields(kind)) {
    const value = String(raw[field.key] ?? '').trim();
    if (!value) {
      if (field.required) throw Error('Please complete ' + field.label + '.');
      continue;
    }
    if (value.length > 3000) throw Error('Cell is too long: ' + field.key);
    if (/^[=+@]/.test(value) || /^-\D/.test(value))
      throw Error('Use values, not formulas: ' + field.key);
    if (field.options && !field.options.includes(value))
      throw Error(field.label + ': ' + field.options.join(' / '));
    if (['number', 'price'].includes(field.type || '')) {
      if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
        throw Error(field.label + ': use whole numbers without separators.');
      payload[field.key] = Number(value);
    } else if (field.type === 'checkbox') {
      if (!['true', 'false'].includes(value.toLowerCase()))
        throw Error(field.label + ': true / false');
      payload[field.key] = value.toLowerCase() === 'true';
    } else if (field.type === 'weekdays') {
      if (!/^[0-6](?:,[0-6])*$/.test(value))
        throw Error('Weekdays: 0=Monday through 6=Sunday, e.g. 0,3');
      payload[field.key] = value.split(',').map(Number);
    } else {
      if (
        field.type === 'date' &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          Number.isNaN(Date.parse(value)) ||
          new Date(value).toISOString().slice(0, 10) !== value)
      )
        throw Error(field.label + ': YYYY-MM-DD');
      if (field.type === 'month' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
        throw Error(field.label + ': YYYY-MM');
      payload[field.key] = value;
    }
  }
  const key = String(payload.entryKey);
  if (!/^[\p{L}\p{N}._:/ -]{1,120}$/u.test(key))
    throw Error('Use a unique reference of 1–120 letters or numbers.');
  delete payload.entryKey;
  const defaults: Record<string, any> = {
    student: { status: 'Active' },
    lead: { status: 'New' },
    package: { scope: 'all' },
    receipt: { purpose: 'Tuition', reconciled: false },
    expense: { category: 'Other', reconciled: false },
    membership: { schedule: 'Regular' },
    class: { archived: false },
    catalogue: { active: true },
    calendar: { open: false },
    makeup: { status: 'Planned' },
    support: { status: 'Planned' },
    payroll: { status: 'Draft', employerInsurance: 0 },
    task: { status: 'To do' },
  };
  return { key, payload: { ...defaults[kind], ...payload } };
}
export function stableJson(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + stableJson(value[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'null';
}
export type BulkRow = {
  row: number;
  key: string;
  label: string;
  status: 'Ready' | 'Already imported' | 'Needs correction' | 'Saved';
  error?: string;
  id?: string;
  payload?: Record<string, any>;
};
