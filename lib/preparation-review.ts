import {
  preparationModules,
  preparationRequired,
  reviewChoices,
} from './preparation-schema.mjs';
import type { DataRecord } from './types';
import type {
  PreparationBaseline,
  PreparationModule,
  PreparationReport,
  PreparationRow,
  PreparationScalar,
  PreparationStatus,
  PreparationSubmissions,
  PreparationValues,
} from './preparation-types';
export type {
  PreparationReport,
  PreparationRow,
  PreparationStatus,
} from './preparation-types';
const modules: PreparationModule[] = preparationModules;
const has = (v: PreparationScalar | null | undefined) =>
  v !== '' && v !== null && v !== undefined;
const validDate = (v: PreparationScalar) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
const reference = (v: PreparationScalar | undefined) =>
  String(v || '')
    .split(' | ')[0]
    .trim();
export function reviewPreparation(
  baseline: PreparationBaseline,
  submissions: PreparationSubmissions,
  records: DataRecord[],
): PreparationReport {
  const current = new Map(records.map((r) => [r.id, r]));
  const references = new Map<string, Set<string>>(
    Object.entries(baseline.tables).map(([k, t]) => [
      k,
      new Set(t.rows.map((r) => r.ref)),
    ]),
  );
  references.set('classes', new Set(baseline.classes.map((c) => c.id)));
  const result: PreparationRow[] = [];
  for (const m of modules) {
    const rows = new Map(baseline.tables[m.key].rows.map((r) => [r.ref, r]));
    for (const row of submissions[m.key]) {
      const source = rows.get(row.ref),
        cells = row.cells;
      if (!source) throw Error('Unknown preparation row reference.');
      const proposed: PreparationValues = {};
      const issues: string[] = [];
      for (const f of m.inputs) {
        const value = cells[f.key];
        if (!has(value)) continue;
        proposed[f.key] = value;
        if (['money', 'number', 'decimal'].includes(f.type)) {
          if (
            typeof value !== 'number' ||
            !Number.isFinite(value) ||
            Math.abs(value) > 1e12 ||
            (f.type !== 'decimal' && !Number.isSafeInteger(value)) ||
            (f.key !== 'adjustment' && value < 0)
          )
            issues.push(
              f.label +
                ': enter a valid ' +
                (f.type === 'decimal' ? 'number' : 'whole number') +
                '.',
            );
        } else if (f.type === 'date' && !validDate(value))
          issues.push(f.label + ': use a valid date.');
        else if (
          f.type === 'month' &&
          !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(value))
        )
          issues.push(f.label + ': use YYYY-MM.');
        else if (f.choices && !f.choices.includes(String(value)))
          issues.push(f.label + ': select a listed choice.');
        else if (f.reference) {
          proposed[f.key] = reference(value);
          if (!references.get(f.reference)?.has(reference(value)))
            issues.push(f.label + ': unknown reference.');
        } else if (typeof value !== 'string')
          issues.push(f.label + ': keep identifiers and text as text.');
        if (typeof value === 'string' && /^[=+@\t\r]/.test(value))
          issues.push(f.label + ': plain text only, no formulas.');
      }
      for (const key of ['reason', 'evidence'])
        if (has(cells[key])) {
          if (typeof cells[key] !== 'string') issues.push(key + ': use text.');
          else proposed[key] = cells[key];
        }
      const decision = String(cells.review || '');
      if (decision && !reviewChoices.includes(decision))
        issues.push('Choose a listed review status.');
      const changes = Object.keys(proposed).filter(
        (k) => !['reason', 'evidence'].includes(k),
      );
      if (!source.existing && !decision && !Object.keys(proposed).length)
        continue;
      const live = source.recordId ? current.get(source.recordId) : null;
      let status: PreparationStatus = source.existing
        ? 'Unchanged'
        : 'Addition';
      if (changes.length && source.existing) status = 'Proposed correction';
      if (decision === 'Đúng, giữ nguyên' && changes.length)
        issues.push('Keep unchanged conflicts with entered correction fields.');
      if (decision === 'Không áp dụng') {
        status = 'Not applicable';
        if (changes.length)
          issues.push('Remove proposed values or choose a correction status.');
      }
      const gaps: string[] = [];
      if (!source.existing && decision !== 'Không áp dụng')
        for (const key of (preparationRequired as Record<string, string[]>)[
          m.key
        ] || [])
          if (!has(proposed[key]))
            gaps.push('Missing: ' + m.inputs.find((f) => f.key === key)?.label);
      if (
        changes.length &&
        (!decision || decision === 'Chưa rõ' || decision === 'Cần kiểm tra')
      )
        gaps.push('Accountant confirmation is needed.');
      if (changes.length && source.existing && !has(proposed.reason))
        gaps.push('Explain the proposed correction.');
      if (
        m.key === 'agreements' &&
        proposed.scope === 'Một lớp' &&
        !proposed.classRef
      )
        gaps.push('Choose the restricted class.');
      if (
        m.key === 'work' &&
        changes.length &&
        !has(proposed.hours) &&
        !has(proposed.lessons)
      )
        gaps.push('Enter confirmed hours or lessons.');
      if (
        m.key === 'opening' &&
        changes.length &&
        !has(proposed.debit) &&
        !has(proposed.credit)
      )
        gaps.push('Enter a reviewed debit or credit balance.');
      if (
        m.key === 'allocations' &&
        changes.length &&
        proposed.purpose !== 'Tín dụng chưa phân bổ' &&
        !proposed.studentRef
      )
        gaps.push('Choose the student for this allocation.');
      if (decision === 'Chưa rõ' || decision === 'Cần kiểm tra' || gaps.length)
        status = 'Needs information';
      if (issues.length) status = 'Invalid';
      // Even an unchanged row can be stale; never silently overwrite newer work.
      if (source.recordId && (!live || live.revision !== source.revision)) {
        status = 'Conflict';
        issues.push(
          live
            ? 'BOH changed after this workbook was created.'
            : 'The original BOH record is no longer available.',
        );
      }
      result.push({
        module: m.key,
        sheet: m.sheet,
        ref: row.ref,
        line: row.line,
        name: String(source.original.name || proposed.name || row.ref),
        status,
        reviewed: !!decision,
        decision,
        issues: [...issues, ...gaps],
        proposed,
        original: source.original,
        recordId: source.recordId,
        recordRevision: source.revision,
        currentRevision: live?.revision,
        effect: 'Review only — no money, student, stock or journal changes.',
      });
    }
  }
  const byRef = new Map(result.map((r) => [r.ref, r]));
  // A reference to an unused reserved slot is not an existing business record.
  for (const row of result)
    for (const f of modules.find((m) => m.key === row.module)!.inputs)
      if (f.reference && f.reference !== 'classes' && row.proposed[f.key]) {
        const target = byRef.get(reference(row.proposed[f.key]));
        if (
          !target ||
          [
            'Invalid',
            'Needs information',
            'Not applicable',
            'Conflict',
          ].includes(target.status)
        ) {
          row.issues.push(
            f.label + ': referenced row is empty or still needs review.',
          );
          if (row.status !== 'Conflict' && row.status !== 'Invalid')
            row.status = 'Needs information';
        }
      }
  const allocations = new Map<string, PreparationRow[]>();
  const receiptReferences = new Map(
    result
      .filter((r) => r.module === 'receipts' && r.recordId)
      .map((r) => [r.recordId, r.ref]),
  );
  for (const r of result.filter((r) => r.module === 'allocations')) {
    // Existing allocation rows retain their source receipt linkage even when
    // every yellow correction field is blank. "Not applicable" is not deletion.
    if (!r.recordId && r.status === 'Not applicable') continue;
    const key = reference(
      r.proposed.receiptRef || receiptReferences.get(r.recordId),
    );
    if (key) allocations.set(key, [...(allocations.get(key) || []), r]);
  }
  for (const [key, rows] of allocations) {
    const receipt = byRef.get(key),
      available = receipt?.proposed.amount ?? receipt?.original.amount;
    const amounts = rows.map((r) => r.proposed.amount ?? r.original.amount);
    if (
      typeof available === 'number' &&
      amounts.every((a): a is number => typeof a === 'number') &&
      amounts.reduce((a, b) => a + b, 0) > available
    )
      for (const row of rows) {
        row.issues.push('Proposed allocations exceed the receipt amount.');
        if (row.status !== 'Conflict') row.status = 'Invalid';
      }
  }
  return {
    sourceDate: baseline.capturedAt,
    sourceFingerprint: baseline.sourceFingerprint,
    rows: result,
    counts: result.reduce(
      (counts, r) => ((counts[r.status] = (counts[r.status] || 0) + 1), counts),
      {} as Record<string, number>,
    ),
    unreviewed: result.filter((r) => !r.reviewed).length,
    financialChanges: 0,
    controlTotals: baseline.controlTotals,
  };
}
