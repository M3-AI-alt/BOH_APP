import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import type { Actor } from './types';
import {
  StorageError,
  storeCall,
  findRecord,
  listRecords,
  decodeRecord,
} from './storage';
import {
  allowedRecords,
  canWrite,
  today,
  entries,
  cashSummary,
  monthEnd,
} from './domain';
import { CUTOFF } from './types';
import imported from '@boh/private-import';

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function actor(): Promise<Actor> {
  const u =
    (await getChatGPTUser()) ??
    (process.env.NODE_ENV === 'development'
      ? {
          userId: 'local-director',
          email: 'seedy@sites.test',
          fullName: 'Director',
        }
      : null);
  if (!u) throw new AppError('Please sign in to continue.', 401);
  const email = u.email.trim().toLowerCase();
  let row = await storeCall('staff_by_user', { userId: u.userId });
  if (!row) {
    const pending = await storeCall('staff_by_email', { email });
    if (pending && !pending.user_id)
      row = await storeCall('claim_staff', { email, userId: u.userId });
  }
  if (
    !row &&
    env.BOH_OWNER_EMAIL &&
    email === env.BOH_OWNER_EMAIL.toLowerCase()
  )
    row = await storeCall('ensure_owner', {
      userId: u.userId,
      email,
      name: u.fullName ?? 'Director',
    });
  if (!row || !row.active)
    throw new AppError(
      'Your account does not have staff access. Ask the Director to add your sign-in email.',
      403,
    );
  return {
    userId: u.userId,
    email: row.email,
    name: row.name,
    role: row.role,
    classIds: row.class_ids,
    active: !!row.active,
  };
}
export function requireRole(a: Actor, roles: string[]) {
  if (!roles.includes(a.role))
    throw new AppError('Your role cannot perform this action.', 403);
}
export function protectWrite(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    throw new AppError('Cross-site request rejected.', 403);
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new AppError('JSON request required.', 415);
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    throw new AppError('Cross-site request rejected.', 403);
}
export async function body(request: Request) {
  protectWrite(request);
  const text = await request.text();
  if (text.length > 65000) throw new AppError('The request is too large.', 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('Invalid request.');
  }
}
export function response(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
export function failure(e: unknown) {
  if (e instanceof AppError || e instanceof StorageError)
    return response({ error: e.message }, e.status);
  console.error(
    'BOH request failed',
    e instanceof Error ? e.message : 'unknown',
  );
  return response(
    {
      error:
        'Could not save or load the record. Please retry. Your existing data is unchanged.',
    },
    500,
  );
}
export const getRecord = findRecord;
export const allRecords = listRecords;
export async function snapshot(a: Actor) {
  const marker = await storeCall('get_setting', { key: 'import-complete' });
  if (!marker)
    return {
      actor: a,
      needsImport: true,
      records: [],
      members: [],
      activity: [],
      manifest: a.role === 'TA' ? { cutoff: CUTOFF } : imported.manifest,
      loadedAt: new Date().toISOString(),
    };
  const [data, members, activity, manifestText, refreshText, auditText] =
    await Promise.all([
      allRecords(),
      a.role === 'Director' ? storeCall('list_staff') : [],
      a.role === 'TA' ? [] : storeCall('list_activity'),
      storeCall('get_setting', { key: 'import-manifest' }),
      storeCall('get_setting', { key: 'student-source-refresh' }),
      a.role === 'TA'
        ? null
        : storeCall('get_setting', { key: 'workbook-audit' }),
    ]);
  const manifest = manifestText ? JSON.parse(manifestText) : imported.manifest;
  const sourceRefresh = refreshText ? JSON.parse(refreshText) : null;
  return {
    actor: a,
    records: allowedRecords(a, data),
    members,
    activity,
    manifest:
      a.role === 'TA'
        ? { cutoff: sourceRefresh?.dataDate || CUTOFF }
        : {
            ...manifest,
            cutoff: sourceRefresh?.dataDate || CUTOFF,
            sourceRefresh,
            workbookAudit: auditText ? JSON.parse(auditText) : null,
          },
    loadedAt: new Date().toISOString(),
    database: 'Supabase',
  };
}
export async function importChunk(a: Actor) {
  requireRole(a, ['Director']);
  if (await storeCall('get_setting', { key: 'import-complete' }))
    return { done: true, progress: 100 };
  if (!imported.records.length)
    throw new AppError(
      'Private source data has not been connected. Ask the Director to complete setup.',
      503,
    );
  const cursor = Number(
      (await storeCall('get_setting', { key: 'import-cursor' })) ?? 0,
    ),
    chunk = imported.records.slice(cursor, cursor + 100),
    next = cursor + chunk.length;
  const result = await storeCall('import_chunk', {
    cursor,
    next,
    records: chunk,
    done: next >= imported.records.length,
    version: imported.manifest.version,
    manifest: imported.manifest,
  });
  return {
    ...result,
    progress: Math.round((next / imported.records.length) * 100),
    count: next,
  };
}

const validKinds = [
  'student',
  'class',
  'membership',
  'attendance',
  'package',
  'receipt',
  'expense',
  'makeup',
  'support',
  'lead',
  'commitment',
  'calendar',
  'close',
  'reconciliation',
  'payroll',
  'task',
];
const fields: Record<string, string[]> = {
  student: [
    'name',
    'classId',
    'status',
    'parent',
    'phone',
    'pauseFrom',
    'resumeDate',
    'notes',
    'transferDate',
    'preferredName',
    'birthDate',
    'enrollmentDate',
    'school',
    'parentEmail',
    'secondParent',
    'secondPhone',
    'zalo',
    'address',
    'learningGoals',
  ],
  class: ['name', 'color', 'weekdays', 'archived'],
  membership: [
    'studentId',
    'classId',
    'from',
    'until',
    'schedule',
    'position',
    'forecast',
  ],
  attendance: ['membershipId', 'studentId', 'classId', 'date', 'mark', 'note'],
  package: [
    'studentId',
    'classId',
    'label',
    'sessions',
    'startDate',
    'agreedFee',
    'dueDate',
    'scope',
    'notes',
  ],
  receipt: [
    'date',
    'month',
    'amount',
    'account',
    'name',
    'description',
    'category',
    'purpose',
    'studentId',
    'packageId',
    'allocations',
    'reference',
    'reconciled',
  ],
  expense: [
    'date',
    'month',
    'amount',
    'account',
    'name',
    'description',
    'category',
    'reference',
    'reconciled',
    'payrollId',
  ],
  makeup: [
    'studentId',
    'classId',
    'date',
    'absenceId',
    'missedDate',
    'makeupClass',
    'teacher',
    'notes',
    'status',
  ],
  support: [
    'studentId',
    'classId',
    'date',
    'notes',
    'teacher',
    'evaluation',
    'status',
  ],
  lead: [
    'name',
    'parent',
    'phone',
    'classId',
    'status',
    'followUp',
    'notes',
    'studentId',
  ],
  commitment: [
    'category',
    'description',
    'amount',
    'frequency',
    'account',
    'dueDate',
    'notes',
  ],
  calendar: ['classId', 'date', 'open', 'reason'],
  close: ['month', 'status', 'notes'],
  reconciliation: ['month', 'account', 'opening', 'statementClosing', 'notes'],
  payroll: [
    'month',
    'name',
    'position',
    'gross',
    'deductions',
    'net',
    'employerInsurance',
    'status',
    'notes',
  ],
  task: [
    'title',
    'date',
    'dueDate',
    'category',
    'assignedTo',
    'status',
    'notes',
  ],
};
function text(v: any, name: string, required = false, max = 1200) {
  if (v === undefined || v === null) {
    if (required) throw new AppError(name + ' is required.');
    return '';
  }
  if (typeof v !== 'string' || v.length > max || (required && !v.trim()))
    throw new AppError('Check ' + name + '.');
  return v.trim();
}
function day(v: any, name: string, required = false) {
  if (!v && !required) return '';
  const s = text(v, name, true, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    Number.isNaN(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    throw new AppError('Enter a valid ' + name + '.');
  return s;
}
function amount(v: any, name: string, min = 0) {
  if (
    typeof v !== 'number' ||
    !Number.isFinite(v) ||
    v < min ||
    v > 1000000000000
  )
    throw new AppError('Enter a valid ' + name + '.');
  return v;
}
async function related(id: any, kind: string) {
  if (typeof id !== 'string') throw new AppError('Select a ' + kind + '.');
  const r = await getRecord(id);
  if (!r || r.kind !== kind)
    throw new AppError('Select an existing ' + kind + '.');
  return r;
}
async function canonicalStudent(id: string) {
  const seen = new Set<string>();
  let record = await related(id, 'student');
  while (record.payload.canonicalStudentId) {
    if (seen.has(record.id))
      throw new AppError('Student identity needs Director review.');
    seen.add(record.id);
    record = await related(record.payload.canonicalStudentId, 'student');
  }
  return record;
}
export async function linkStudentRecord(a: Actor, input: any) {
  if (!a.active || a.role !== 'Director')
    throw new AppError('Only the Director can match source lessons.', 403);
  const id = text(input.id, 'source record', true, 200);
  const studentId = text(input.studentId, 'student', true, 200);
  const reason = text(input.reason, 'source evidence', true, 1000);
  if (!Number.isSafeInteger(input.revision) || input.revision < 1)
    throw new AppError('Refresh the source record first.');
  return decodeRecord(
    await storeCall('link_student_record', {
      id,
      studentId,
      reason,
      revision: input.revision,
      actorId: a.userId,
    }),
  );
}
export async function saveRecord(a: Actor, input: any) {
  const kind = text(input.kind, 'record type', true);
  if (!validKinds.includes(kind))
    throw new AppError('Unsupported record type.');
  const old = input.id ? await getRecord(text(input.id, 'record', true)) : null;
  if (input.id && !old)
    throw new AppError('This record no longer exists.', 404);
  if (old && old.kind !== kind)
    throw new AppError('Record type cannot change.');
  const p: any = { ...(old?.payload ?? {}) };
  for (const key of fields[kind])
    if (Object.hasOwn(input.payload ?? {}, key)) p[key] = input.payload[key];
  const classId =
    typeof p.classId === 'string' ? p.classId : (old?.classId ?? '');
  if (!canWrite(a, kind, classId) || (old && !canWrite(a, kind, old.classId)))
    throw new AppError('Your role cannot edit this record.', 403);
  if (old && Number(input.revision) !== old.revision)
    throw new AppError(
      'Someone updated this record. Refresh before saving your changes.',
      409,
    );
  if (
    old?.payload.historical &&
    ['attendance', 'makeup', 'support'].includes(kind)
  )
    throw new AppError(
      'Original history is preserved. Add a new dated record instead.',
    );
  if (p.classId) await related(p.classId, 'class');
  if (p.studentId) {
    const student = await related(p.studentId, 'student');
    if (
      student.payload.canonicalStudentId &&
      (!old || old.payload.studentId !== p.studentId) &&
      ['package', 'membership', 'receipt', 'support'].includes(kind)
    )
      throw new AppError(
        'Select the linked current student profile, not an old transfer identity.',
      );
  }
  let id = old?.id ?? crypto.randomUUID();
  if (['receipt', 'expense'].includes(kind)) {
    p.date = day(p.date, 'payment date', true);
    if (p.date > today())
      throw new AppError(
        'Cash payments need an actual date, not a future forecast.',
      );
    p.month = p.date.slice(0, 7);
    p.amount = amount(p.amount, 'amount', 1);
    if (!Number.isSafeInteger(p.amount)) throw new AppError('Enter whole VND.');
    p.account = text(p.account, 'account', true, 100);
    p.description = text(p.description, 'description', kind === 'expense');
    p.name = text(p.name, 'payer', kind === 'receipt');
    p.reference = text(p.reference, 'reference', false, 1000);
    p.reconciled = !!p.reconciled;
    for (const m of new Set([p.month, old?.payload.month].filter(Boolean))) {
      const close = await getRecord('close:' + m);
      if (close?.payload.status === 'Closed')
        throw new AppError(
          'This month is closed. The Director must reopen it before changes.',
        );
    }
    if (kind === 'receipt') {
      if (!['Tuition', 'Deposit', 'Books', 'Other income'].includes(p.purpose))
        throw new AppError('Choose a payment purpose.');
      const splits = Array.isArray(p.allocations) ? p.allocations : [];
      if (splits.length > 20)
        throw new AppError('Too many receipt allocations.');
      let total = 0;
      for (const split of splits) {
        const pkg = await related(split.packageId, 'package');
        amount(split.amount, 'allocated amount', 1);
        if (
          (await canonicalStudent(pkg.studentId)).id !==
          (await canonicalStudent(split.studentId)).id
        )
          throw new AppError('Allocation student does not match package.');
        total += split.amount;
      }
      if (splits.length && total !== p.amount)
        throw new AppError('Allocated amounts must equal the receipt exactly.');
      if (splits.length) {
        p.packageId = '';
        p.studentId = '';
      } else if (p.packageId) {
        const pkg = await related(p.packageId, 'package');
        if (
          (await canonicalStudent(pkg.studentId)).id !==
          (await canonicalStudent(p.studentId)).id
        )
          throw new AppError('Select the package belonging to this student.');
      }
      p.allocations = splits;
    } else p.category = text(p.category, 'expense category', true, 100);
    if (
      old?.payload.imported &&
      p.amount !== old.payload.amount &&
      !text(input.reason, 'reason')
    )
      throw new AppError(
        'Enter a reason before correcting an imported amount.',
      );
  }
  if (kind === 'expense' && p.payrollId) {
    await related(p.payrollId, 'payroll');
    p.category = 'Payroll';
  }
  if (kind === 'payroll') {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.month))
      throw new AppError('Choose a valid payroll month.');
    p.name = text(p.name, 'staff name', true, 160);
    p.gross = amount(p.gross, 'gross salary');
    p.deductions = amount(p.deductions, 'deductions');
    p.employerInsurance = amount(
      p.employerInsurance ?? 0,
      'employer insurance',
    );
    p.net = p.gross - p.deductions;
    if (p.net < 0) throw new AppError('Deductions exceed gross salary.');
    if (!['Draft', 'Approved', 'Needs confirmation'].includes(p.status))
      throw new AppError('Choose payroll status.');
  }
  if (kind === 'task') {
    p.title = text(p.title, 'task title', true, 160);
    p.date = day(p.date, 'work date');
    p.dueDate = day(p.dueDate, 'due date');
    p.assignedTo = text(p.assignedTo, 'assigned person', false, 160);
    if (
      !['To do', 'In progress', 'Done', 'Logged in source'].includes(p.status)
    )
      throw new AppError('Choose task status.');
  }
  if (kind === 'student') {
    p.name = text(p.name, 'student name', true, 160);
    if (
      ![
        'Active',
        'Paused',
        'Stopped',
        'Roster only',
        'Free',
        'Ends without renewal',
        'Archived',
        'Transferred',
      ].includes(p.status)
    )
      throw new AppError('Choose a student status.');
    p.parent = text(p.parent, 'parent', false, 200);
    p.phone = text(p.phone, 'phone', false, 50);
    for (const key of ['preferredName', 'school', 'secondParent', 'zalo'])
      p[key] = text(p[key], key, false, 200);
    p.secondPhone = text(p.secondPhone, 'second phone', false, 50);
    p.parentEmail = text(p.parentEmail, 'parent email', false, 200);
    if (p.parentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.parentEmail))
      throw new AppError('Enter a valid parent email.');
    p.address = text(p.address, 'address', false, 500);
    p.learningGoals = text(p.learningGoals, 'learning goals', false, 1500);
    p.birthDate = day(p.birthDate, 'date of birth');
    if (p.birthDate && p.birthDate > today())
      throw new AppError('Date of birth cannot be in the future.');
    p.enrollmentDate = day(p.enrollmentDate, 'enrollment date');
    if (
      old?.payload.canonicalStudentId ||
      (p.status !== old?.payload.status &&
        [p.status, old?.payload.status].some((status) =>
          ['Archived', 'Transferred'].includes(status),
        ))
    )
      throw new AppError(
        'Use the profile archive/restore controls or the linked current profile.',
      );
    p.pauseFrom = day(p.pauseFrom, 'pause date');
    p.resumeDate = day(p.resumeDate, 'resume date');
    if (p.resumeDate && p.pauseFrom && p.resumeDate < p.pauseFrom)
      throw new AppError('Resume date must be after pause date.');
  }
  if (kind === 'class') {
    p.name = text(p.name, 'class name', true, 100);
    if (
      !Array.isArray(p.weekdays) ||
      p.weekdays.some((v: any) => !Number.isInteger(v) || v < 0 || v > 6)
    )
      throw new AppError('Choose weekdays.');
    if (!/^#[0-9a-fA-F]{6}$/.test(p.color))
      throw new AppError('Choose a valid class colour.');
  }
  if (kind === 'membership') {
    if (old && ['studentId', 'classId'].some((k) => p[k] !== old.payload[k]))
      throw new AppError(
        'A class row cannot be reassigned. Transfer the student or create a new membership.',
      );
    await related(p.studentId, 'student');
    await related(p.classId, 'class');
    p.from = day(p.from, 'start date', !old);
    p.until = day(p.until, 'end date');
    if (p.until && p.from && p.until < p.from)
      throw new AppError('End date must follow start date.');
    if (!['Regular', 'Saturday'].includes(p.schedule))
      throw new AppError('Choose the timetable.');
  }
  if (kind === 'attendance') {
    if (
      old &&
      ['membershipId', 'studentId', 'classId', 'date'].some(
        (k) => p[k] !== old.payload[k],
      )
    )
      throw new AppError('The attendance row identity cannot change.');
    const member = await related(p.membershipId, 'membership');
    const student = await related(p.studentId, 'student');
    if (['Archived', 'Transferred'].includes(student.payload.status))
      throw new AppError(
        'Restore this student before recording new attendance.',
      );
    if (member.studentId !== p.studentId || member.classId !== p.classId)
      throw new AppError('Student does not match this class row.');
    p.date = day(p.date, 'lesson date', true);
    const refreshed = await storeCall('get_setting', {
      key: 'student-source-refresh',
    });
    const attendanceCutoff = refreshed
      ? JSON.parse(refreshed).dataDate || CUTOFF
      : CUTOFF;
    if (p.date <= attendanceCutoff)
      throw new AppError(
        'Historical attendance is already imported. Use a new lesson date.',
      );
    if (p.date > today())
      throw new AppError('You cannot mark attendance before the lesson.');
    if (
      (member.payload.from && p.date < member.payload.from) ||
      (member.payload.until && p.date > member.payload.until)
    )
      throw new AppError('Lesson is outside this class membership.');
    if (!['P', 'T', 'A', 'N'].includes(p.mark))
      throw new AppError('Choose present, late, absent or not scheduled.');
    id = old?.id ?? 'attendance:' + p.membershipId + ':' + p.date;
    if (!old && (await getRecord(id)))
      throw new AppError(
        'Attendance was already entered. Refresh to edit it.',
        409,
      );
    if (old && p.mark !== 'A') {
      const makeup = await getRecord('makeup:' + old.id);
      if (makeup && makeup.payload.status !== 'Cancelled')
        throw new AppError(
          'Cancel the linked makeup before changing this absence.',
        );
    }
  }
  if (kind === 'package') {
    if (old && p.studentId !== old.payload.studentId)
      throw new AppError(
        'A purchased package cannot move to another student. Keep its payment history together.',
      );
    p.agreedDate = old?.payload.agreedDate ?? today();
    await related(p.studentId, 'student');
    p.sessions = amount(p.sessions, 'sessions', 1);
    if (!Number.isInteger(p.sessions) || p.sessions > 1000)
      throw new AppError('Enter whole sessions, up to 1000.');
    p.agreedFee = amount(p.agreedFee, 'agreed fee');
    p.startDate = day(p.startDate, 'package start', true);
    p.dueDate = day(p.dueDate, 'payment due date');
    p.label = text(p.label, 'package name', true, 150);
    if (!['all', 'class'].includes(p.scope))
      throw new AppError('Choose session allocation.');
    if (
      old?.payload.imported &&
      ['sessions', 'startDate', 'agreedFee', 'studentId', 'scope'].some(
        (k) => p[k] !== old.payload[k],
      )
    )
      throw new AppError(
        'Original package terms are preserved. Create a new package for a renewal.',
      );
  }
  if (kind === 'makeup') {
    if (
      old &&
      ['absenceId', 'studentId', 'classId'].some((k) => p[k] !== old.payload[k])
    )
      throw new AppError('The original absence cannot change.');
    if (p.status === 'Completed' && p.date > today())
      throw new AppError('A future makeup must stay Planned.');
    const absent = await related(p.absenceId, 'attendance');
    if (!['A', 'L', 'K'].includes(absent.payload.mark))
      throw new AppError('Select an actual absence.');
    if (absent.studentId !== p.studentId || absent.classId !== p.classId)
      throw new AppError('Makeup must match the original student and class.');
    p.missedDate = absent.date;
    p.date = day(p.date, 'makeup date', true);
    if (p.date < p.missedDate)
      throw new AppError('Makeup cannot be before the absence.');
    if (!['Planned', 'Completed', 'Cancelled'].includes(p.status))
      throw new AppError('Choose makeup status.');
    id = 'makeup:' + absent.id;
    if (!old && (await getRecord(id)))
      throw new AppError(
        'This absence already has a makeup. Edit the existing record.',
        409,
      );
  }
  if (kind === 'support') {
    await related(p.studentId, 'student');
    p.date = day(p.date, 'support date', true);
    p.notes = text(p.notes, 'lesson content', true);
    if (!['Planned', 'Completed', 'Cancelled'].includes(p.status))
      throw new AppError('Choose support status.');
  }
  if (kind === 'lead') {
    p.name = text(p.name, 'lead name', true, 160);
    p.phone = text(p.phone, 'phone', false, 50);
    p.parent = text(p.parent, 'parent', false, 160);
    p.followUp = day(p.followUp, 'follow-up date');
    if (
      ![
        'New',
        'Contacted',
        'Trial booked',
        'Trial completed',
        'Enrolled',
        'Not proceeding',
      ].includes(p.status)
    )
      throw new AppError('Choose lead status.');
  }
  if (kind === 'calendar') {
    p.date = day(p.date, 'calendar date', true);
    p.open = !!p.open;
    p.reason = text(p.reason, 'calendar note', true, 300);
    id = 'calendar:' + p.classId + ':' + p.date;
    if (!old && (await getRecord(id)))
      throw new AppError(
        'This calendar exception exists. Edit it instead.',
        409,
      );
  }
  if (kind === 'commitment') {
    p.description = text(p.description, 'description', true);
    p.amount = amount(p.amount, 'amount');
    p.dueDate = day(p.dueDate, 'due date');
  }
  if (kind === 'close') {
    if (old && p.month !== old.payload.month)
      throw new AppError('A close record cannot move to another month.');
    if (p.status === 'Closed') {
      if (p.month >= today().slice(0, 7))
        throw new AppError('Close the month after it ends.');
      const records = await allRecords(),
        cash = cashSummary(records, p.month, monthEnd(p.month)),
        recons = entries(records, 'reconciliation').filter(
          (r) => r.month === p.month,
        ),
        tx = [...cash.receipts, ...cash.expenses];
      if (
        tx.some((t) => typeof t.amount !== 'number' || !t.date || !t.reconciled)
      )
        throw new AppError(
          'Match all receipts and expenses to statements and confirm text amounts before closing.',
        );
      for (const account of new Set(tx.map((t) => t.account))) {
        const r = recons.find((r) => r.account === account);
        const incoming = cash.receipts
            .filter((t) => t.account === account)
            .reduce((n, t) => n + t.amount, 0),
          outgoing = cash.expenses
            .filter((t) => t.account === account)
            .reduce((n, t) => n + t.amount, 0);
        if (!r || r.statementClosing !== r.opening + incoming - outgoing)
          throw new AppError(
            'Reconcile every account to a zero difference before closing.',
          );
      }
    }
    if (
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(p.month) ||
      !['Open', 'Closed'].includes(p.status)
    )
      throw new AppError('Choose a valid month and status.');
    if (old?.payload.status === 'Closed' && p.status === 'Open')
      requireRole(a, ['Director']);
    p.notes = text(p.notes, 'close notes', true);
    id = 'close:' + p.month;
  }
  if (kind === 'reconciliation') {
    if (
      old &&
      (p.month !== old.payload.month || p.account !== old.payload.account)
    )
      throw new AppError(
        'Create a new reconciliation for a different month or account.',
      );
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.month))
      throw new AppError('Choose a valid month.');
    p.account = text(p.account, 'account', true, 100);
    p.opening = amount(p.opening, 'opening balance', -1e12);
    p.statementClosing = amount(p.statementClosing, 'statement balance', -1e12);
    id = old?.id ?? 'recon:' + p.month + ':' + p.account;
  }
  p.notes = text(p.notes, 'notes');
  if (JSON.stringify(p).length > 20000)
    throw new AppError('Record is too long.');
  const rid = old?.id ?? id;
  const transferDate =
    kind === 'student' &&
    p.classId &&
    (!old || p.classId !== (old.classId || old.payload.classId))
      ? day(p.transferDate || today(), 'transfer date', true)
      : null;
  if (transferDate && transferDate <= CUTOFF)
    throw new AppError(
      'A new transfer must be after the imported attendance date.',
    );
  let leadId = '';
  if (kind === 'student' && !old && input.payload?.leadId) {
    const lead = await related(input.payload.leadId, 'lead');
    if (lead.payload.studentId)
      throw new AppError('This lead is already enrolled.');
    leadId = lead.id;
  }
  const result = await storeCall('commit_record', {
    record: {
      id: rid,
      kind,
      classId: p.classId ?? '',
      studentId: p.studentId ?? '',
      date: p.date ?? p.startDate ?? '',
      payload: p,
    },
    expectedRevision: old?.revision ?? null,
    actorId: a.userId,
    reason: text(input.reason, 'reason', false, 500),
    transferDate,
    leadId,
  });
  return decodeRecord(result);
}
export async function studentAction(a: Actor, input: any) {
  requireRole(a, ['Director']);
  if (!['archive', 'restore', 'delete'].includes(input.action))
    throw new AppError('Choose archive, restore or delete.');
  const id = text(input.id, 'student', true, 160);
  const reason = text(input.reason, 'reason', true, 500);
  if (!Number.isInteger(input.revision) || input.revision < 1)
    throw new AppError('Refresh the student before continuing.');
  return storeCall('student_action', {
    id,
    action: input.action,
    expectedRevision: input.revision,
    reason,
    confirmation: text(input.confirmation, 'confirmation', false, 160),
    actorId: a.userId,
  });
}
export async function saveStaff(a: Actor, input: any) {
  requireRole(a, ['Director']);
  const email = text(input.email, 'email', true, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new AppError('Enter a valid email.');
  if (!['Director', 'Finance', 'TA'].includes(input.role))
    throw new AppError('Choose a role.');
  const name = text(input.name, 'staff name', true, 150),
    classIds = Array.isArray(input.classIds)
      ? [...new Set(input.classIds)]
      : [];
  for (const cid of classIds) await related(cid, 'class');
  const old = await storeCall('staff_by_email', { email });
  if (old?.id === 'owner')
    throw new AppError('The owner account cannot be changed here.');
  const active = input.active !== false;
  if (old?.user_id === a.userId && (input.role !== 'Director' || !active))
    throw new AppError('You cannot remove your own Director access.');
  return storeCall('save_staff', {
    actorId: a.userId,
    staff: { email, name, role: input.role, classIds, active },
  });
}
export async function sourceRows(a: Actor, query: string, book = '') {
  requireRole(a, ['Director', 'Finance']);
  const matching = [];
  for (let offset = 0; ; offset += 900) {
    const rows = await storeCall('list_records', {
      kind: 'source',
      query: query.slice(0, 200).replace(/[\\%_]/g, ''),
      limit: 900,
      offset,
    });
    matching.push(
      ...rows.filter(
        (r: any) => !book || r.payload.book === book.slice(0, 200),
      ),
    );
    if (matching.length >= 400 || rows.length < 900)
      return matching.slice(0, 400).map(decodeRecord);
  }
}
