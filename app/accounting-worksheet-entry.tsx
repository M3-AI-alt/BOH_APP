'use client';

import { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { accountingImportSources } from '@/lib/accounting';
import {
  accountingWorksheetColumns,
  type AccountingWorksheetKind,
  type AccountingWorksheetRow,
} from '@/lib/accounting-worksheets';
import { useLanguage } from './language';
import { Badge, DataTable } from './ui';

type Review = {
  rows: AccountingWorksheetRow[];
  digest: string;
  count: number;
  committed?: boolean;
  saved?: number;
  skipped?: number;
  failed?: number;
};
const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';

export function AccountingWorksheetValues({
  row,
  kind,
}: {
  row: AccountingWorksheetRow;
  kind: AccountingWorksheetKind;
}) {
  const { t, money } = useLanguage();
  const payload = row.payload;
  if (!payload) return <span>—</span>;
  const labels =
    kind === 'documents'
      ? {
          kind: 'Document type',
          date: 'Document date',
          title: 'Title',
          counterparty: 'Supplier / employee',
          amount: 'Amount (VND)',
          dueDate: 'Due date',
          notes: 'Notes',
        }
      : {
          externalId: 'Entry reference',
          date: 'Document date',
          name: 'Name / description',
          amount: 'Amount (VND)',
          category: 'Category',
          direction: 'Receipt / payment',
          reference: 'Supporting reference',
        };
  return (
    <details className="worksheet-row-values">
      <summary>{t('View values')}</summary>
      <dl>
        {Object.entries(labels).map(([key, label]) => (
          <div key={key}>
            <dt>{t(label)}</dt>
            <dd>
              {payload[key] == null || payload[key] === ''
                ? '—'
                : key === 'amount'
                  ? money(Number(payload[key])) + ' VND'
                  : key === 'kind'
                    ? t(String(payload[key]))
                    : String(payload[key])}
            </dd>
          </div>
        ))}
      </dl>
      {Array.isArray(payload.lines) && payload.lines.length > 0 && (
        <DataTable
          headings={['Account', 'debit', 'credit', 'Notes']}
          rows={payload.lines.map(
            (line: {
              account: string;
              debit: number;
              credit: number;
              note?: string;
            }) => [
              line.account,
              money(Number(line.debit)),
              money(Number(line.credit)),
              line.note || '—',
            ],
          )}
        />
      )}
    </details>
  );
}

/** Templates, manual source entry and uploads use the same checked command. */
export function AccountingWorksheetEntry({
  kind,
  month,
  onManualDocument,
  onSaved,
  onOtherCsv,
}: {
  kind: AccountingWorksheetKind;
  month: string;
  onManualDocument: () => void;
  onSaved: () => void;
  onOtherCsv: () => void;
}) {
  const { t, message, money } = useLanguage();
  const [mode, setMode] = useState<'upload' | 'manual' | null>(null);
  const [upload, setUpload] = useState<{ csv?: string; xlsx?: string }>({});
  const [fileName, setFileName] = useState('');
  const [metadata, setMetadata] = useState({
    source: 'Spreadsheet',
    dataset: 'Internal review',
    period: month,
    view: 'Worksheet',
  });
  const [manual, setManual] = useState<Record<string, string>>({});
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const inFlight = useRef(false);
  const readVersion = useRef(0);
  const active = useRef(true);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (review) {
      reviewHeading.current?.focus({ preventScroll: true });
      reviewHeading.current?.scrollIntoView({ block: 'start' });
    }
  }, [review]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      readVersion.current++;
    };
  }, []);
  const dirty =
    !!mode && (!!fileName || mode === 'manual') && !review?.committed;
  useEffect(() => {
    if (!dirty) return;
    const prevent = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);
  const template = '/templates/BOH-accounting-' + kind + '.xlsx';
  function begin(next: 'manual' | 'upload') {
    readVersion.current++;
    setMode(next);
    setUpload({});
    setFileName('');
    setReview(null);
    setError('');
    setReading(false);
    setMetadata({
      source: 'Spreadsheet',
      dataset: 'Internal review',
      period: month,
      view: next === 'manual' ? 'Manual entry' : 'Worksheet',
    });
    setManual({
      entryKey: '',
      date: '',
      amount: '',
      name: '',
      category: '',
      direction: '',
      reference: '',
    });
  }
  function dismiss() {
    if (inFlight.current) return;
    if (
      dirty &&
      !window.confirm(
        t(
          'Close this import? Unsaved review changes will be discarded. Your worksheet and any saved records are kept.',
        ),
      )
    )
      return;
    readVersion.current++;
    setReading(false);
    setMode(null);
  }
  function edit(key: string, value: string) {
    setManual((v) => ({ ...v, [key]: value }));
    setReview(null);
    setError('');
  }
  async function chooseFile(file?: File) {
    const version = ++readVersion.current;
    setReview(null);
    setUpload({});
    setFileName('');
    setError('');
    setReading(false);
    if (!file) return;
    if (file.size > 2 * 1024 * 1024 || !/\.(csv|xlsx)$/i.test(file.name)) {
      setError(t('Choose an Excel (.xlsx) or CSV worksheet up to 2 MB.'));
      return;
    }
    setReading(true);
    try {
      let value: { csv?: string; xlsx?: string };
      if (/\.csv$/i.test(file.name)) value = { csv: await file.text() };
      else {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () =>
            reject(Error('Could not read this file. Please choose it again.'));
          reader.readAsDataURL(file);
        });
        value = { xlsx: base64 };
      }
      if (!active.current || version !== readVersion.current) return;
      setUpload(value);
      setFileName(file.name);
    } catch (e) {
      if (active.current && version === readVersion.current)
        setError(
          message(
            e instanceof Error
              ? e.message
              : 'Could not read this file. Please choose it again.',
          ),
        );
    } finally {
      if (active.current && version === readVersion.current) setReading(false);
    }
  }
  async function submit(operation: 'preview' | 'commit') {
    if (inFlight.current || reading) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const fields = accountingWorksheetColumns.source;
      const file =
        mode === 'manual'
          ? {
              csv:
                fields.map(quote).join(',') +
                '\r\n' +
                fields.map((k) => quote(manual[k] || '')).join(','),
            }
          : upload;
      const response = await fetch('/api/accounting-worksheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation,
          kind,
          ...file,
          metadata: {
            ...metadata,
            fileName: mode === 'manual' ? 'manual-entry.csv' : fileName,
          },
          digest: operation === 'commit' ? review?.digest : undefined,
        }),
      });
      const result = (await response.json()) as Review & { error?: string };
      if (!response.ok)
        throw Error(
          result.error || 'Could not complete this request. Please try again.',
        );
      setReview(result);
      if (operation === 'commit' && (result.saved || 0) > 0) onSaved();
    } catch (e) {
      setError(
        message(
          e instanceof Error
            ? e.message
            : 'Could not complete this request. Please try again.',
        ),
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const ready = review?.rows.filter((r) => r.status === 'Ready').length || 0;
  const invalid = review?.rows.some(
    (r) => r.status === 'Needs correction' || r.status === 'Failed',
  );
  const outsidePeriod =
    review?.rows.filter(
      (r) =>
        r.payload?.date && !String(r.payload.date).startsWith(metadata.period),
    ).length || 0;
  const manualFields = [
    ['entryKey', 'Entry reference', 'text', true],
    ['date', 'Document date', 'date', true],
    ['amount', 'Amount (VND)', 'text', true],
    ['name', 'Name / description', 'text', false],
    ['category', 'Category', 'text', false],
    ['reference', 'Supporting reference', 'text', false],
  ] as const;
  return (
    <>
      <div className="accounting-entry-box">
        <div
          className="entry-actions"
          role="group"
          aria-label={t(
            kind === 'source'
              ? 'Source review entry'
              : 'Accounting document entry',
          )}
        >
          <Button
            onClick={
              kind === 'source' ? () => begin('manual') : onManualDocument
            }
          >
            <Plus size={16} />
            {t('Add manually')}
          </Button>
          <a className="bulk-link" href={template} download>
            <FileSpreadsheet size={16} />
            {t('Download worksheet sample')}
          </a>
          <Button variant="outline" onClick={() => begin('upload')}>
            <Upload size={16} />
            {t('Import completed worksheet')}
          </Button>
        </div>
        <p>
          {t(
            kind === 'source'
              ? 'Add source evidence for review. This does not record money received or paid.'
              : 'Add draft bills, payroll, refunds or journals. Importing does not approve or pay them.',
          )}
        </p>
        {kind === 'source' && (
          <details>
            <summary>{t('Already have a different CSV format?')}</summary>
            <Button variant="outline" onClick={onOtherCsv}>
              {t('Map another CSV')}
            </Button>
          </details>
        )}
      </div>
      <Dialog
        open={!!mode}
        onOpenChange={(value) => {
          if (!value) dismiss();
        }}
      >
        <DialogContent className="record-dialog entry-dialog accounting-worksheet-dialog">
          <DialogHeader>
            <DialogTitle>
              {t(
                mode === 'manual'
                  ? 'Add source record'
                  : 'Import completed worksheet',
              )}
            </DialogTitle>
            <DialogDescription>
              {t(
                kind === 'source'
                  ? 'Add source evidence for review. This does not record money received or paid.'
                  : 'Add draft bills, payroll, refunds or journals. Importing does not approve or pay them.',
              )}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit(review && !review.committed ? 'commit' : 'preview');
            }}
          >
            <div className="accounting-worksheet-body">
              <fieldset disabled={busy || reading || !!review?.committed}>
                {mode === 'upload' && (
                  <section className="worksheet-upload-step">
                    <h3>{t('1. Download and fill')}</h3>
                    <p>
                      {t(
                        'Fill the blank Entry sheet. Examples are separate and are never imported. Keep each entry reference unchanged when retrying.',
                      )}
                    </p>
                    <a className="bulk-link" href={template} download>
                      <FileSpreadsheet size={16} />
                      {t('Download worksheet sample')}
                    </a>
                    {kind === 'documents' && (
                      <p>
                        {t(
                          'For journals, also fill JournalLines with matching entry references and balanced debit and credit amounts.',
                        )}
                      </p>
                    )}
                    <h3>{t('2. Upload your completed worksheet')}</h3>
                    <label>
                      <span>{t('Excel or CSV worksheet')}</span>
                      <input
                        type="file"
                        accept=".xlsx,.csv"
                        onChange={(e) => void chooseFile(e.target.files?.[0])}
                      />
                    </label>
                    <small>
                      {fileName ||
                        t(
                          'Up to 200 entries per import. No records are saved until you review and confirm.',
                        )}
                    </small>
                  </section>
                )}
                {kind === 'source' && (
                  <section className="entry-section">
                    <h3>{t('Source information')}</h3>
                    <div className="record-grid">
                      <label>
                        <span>{t('Source')}</span>
                        <select
                          value={metadata.source}
                          onChange={(e) => {
                            setMetadata((v) => ({
                              ...v,
                              source: e.target.value,
                            }));
                            setReview(null);
                          }}
                        >
                          {accountingImportSources.map((value) => (
                            <option key={value} value={value}>
                              {t(value)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>{t('Review period')}</span>
                        <input
                          type="month"
                          required
                          value={metadata.period}
                          onChange={(e) => {
                            setMetadata((v) => ({
                              ...v,
                              period: e.target.value,
                            }));
                            setReview(null);
                          }}
                        />
                      </label>
                    </div>
                    <details>
                      <summary>{t('More details')}</summary>
                      <div className="record-grid">
                        <label>
                          <span>{t('Dataset')}</span>
                          <input
                            required
                            maxLength={200}
                            value={metadata.dataset}
                            onChange={(e) => {
                              setMetadata((v) => ({
                                ...v,
                                dataset: e.target.value,
                              }));
                              setReview(null);
                            }}
                          />
                        </label>
                        <label>
                          <span>{t('Source category')}</span>
                          <input
                            required
                            maxLength={160}
                            value={metadata.view}
                            onChange={(e) => {
                              setMetadata((v) => ({
                                ...v,
                                view: e.target.value,
                              }));
                              setReview(null);
                            }}
                          />
                        </label>
                      </div>
                    </details>
                  </section>
                )}
                {mode === 'manual' && (
                  <section className="entry-section">
                    <h3>{t('Record details')}</h3>
                    <div className="record-grid">
                      {manualFields.map(([key, label, type, required]) => (
                        <label key={key}>
                          <span>
                            {t(label)}{' '}
                            {required && <small>{t('Required')}</small>}
                          </span>
                          <input
                            required={required}
                            type={type}
                            value={manual[key] || ''}
                            inputMode={key === 'amount' ? 'numeric' : undefined}
                            pattern={
                              key === 'amount'
                                ? '-?[0-9]+'
                                : key === 'entryKey'
                                  ? '[A-Za-z0-9][A-Za-z0-9._:\\-]*'
                                  : undefined
                            }
                            onChange={(e) => edit(key, e.target.value)}
                          />
                          {key === 'entryKey' && (
                            <small>
                              {t(
                                'Use a permanent reference, for example BANK-2026-001. Do not reuse it for another record.',
                              )}
                            </small>
                          )}
                          {key === 'amount' && (
                            <small>
                              {t(
                                'Whole VND, without separators. Use a negative amount for money paid out.',
                              )}
                            </small>
                          )}
                        </label>
                      ))}
                    </div>
                  </section>
                )}
              </fieldset>
              {reading && <p role="status">{t('Reading worksheet…')}</p>}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              {review && (
                <section aria-label={t('Review before saving')}>
                  <h3 ref={reviewHeading} tabIndex={-1}>
                    {t(
                      review.committed
                        ? 'Import results'
                        : 'Review before saving',
                    )}
                  </h3>
                  <p role="status">
                    {review.committed
                      ? `${t('Saved')}: ${review.saved || 0} · ${t('Skipped')}: ${review.skipped || 0} · ${t('Failed')}: ${review.failed || 0}`
                      : `${t('Ready')}: ${ready} · ${t('Total rows')}: ${review.count}`}
                  </p>
                  {outsidePeriod > 0 && (
                    <p className="accounting-notice">
                      {t(
                        'Some document dates are outside the selected period. Check the dates before saving.',
                      )}
                    </p>
                  )}
                  {review.committed && (
                    <p>
                      {t(
                        'Records are shown in their relevant period. Change the period filter if you cannot see them in the list.',
                      )}
                    </p>
                  )}
                  <DataTable
                    headings={[
                      'Row',
                      'Entry reference',
                      'Document date',
                      ...(kind === 'documents' ? ['Document type'] : []),
                      'Record',
                      'Amount',
                      'Status',
                      'Details',
                    ]}
                    rows={review.rows.map((row) => [
                      row.row,
                      row.key,
                      row.payload?.date || '—',
                      ...(kind === 'documents'
                        ? [
                            row.payload?.kind
                              ? t(String(row.payload.kind))
                              : '—',
                          ]
                        : []),
                      row.label,
                      row.payload?.amount == null
                        ? '—'
                        : money(Number(row.payload.amount)),
                      <Badge
                        key={row.row}
                        tone={
                          ['Needs correction', 'Failed'].includes(row.status)
                            ? 'amber'
                            : 'green'
                        }
                      >
                        {t(row.status)}
                      </Badge>,
                      <div key={'details-' + row.row}>
                        {row.error && <p>{message(row.error)}</p>}
                        <AccountingWorksheetValues row={row} kind={kind} />
                      </div>,
                    ])}
                  />
                  {!review.count && (
                    <p>
                      {t(
                        'The Entry sheet is empty. Add your records there; do not fill the Examples sheet.',
                      )}
                    </p>
                  )}
                  {invalid && (
                    <p role="alert">
                      {t(
                        'Fix the highlighted rows in your worksheet and upload it again. Saved records are not imported twice.',
                      )}
                    </p>
                  )}
                </section>
              )}
            </div>
            <div className="accounting-worksheet-footer">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={dismiss}
              >
                {t(review?.committed ? 'Done' : 'Cancel')}
              </Button>
              {review?.committed && (
                <Button type="button" onClick={() => begin(mode || 'upload')}>
                  {t('Start another import')}
                </Button>
              )}
              {review && !review.committed && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setReview(null)}
                >
                  {t('Back to entry')}
                </Button>
              )}
              {!review?.committed && (
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    reading ||
                    (mode === 'upload' && !fileName) ||
                    (!!review && (!ready || !!invalid))
                  }
                >
                  {t(
                    busy
                      ? 'Working…'
                      : !review
                        ? 'Preview entries'
                        : kind === 'source'
                          ? 'Save for review'
                          : 'Create draft documents',
                  )}
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
