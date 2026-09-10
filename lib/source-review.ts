import { entries, allocations, sessionSnapshot } from './domain';
import type { DataRecord } from './types';

// These are data-completeness checks, never debt or collection calculations.
export function sourceReviewIssues(records: DataRecord[], asOf: string) {
  const students = new Map(
    entries(records, 'student').map((s) => [s.id, s.name]),
  );
  const issues: {
    id: string;
    kind: string;
    category: string;
    name: string;
    reason: string;
    source: string;
    studentId: string;
    date: string;
  }[] = [];
  for (const kind of [
    'receipt',
    'makeup',
    'support',
    'package',
    'unmatched',
  ] as const) {
    for (const record of entries(records, kind)) {
      const add = (category: string, reason: string) =>
        issues.push({
          id: record.id,
          kind,
          category,
          reason,
          name: students.get(record.studentId) || record.name || 'Not recorded',
          source: record.source || 'Entered in app',
          studentId: record.studentId || '',
          date: record.date || '',
        });
      if (kind === 'unmatched') {
        add('attendance', 'Attendance mark has no confirmed student');
        continue;
      }
      if (kind === 'receipt') {
        if (!['Tuition', 'Deposit'].includes(record.purpose)) continue;
        const parts = allocations(record);
        if (!record.studentId && !parts.length)
          add('student', 'Student or family split needs confirmation');
        else if (
          !parts.length ||
          parts.some((p: any) => !p.packageId) ||
          Math.abs(
            parts.reduce((n: number, p: any) => n + Number(p.amount || 0), 0) -
              Number(record.amount || 0),
          ) > 0.5
        )
          add(
            'payment',
            'Student known; package allocation needs confirmation',
          );
      } else if (kind === 'package') {
        if (
          record.sourcePending ||
          typeof record.sessions !== 'number' ||
          (record.imported &&
            typeof sessionSnapshot(record, asOf)?.remaining !== 'number')
        )
          add('terms', 'Package terms or session balance need confirmation');
      } else if (!record.studentId)
        add(
          'student',
          'Source lesson is stored; student match needs confirmation',
        );
    }
  }
  return issues;
}
