import { AppError, allRecords, getRecord, prepareRecord } from './server';
import { storeCall, decodeRecord } from './storage';
import { allowedRecords } from './domain';
import {
  bulkFields,
  canImport,
  canExport,
  parseEntry,
  stableJson,
  worksheetRows,
  type BulkRow,
} from './bulk';
import { csvCell } from './accounting';
import { CUTOFF, type Actor, type DataRecord } from './types';

async function hash(text: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}
function reference(
  records: DataRecord[],
  kind: string,
  value: string,
  studentId?: string,
) {
  const eligible = records.filter(
    (r) => r.kind === kind && (!studentId || r.studentId === studentId),
  );
  const exact = eligible.find((r) => r.id === value);
  if (exact) return exact;
  const matches = eligible.filter(
    (r) =>
      String(r.payload.name ?? r.payload.label ?? '')
        .normalize('NFC')
        .toLocaleLowerCase() === value.normalize('NFC').toLocaleLowerCase() &&
      !r.payload.canonicalStudentId,
  );
  if (matches.length !== 1)
    throw new AppError(
      'Unmatched or ambiguous ' +
        kind +
        ': ' +
        value +
        '. Use the record ID from the reference export.',
    );
  return matches[0];
}
async function prepare(
  a: Actor,
  kind: string,
  raw: Record<string, string>,
  records: DataRecord[],
  attendanceCutoff: string,
) {
  const { key, payload } = parseEntry(kind, raw);
  for (const [field, type] of [
    ['studentId', 'student'],
    ['classId', 'class'],
    ['packageId', 'package'],
    ['absenceId', 'attendance'],
    ['payrollId', 'payroll'],
  ]) {
    if (payload[field])
      payload[field] = reference(
        records,
        type,
        payload[field],
        field === 'packageId' ? payload.studentId : undefined,
      ).id;
  }
  if (kind === 'attendance') {
    const memberships = records.filter(
      (r) =>
        r.kind === 'membership' &&
        r.studentId === payload.studentId &&
        r.classId === payload.classId &&
        r.payload.forecast !== false &&
        (!r.payload.from || r.payload.from <= payload.date) &&
        (!r.payload.until || r.payload.until >= payload.date),
    );
    if (memberships.length !== 1)
      throw new AppError(
        'Choose a student with one current class membership on this lesson date.',
      );
    payload.membershipId = memberships[0].id;
  }
  if (kind === 'makeup')
    payload.classId = records.find((r) => r.id === payload.absenceId)?.classId;
  const fingerprint = await hash(stableJson(payload));
  const importKey = 'bulk:' + kind + ':' + (await hash(key));
  // Natural lesson keys retain the same duplicate safeguards as manual entry.
  const naturalId =
    kind === 'attendance'
      ? 'attendance:' + payload.membershipId + ':' + payload.date
      : kind === 'makeup'
        ? 'makeup:' + payload.absenceId
        : kind === 'calendar'
          ? 'calendar:' + payload.classId + ':' + payload.date
          : kind === 'reconciliation'
            ? 'recon:' + payload.month + ':' + payload.account
            : importKey;
  const prior = records.find(
    (r) => r.id === naturalId || r.payload.bulkKey === importKey,
  );
  if (prior) {
    if (
      prior.payload.bulkKey === importKey &&
      prior.payload.bulkFingerprint === fingerprint
    )
      return { key, payload, prior, command: null };
    throw new AppError(
      'This reference or lesson already exists with different data. Edit the existing record; imports never overwrite it.',
    );
  }
  if (['student', 'lead', 'class', 'catalogue'].includes(kind)) {
    const name = String(payload.name || payload.label)
      .normalize('NFC')
      .toLowerCase();
    if (
      records.some(
        (r) =>
          r.kind === kind &&
          String(r.payload.name || r.payload.label)
            .normalize('NFC')
            .toLowerCase() === name &&
          (kind !== 'student' || r.classId === payload.classId),
      )
    )
      throw new AppError(
        'A matching name already exists. Review the existing record before adding another.',
      );
  }
  const command = await prepareRecord(
    a,
    { kind, payload, reason: 'Worksheet import: ' + key },
    importKey,
    { records, attendanceCutoff },
  );
  command.record.payload.bulkKey = importKey;
  command.record.payload.bulkFingerprint = fingerprint;
  command.record.payload.entryKey = key;
  return { key, payload, prior: null, command };
}
export async function bulkPreview(a: Actor, kind: string, csv: string) {
  if (!canImport(a, kind))
    throw new AppError('Your role cannot import this worksheet.', 403);
  let rows: Record<string, string>[];
  try {
    rows = worksheetRows(csv, kind);
  } catch (e) {
    throw new AppError(e instanceof Error ? e.message : 'Invalid worksheet.');
  }
  const records = allowedRecords(a, await allRecords());
  const refresh =
    kind === 'attendance'
      ? await storeCall('get_setting', { key: 'student-source-refresh' })
      : null;
  const attendanceCutoff = refresh
    ? JSON.parse(refresh).dataDate || CUTOFF
    : CUTOFF;
  const result: BulkRow[] = [];
  const keys = new Set<string>();
  const identities = new Set<string>();
  for (const [i, raw] of rows.entries()) {
    const base = {
      row: i + 2,
      key: raw.entryKey || '',
      label:
        raw.name ||
        raw.title ||
        raw.label ||
        raw.studentId ||
        raw.description ||
        '',
    };
    try {
      if (keys.has(raw.entryKey.trim()))
        throw new AppError('Duplicate entry reference in this worksheet.');
      keys.add(raw.entryKey.trim());
      const prepared = await prepare(a, kind, raw, records, attendanceCutoff);
      const identity = prepared.command?.record.id ?? prepared.prior!.id;
      if (identities.has(identity))
        throw new AppError('Duplicate lesson or record in this worksheet.');
      identities.add(identity);
      result.push({
        ...base,
        id: identity,
        status: prepared.prior ? 'Already imported' : 'Ready',
        payload: prepared.payload,
      });
    } catch (e) {
      result.push({
        ...base,
        status: 'Needs correction',
        error: e instanceof Error ? e.message : 'Unable to validate row.',
      });
    }
  }
  return {
    rows: result,
    digest: await hash(kind + ':' + csv),
    count: result.length,
  };
}
/** Each row is a guarded database transaction. Retry the same worksheet safely after interruption. */
export async function bulkCommit(
  a: Actor,
  kind: string,
  csv: string,
  digest: string,
) {
  const preview = await bulkPreview(a, kind, csv);
  if (digest !== preview.digest)
    throw new AppError('The worksheet changed. Preview it again.', 409);
  if (preview.rows.some((r) => r.status === 'Needs correction'))
    return { ...preview, committed: false };
  const rawRows = worksheetRows(csv, kind);
  const records = allowedRecords(a, await allRecords());
  const refresh =
    kind === 'attendance'
      ? await storeCall('get_setting', { key: 'student-source-refresh' })
      : null;
  const attendanceCutoff = refresh
    ? JSON.parse(refresh).dataDate || CUTOFF
    : CUTOFF;
  for (let i = 0; i < rawRows.length; i++) {
    const row = preview.rows[i];
    try {
      const prepared = await prepare(
        a,
        kind,
        rawRows[i],
        records,
        attendanceCutoff,
      );
      if (!prepared.command) {
        row.status = 'Already imported';
        continue;
      }
      try {
        const saved = decodeRecord(
          await storeCall('commit_record', prepared.command),
        );
        records.push(saved);
        row.status = 'Saved';
      } catch (e) {
        const saved = await getRecord(prepared.command.record.id);
        if (
          !saved ||
          saved.payload.bulkKey !== prepared.command.record.payload.bulkKey ||
          saved.payload.bulkFingerprint !==
            prepared.command.record.payload.bulkFingerprint
        )
          throw e;
        row.status = 'Already imported';
        records.push(saved);
      }
    } catch (e) {
      row.status = 'Needs correction';
      row.error =
        e instanceof Error
          ? e.message
          : 'Unable to save row. Retry this worksheet.';
    }
  }
  return { ...preview, committed: true };
}
export async function exportRecords(
  a: Actor,
  kind: string,
  month = '',
  classId = '',
) {
  if (!canExport(a, kind))
    throw new AppError('Your role cannot export this worksheet.', 403);
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new AppError('Choose a valid month.');
  const records = allowedRecords(a, await allRecords());
  const definitions = bulkFields(kind);
  const additional = [
    ...new Set(
      records
        .filter((r) => r.kind === kind)
        .flatMap((r) => Object.keys(r.payload)),
    ),
  ]
    .filter(
      (key) =>
        !definitions.some((f) => f.key === key) &&
        !['bulkKey', 'bulkFingerprint'].includes(key),
    )
    .sort();
  const headers = [
    'recordId',
    ...definitions.map((f) => f.key),
    ...additional,
    'revision',
    'updatedAt',
  ];
  const rows = records.filter(
    (r) =>
      r.kind === kind &&
      (!classId || r.classId === classId) &&
      (!month ||
        String(
          r.payload.month ||
            r.date ||
            r.payload.from ||
            r.payload.enrollmentDate ||
            '',
        ).startsWith(month)),
  );
  return (
    '\uFEFF' +
    [
      headers,
      ...rows.map((r) => [
        r.id,
        ...definitions.map((f) => {
          const value =
            f.key === 'entryKey' ? r.payload.entryKey || '' : r.payload[f.key];
          return value && typeof value === 'object'
            ? JSON.stringify(value)
            : (value ?? '');
        }),
        ...additional.map((key) => {
          const value = r.payload[key];
          return value && typeof value === 'object'
            ? JSON.stringify(value)
            : (value ?? '');
        }),
        r.revision,
        r.updatedAt,
      ]),
    ]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n')
  );
}
export async function referenceCsv(a: Actor) {
  const records = allowedRecords(a, await allRecords());
  const names = new Map(
    records.map((r) => [r.id, r.payload.name || r.payload.label || '']),
  );
  const kinds =
    a.role === 'TA'
      ? ['class', 'student', 'attendance']
      : ['class', 'student', 'package', 'attendance', 'payroll'];
  return (
    '\uFEFF' +
    [
      ['recordId', 'type', 'name', 'student', 'class', 'date', 'status'],
      ...records
        .filter(
          (r) =>
            kinds.includes(r.kind) &&
            (r.kind !== 'attendance' ||
              ['A', 'L', 'K'].includes(r.payload.mark)),
        )
        .map((r) => [
          r.id,
          r.kind,
          names.get(r.id),
          names.get(r.studentId) || '',
          names.get(r.classId) || '',
          r.date,
          r.payload.status || r.payload.mark || '',
        ]),
    ]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n')
  );
}
