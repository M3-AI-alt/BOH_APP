import { fields, type Field } from './entry-fields';
export const entryActions: Record<string, string> = {
  student: 'Save student',
  receipt: 'Record payment',
  expense: 'Record expense',
  package: 'Save agreement',
  lead: 'Save inquiry',
  makeup: 'Save makeup lesson',
  support: 'Save support lesson',
  payroll: 'Save payroll review',
  staff: 'Save access',
  class: 'Save class',
  catalogue: 'Save offer',
  membership: 'Save membership',
  calendar: 'Save calendar change',
  commitment: 'Save commitment',
  reconciliation: 'Save reconciliation',
  close: 'Save month status',
  task: 'Save task',
};
const groups: Record<string, Record<string, string[]>> = {
  student: {
    'Student details': ['name', 'preferredName', 'birthDate', 'school'],
    Enrollment: [
      'classId',
      'status',
      'enrollmentDate',
      'pauseFrom',
      'resumeDate',
    ],
    'Parent & contact details': [
      'parent',
      'phone',
      'parentEmail',
      'zalo',
      'secondParent',
      'secondPhone',
      'address',
    ],
    'Learning & notes': ['learningGoals', 'notes'],
  },
  receipt: {
    'Payer and account': ['name', 'account'],
    'Amount and date': ['amount', 'date', 'purpose'],
    Allocation: ['studentId', 'packageId'],
    'Supporting details': ['reference', 'description', 'reconciled'],
  },
  expense: {
    'Payment details': ['description', 'category', 'amount', 'date', 'account'],
    'Supporting details': ['reference', 'reconciled'],
  },
  package: {
    'Student and offer': ['studentId', 'sessions', 'agreedFee'],
    'Agreement details': ['startDate', 'dueDate', 'scope', 'classId', 'notes'],
  },
  lead: {
    'Inquiry details': ['name', 'parent', 'phone', 'classId'],
    'Next action': ['status', 'followUp', 'notes'],
  },
  payroll: {
    'Employee and period': ['name', 'month', 'position'],
    'Reviewed amounts': ['gross', 'deductions', 'employerInsurance'],
    Review: ['status', 'notes'],
  },
};
const moneyKeys = new Set([
  'price',
  'amount',
  'agreedFee',
  'gross',
  'deductions',
  'employerInsurance',
  'opening',
  'statementClosing',
]);
const advancedKeys = new Set([
  'notes',
  'description',
  'secondParent',
  'secondPhone',
  'parentEmail',
  'zalo',
  'address',
  'learningGoals',
  'school',
  'reference',
  'until',
]);
const hints: Record<string, string> = {
  account:
    'Choose an account already used by the centre, or enter its exact name.',
  agreedFee:
    'The amount actually agreed with the family. Existing agreements are not repriced.',
  amount: 'Enter the actual amount, in whole VND.',
  deductions:
    'Enter reviewed deductions. BOH does not calculate tax automatically here.',
  employerInsurance:
    'Use a reviewed amount, not an assumed insurance calculation.',
  reconciled: 'Mark only after checking the bank statement or cash evidence.',
  followUp: 'When should your team contact this family again?',
};
export function entryFields(kind: string): Field[] {
  return (fields[kind] || []).map((field) => ({
    ...field,
    section:
      Object.entries(groups[kind] || {}).find(([, keys]) =>
        keys.includes(field.key),
      )?.[0] || 'Essential information',
    advanced: !field.required && advancedKeys.has(field.key),
    help: hints[field.key],
    ...(moneyKeys.has(field.key) ? { control: 'money' as const } : {}),
    ...(['account', 'teacher', 'makeupClass', 'assignedTo'].includes(field.key)
      ? { control: 'suggestion' as const }
      : {}),
    ...(kind === 'student' && ['pauseFrom', 'resumeDate'].includes(field.key)
      ? { visibleWhen: { key: 'status', value: 'Paused' } }
      : {}),
    ...(kind === 'package' && field.key === 'classId'
      ? { visibleWhen: { key: 'scope', value: 'class' }, required: true }
      : {}),
  }));
}
export const visibleField = (f: Field, data: Record<string, unknown>) =>
  !f.visibleWhen ||
  data[f.visibleWhen.key] === f.visibleWhen.value ||
  (['pauseFrom', 'resumeDate'].includes(f.key) &&
    !!(data.pauseFrom || data.resumeDate));
export function entryErrors(
  kind: string,
  data: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of entryFields(kind)) {
    if (!visibleField(f, data)) continue;
    const value = data[f.key];
    if (
      f.required &&
      (value == null || (typeof value === 'string' && !value.trim()))
    )
      errors[f.key] = 'This information is required.';
    else if (
      f.control === 'money' &&
      value !== '' &&
      value != null &&
      (typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        (!['opening', 'statementClosing'].includes(f.key) && value < 0))
    )
      errors[f.key] = 'Enter a valid whole VND amount.';
    else if (
      ['receipt', 'expense'].includes(kind) &&
      f.key === 'amount' &&
      Number(value) <= 0
    )
      errors[f.key] = 'Enter an amount greater than zero.';
    else if (
      f.type === 'email' &&
      value &&
      (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    )
      errors[f.key] = 'Enter a valid email address.';
  }
  if (
    kind === 'receipt' &&
    Array.isArray(data.allocations) &&
    data.allocations.length
  ) {
    const rows = data.allocations as { amount: unknown; packageId: unknown }[];
    if (
      rows.some(
        (a) =>
          !a.packageId ||
          typeof a.amount !== 'number' ||
          !Number.isSafeInteger(a.amount) ||
          a.amount <= 0,
      ) ||
      rows.reduce((n, a) => n + Number(a.amount || 0), 0) !==
        Number(data.amount)
    )
      errors.allocations =
        'Choose each agreement and allocate the exact payment amount.';
  }
  if (
    kind === 'student' &&
    data.status === 'Active' &&
    data.pauseFrom &&
    !data.resumeDate
  )
    errors.resumeDate = 'Enter the return date to end this pause.';
  return errors;
}
export function parseVnd(text: string): number | string {
  const raw = text.replace(/\s/g, '');
  if (raw === '' || raw === '-') return raw;
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,3}(?:\.\d{3})+)$/.test(raw))
    return text;
  const value = Number(raw.replace(/[.,]/g, ''));
  return Number.isSafeInteger(value) ? value : text;
}
