'use client';
import { useLanguage } from '@/app/language';
import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Choice, Picker } from './ui';
import { entries, today, resolveStudentId, packagePaid } from '@/lib/domain';
import { priceList, type DataRecord } from '@/lib/types';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { type Field } from '@/lib/entry-fields';
import { draftKinds } from '@/lib/drafts';
import { commandKey } from '@/lib/command-key';
import {
  receiptAccountError,
  receivingAccountChoices,
  isCompanyReceivingAccount,
  LEGACY_ACCOUNT_HELP,
  expenseAccountError,
  payingAccountChoices,
  LEGACY_PAYING_ACCOUNT_HELP,
} from '@/lib/receipt-accounts';
import type { Role } from '@/lib/types';
import {
  entryFields,
  entryActions,
  entryErrors,
  visibleField,
} from '@/lib/entry-experience';
import { MoneyInput, FormSection, FinancialReview } from './entry-controls';
const titles: Record<string, string> = {
  class: 'Class settings',
  catalogue: 'Package catalogue',
  receipt: 'Record payment',
  expense: 'Record expense',
  student: 'Student profile',
  package: 'Student package',
  makeup: 'Makeup lesson / Học bù',
  support: 'Free support / Học bổ trợ',
  lead: 'Lead',
  membership: 'Class membership',
  calendar: 'Class calendar',
  commitment: 'Recurring expense',
  reconciliation: 'Reconcile account',
  close: 'Monthly close',
  staff: 'Staff access',
  payroll: 'Payroll / Bảng lương',
  task: 'Accountant task',
};
export default function RecordForm({
  kind,
  record,
  defaults = {},
  records,
  onClose,
  onSaved,
  onRefresh,
  role,
}: {
  kind: string;
  record?: any;
  defaults?: any;
  records: DataRecord[];
  onClose: () => void;
  onSaved: (record?: DataRecord) => Promise<void>;
  onRefresh: () => Promise<boolean>;
  role: Role;
}) {
  const { t, message, money, packageTitle } = useLanguage();
  const { __draft, ...entryDefaults } = defaults;
  const [data, setData] = useState<any>(() => ({
    date: today(),
    startDate: today(),
    from: today(),
    color: '#4466ee',
    weekdays: [0, 3],
    scope: 'all',
    purpose: 'Tuition',
    account: '',
    deductions: 0,
    employerInsurance: 0,
    status:
      kind === 'task'
        ? 'To do'
        : kind === 'payroll'
          ? 'Draft'
          : kind === 'student'
            ? 'Active'
            : kind === 'lead'
              ? 'New'
              : kind === 'close'
                ? 'Closed'
                : 'Planned',
    schedule: 'Regular',
    role: 'TA',
    active: true,
    open: false,
    allocations: [],
    classIds: [],
    ...(record?.payload ?? record ?? {}),
    ...entryDefaults,
  }));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [reason, setReason] = useState(__draft?.payload.reason || '');
  const retry = useRef<{ key: string; id: string }>(
    __draft?.payload.retry || { key: '', id: '' },
  );
  const draftIdentity = useRef({
    id: __draft?.id || crypto.randomUUID(),
    revision: __draft?.revision ?? null,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [draftStatus, setDraftStatus] = useState(__draft ? 'Draft saved' : '');
  const [step, setStep] = useState(0);
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  const active = useRef(true),
    locked = useRef(false),
    submitting = useRef(false),
    blocked = useRef(false);
  const pendingDraft = useRef<Promise<void>>(Promise.resolve());
  const draftKey = useRef(commandKey({ data, reason }));
  const latestDraft = useRef({ data, reason });
  latestDraft.current = { data, reason };
  const formFields = entryFields(kind);
  const guided = kind === 'receipt';
  const steps = [
    'Payer and account',
    'Amount and date',
    'Allocation',
    'Review',
  ];
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (
      !draftKinds(role).includes(kind) ||
      busy ||
      conflict ||
      uncertain ||
      locked.current ||
      commandKey({ data, reason }) === draftKey.current
    )
      return;
    const timer = setTimeout(() => {
      if (!locked.current && active.current)
        void persistDraft().catch(() => {});
    }, 1400);
    return () => clearTimeout(timer);
  }, [data, reason, busy, conflict, uncertain, kind, role]);
  async function loadLatest() {
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      await pendingDraft.current.catch(() => {});
      let savedDraft: any;
      // The UUID is known before the first write, even if both its response and
      // the recovery read were lost. A missing local revision is not proof that
      // the private draft does not exist.
      if (draftKinds(role).includes(kind)) {
        const r = await fetch('/api/drafts', { cache: 'no-store' });
        const drafts: any = await r.json();
        if (!r.ok) throw Error(drafts.error || 'Could not load draft.');
        savedDraft = drafts.find((d: any) => d.id === draftIdentity.current.id);
        if (!savedDraft && (draftIdentity.current.revision || !record?.id))
          throw Error(
            'This draft was submitted or deleted elsewhere. Close this form and review saved records before entering anything again.',
          );
      }
      if (savedDraft) {
        const latest = savedDraft;
        setData(latest.payload.data);
        setReason(latest.payload.reason);
        draftKey.current = commandKey({
          data: latest.payload.data,
          reason: latest.payload.reason,
        });
        setRevision(latest.record_revision ?? undefined);
        retry.current = latest.payload.retry || { key: '', id: '' };
        draftIdentity.current = { id: latest.id, revision: latest.revision };
        setDraftStatus('Draft saved');
        initial.current = JSON.stringify(latest.payload.data);
        const currentRecord = records.find((r) => r.id === latest.record_id);
        if (currentRecord && currentRecord.revision > latest.record_revision) {
          setData({ ...currentRecord.payload });
          setRevision(currentRecord.revision);
          setReason('');
          draftKey.current = '';
          initial.current = JSON.stringify(currentRecord.payload);
          retry.current = { key: '', id: '' };
        }
      } else {
        const latest = records.find((r) => r.id === record?.id);
        if (!latest || latest.revision <= revision)
          throw Error(
            'The latest version has not loaded yet. Your draft is preserved. Close this form and refresh before editing again.',
          );
        setData({ ...latest.payload });
        setRevision(latest.revision);
        setReason('');
        draftKey.current = commandKey({ data: latest.payload, reason: '' });
        initial.current = JSON.stringify(latest.payload);
      }
      setConflict(false);
      blocked.current = false;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load draft.');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function persistDraft() {
    const run = pendingDraft.current
      .catch(() => {})
      .then(async () => {
        if (!active.current) return;
        const snapshot = latestDraft.current;
        const key = commandKey(snapshot);
        if (key === draftKey.current && draftIdentity.current.revision) return;
        const requestKey = commandKey(entryInput(snapshot));
        if (retry.current.key !== requestKey)
          retry.current = { key: requestKey, id: crypto.randomUUID() };
        const draftRequest = {
          operation: 'save',
          ...draftIdentity.current,
          kind,
          recordId: record?.id || null,
          recordRevision: revision ?? null,
          payload: { ...snapshot, retry: retry.current },
        };
        setDraftStatus('Saving draft…');
        try {
          let r: Response;
          let j: any;
          try {
            r = await fetch('/api/drafts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(draftRequest),
            });
            j = await r.json();
          } catch (failure) {
            // A lost response is not a failed write. Recover only the exact snapshot
            // sent by this form; a different revision must never be overwritten.
            const recovery = await fetch('/api/drafts', { cache: 'no-store' });
            const saved: any = await recovery.json();
            const found =
              recovery.ok &&
              Array.isArray(saved) &&
              saved.find((d: any) => d.id === draftRequest.id);
            if (
              !found ||
              commandKey(found.payload) !== commandKey(draftRequest.payload) ||
              found.record_revision !== draftRequest.recordRevision
            )
              throw failure;
            j = found;
            r = recovery;
          }
          if (!r.ok) {
            if (r.status === 409 && active.current) {
              blocked.current = true;
              locked.current = true;
              setConflict(true);
            }
            throw Error(j.error || 'Could not save draft.');
          }
          draftIdentity.current = { id: j.id, revision: j.revision };
          draftKey.current = key;
          if (active.current)
            setDraftStatus(
              key === commandKey(latestDraft.current)
                ? 'Draft saved'
                : 'Unsaved changes',
            );
        } catch (e) {
          if (active.current) {
            setDraftStatus('Draft save failed');
            setError(e instanceof Error ? e.message : 'Could not save draft.');
          }
          throw e;
        }
      });
    pendingDraft.current = run;
    return run;
  }
  async function saveDraft() {
    if (submitting.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      await persistDraft();
      if (active.current) {
        await onRefresh();
        onClose();
      }
    } catch {
      /* keep entered values visible */
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  }
  const initial = useRef(JSON.stringify(data));
  const [revision, setRevision] = useState(record?.revision);
  const [discard, setDiscard] = useState(false);
  function requestClose() {
    if (busy) return;
    locked.current = true;
    if (JSON.stringify(data) !== initial.current || reason) setDiscard(true);
    else onClose();
  }
  const students = entries(records, 'student').filter(
      (s) =>
        resolveStudentId(records, s.id) === s.id || s.id === data.studentId,
    ),
    classes = entries(records, 'class').filter(
      (c) => !c.archived || c.id === data.classId,
    ),
    packages = entries(records, 'package');
  const catalogue = entries(records, 'catalogue').filter(
    (c) => c.active !== false,
  );
  const prices = entries(records, 'catalogue').length ? catalogue : priceList;
  const selectedOffer = prices.find(
    (offer) => Number(offer.sessions) === Number(data.sessions),
  );
  const set = (key: string, v: any) =>
    setData((d: any) => ({
      ...d,
      [key]: v,
      ...(key === 'studentId'
        ? {
            packageId: '',
            absenceId: '',
            missedDate: '',
            ...(kind === 'receipt' ? { allocations: [] } : {}),
            ...(['makeup', 'support', 'package'].includes(kind)
              ? { classId: students.find((s) => s.id === v)?.classId || '' }
              : {}),
            name:
              !d.name ||
              d.name === students.find((s) => s.id === d.studentId)?.name
                ? students.find((s) => s.id === v)?.name || ''
                : d.name,
          }
        : {}),
    }));
  const split = !!data.allocations?.length;
  function entryInput(snapshot: { data: any; reason: string }) {
    const payload = { ...snapshot.data };
    if (kind === 'package') {
      payload.label = payload.label || payload.sessions + ' sessions';
      payload.sessions = Number(payload.sessions);
    }
    return { kind, id: record?.id, revision, payload, reason: snapshot.reason };
  }
  function showFieldErrors(errors: Record<string, string>) {
    setFieldErrors(errors);
    const first = Object.keys(errors)[0];
    if (!first) return;
    if (guided) {
      const section =
        first === 'allocations'
          ? 'Allocation'
          : formFields.find((f) => f.key === first)?.section;
      if (section && steps.includes(section)) setStep(steps.indexOf(section));
    }
    setTimeout(() => document.getElementById('field-' + first)?.focus(), 0);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    const validation = entryErrors(kind, data);
    if (['receipt', 'expense'].includes(kind)) {
      const accountError = (
        kind === 'receipt' ? receiptAccountError : expenseAccountError
      )(data, record?.payload);
      if (accountError) validation.account = accountError;
    }
    const relevant =
      guided && step < 3
        ? Object.fromEntries(
            Object.entries(validation).filter(
              ([key]) =>
                formFields.some(
                  (f) => f.key === key && f.section === steps[step],
                ) ||
                (step === 2 && key === 'allocations'),
            ),
          )
        : validation;
    showFieldErrors(relevant);
    if (Object.keys(relevant).length) {
      setError('Please check the highlighted information.');
      return;
    }
    if (guided && step < 3) {
      setError('');
      setStep(step + 1);
      return;
    }
    submitting.current = true;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      // First submissions must resolve and consume their private draft. A retry
      // after an uncertain record response bypasses the already-consumed draft.
      if (!uncertain && draftKinds(role).includes(kind)) await persistDraft();
      else await pendingDraft.current;
      if (!active.current) return;
      if (blocked.current)
        throw new Error('Load the latest saved values before continuing.');
      const input = entryInput({ data, reason });
      const p = input.payload;
      if (kind === 'package') {
        if (p.scope === 'class' && !p.classId)
          throw new Error('Choose a class for this class-specific package.');
        p.label = p.label || p.sessions + ' sessions';
        p.sessions = Number(p.sessions);
      }
      const requestKey = commandKey(input);
      if (retry.current.key !== requestKey)
        retry.current = { key: requestKey, id: crypto.randomUUID() };
      setUncertain(true);
      const r = await fetch(kind === 'staff' ? '/api/staff' : '/api/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          kind === 'staff'
            ? p
            : {
                ...input,
                commandId: retry.current.id,
                ...(draftIdentity.current.revision
                  ? {
                      draftId: draftIdentity.current.id,
                      draftRevision: draftIdentity.current.revision,
                    }
                  : {}),
              },
        ),
      });
      const j: any = await r.json();
      setUncertain(false);
      if (!r.ok) {
        if (j.fieldErrors) showFieldErrors(j.fieldErrors);
        if (r.status === 409) {
          blocked.current = true;
          setConflict(true);
          await onRefresh();
        }
        throw new Error(j.error ?? 'Unable to save.');
      }
      await onSaved(kind === 'staff' ? undefined : j);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save.');
    } finally {
      submitting.current = false;
      locked.current = false;
      setBusy(false);
    }
  }
  function control(f: Field) {
    const v = data[f.key] ?? '';
    const guidance = {
      invalid: !!fieldErrors[f.key],
      describedBy: 'help-' + f.key,
      required: f.required,
    };
    if (['receipt', 'expense'].includes(kind) && f.key === 'account')
      return (
        <>
          <Picker
            {...guidance}
            id="field-account"
            label={t(
              kind === 'receipt'
                ? 'Choose a company receiving account'
                : 'Choose a company paying account',
            )}
            value={v}
            onChange={(value) => set('account', value)}
            options={(kind === 'receipt'
              ? receivingAccountChoices
              : payingAccountChoices)(record?.payload)}
          />
          {record?.payload?.account === v && !isCompanyReceivingAccount(v) && (
            <p className="field-help">
              {t(
                kind === 'receipt'
                  ? LEGACY_ACCOUNT_HELP
                  : LEGACY_PAYING_ACCOUNT_HELP,
              )}
            </p>
          )}
        </>
      );
    if (f.control === 'money')
      return (
        <MoneyInput
          id={'field-' + f.key}
          value={v}
          onChange={(v) => set(f.key, v)}
          label={t(f.label)}
          invalid={guidance.invalid}
          describedBy={guidance.describedBy}
        />
      );
    if (f.control === 'suggestion') {
      const values = [
        ...new Set(
          records
            .map((r) => r.payload[f.key])
            .filter((v): v is string => typeof v === 'string' && !!v.trim()),
        ),
      ].sort();
      return (
        <>
          <input
            id={'field-' + f.key}
            list={'options-' + f.key}
            value={v}
            onChange={(e) => set(f.key, e.target.value)}
            aria-invalid={guidance.invalid || undefined}
            aria-describedby={guidance.describedBy}
            autoComplete="off"
          />
          <datalist id={'options-' + f.key}>
            {values.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </>
      );
    }
    if (
      record &&
      ((['package', 'membership', 'makeup'].includes(kind) &&
        f.key === 'studentId') ||
        (['membership', 'makeup'].includes(kind) && f.key === 'classId') ||
        (kind === 'makeup' && f.key === 'absenceId'))
    ) {
      const label =
        f.key === 'studentId'
          ? entries(records, 'student').find(
              (s) => s.id === resolveStudentId(records, v),
            )?.name
          : f.key === 'classId'
            ? classes.find((c) => c.id === v)?.name
            : data.missedDate;
      return (
        <input
          id={'field-' + f.key}
          value={label || v}
          disabled
          title={t(
            'Historical identity stays fixed. Use a transfer or a new record.',
          )}
        />
      );
    }
    if (f.type === 'checkbox')
      return (
        <div className="checkbox-field">
          <Checkbox
            id={'field-' + f.key}
            checked={!!v}
            onCheckedChange={(v) => set(f.key, !!v)}
          />
          <label htmlFor={'field-' + f.key}>{t(f.label)}</label>
        </div>
      );
    if (f.type === 'student')
      return (
        <Picker
          {...guidance}
          id={'field-' + f.key}
          label={f.label}
          value={v}
          onChange={(v) => set(f.key, v)}
          options={students.map((s) => ({
            id: s.id,
            label: s.name,
            secondary: [
              classes.find((c) => c.id === s.classId)?.name,
              t(s.status || 'Active'),
            ]
              .filter(Boolean)
              .join(' · '),
            aliases: [s.preferredName || '', s.phone || ''],
          }))}
        />
      );
    if (f.type === 'class')
      return (
        <Choice
          {...guidance}
          id={'field-' + f.key}
          label={f.label}
          value={v}
          onChange={(v) => set(f.key, v)}
          options={[
            { value: '', label: t('Select class') },
            ...classes.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      );
    if (f.type === 'package')
      return (
        <Picker
          {...guidance}
          disabled={!data.studentId}
          emptyText="Choose a student first"
          id={'field-' + f.key}
          label={t('Select an agreed package')}
          value={v}
          onChange={(v) => set(f.key, v)}
          options={packages
            .filter(
              (p) =>
                !data.studentId ||
                p.studentId === resolveStudentId(records, data.studentId),
            )
            .map((p) => ({
              id: p.id,
              secondary: (() => {
                const paid = packagePaid(
                  p,
                  entries(records, 'receipt'),
                  data.date || today(),
                );
                return typeof p.agreedFee === 'number' && paid != null
                  ? t('Amount owed') +
                      ': ' +
                      money(Math.max(0, p.agreedFee - paid)) +
                      ' VND'
                  : t('Agreed balance needs review');
              })(),
              label:
                (students.find((s) => s.id === p.studentId)?.name ??
                  'Student') +
                ' · ' +
                packageTitle(p) +
                ' · ' +
                (p.startDate ?? ''),
            }))}
        />
      );
    if (f.type === 'absence') {
      const abs = entries(records, 'attendance').filter(
        (a) =>
          a.studentId === resolveStudentId(records, data.studentId) &&
          ['A', 'L', 'K'].includes(a.mark),
      );
      return (
        <Picker
          id={'field-' + f.key}
          label={t('Choose the missed lesson')}
          value={v}
          onChange={(v) => {
            const a = abs.find((a) => a.id === v);
            setData((d: any) => ({
              ...d,
              absenceId: v,
              studentId: a?.sourceStudentId || a?.studentId || d.studentId,
              classId: a?.classId,
              missedDate: a?.date,
            }));
          }}
          options={abs.map((a) => ({
            id: a.id,
            label:
              a.date +
              ' · ' +
              (classes.find((c) => c.id === a.classId)?.name ?? '') +
              (a.historical ? t(' · original record') : ''),
            disabledReason: entries(records, 'makeup').some(
              (m) =>
                m.absenceId === a.id &&
                m.status !== 'Cancelled' &&
                m.id !== record?.id,
            )
              ? 'A makeup is already linked to this lesson.'
              : undefined,
          }))}
        />
      );
    }
    if (f.type === 'weekdays')
      return (
        <div className="class-checks">
          {[
            'Monday',
            'Tuesday',
            'Wednesday',
            'Thursday',
            'Friday',
            'Saturday',
            'Sunday',
          ].map((d, i) => (
            <label key={d}>
              <input
                type="checkbox"
                checked={v.includes(i)}
                onChange={(e) =>
                  set(
                    'weekdays',
                    e.target.checked
                      ? [...v, i]
                      : v.filter((n: number) => n !== i),
                  )
                }
              />
              {t(d)}
            </label>
          ))}
        </div>
      );
    if (f.type === 'price')
      return (
        <div className="space-y-2">
          <Choice
            id={'field-' + f.key}
            label={t('Select session package')}
            value={String(v)}
            onChange={(v) => {
              const p = prices.find((p) => p.sessions === Number(v));
              setData((d: any) => ({
                ...d,
                sessions: Number(v),
                label: v + ' sessions',
                agreedFee: p?.price ?? d.agreedFee,
              }));
            }}
            options={[
              ...prices.map((p) => ({
                value: String(p.sessions),
                label:
                  p.sessions + t(' sessions · ') + money(p.price) + t(' VND'),
              })),
              ...(v && !prices.some((p) => p.sessions === Number(v))
                ? [
                    {
                      value: String(v),
                      label: v + t(' sessions · custom agreement'),
                    },
                  ]
                : []),
            ]}
          />
          <label>
            {t('Custom session count')}
            <input
              type="number"
              min="1"
              max="1000"
              step="1"
              value={v || ''}
              onChange={(e) =>
                setData((d: any) => ({
                  ...d,
                  sessions: Number(e.target.value),
                  label: e.target.value + ' sessions',
                }))
              }
            />
          </label>
        </div>
      );
    if (f.type === 'select')
      return (
        <Choice
          {...guidance}
          translateOptions
          id={'field-' + f.key}
          label={f.label}
          value={v}
          onChange={(v) => set(f.key, v)}
          options={(f.options ?? []).map((v) => ({
            value: v,
            label:
              v === 'all'
                ? t('All classes')
                : v === 'class'
                  ? t('This class only')
                  : v,
          }))}
        />
      );
    if (f.type === 'textarea')
      return (
        <textarea
          aria-invalid={guidance.invalid || undefined}
          aria-describedby={guidance.describedBy}
          id={'field-' + f.key}
          rows={3}
          value={v}
          onChange={(e) => set(f.key, e.target.value)}
          required={f.required}
        />
      );
    return (
      <input
        aria-invalid={guidance.invalid || undefined}
        aria-describedby={guidance.describedBy}
        id={'field-' + f.key}
        type={f.type ?? 'text'}
        max={
          f.type === 'date' &&
          ['receipt', 'expense'].includes(kind) &&
          f.key === 'date'
            ? today()
            : undefined
        }
        disabled={kind === 'staff' && !!record && f.key === 'email'}
        value={v}
        onChange={(e) =>
          set(
            f.key,
            f.type === 'number' && e.target.value !== ''
              ? Number(e.target.value)
              : e.target.value,
          )
        }
        required={f.required}
        step={f.type === 'number' ? '1' : undefined}
      />
    );
  }
  function fieldView(f: Field) {
    return (
      <div
        className={(f.type === 'textarea' ? 'wide ' : '') + 'form-field'}
        key={f.key}
      >
        {f.type !== 'checkbox' && (
          <label htmlFor={'field-' + f.key}>
            {t(f.label)}{' '}
            <span className="field-optional">
              {t(f.required ? 'Required' : 'Optional')}
            </span>
          </label>
        )}
        {control(f)}
        <div id={'help-' + f.key}>
          {fieldErrors[f.key] ? (
            <p className="field-error">{t(fieldErrors[f.key])}</p>
          ) : f.help ? (
            <p className="field-help">{t(f.help)}</p>
          ) : null}
        </div>
      </div>
    );
  }
  const sections = [...new Set(formFields.map((f) => f.section!))];
  const amount = Number(data.amount || 0);
  const allocated = split
    ? data.allocations.reduce(
        (n: number, a: any) => n + Number(a.amount || 0),
        0,
      )
    : data.packageId
      ? amount
      : 0;
  return (
    <>
      <Dialog open onOpenChange={(open) => !open && requestClose()}>
        <DialogContent
          className={
            'record-dialog entry-dialog' + (guided ? ' guided-entry' : '')
          }
        >
          <DialogHeader>
            <DialogTitle>
              {record ? t('Edit ') : ''}
              {t(titles[kind] ?? kind)}
            </DialogTitle>
            <DialogDescription>
              {kind === 'package'
                ? t(
                    'Create a new record for each renewal. The agreed fee is the actual discounted amount.',
                  )
                : kind === 'staff'
                  ? t(
                      'Use each person’s own email. TAs have teaching access to all classes; passwords are provisioned separately.',
                    )
                  : kind === 'support'
                    ? t('Free support does not use package sessions.')
                    : kind === 'makeup'
                      ? t(
                          'Link the original absence once. Historical records remain unchanged.',
                        )
                      : t('Required fields must be completed before saving.')}
            </DialogDescription>
          </DialogHeader>
          {guided && (
            <nav className="entry-steps" aria-label={t('Payment steps')}>
              {steps.map((title, i) => (
                <span
                  key={title}
                  aria-current={step === i ? 'step' : undefined}
                >
                  <b>{i + 1}</b>
                  {t(title)}
                </span>
              ))}
            </nav>
          )}
          <form onSubmit={submit} noValidate>
            <fieldset
              className="entry-body"
              disabled={busy || uncertain}
              inert={busy || uncertain}
              aria-busy={busy}
            >
              {sections
                .filter(
                  (section) =>
                    !guided ||
                    section === steps[step] ||
                    (step === 3 && section === 'Supporting details'),
                )
                .map((section) => {
                  const list = formFields.filter(
                    (f) =>
                      f.section === section &&
                      visibleField(f, data) &&
                      !(split && ['studentId', 'packageId'].includes(f.key)),
                  );
                  if (!list.length) return null;
                  return (
                    <FormSection key={section} title={section}>
                      {list.filter((f) => !f.advanced).map(fieldView)}
                      {list.some((f) => f.advanced) && (
                        <details
                          className="entry-more wide"
                          open={
                            list.some(
                              (f) => f.advanced && fieldErrors[f.key],
                            ) || undefined
                          }
                        >
                          <summary>
                            {t('More details')} <span>{t('Optional')}</span>
                          </summary>
                          <div className="form-grid">
                            {list.filter((f) => f.advanced).map(fieldView)}
                          </div>
                        </details>
                      )}
                    </FormSection>
                  );
                })}
              {kind === 'student' &&
                record &&
                data.classId !== record.payload?.classId && (
                  <div className="wide form-field">
                    <label htmlFor="transfer-date">
                      {t('Transfer takes effect on')}
                    </label>
                    <input
                      id="transfer-date"
                      type="date"
                      required
                      value={data.transferDate ?? today()}
                      onChange={(e) => set('transferDate', e.target.value)}
                    />
                    <p className="field-help">
                      {t(
                        'The old class history is retained. The new membership starts on this date.',
                      )}
                    </p>
                  </div>
                )}
              {kind === 'package' && (
                <div className="wide discount-tools">
                  <span>{t('Apply to the listed price:')}</span>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || !selectedOffer}
                    onClick={() => {
                      if (selectedOffer)
                        set(
                          'agreedFee',
                          Math.round(selectedOffer.price * 0.95),
                        );
                    }}
                  >
                    {t('5% group discount')}
                  </Button>
                  {selectedOffer && (
                    <span>{money(selectedOffer.price)} VND</span>
                  )}
                  <span>{t('Or enter any agreed fee above.')}</span>
                </div>
              )}
              {kind === 'receipt' && step === 2 && (
                <div className="wide">
                  <div className="checkbox-field">
                    <Checkbox
                      id="split-receipt"
                      checked={split}
                      onCheckedChange={(v) =>
                        set(
                          'allocations',
                          v
                            ? [{ packageId: '', studentId: '', amount: 0 }]
                            : [],
                        )
                      }
                    />
                    <label htmlFor="split-receipt">
                      {t('Split a family payment across packages')}
                    </label>
                  </div>
                  {split && (
                    <div className="split-rows">
                      {data.allocations.map((a: any, i: number) => (
                        <div className="split-row" key={i}>
                          <Picker
                            label={t('Package')}
                            value={a.packageId}
                            onChange={(v) => {
                              const arr = [...data.allocations];
                              arr[i] = {
                                ...arr[i],
                                packageId: v,
                                studentId: packages.find((p) => p.id === v)
                                  ?.studentId,
                              };
                              set('allocations', arr);
                            }}
                            options={packages.map((p) => ({
                              id: p.id,
                              label:
                                (students.find((s) => s.id === p.studentId)
                                  ?.name ?? '') +
                                ' · ' +
                                packageTitle(p),
                            }))}
                          />
                          <MoneyInput
                            label={t('Allocation ') + (i + 1) + t(' amount')}
                            value={a.amount}
                            onChange={(value) => {
                              const arr = [...data.allocations];
                              arr[i] = { ...a, amount: value };
                              set('allocations', arr);
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              set(
                                'allocations',
                                data.allocations.filter(
                                  (_: any, j: number) => j !== i,
                                ),
                              )
                            }
                          >
                            {t('Remove')}
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          set('allocations', [
                            ...data.allocations,
                            { packageId: '', studentId: '', amount: 0 },
                          ])
                        }
                      >
                        {t('Add another student')}
                      </Button>
                      <p className="field-help">
                        {t('Allocated')}{' '}
                        {money(
                          data.allocations.reduce(
                            (n: number, a: any) => n + Number(a.amount || 0),
                            0,
                          ),
                        )}{' '}
                        {t('of')} {money(Number(data.amount || 0))}{' '}
                        {t('VND. These must match.')}
                      </p>
                      {fieldErrors.allocations && (
                        <p
                          id="field-allocations"
                          tabIndex={-1}
                          className="field-error"
                        >
                          {t(fieldErrors.allocations)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
              {((guided && step === 3) || kind === 'expense') && (
                <FinancialReview
                  items={[
                    { label: 'Amount', value: money(amount) + ' VND' },
                    { label: 'Account', value: data.account },
                    { label: 'Date', value: data.date },
                    ...(kind === 'receipt'
                      ? [
                          { label: 'Payer', value: data.name },
                          {
                            label: 'Allocated',
                            value: money(allocated) + ' VND',
                          },
                        ]
                      : [{ label: 'Description', value: data.description }]),
                  ]}
                >
                  {kind === 'receipt' && (
                    <>
                      <p>
                        {t(
                          'This records one receipt. Allocations do not create extra money.',
                        )}
                      </p>
                      {split && (
                        <ul>
                          {data.allocations.map((a: any, i: number) => (
                            <li key={i}>
                              {
                                students.find(
                                  (s) =>
                                    s.id ===
                                    packages.find((p) => p.id === a.packageId)
                                      ?.studentId,
                                )?.name
                              }{' '}
                              · {money(Number(a.amount || 0))} VND
                            </li>
                          ))}
                        </ul>
                      )}
                      {!data.packageId && !split && (
                        <p>
                          {t(
                            'No agreement selected. This receipt will need allocation review; it is not an available-credit account.',
                          )}
                        </p>
                      )}
                    </>
                  )}
                </FinancialReview>
              )}
              {kind === 'staff' && data.role === 'TA' && (
                <div className="wide">
                  <p>{t('All classes · teaching only')}</p>
                </div>
              )}
              {((record?.payload?.imported &&
                ['receipt', 'expense'].includes(kind)) ||
                (['receipt', 'expense'].includes(kind) &&
                  record?.id &&
                  data.account !== record.payload?.account)) && (
                <div className="wide form-field">
                  <label htmlFor="correction-reason">
                    {t(
                      'Reason for correcting the original amount or company account',
                    )}
                  </label>
                  <input
                    id="correction-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              )}
            </fieldset>
            {error && (
              <div className="error-message" role="alert">
                {message(error)}
              </div>
            )}
            {uncertain && (
              <p className="source-notice">
                {t(
                  'The save result is uncertain. Retry the same entry to recover its result without recording it twice.',
                )}
              </p>
            )}
            {conflict && (
              <div className="source-notice">
                <p>
                  {t(
                    'Your draft is still here. Another person changed this record. Load the latest saved values to start again, or cancel and copy your draft first.',
                  )}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={loadLatest}
                >
                  {t('Load latest saved values (replace draft)')}
                </Button>
              </div>
            )}
            <DialogFooter>
              {draftStatus && (
                <output className="draft-status" aria-live="polite">
                  {t(draftStatus)}
                </output>
              )}
              {draftKinds(role).includes(kind) && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || conflict || uncertain}
                  onClick={saveDraft}
                >
                  {t('Save draft & close')}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={requestClose}
                disabled={busy}
              >
                {t('Cancel')}
              </Button>
              {guided && step > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || uncertain}
                  onClick={() => setStep(step - 1)}
                >
                  {t('Back')}
                </Button>
              )}
              <Button
                type="submit"
                className="primary"
                disabled={busy || conflict}
              >
                {busy
                  ? t('Saving…')
                  : uncertain
                    ? t('Retry save')
                    : guided && step < 3
                      ? t('Continue')
                      : t(entryActions[kind] || 'Save record')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={discard}
        onOpenChange={(open) => {
          setDiscard(open);
          if (!open) locked.current = false;
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Close this form?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'Saved drafts stay in My drafts. Changes not yet saved may be lost.',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Keep editing')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                locked.current = true;
                await pendingDraft.current.catch(() => {});
                if (active.current) onClose();
              }}
            >
              {t('Close without saving more')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
