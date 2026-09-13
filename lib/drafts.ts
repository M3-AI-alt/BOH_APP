import type { Role } from './types';
export type EntryDraft = {
  id: string;
  kind: string;
  record_id: string | null;
  record_revision: number | null;
  revision: number;
  payload: {
    data: Record<string, unknown>;
    reason: string;
    retry?: { key: string; id: string };
  };
  updated_at: string;
};
export function draftKinds(role: Role): string[] {
  const finance = [
    'catalogue',
    'package',
    'receipt',
    'expense',
    'commitment',
    'task',
    'payroll',
    'reconciliation',
    'close',
  ];
  if (role === 'Finance') return finance;
  if (role === 'Director')
    return [...finance, 'lead', 'student', 'class', 'membership', 'calendar'];
  return [];
}
