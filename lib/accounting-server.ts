import type { Actor } from './types';
import { AppError, requireRole } from './server';
import { storeCall } from './storage';
import {
  documentKinds,
  parseSourceCsv,
  sourceAmount,
  validDate,
  validateJournal,
} from './accounting';
const uuid = (v: unknown) =>
  typeof v === 'string' &&
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
function bounded(v: unknown, max: number, required = false) {
  if (typeof v !== 'string' || v.length > max || (required && !v.trim()))
    throw new AppError('Complete the required fields.');
  return v.trim();
}
export async function listAccounting(a: Actor, q: URLSearchParams) {
  requireRole(a, ['Director', 'Finance']);
  const offset = Number(q.get('offset') || 0);
  const month = q.get('month') || '';
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new AppError('Choose a valid period.');
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1e6)
    throw new AppError('Invalid page.');
  return storeCall('fin_list', {
    actorId: a.userId,
    tab: q.get('tab') === 'imports' ? 'imports' : 'documents',
    status: (q.get('status') || '').slice(0, 40),
    offset,
    month,
  });
}
export function previewSource(input: any) {
  let parsed;
  try {
    parsed = parseSourceCsv(bounded(input.csv, 1_000_000, true));
  } catch (e) {
    throw new AppError(e instanceof Error ? e.message : 'Check the CSV file.');
  }
  const mapping = input.mapping || {};
  for (const key of ['externalId', 'date', 'amount'])
    if (!parsed.headers.includes(mapping[key]))
      throw new AppError('Map the document ID, date and amount columns.');
  if (
    !['plain', 'vn', 'en'].includes(input.numberFormat) ||
    !['iso', 'dmy'].includes(input.dateFormat)
  )
    throw new AppError('Choose date and number formats.');
  if (!['MISA', 'Bank', 'Spreadsheet', 'Top ID'].includes(input.source))
    throw new AppError('Choose the source.');
  const dataset = bounded(input.dataset, 200, true),
    view = bounded(input.view, 160, true),
    fileName = bounded(input.fileName, 250, true);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period))
    throw new AppError('Choose a valid period.');
  const rows = parsed.rows.map((raw, index) => {
    try {
      let date = (raw[mapping.date] || '').trim();
      if (input.dateFormat === 'dmy') {
        const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(date);
        if (match)
          date = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
      }
      if (!validDate(date)) throw new Error('Check the source date.');
      return {
        externalId: bounded(raw[mapping.externalId], 200, true),
        date,
        amount: sourceAmount(raw[mapping.amount], input.numberFormat),
        name: bounded(raw[mapping.name] || '', 300),
        reference: bounded(raw[mapping.reference] || '', 1000),
        category: bounded(raw[mapping.category] || '', 200),
        direction: bounded(raw[mapping.direction] || '', 100),
        raw,
      };
    } catch (e) {
      throw new AppError(
        `Row ${index + 2}: ${e instanceof Error ? e.message : 'Check source values.'}`,
      );
    }
  });
  return {
    source: input.source,
    dataset,
    view,
    period: input.period,
    fileName,
    rows,
    outsidePeriod: rows.filter((r) => r.date.slice(0, 7) !== input.period)
      .length,
    duplicateIds: rows.length - new Set(rows.map((r) => r.externalId)).size,
  };
}
export async function accountingCommand(a: Actor, input: any) {
  requireRole(a, ['Director', 'Finance']);
  if (!a.active) throw new AppError('Account disabled.', 403);
  if (input.operation === 'preview') return previewSource(input.payload);
  if (input.operation === 'history') {
    if (!uuid(input.id)) throw new AppError('Choose a document.');
    return storeCall('fin_history', { actorId: a.userId, id: input.id });
  }
  if (!uuid(input.commandId))
    throw new AppError('Refresh the form before saving.');
  const args: any = { actorId: a.userId, commandId: input.commandId };
  if (input.operation === 'stage') {
    const p = previewSource(input.payload);
    const hash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(input.payload.csv),
    );
    args.payload = {
      ...p,
      fileHash: Array.from(new Uint8Array(hash), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join(''),
    };
  } else {
    if (!uuid(input.id)) throw new AppError('Choose a document.');
    args.id = input.id;
    if (
      input.revision != null &&
      (!Number.isSafeInteger(input.revision) || input.revision < 1)
    )
      throw new AppError('Refresh the record before saving.');
    args.revision = input.revision ?? null;
    const p = input.payload || {};
    if (input.operation === 'save') {
      if (!documentKinds.includes(p.kind))
        throw new AppError('Choose a document type.');
      if (!validDate(p.date) || (p.dueDate && !validDate(p.dueDate)))
        throw new AppError('Check the document dates.');
      if (!Number.isSafeInteger(p.amount) || p.amount < 0 || p.amount > 1e12)
        throw new AppError('Enter an amount in whole VND.');
      const lines = p.lines || [];
      if (lines.length) {
        try {
          validateJournal(lines);
        } catch (e) {
          throw new AppError(
            e instanceof Error ? e.message : 'Check journal lines.',
          );
        }
      }
      args.payload = {
        kind: p.kind,
        date: p.date,
        dueDate: p.dueDate || '',
        title: bounded(p.title, 250, true),
        counterparty: bounded(p.counterparty || '', 250),
        amount: p.amount,
        notes: bounded(p.notes || '', 5000),
        lines,
      };
    } else if (input.operation === 'action') {
      if (
        ![
          'submit',
          'approve',
          'return',
          'archive',
          'restore',
          'delete',
          'post',
        ].includes(p.action)
      )
        throw new AppError('Choose an action.');
      if (['approve', 'post'].includes(p.action)) requireRole(a, ['Director']);
      args.payload = {
        action: p.action,
        note: bounded(p.note || '', 1000),
        date: p.date || '',
      };
    } else if (input.operation === 'review') {
      if (
        ![
          'Matched',
          'Excluded',
          'Draft created',
          'Needs confirmation',
        ].includes(p.status)
      )
        throw new AppError('Choose a review decision.');
      args.payload = {
        status: p.status,
        note: bounded(p.note, 1000, true),
        recordId: bounded(p.recordId || '', 200),
        kind: p.kind,
      };
    } else if (input.operation === 'settle') {
      if (!Number.isSafeInteger(p.amount) || p.amount <= 0 || p.amount > 1e12)
        throw new AppError('Enter an amount in whole VND.');
      args.payload = {
        cashRecordId: bounded(p.cashRecordId, 200, true),
        amount: p.amount,
        evidence: bounded(p.evidence, 1000, true),
      };
    } else throw new AppError('Unsupported accounting action.');
  }
  return storeCall('fin_' + input.operation, args);
}
