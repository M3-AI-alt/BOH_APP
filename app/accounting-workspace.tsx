'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Download,
  FileCheck2,
  FileInput,
  Plus,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge, Choice, DataTable, Panel, Picker } from './ui';
import { useLanguage } from './language';
import { csvCell, documentKinds, parseSourceCsv } from '@/lib/accounting';
import { entries, today } from '@/lib/domain';
import type { ViewProps } from './views';
import { MoneyInput, FinancialReview } from './entry-controls';

export function Accounting(p: ViewProps) {
  const { t, message, money } = useLanguage();
  const [tab, setTab] = useState('documents'),
    [status, setStatus] = useState(''),
    [offset, setOffset] = useState(0);
  const [focusedId, setFocusedId] = useState(
    p.navigationTarget?.documentId || '',
  );
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0),
    [dialog, setDialog] = useState<any>(null),
    [form, setForm] = useState<any>({});
  const [busy, setBusy] = useState(false),
    [exporting, setExporting] = useState(false),
    [formError, setFormError] = useState(''),
    [preview, setPreview] = useState<any>(null);
  const retry = useRef({ key: '', id: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [uncertain, setUncertain] = useState(false);
  const submitting = useRef(false);
  const exportController = useRef<AbortController | null>(null);
  useEffect(() => () => exportController.current?.abort(), []);
  const pristine = useRef('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(
      `/api/accounting?tab=${tab}&status=${encodeURIComponent(status)}&offset=${offset}&month=${p.month}${focusedId ? '&id=' + encodeURIComponent(focusedId) : ''}`,
      { signal: controller.signal, cache: 'no-store' },
    )
      .then(async (r) => {
        const j: any = await r.json();
        if (!r.ok) throw Error(j.error);
        return j;
      })
      .then((j) => {
        if (!controller.signal.aborted) setData(j);
      })
      .catch((e) => {
        if (!controller.signal.aborted && e.name !== 'AbortError') {
          setError(e.message);
          setData(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [tab, status, offset, version, p.snapshot.loadedAt, p.month, focusedId]);
  useEffect(() => setOffset(0), [p.month]);
  useEffect(() => {
    if (p.navigationTarget?.status === 'Submitted') {
      setTab('documents');
      setStatus('Submitted');
      setOffset(0);
    }
    setFocusedId(p.navigationTarget?.documentId || '');
    if (p.navigationTarget?.documentId) {
      setTab('documents');
      setStatus('');
      setOffset(0);
    }
  }, [p.navigationTarget]);
  async function command(input: any) {
    const key = JSON.stringify(input);
    if (retry.current.key !== key)
      retry.current = { key, id: crypto.randomUUID() };
    if (input.operation === 'pay') setUncertain(true);
    const r = await fetch('/api/accounting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, commandId: retry.current.id }),
    });
    const j: any = await r.json();
    setUncertain(false);
    if (!r.ok) throw Error(j.error || 'Could not save.');
    retry.current = { key: '', id: '' };
    return j;
  }
  function open(type: string, row?: any, action?: string) {
    setFormError('');
    setFieldErrors({});
    setUncertain(false);
    setPreview(null);
    retry.current = { key: '', id: '' };
    setDialog({ type, row, action, id: row?.id || crypto.randomUUID() });
    const initial =
      type === 'import'
        ? {
            source: 'MISA',
            period: p.month,
            dataset: '',
            view: '',
            numberFormat: 'vn',
            dateFormat: 'dmy',
            mapping: {},
          }
        : type === 'review'
          ? {
              status:
                row?.status === 'Needs confirmation'
                  ? 'Matched'
                  : 'Needs confirmation',
              recordId: '',
              note: '',
              kind: 'bill',
            }
          : type === 'pay'
            ? {
                date: today(),
                amount: Math.max(0, Number(row.amount) - Number(row.paid || 0)),
                account: '',
                evidence: '',
                category: 'Other',
              }
            : type === 'settle'
              ? {
                  cashRecordId: '',
                  amount: Math.max(
                    0,
                    Number(row.amount) - Number(row.paid || 0),
                  ),
                  evidence: '',
                }
              : {
                  kind: 'bill',
                  date: today(),
                  title: '',
                  counterparty: '',
                  amount: 0,
                  notes: '',
                  lines: [],
                  ...row,
                  dueDate: row?.due_date || '',
                };
    pristine.current = JSON.stringify(initial);
    setForm(initial);
  }
  function dismiss() {
    if (busy) return;
    if (
      !['history', 'confirm'].includes(dialog?.type) &&
      JSON.stringify(form) !== pristine.current &&
      !window.confirm(t('Discard unsaved changes?'))
    )
      return;
    setDialog(null);
  }
  const set = (key: string, value: any) => {
    setForm((f: any) => ({ ...f, [key]: value }));
    setPreview(null);
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    const errors: Record<string, string> = {};
    if (
      ['document', 'pay', 'settle'].includes(dialog.type) &&
      (typeof form.amount !== 'number' ||
        !Number.isSafeInteger(form.amount) ||
        form.amount < (dialog.type === 'document' ? 0 : 1))
    )
      errors.amount = 'Enter a valid whole VND amount.';
    if (dialog.type === 'pay') {
      for (const key of ['date', 'account', 'evidence'])
        if (!String(form[key] || '').trim())
          errors[key] = 'This information is required.';
      if (form.date > today())
        errors.date = 'Choose today or an earlier payment date.';
      if (
        typeof form.amount === 'number' &&
        form.amount > Number(dialog.row.amount) - Number(dialog.row.paid || 0)
      )
        errors.amount = 'Payment exceeds the remaining bill balance.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      document.getElementById('accounting-' + Object.keys(errors)[0])?.focus();
      return;
    }
    submitting.current = true;
    setBusy(true);
    setFormError('');
    try {
      if (dialog.type === 'import') {
        if (!preview) {
          setPreview(await command({ operation: 'preview', payload: form }));
          return;
        }
        await command({ operation: 'stage', payload: form });
      } else {
        await command({
          operation:
            dialog.type === 'document'
              ? 'save'
              : dialog.type === 'confirm'
                ? 'action'
                : dialog.type,
          id: dialog.id,
          revision: dialog.row?.revision,
          payload: dialog.type === 'confirm' ? { action: dialog.action } : form,
        });
      }
      setDialog(null);
      setVersion((v) => v + 1);
      await p.refresh?.();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function history(row: any) {
    open('history', row);
    setBusy(true);
    try {
      setForm(await command({ operation: 'history', id: row.id }));
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not load.');
    } finally {
      setBusy(false);
    }
  }
  async function chooseFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1_000_000)
        throw Error('Use a CSV file smaller than 1 MB.');
      const csv = await file.text(),
        parsed = parseSourceCsv(csv);
      setForm((f: any) => ({
        ...f,
        csv,
        fileName: file.name,
        headers: parsed.headers,
        mapping: {},
      }));
      setPreview(null);
      setFormError('');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not read file.');
    }
  }
  async function exportAll() {
    exportController.current?.abort();
    const controller = new AbortController();
    exportController.current = controller;
    setExporting(true);
    setError('');
    try {
      const r = await fetch(
        `/api/accounting?export=1&tab=${tab}&status=${encodeURIComponent(status)}&month=${p.month}${focusedId ? '&id=' + encodeURIComponent(focusedId) : ''}`,
        { cache: 'no-store', signal: controller.signal },
      );
      const exported: any = await r.json();
      if (!r.ok) throw Error(exported.error || 'Could not export records.');
      if (controller.signal.aborted) return;
      const headings =
        tab === 'imports'
          ? [
              'Source',
              'Dataset',
              'Document ID',
              'Date',
              'Amount',
              'Status',
              'Evidence',
            ]
          : [
              'ID',
              'Type',
              'Date',
              'Title',
              'Amount',
              'Status',
              'Allocated payments',
            ];
      const rows = exported.rows.map((r: any) =>
        tab === 'imports'
          ? [
              r.source,
              r.dataset,
              r.external_id,
              r.document_date,
              r.amount,
              r.status,
              r.review_note,
            ]
          : [r.id, r.kind, r.date, r.title, r.amount, r.status, r.paid],
      );
      const blob = new Blob(
        [
          '\uFEFF' +
            [
              [
                'BOH',
                tab,
                'Period',
                exported.month,
                'Status filter',
                exported.status || 'All',
              ],
              ['Generated at', exported.generatedAt, 'Basis', exported.basis],
              ...(exported.selectedDocumentId
                ? [['Selected document', exported.selectedDocumentId]]
                : []),
              headings,
              ...rows,
            ]
              .map((row: any[]) => row.map(csvCell).join(','))
              .join('\r\n'),
        ],
        { type: 'text/csv;charset=utf-8' },
      );
      const url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = `BOH-accounting-${tab}-${p.month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Could not export records.');
    } finally {
      if (!controller.signal.aborted) setExporting(false);
    }
  }
  const options =
    tab === 'imports'
      ? ['Needs confirmation', 'Matched', 'Excluded', 'Draft created']
      : ['Draft', 'Submitted', 'Approved', 'Posted', 'Archived'];
  const tone = (s: string) =>
    s === 'Approved' || s === 'Matched'
      ? 'green'
      : s === 'Posted'
        ? 'blue'
        : s === 'Archived' || s === 'Excluded'
          ? 'grey'
          : 'amber';
  const field = (
    key: string,
    label: string,
    type = 'text',
    required = false,
  ) => (
    <label className="form-field" htmlFor={'accounting-' + key}>
      {t(label)}{' '}
      <span className="field-optional">
        {t(required ? 'Required' : 'Optional')}
      </span>
      {key === 'amount' ? (
        <MoneyInput
          id={'accounting-' + key}
          label={t(label)}
          value={form[key] ?? ''}
          onChange={(v) => set(key, v)}
          invalid={!!fieldErrors[key]}
          describedBy={'accounting-help-' + key}
        />
      ) : (
        <input
          id={'accounting-' + key}
          value={form[key] ?? ''}
          type={type}
          required={required}
          min={type === 'number' ? 0 : undefined}
          step={type === 'number' ? 1 : undefined}
          max={key === 'date' && dialog?.type === 'pay' ? today() : undefined}
          list={key === 'account' ? 'accounting-accounts' : undefined}
          aria-invalid={!!fieldErrors[key] || undefined}
          aria-describedby={'accounting-help-' + key}
          onChange={(e) =>
            set(
              key,
              type === 'number' ? Number(e.target.value) : e.target.value,
            )
          }
        />
      )}
      {key === 'account' && (
        <datalist id="accounting-accounts">
          {[
            ...new Set(
              p.snapshot.records
                .map((r) => r.payload.account)
                .filter((v) => typeof v === 'string' && v),
            ),
          ].map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      )}
      <span
        id={'accounting-help-' + key}
        className="field-error"
        role={fieldErrors[key] ? 'alert' : undefined}
      >
        {fieldErrors[key] && t(fieldErrors[key])}
      </span>
    </label>
  );
  return (
    <>
      <div className="accounting-intro">
        <div>
          <ShieldCheck size={22} />
          <div>
            <strong>{t('Accounting review')}</strong>
            <p>
              {t(
                'Prepare, match and approve. Imported accounting records never become cash receipts automatically.',
              )}
            </p>
          </div>
        </div>
        <div className="button-row">
          <Button variant="outline" onClick={() => open('import')}>
            <FileInput size={16} />
            {t('Import CSV')}
          </Button>
          <Button onClick={() => open('document')}>
            <Plus size={16} />
            {t('New document')}
          </Button>
        </div>
      </div>
      <div className="accounting-stats">
        <Panel title={t('Needs confirmation')} subtitle={t('All periods')}>
          <strong>{data?.summary?.unreviewed ?? '—'}</strong>
        </Panel>
        <Panel title={t('Awaiting approval')} subtitle={t('All periods')}>
          <strong>{data?.summary?.submitted ?? '—'}</strong>
        </Panel>
        <Panel title={t('Approved documents')} subtitle={t('All periods')}>
          <strong>{data?.summary?.approved ?? '—'}</strong>
        </Panel>
      </div>
      <div className="accounting-notice">
        <FileCheck2 size={20} />
        <span>
          {t(
            'MISA is not connected for posting. API registration, accounting mappings, opening balances and cutover approval are still required.',
          )}
        </span>
      </div>
      <div
        className="button-row"
        role="group"
        aria-label={t('Accounting review')}
      >
        {[
          ['documents', 'Documents'],
          ['imports', 'Import review'],
        ].map(([value, label]) => (
          <Button
            key={value}
            variant={tab === value ? 'default' : 'outline'}
            aria-pressed={tab === value}
            onClick={() => {
              setFocusedId('');
              setTab(value);
              setStatus('');
              setOffset(0);
            }}
          >
            {t(label)}
          </Button>
        ))}
        <Choice
          label={t('Status')}
          value={status}
          onChange={(v) => {
            setFocusedId('');
            setStatus(v);
            setOffset(0);
          }}
          options={[
            { value: '', label: t('All statuses') },
            ...options.map((s) => ({ value: s, label: t(s) })),
          ]}
        />
        <Button
          variant="ghost"
          onClick={() => setVersion((v) => v + 1)}
          aria-label={t('Refresh latest records')}
        >
          <RefreshCw size={16} />
        </Button>
        <Button
          variant="outline"
          disabled={loading || exporting || !data?.total}
          onClick={exportAll}
        >
          <Download size={16} />
          {t(exporting ? 'Preparing export…' : 'Export all matching records')}
        </Button>
      </div>
      {focusedId && (
        <div className="accounting-notice">
          <span>
            {t(
              'Showing the document selected from Today, with its current status.',
            )}
          </span>
          <Button variant="outline" onClick={() => setFocusedId('')}>
            {t('Show all documents')}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {message(error)}
        </p>
      )}
      {loading ? (
        <p role="status">{t('Loading records…')}</p>
      ) : (
        data && (
          <Panel
            title={t(tab === 'imports' ? 'Import review' : 'Documents')}
            subtitle={t(
              'Source evidence stays attached to the review history. Cash totals stay in Finance.',
            )}
          >
            <DataTable
              headings={
                tab === 'imports'
                  ? [
                      'Source / document',
                      'Date',
                      'Amount',
                      'Status',
                      'Review / actions',
                    ]
                  : [
                      'Document',
                      'Date',
                      'Amount',
                      'Allocated payments',
                      'Status',
                      'Review / actions',
                    ]
              }
              rows={data.rows.map((r: any) =>
                tab === 'imports'
                  ? [
                      <span>
                        <strong>{r.external_id}</strong>
                        <small>
                          {r.source} · {r.dataset} · {r.view_name}
                        </small>
                        <small>
                          {r.file_name} · {t('Row')} {r.row_number + 1}
                        </small>
                        {Number(r.possible_duplicates) > 0 && (
                          <Badge tone="amber">{t('Possible duplicate')}</Badge>
                        )}
                      </span>,
                      r.document_date,
                      money(Number(r.amount)),
                      <Badge tone={tone(r.status)}>{t(r.status)}</Badge>,
                      <div className="button-row">
                        {r.status === 'Needs confirmation' && (
                          <Button
                            variant="outline"
                            onClick={() => open('review', r)}
                          >
                            {t('Review')}
                          </Button>
                        )}
                        {['Matched', 'Excluded'].includes(r.status) && (
                          <Button
                            variant="outline"
                            onClick={() => open('review', r)}
                          >
                            {t('Reopen review')}
                          </Button>
                        )}
                        <Button variant="ghost" onClick={() => history(r)}>
                          {t('History')}
                        </Button>
                      </div>,
                    ]
                  : [
                      <span>
                        <strong>{r.title}</strong>
                        <small>
                          {t(r.kind)} · {r.counterparty}
                        </small>
                      </span>,
                      r.date,
                      money(Number(r.amount)),
                      money(Number(r.paid)),
                      <Badge tone={tone(r.status)}>{t(r.status)}</Badge>,
                      <div className="button-row">
                        {['Draft', 'Submitted', 'Approved'].includes(
                          r.status,
                        ) &&
                          !Number(r.paid) && (
                            <Button
                              variant="ghost"
                              onClick={() => open('document', r)}
                            >
                              {t('Edit')}
                            </Button>
                          )}
                        {r.status === 'Draft' && (
                          <Button
                            variant="outline"
                            onClick={() => open('confirm', r, 'submit')}
                          >
                            {t('Submit for approval')}
                          </Button>
                        )}
                        {r.status === 'Submitted' &&
                          p.snapshot.actor.role === 'Director' && (
                            <Button
                              onClick={() => open('confirm', r, 'approve')}
                            >
                              {t('Approve')}
                            </Button>
                          )}
                        {['Approved', 'Posted'].includes(r.status) &&
                          r.kind === 'bill' &&
                          Number(r.paid) < Number(r.amount) && (
                            <Button
                              variant="outline"
                              onClick={() => open('pay', r)}
                            >
                              {t('Record bill payment')}
                            </Button>
                          )}
                        {['Approved', 'Posted'].includes(r.status) &&
                          r.kind !== 'journal' &&
                          Number(r.paid) < Number(r.amount) && (
                            <Button
                              variant="outline"
                              onClick={() => open('settle', r)}
                            >
                              {t('Match existing payment')}
                            </Button>
                          )}
                        {['Draft', 'Submitted'].includes(r.status) && (
                          <Button
                            variant="ghost"
                            onClick={() => open('confirm', r, 'archive')}
                          >
                            {t('Archive')}
                          </Button>
                        )}
                        {r.status === 'Archived' && (
                          <Button
                            variant="ghost"
                            onClick={() => open('confirm', r, 'restore')}
                          >
                            {t('Restore')}
                          </Button>
                        )}
                        {r.status === 'Draft' &&
                          !r.source_row_id &&
                          !r.ever_approved && (
                            <Button
                              variant="ghost"
                              onClick={() => open('confirm', r, 'delete')}
                            >
                              {t('Delete unused draft')}
                            </Button>
                          )}
                        <Button variant="ghost" onClick={() => history(r)}>
                          {t('History')}
                        </Button>
                      </div>,
                    ],
              )}
            />
            <div className="accounting-pagination">
              <Button
                variant="outline"
                disabled={!offset}
                onClick={() => setOffset((v) => Math.max(0, v - 50))}
              >
                {t('Previous')}
              </Button>
              <span>
                {data.total ? offset + 1 : 0}–
                {Math.min(offset + 50, data.total)} / {data.total}
              </span>
              <Button
                variant="outline"
                disabled={offset + 50 >= data.total}
                onClick={() => setOffset((v) => v + 50)}
              >
                {t('Next')}
              </Button>
            </div>
          </Panel>
        )
      )}
      <Dialog
        open={!!dialog}
        onOpenChange={(v) => {
          if (!v) dismiss();
        }}
      >
        <DialogContent className="record-dialog entry-dialog">
          <DialogHeader>
            <DialogTitle>
              {t(
                dialog?.type === 'import'
                  ? 'Import CSV'
                  : dialog?.type === 'review'
                    ? 'Review source record'
                    : dialog?.type === 'pay'
                      ? 'Record bill payment'
                      : dialog?.type === 'settle'
                        ? 'Match existing payment'
                        : dialog?.type === 'history'
                          ? 'Record history'
                          : dialog?.type === 'confirm'
                            ? 'Confirm action'
                            : 'Financial document',
              )}
            </DialogTitle>
            <DialogDescription>
              {t(
                'Changes are recorded under your account. Existing cash and attendance remain separate.',
              )}
            </DialogDescription>
          </DialogHeader>
          {dialog && (
            <form onSubmit={submit} noValidate={dialog.type === 'pay'}>
              <fieldset
                className="accounting-form"
                disabled={busy || uncertain}
                inert={busy || uncertain}
              >
                {formError && (
                  <p className="form-error wide" role="alert">
                    {message(formError)}
                  </p>
                )}
                {dialog.type === 'document' && (
                  <>
                    <label>
                      {t('Document type')}
                      <Choice
                        label={t('Document type')}
                        value={form.kind}
                        onChange={(v) => set('kind', v)}
                        options={documentKinds.map((k) => ({
                          value: k,
                          label: t(k),
                        }))}
                      />
                    </label>
                    {field('title', 'Title', 'text', true)}
                    {field('counterparty', 'Supplier / employee')}
                    {field('date', 'Document date', 'date', true)}
                    {field('dueDate', 'Due date', 'date')}
                    {field('amount', 'Amount (VND)', 'number', true)}
                    <label className="wide">
                      {t('Notes')}
                      <textarea
                        value={form.notes}
                        onChange={(e) => set('notes', e.target.value)}
                      />
                    </label>
                    <details className="wide">
                      <summary>{t('Advanced: journal preparation')}</summary>
                      <p>
                        {t(
                          'These lines are a draft only. Official posting remains locked until reconciliation is approved.',
                        )}
                      </p>
                      {(form.lines || []).map((line: any, i: number) => (
                        <div className="journal-line" key={i}>
                          {['account', 'debit', 'credit'].map((key) => (
                            <label key={key}>
                              {t(key)}
                              <input
                                type={key === 'account' ? 'text' : 'number'}
                                min="0"
                                step="1"
                                value={line[key]}
                                onChange={(e) =>
                                  set(
                                    'lines',
                                    form.lines.map((v: any, n: number) =>
                                      n === i
                                        ? {
                                            ...v,
                                            [key]:
                                              key === 'account'
                                                ? e.target.value
                                                : Number(e.target.value),
                                          }
                                        : v,
                                    ),
                                  )
                                }
                              />
                            </label>
                          ))}
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              set(
                                'lines',
                                form.lines.filter(
                                  (_: any, n: number) => n !== i,
                                ),
                              )
                            }
                          >
                            {t('Remove line')}
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          set('lines', [
                            ...(form.lines || []),
                            { account: '', debit: 0, credit: 0 },
                          ])
                        }
                      >
                        {t('Add journal line')}
                      </Button>
                    </details>
                  </>
                )}
                {dialog.type === 'import' && (
                  <>
                    <div className="wide accounting-notice">
                      {t(
                        'Export a document list as CSV first. Map its columns, preview the values, then save to review—not to collections.',
                      )}
                    </div>
                    <label>
                      {t('Source')}
                      <Choice
                        label={t('Source')}
                        value={form.source}
                        onChange={(v) => set('source', v)}
                        options={['MISA', 'Bank', 'Spreadsheet', 'Top ID'].map(
                          (v) => ({ value: v, label: t(v) }),
                        )}
                      />
                    </label>
                    {field('dataset', 'Dataset name', 'text', true)}
                    {field('period', 'Source period', 'month', true)}
                    {field('view', 'Source view / category', 'text', true)}
                    <label>
                      {t('Number format')}
                      <Choice
                        label={t('Number format')}
                        value={form.numberFormat}
                        onChange={(v) => set('numberFormat', v)}
                        options={[
                          { value: 'vn', label: '1.000.000' },
                          { value: 'en', label: '1,000,000' },
                          { value: 'plain', label: '1000000' },
                        ]}
                      />
                    </label>
                    <label>
                      {t('Date format')}
                      <Choice
                        label={t('Date format')}
                        value={form.dateFormat}
                        onChange={(v) => set('dateFormat', v)}
                        options={[
                          { value: 'dmy', label: 'DD/MM/YYYY' },
                          { value: 'iso', label: 'YYYY-MM-DD' },
                        ]}
                      />
                    </label>
                    <label className="wide">
                      {t('CSV file')}
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(e) => void chooseFile(e.target.files?.[0])}
                      />
                    </label>
                    {form.headers &&
                      [
                        ['externalId', 'Document ID'],
                        ['date', 'Document date'],
                        ['amount', 'Amount (VND)'],
                        ['name', 'Supplier / employee'],
                        ['reference', 'Reference'],
                        ['category', 'Category'],
                        ['direction', 'Receipt / payment'],
                      ].map(([key, label]) => (
                        <label key={key}>
                          {t(label)}
                          {['externalId', 'date', 'amount'].includes(key)
                            ? ' *'
                            : ''}
                          <Choice
                            label={t(label)}
                            value={form.mapping[key] || ''}
                            onChange={(v) =>
                              set('mapping', { ...form.mapping, [key]: v })
                            }
                            options={[
                              { value: '', label: t('Not mapped') },
                              ...form.headers.map((v: string) => ({
                                value: v,
                                label: v,
                              })),
                            ]}
                          />
                        </label>
                      ))}
                    {preview && (
                      <div className="wide">
                        <p>
                          {preview.rows.length} {t('rows ready for review')} ·{' '}
                          {preview.outsidePeriod} {t('outside selected period')}{' '}
                          · {preview.duplicateIds} {t('repeated document IDs')}
                        </p>
                        <DataTable
                          headings={['Document ID', 'Date', 'Amount']}
                          rows={preview.rows
                            .slice(0, 8)
                            .map((r: any) => [
                              r.externalId,
                              r.date,
                              money(r.amount),
                            ])}
                        />
                        <p>
                          {t(
                            'No invoices are treated as paid. Repeated files are not imported twice.',
                          )}
                        </p>
                      </div>
                    )}
                  </>
                )}
                {dialog.type === 'review' && (
                  <>
                    <div className="wide">
                      <strong>{dialog.row.external_id}</strong> ·{' '}
                      {money(Number(dialog.row.amount))}
                      <details>
                        <summary>{t('Original source values')}</summary>
                        <DataTable
                          headings={['Column', 'Value']}
                          rows={Object.entries(dialog.row.raw).map(([k, v]) => [
                            k,
                            String(v),
                          ])}
                        />
                      </details>
                    </div>
                    <label>
                      {t('Review decision')}
                      <Choice
                        label={t('Review decision')}
                        value={form.status}
                        onChange={(v) => set('status', v)}
                        options={(dialog.row.status === 'Needs confirmation'
                          ? ['Matched', 'Excluded', 'Draft created']
                          : ['Needs confirmation']
                        ).map((v) => ({ value: v, label: t(v) }))}
                      />
                    </label>
                    {form.status === 'Matched' && (
                      <label>
                        {t('Existing cash record')}
                        <Picker
                          label={t('Existing cash record')}
                          value={form.recordId}
                          onChange={(v) => set('recordId', v)}
                          options={p.snapshot.records
                            .filter(
                              (r) =>
                                ['receipt', 'expense'].includes(r.kind) &&
                                r.payload.amount ===
                                  Math.abs(Number(dialog.row.amount)),
                            )
                            .map((r) => ({
                              id: r.id,
                              label: `${r.date} · ${r.payload.name || r.payload.description} · ${money(r.payload.amount)}`,
                            }))}
                        />
                      </label>
                    )}
                    {form.status === 'Draft created' && (
                      <Choice
                        label={t('Document type')}
                        value={form.kind}
                        onChange={(v) => set('kind', v)}
                        options={documentKinds.map((v) => ({
                          value: v,
                          label: t(v),
                        }))}
                      />
                    )}
                    <label className="wide">
                      {t('Evidence / reason')}
                      <textarea
                        required
                        value={form.note}
                        onChange={(e) => set('note', e.target.value)}
                      />
                    </label>
                  </>
                )}
                {dialog.type === 'pay' && (
                  <>
                    <div className="wide accounting-notice">
                      <strong>
                        {dialog.row.title} ·{' '}
                        {money(
                          Number(dialog.row.amount) -
                            Number(dialog.row.paid || 0),
                        )}
                      </strong>
                      <p>
                        {t(
                          'Record money actually paid. This creates one cash entry linked to this bill. Bank verification is a separate step.',
                        )}
                      </p>
                    </div>
                    {field('date', 'Payment date', 'date', true)}
                    {field('amount', 'Amount (VND)', 'number', true)}
                    {field('account', 'Paying account', 'text', true)}
                    <label>
                      {t('Category')}
                      <Choice
                        label={t('Category')}
                        value={form.category}
                        onChange={(v) => set('category', v)}
                        options={[
                          'Rent',
                          'Utilities',
                          'Teaching',
                          'Books',
                          'Marketing',
                          'Insurance',
                          'Bank fees',
                          'Office',
                          'Other',
                        ].map((v) => ({ value: v, label: t(v) }))}
                      />
                    </label>
                    {field(
                      'evidence',
                      'Payment reference / evidence',
                      'text',
                      true,
                    )}
                    <p className="wide">
                      {t(
                        'If this payment is already in Finance, cancel and choose Match existing payment.',
                      )}
                    </p>
                    <div className="wide">
                      <FinancialReview
                        items={[
                          {
                            label: 'Supplier / employee',
                            value: dialog.row.counterparty || dialog.row.title,
                          },
                          {
                            label: 'Amount (VND)',
                            value:
                              typeof form.amount === 'number'
                                ? money(form.amount) + ' VND'
                                : '—',
                          },
                          {
                            label: 'Paying account',
                            value: form.account || t('Not recorded'),
                          },
                          {
                            label: 'Remaining after payment',
                            value:
                              typeof form.amount === 'number'
                                ? money(
                                    Number(dialog.row.amount) -
                                      Number(dialog.row.paid || 0) -
                                      form.amount,
                                  ) + ' VND'
                                : '—',
                          },
                        ]}
                      />
                    </div>
                  </>
                )}
                {dialog.type === 'settle' && (
                  <>
                    <div className="wide accounting-notice">
                      {t(
                        'Match money already recorded in Finance. This does not create a second payment.',
                      )}
                    </div>
                    <label className="wide">
                      {t('Existing cash record')}
                      <Picker
                        label={t('Existing cash record')}
                        value={form.cashRecordId}
                        onChange={(v) => set('cashRecordId', v)}
                        options={entries(p.snapshot.records, 'expense')
                          .filter(
                            (r) => typeof r.amount === 'number' && !r.payrollId,
                          )
                          .map((r) => ({
                            id: r.id,
                            label: `${r.date} · ${r.description} · ${money(r.amount)}`,
                          }))}
                      />
                    </label>
                    {field('amount', 'Amount (VND)', 'number', true)}
                    <label className="wide">
                      {t('Evidence / reason')}
                      <textarea
                        required
                        value={form.evidence}
                        onChange={(e) => set('evidence', e.target.value)}
                      />
                    </label>
                  </>
                )}
                {dialog.type === 'confirm' && (
                  <p className="wide">
                    {t(
                      dialog.action === 'delete'
                        ? 'Delete this unused draft? Its audit history is retained.'
                        : dialog.action === 'approve'
                          ? 'Approve this version? Later edits will remove approval.'
                          : dialog.action === 'archive'
                            ? 'Archive this document? It remains available in the archive filter.'
                            : dialog.action === 'restore'
                              ? 'Restore this document as a draft?'
                              : 'Submit this document to the Director for approval?',
                    )}{' '}
                    <strong>{dialog.row.title}</strong>
                  </p>
                )}
                {dialog.type === 'history' && (
                  <div className="wide">
                    <DataTable
                      headings={['When', 'Staff member', 'Change']}
                      rows={(form.activity || []).map((r: any) => [
                        r.at,
                        r.actor_name,
                        <details>
                          <summary>{r.action}</summary>
                          <pre className="audit-json">
                            {JSON.stringify(
                              { before: r.before, after: r.after },
                              null,
                              2,
                            )}
                          </pre>
                        </details>,
                      ])}
                    />
                  </div>
                )}
              </fieldset>
              {uncertain && !busy && (
                <p className="error-message" role="alert">
                  {t(
                    'The save result is uncertain. Retry the same entry to recover its result without recording it twice.',
                  )}
                </p>
              )}
              <div className="accounting-footer">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={dismiss}
                >
                  {t('Cancel')}
                </Button>
                {dialog.type !== 'history' && (
                  <Button type="submit" disabled={busy}>
                    {t(
                      busy
                        ? 'Saving…'
                        : uncertain
                          ? 'Retry save'
                          : dialog.type === 'import'
                            ? preview
                              ? 'Save to review'
                              : 'Preview import'
                            : dialog.type === 'confirm'
                              ? 'Confirm'
                              : dialog.type === 'pay'
                                ? 'Record bill payment'
                                : dialog.type === 'settle'
                                  ? 'Match existing payment'
                                  : 'Save record',
                    )}
                  </Button>
                )}
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
