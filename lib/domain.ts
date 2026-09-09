import { CUTOFF, type Actor, type DataRecord, type RecordKind } from './types';
export function entries(records: DataRecord[], kind: RecordKind) {
  return records
    .filter((r) => r.kind === kind)
    .map((r) => ({
      ...r.payload,
      id: r.id,
      revision: r.revision,
      kind: r.kind,
    }));
}
export function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export function addDays(day: string, n: number) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function shiftMonth(month: string, n: number) {
  const d = new Date(month + '-01T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}
export function monthEnd(month: string) {
  return addDays(shiftMonth(month, 1) + '-01', -1);
}
export function monthLabel(month: string) {
  return new Date(month + '-01T12:00:00Z').toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
export const money = (n: number | null | undefined) =>
  typeof n === 'number'
    ? new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(n)
    : '—';
export function cleanSearch(v: string) {
  return (v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}
export function canWrite(actor: Actor, kind: string, classId = '') {
  if (!actor.active) return false;
  if (actor.role === 'Director') return !['source', 'unmatched'].includes(kind);
  if (actor.role === 'Finance')
    return [
      'receipt',
      'expense',
      'package',
      'commitment',
      'close',
      'reconciliation',
      'payroll',
      'task',
    ].includes(kind);
  return (
    ['attendance', 'makeup', 'support'].includes(kind) &&
    actor.classIds.includes(classId)
  );
}
export function allowedRecords(actor: Actor, records: DataRecord[]) {
  if (actor.role !== 'TA')
    return records.filter(
      (r) =>
        r.kind !== 'source' && (actor.role === 'Director' || r.kind !== 'lead'),
    );
  const membership = records.filter(
    (r) => r.kind === 'membership' && actor.classIds.includes(r.classId),
  );
  const ids = new Set(membership.map((r) => r.studentId));
  return records
    .filter((r) =>
      r.kind === 'student'
        ? ids.has(r.id)
        : [
            'class',
            'membership',
            'attendance',
            'makeup',
            'support',
            'calendar',
          ].includes(r.kind) && actor.classIds.includes(r.classId),
    )
    .map((r) =>
      r.kind === 'student'
        ? {
            ...r,
            payload: {
              name: r.payload.name,
              status: r.payload.status,
              classId: r.payload.classId,
              pauseFrom: r.payload.pauseFrom,
              resumeDate: r.payload.resumeDate,
            },
          }
        : r,
    );
}
export function allocations(receipt: any) {
  return Array.isArray(receipt.allocations) && receipt.allocations.length
    ? receipt.allocations
    : receipt.packageId
      ? [
          {
            packageId: receipt.packageId,
            studentId: receipt.studentId,
            amount: receipt.amount,
          },
        ]
      : [];
}
export function packagePaid(pkg: any, receipts: any[], asOf: string) {
  const baseline = pkg.imported
    ? asOf >= CUTOFF
      ? Number(pkg.sourcePaid ?? 0)
      : null
    : 0;
  if (baseline === null) return null;
  return (
    baseline +
    receipts
      .filter(
        (r) =>
          r.date &&
          r.date <= asOf &&
          (!pkg.imported || (!r.imported && r.date > CUTOFF)),
      )
      .reduce(
        (s, r) =>
          s +
          allocations(r)
            .filter((a: any) => a.packageId === pkg.id)
            .reduce((v: number, a: any) => v + Number(a.amount || 0), 0),
        0,
      )
  );
}
export function getPackageBalances(records: DataRecord[], asOf: string) {
  const pkgs = entries(records, 'package')
    .filter((p) => !p.startDate || p.startDate <= asOf)
    .sort(
      (a, b) =>
        (a.startDate ?? '').localeCompare(b.startDate ?? '') ||
        a.id.localeCompare(b.id),
    );
  const remaining = new Map<string, number | null>(
    pkgs.map((p) => [
      p.id,
      p.imported
        ? asOf >= CUTOFF && typeof p.sourceRemaining === 'number'
          ? p.sourceRemaining
          : null
        : p.sessions,
    ]),
  );
  const attendance = entries(records, 'attendance');
  const events = attendance
    .filter(
      (a) =>
        !a.historical &&
        a.date > CUTOFF &&
        a.date <= asOf &&
        ['P', 'T'].includes(a.mark),
    )
    .map((a) => ({
      studentId: a.studentId,
      classId: a.classId,
      date: a.date,
      id: a.id,
    }));
  for (const m of entries(records, 'makeup')) {
    if (
      m.historical ||
      m.status !== 'Completed' ||
      !m.date ||
      (m.date > CUTOFF && m.date > asOf)
    )
      continue;
    const original = attendance.find((a) => a.id === m.absenceId);
    // Historical L already reduced the authoritative opening balance.
    if (
      original &&
      !(original.historical && original.mark === 'L') &&
      m.date > CUTOFF &&
      m.date <= asOf
    )
      events.push(m);
  }
  events.sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  const overrun = new Map<string, number>();
  for (const e of events) {
    const candidates = pkgs.filter(
      (p) =>
        p.studentId === e.studentId &&
        (!p.startDate || p.startDate <= e.date) &&
        (p.scope !== 'class' || p.classId === e.classId),
    );
    const pkg = candidates.find((p) => Number(remaining.get(p.id) ?? 0) > 0);
    if (pkg) remaining.set(pkg.id, Number(remaining.get(pkg.id)) - 1);
    else overrun.set(e.studentId, (overrun.get(e.studentId) ?? 0) + 1);
  }
  return { pkgs, remaining, overrun };
}
export function scheduledDates(
  records: DataRecord[],
  classId: string,
  start: string,
  end: string,
  student?: any,
) {
  const cl = entries(records, 'class').find((c) => c.id === classId);
  if (!cl) return [];
  const overrides = entries(records, 'calendar').filter(
    (c) => c.classId === classId,
  );
  const ds = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const weekday = (new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7;
    const override = overrides.find((c) => c.date === d);
    if (!(override ? override.open : cl.weekdays?.includes(weekday))) continue;
    if (
      student?.pauseFrom &&
      d >= student.pauseFrom &&
      (!student.resumeDate || d < student.resumeDate)
    )
      continue;
    ds.push(d);
  }
  return ds;
}
export function studentReview(records: DataRecord[], asOf: string) {
  const students = entries(records, 'student'),
    memberships = entries(records, 'membership'),
    receipts = entries(records, 'receipt'),
    allPackages = entries(records, 'package');
  const { pkgs, remaining, overrun } = getPackageBalances(records, asOf);
  const forecastEnd = addDays(asOf, 730);
  return students.map((st) => {
    const ps = pkgs.filter((p) => p.studentId === st.id);
    const vals = ps.map((p) => remaining.get(p.id));
    const sessions =
      ps.length && vals.every((v) => typeof v === 'number')
        ? vals.reduce((n: number, v) => n + Math.max(0, v as number), 0)
        : null;
    const agreed = allPackages.filter(
      (p) =>
        p.studentId === st.id &&
        (!p.agreedDate || p.agreedDate <= asOf) &&
        (!p.imported || !p.startDate || p.startDate <= asOf),
    );
    const financial = agreed.map((p) => {
      const paid = packagePaid(p, receipts, asOf);
      return {
        ...p,
        paid,
        balance:
          paid !== null && typeof p.agreedFee === 'number'
            ? Math.max(0, p.agreedFee - paid)
            : null,
        remaining: p.startDate > asOf ? p.sessions : remaining.get(p.id),
      };
    });
    const overdue = financial.reduce(
      (n, p) =>
        n + (p.dueDate && p.dueDate <= asOf ? Number(p.balance || 0) : 0),
      0,
    );
    const due = financial.reduce((n, p) => n + Number(p.balance || 0), 0);
    let expectedDate: string | null = null;
    const active =
      ![
        'Stopped',
        'Archived',
        'Free',
        'Ends without renewal',
        'Roster only',
      ].includes(st.status) && !(st.status === 'Paused' && !st.resumeDate);
    const ms = memberships.filter(
      (m) =>
        m.studentId === st.id &&
        m.forecast !== false &&
        (!m.until || m.until > asOf),
    );
    const future = allPackages.filter(
      (p) =>
        p.studentId === st.id &&
        p.startDate > asOf &&
        (!p.agreedDate || p.agreedDate <= asOf),
    );
    if (active && sessions !== null) {
      const capacities = [...ps, ...future].map((p) => ({
        ...p,
        left:
          p.startDate > asOf
            ? Number(p.sessions || 0)
            : Number(remaining.get(p.id) || 0),
      }));
      const scheduled = ms.flatMap((m) =>
        scheduledDates(records, m.classId, addDays(asOf, 1), forecastEnd, st)
          .filter(
            (d) =>
              (!m.from || d >= m.from) &&
              (!m.until || d <= m.until) &&
              (m.schedule !== 'Saturday' ||
                new Date(d + 'T12:00:00Z').getUTCDay() === 6),
          )
          .map((d) => ({ date: d, classId: m.classId })),
      );
      const attendanceById = new Map(
        entries(records, 'attendance').map((a) => [a.id, a]),
      );
      const planned = entries(records, 'makeup')
        .filter(
          (m) =>
            !m.historical &&
            m.studentId === st.id &&
            m.status === 'Planned' &&
            m.date > asOf &&
            m.date <= forecastEnd,
        )
        .filter((m) => {
          const a = attendanceById.get(m.absenceId);
          return !(a?.historical && a.mark === 'L');
        })
        .map((m) => ({ date: m.date, classId: m.classId }));
      const events = [
        ...new Map(
          scheduled.map((d) => [d.date + ':' + d.classId, d]),
        ).values(),
        ...planned,
      ].sort((a, b) => a.date.localeCompare(b.date));
      const lastByClass = new Map<string, string>();
      if (sessions === 0 && !future.length) expectedDate = asOf;
      else
        for (const e of events) {
          const eligible = capacities.find(
            (p) =>
              p.left > 0 &&
              (!p.startDate || p.startDate <= e.date) &&
              (p.scope !== 'class' || p.classId === e.classId),
          );
          if (!eligible) {
            expectedDate = lastByClass.get(e.classId) ?? asOf;
            break;
          }
          eligible.left--;
          lastByClass.set(e.classId, e.date);
        }
    }
    const sourcePending = ps.some((p) => p.sourcePending);
    const status = [
      'Stopped',
      'Paused',
      'Free',
      'Ends without renewal',
    ].includes(st.status)
      ? st.status
      : overdue > 0
        ? 'Overdue'
        : due > 0
          ? financial.some((p) => p.paid > 0 && p.balance > 0)
            ? 'Partial payment'
            : 'Payment expected'
          : sourcePending
            ? 'Source payment note'
            : asOf < CUTOFF && ps.some((p) => p.imported)
              ? 'Historical balance unavailable'
              : sessions === 0 && !future.length
                ? 'Renewal needed'
                : ps.length
                  ? 'Covered'
                  : 'No package recorded';
    return {
      ...st,
      sessions,
      overrun: overrun.get(st.id) ?? 0,
      packages: financial,
      expectedDate,
      status,
      overdue,
      due,
      advanceCovered: future.some((p) => {
        const paid = packagePaid(p, receipts, asOf);
        return paid !== null && paid >= p.agreedFee;
      }),
      futurePackages: future,
    };
  });
}
export function cashSummary(
  records: DataRecord[],
  month: string,
  asOf: string,
) {
  const cutoff = asOf < monthEnd(month) ? asOf : monthEnd(month);
  const receipts = entries(records, 'receipt').filter(
    (r) => r.month === month && (!r.date || r.date <= cutoff),
  );
  const expenses = entries(records, 'expense').filter(
    (r) => r.month === month && (!r.date || r.date <= cutoff),
  );
  const collected = receipts.reduce(
      (n, r) => n + (typeof r.amount === 'number' ? r.amount : 0),
      0,
    ),
    paid = expenses.reduce(
      (n, r) => n + (typeof r.amount === 'number' ? r.amount : 0),
      0,
    );
  const payerIds = new Set(
    receipts.flatMap((r) =>
      r.studentId
        ? [r.studentId]
        : allocations(r)
            .map((a: any) => a.studentId)
            .filter(Boolean),
    ),
  );
  return {
    receipts,
    expenses,
    collected,
    paid,
    net: collected - paid,
    payerIds: [...payerIds],
    pendingExpenses: expenses.filter((r) => typeof r.amount !== 'number')
      .length,
    coverage: month >= '2026-06' || receipts.length > 0,
  };
}
