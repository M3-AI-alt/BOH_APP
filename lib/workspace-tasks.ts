import { attendanceRoster, entries, scheduledDates } from './domain';
import type { Actor, DataRecord } from './types';
import type { NavigationTarget } from './workspace-navigation';

export type WorkItem = {
  id: string;
  title: string;
  category:
    | 'Attendance'
    | 'Follow-up'
    | 'Task'
    | 'Reconciliation'
    | 'Payroll'
    | 'Approval';
  dueDate: string;
  owner: string;
  action: string;
  count?: number;
  view: string;
  target?: NavigationTarget;
  recordId?: string;
  kind?: string;
};

/** Queues are read models of existing records, never independent task/balance stores. */
export function dailyWork(
  records: DataRecord[],
  actor: Actor,
  date: string,
): WorkItem[] {
  if (!actor.active) return [];
  const result: WorkItem[] = [];
  if (actor.role !== 'Finance') {
    const students = new Map(entries(records, 'student').map((s) => [s.id, s]));
    const marks = new Set(
      entries(records, 'attendance')
        .filter((a) => a.date === date && a.mark)
        .map((a) => a.membershipId),
    );
    for (const cl of entries(records, 'class').filter((c) => !c.archived)) {
      if (
        actor.role === 'TA' &&
        !actor.allClasses &&
        !actor.classIds.includes(cl.id)
      )
        continue;
      const roster = attendanceRoster(records, cl.id, date).filter(
        (m) =>
          (m.schedule !== 'Saturday' ||
            new Date(date + 'T12:00Z').getUTCDay() === 6) &&
          scheduledDates(
            records,
            cl.id,
            date,
            date,
            students.get(m.studentId),
          ).includes(date),
      );
      const missing = roster.filter((m) => !marks.has(m.id)).length;
      if (roster.length)
        result.push({
          id: 'class:' + cl.id,
          title: cl.name,
          category: 'Attendance',
          dueDate: date,
          owner: 'Teaching team',
          action: missing ? 'Complete attendance' : 'Review attendance',
          count: missing,
          view: 'Attendance',
          target: { month: date.slice(0, 7), classId: cl.id },
        });
    }
  }
  if (actor.role === 'Director') {
    for (const lead of entries(records, 'lead')) {
      if (
        ['Enrolled', 'Not proceeding', 'Lost', 'Archived'].includes(
          lead.status,
        ) ||
        !lead.followUp ||
        lead.followUp > date
      )
        continue;
      result.push({
        id: 'lead:' + lead.id,
        title: lead.name,
        category: 'Follow-up',
        dueDate: lead.followUp,
        owner: lead.assignedTo || 'Centre manager',
        action: 'Review follow-up',
        view: 'Leads',
        recordId: lead.id,
        kind: 'lead',
      });
    }
  }
  if (actor.role !== 'TA') {
    for (const task of entries(records, 'task')) {
      if (
        task.historical ||
        ['Done', 'Logged in source', 'Archived'].includes(task.status)
      )
        continue;
      const dueDate = task.dueDate || task.date || '';
      if (dueDate && dueDate > date) continue;
      result.push({
        id: 'task:' + task.id,
        title: task.title,
        category: 'Task',
        dueDate,
        owner: task.assignedTo || 'Accountant',
        action: 'Open task',
        view: 'Finance',
        target: { tab: 'tasks', month: (dueDate || date).slice(0, 7) },
        recordId: task.id,
        kind: 'task',
      });
    }
    for (const payroll of entries(records, 'payroll')) {
      if (
        !['Draft', 'Needs confirmation'].includes(payroll.status) ||
        !payroll.month ||
        payroll.month > date.slice(0, 7)
      )
        continue;
      result.push({
        id: 'payroll:' + payroll.id,
        title: payroll.name,
        category: 'Payroll',
        dueDate: payroll.month + '-01',
        owner: actor.role === 'Director' ? 'Centre manager' : 'Accountant',
        action: 'Review payroll',
        view: 'Finance',
        target: { tab: 'payroll', month: payroll.month },
        recordId: payroll.id,
        kind: 'payroll',
      });
    }
    const cash = [
      ...entries(records, 'receipt'),
      ...entries(records, 'expense'),
    ].filter((r) => r.date && r.date <= date && !r.reconciled);
    const months = new Map<string, number>();
    for (const row of cash)
      months.set(
        row.date.slice(0, 7),
        (months.get(row.date.slice(0, 7)) || 0) + 1,
      );
    for (const [month, count] of months)
      result.push({
        id: 'reconciliation:' + month,
        title: 'Cash entries to verify',
        category: 'Reconciliation',
        dueDate: month + '-01',
        owner: 'Accountant',
        action: 'Review accounts',
        count,
        view: 'Finance',
        target: { tab: 'reconcile', month },
      });
  }
  return result.sort(
    (a, b) =>
      (a.dueDate || '9999').localeCompare(b.dueDate || '9999') ||
      a.title.localeCompare(b.title),
  );
}
