import { cleanSearch } from './domain';
export type FilterSpec = {
  query: string;
  facets: Record<string, string[]>;
  columns: string[];
};
export const emptyFilters = (): FilterSpec => ({
  query: '',
  facets: {},
  columns: [],
});
export const filterKeys: Record<string, string[]> = {
  receipts: ['account', 'purpose', 'reconciliation', 'allocation', 'classId'],
  expenses: ['account', 'category', 'reconciliation'],
  leads: ['status', 'classId', 'followUp'],
  attendance: ['mark', 'date'],
  students: ['status', 'coverage'],
  payroll: ['status', 'name'],
  tasks: ['status', 'category', 'assignedTo'],
};
export const filterColumns: Record<string, string[]> = {
  receipts: ['date', 'payer', 'purpose', 'amount', 'account', 'allocation'],
  expenses: [
    'date',
    'category',
    'description',
    'amount',
    'account',
    'reconciliation',
  ],
  leads: ['name', 'contact', 'class', 'stage', 'followUp', 'notes'],
  attendance: [],
  students: [],
  payroll: [],
  tasks: [],
};
export function moduleAllowed(module: string, role: string) {
  return (
    Object.hasOwn(filterKeys, module) &&
    (role === 'Director' ||
      (role === 'Finance' && module !== 'leads') ||
      (role === 'TA' && module === 'attendance'))
  );
}
export function validateFilters(module: string, value: unknown): FilterSpec {
  if (
    !Object.hasOwn(filterKeys, module) ||
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  )
    throw Error('Check the saved view.');
  const v = value as FilterSpec;
  if (
    typeof v.query !== 'string' ||
    v.query.length > 200 ||
    !v.facets ||
    typeof v.facets !== 'object' ||
    Array.isArray(v.facets) ||
    !Array.isArray(v.columns)
  )
    throw Error('Check the saved view.');
  const facets: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(v.facets)) {
    if (
      !filterKeys[module].includes(key) ||
      !Array.isArray(values) ||
      values.length > 50 ||
      values.some((x) => typeof x !== 'string' || x.length > 200)
    )
      throw Error('Check the saved view.');
    if (values.length) facets[key] = [...new Set(values)];
  }
  if (
    v.columns.some((x) => !filterColumns[module].includes(x)) ||
    v.columns.length > filterColumns[module].length
  )
    throw Error('Check the saved view.');
  return { query: v.query, facets, columns: [...new Set(v.columns)] };
}
export function matchesFilters(
  spec: FilterSpec,
  row: Record<string, unknown>,
  searchValues: unknown[],
) {
  if (!cleanSearch(searchValues.join(' ')).includes(cleanSearch(spec.query)))
    return false;
  return Object.entries(spec.facets).every(
    ([key, selected]) =>
      !selected.length ||
      selected.some((v) => {
        const actual = row[key];
        return Array.isArray(actual)
          ? actual.includes(v)
          : (typeof actual === 'string' ||
            typeof actual === 'number' ||
            typeof actual === 'boolean'
              ? String(actual)
              : '') === v;
      }),
  );
}
export const numericTotal = (rows: { amount?: unknown }[]) =>
  rows.reduce(
    (sum, r) =>
      sum +
      (typeof r.amount === 'number' && Number.isFinite(r.amount)
        ? r.amount
        : 0),
    0,
  );
