'use client';
import { useRef, useState } from 'react';
import {
  Download,
  Upload,
  Plus,
  CheckCircle2,
  FileSpreadsheet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Choice, Panel, DataTable, Badge } from './ui';
import { useLanguage } from './language';
import {
  bulkTasks,
  bulkFields,
  canImport,
  canExport,
  type BulkRow,
} from '@/lib/bulk';
import { entries } from '@/lib/domain';
import { csvCell } from '@/lib/accounting';
import type { ViewProps } from './views';

export function BulkWorkspace(p: ViewProps) {
  const { t, message } = useLanguage();
  const a = p.snapshot.actor;
  const [kind, setKind] = useState(
    a.role === 'TA'
      ? 'attendance'
      : a.role === 'Finance'
        ? 'receipt'
        : 'student',
  );
  const [upload, setUpload] = useState<{ csv?: string; xlsx?: string }>({});
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<{
    rows: BulkRow[];
    digest: string;
    committed?: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [allMonths, setAllMonths] = useState(true);
  const [classId, setClassId] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const permitted = Object.keys(bulkTasks).filter((k) => canExport(a, k));
  const editable = canImport(a, kind);
  const url = (action: string) =>
    '/api/worksheets?' +
    new URLSearchParams({
      action,
      kind,
      month: allMonths ? '' : p.month,
      classId,
    });
  function select(value: string) {
    setKind(value);
    setPreview(null);
    setUpload({});
    setFileName('');
    setError('');
    if (input.current) input.current.value = '';
  }
  async function choose(file?: File) {
    setPreview(null);
    setUpload({});
    setError('');
    setFileName('');
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw Error('Use a file smaller than 2 MB.');
      if (/\.csv$/i.test(file.name)) setUpload({ csv: await file.text() });
      else if (/\.xlsx$/i.test(file.name)) {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        setUpload({ xlsx: data });
      } else throw Error('Choose an Excel (.xlsx) or CSV worksheet.');
      setFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to read file.');
    }
  }
  async function run(action: 'preview' | 'commit') {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/worksheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          kind,
          ...upload,
          digest: preview?.digest,
        }),
      });
      const result: any = await r.json();
      if (!r.ok) throw Error(result.error || 'Unable to import.');
      setPreview(result);
      if (action === 'commit') await p.refresh?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to import.');
    } finally {
      setBusy(false);
    }
  }
  function report() {
    const csv =
      '\uFEFF' +
      [
        ['Row', 'Reference', 'Status', 'Error'],
        ...(preview?.rows || []).map((r) => [
          r.row,
          r.key,
          r.status,
          r.error || '',
        ]),
      ]
        .map((r) => r.map(csvCell).join(','))
        .join('\r\n');
    const u = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = u;
    link.download = 'BOH-import-review.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  const bad =
    preview?.rows.filter((r) => r.status === 'Needs correction').length || 0;
  const ready = preview?.rows.filter((r) => r.status === 'Ready').length || 0;
  return (
    <div className="bulk-workspace">
      <Panel
        title={t('Import & export')}
        subtitle={t(
          'Enter one record or fill a worksheet. Review before saving.',
        )}
      >
        <div className="bulk-toolbar">
          <Choice
            label={t('Choose a task')}
            value={kind}
            onChange={select}
            disabled={busy}
            options={permitted.map((k) => ({
              value: k,
              label: t(bulkTasks[k].label),
            }))}
          />
          <span
            className={
              'bulk-category bulk-' + bulkTasks[kind].group.toLowerCase()
            }
          >
            {t(bulkTasks[kind].group)}
          </span>
          {editable && (
            <Button
              disabled={busy}
              onClick={() =>
                kind === 'attendance'
                  ? p.navigate('Attendance')
                  : p.open(kind, undefined, { month: p.month })
              }
            >
              <Plus size={16} />
              {t('Manual entry')}
            </Button>
          )}
        </div>
      </Panel>
      <div className="bulk-cards">
        <Panel
          title={t('1. Download a template')}
          subtitle={t(
            'Use the Entry sheet. Examples are separate and are not imported.',
          )}
        >
          <div className="bulk-actions">
            {editable && (
              <>
                <a
                  className="bulk-link"
                  href={'/templates/BOH-' + kind + '.xlsx'}
                  download
                >
                  <FileSpreadsheet size={18} />
                  {t('Excel template')}
                </a>
                <a className="bulk-link" href={url('template')}>
                  <Download size={16} />
                  {t('CSV template')}
                </a>
              </>
            )}
            <a className="bulk-link" href={url('references')}>
              <Download size={16} />
              {t('Student, class and package references')}
            </a>
          </div>
          <p className="bulk-help">
            {t(
              'Use exact names or record IDs. Duplicate names need an ID. Import classes and students before their packages and payments.',
            )}
          </p>
        </Panel>
        <Panel
          title={t('2. Upload and review')}
          subtitle={t(
            'Up to 200 rows. Whole VND without separators. Dates: YYYY-MM-DD.',
          )}
        >
          {editable ? (
            <>
              <label className="bulk-upload">
                <Upload size={22} />
                <span>
                  {fileName || t('Choose an Excel (.xlsx) or CSV worksheet.')}
                </span>
                <input
                  ref={input}
                  type="file"
                  accept=".csv,.xlsx"
                  disabled={busy}
                  onChange={(e) => void choose(e.target.files?.[0])}
                />
              </label>
              <Button
                disabled={busy || !fileName}
                onClick={() => void run('preview')}
              >
                {busy ? t('Working…') : t('Preview import')}
              </Button>
            </>
          ) : (
            <p>{t('Your role has read-only access to these records.')}</p>
          )}
        </Panel>
      </div>
      {error && (
        <div className="notice" role="alert">
          {message(error)}
        </div>
      )}
      {preview && (
        <Panel
          title={t('3. Confirm entries')}
          subtitle={t(
            'New entries only. Existing records are never overwritten.',
          )}
        >
          <div className="bulk-toolbar" aria-live="polite">
            <Badge tone={bad ? 'amber' : 'green'}>
              {preview.rows.length} {t('rows')} · {bad} {t('need correction')}
            </Badge>
            <Button variant="outline" onClick={report}>
              <Download size={16} />
              {t('Download review')}
            </Button>
            <Button
              disabled={busy || bad > 0 || ready === 0}
              onClick={() => void run('commit')}
            >
              <CheckCircle2 size={16} />
              {t('Save reviewed entries')} ({ready})
            </Button>
          </div>
          {preview.committed && (
            <p className="bulk-help" role="status">
              {t(
                'Saved rows are recorded individually. If interrupted, upload the same worksheet again; saved entries will be skipped.',
              )}
            </p>
          )}
          <DataTable
            headings={['Row', 'Reference', 'Name', 'Status', 'Details']}
            rows={preview.rows.map((r) => [
              r.row,
              r.key,
              r.label,
              <Badge
                key={r.row}
                tone={
                  r.status === 'Needs correction'
                    ? 'amber'
                    : r.status === 'Saved' || r.status === 'Already imported'
                      ? 'green'
                      : 'blue'
                }
              >
                {t(r.status)}
              </Badge>,
              r.error ? (
                message(r.error)
              ) : (
                <details key={'values-' + r.row}>
                  <summary>{t('View values')}</summary>
                  <dl>
                    {Object.entries(r.payload || {}).map(([key, value]) => (
                      <div key={key}>
                        <dt>
                          {t(
                            bulkFields(kind).find((f) => f.key === key)
                              ?.label || key,
                          )}
                        </dt>
                        <dd>
                          {Array.isArray(value)
                            ? value.join(', ')
                            : String(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
              ),
            ])}
          />
        </Panel>
      )}
      <Panel
        title={t('Export saved records')}
        subtitle={t(
          'Exports include record IDs and revisions. They are reports, not import templates.',
        )}
      >
        <div className="bulk-toolbar">
          <label>
            <input
              type="checkbox"
              checked={allMonths}
              onChange={(e) => setAllMonths(e.target.checked)}
            />{' '}
            {t('All dates')}
          </label>
          {!allMonths && <span>{p.month}</span>}
          <Choice
            label={t('All classes')}
            value={classId}
            onChange={setClassId}
            options={[
              { value: '', label: t('All classes') },
              ...entries(p.snapshot.records, 'class').map((c) => ({
                value: c.id,
                label: c.name,
              })),
            ]}
          />
          <a className="bulk-link" href={url('export')}>
            <Download size={16} />
            {t('Export records (CSV)')}
          </a>
        </div>
      </Panel>
      <details className="bulk-guide">
        <summary>{t('Field guide and safety rules')}</summary>
        <p>
          {t(
            'Keep each entry reference unique and unchanged when retrying. Payroll cannot be approved by upload. Family payment splits, approvals, account access and monthly close use their dedicated review screens.',
          )}
        </p>
        <DataTable
          headings={['Column', 'Field', 'Required', 'Format / choices']}
          rows={bulkFields(kind).map((f) => [
            f.key,
            t(f.label),
            f.required ? t('Yes') : t('No'),
            f.options?.join(' / ') ||
              (f.type === 'date'
                ? 'YYYY-MM-DD'
                : f.type === 'month'
                  ? 'YYYY-MM'
                  : f.type === 'checkbox'
                    ? 'true / false'
                    : f.type === 'weekdays'
                      ? '0=Mon, 6=Sun; 0,3'
                      : f.type === 'number'
                        ? '12000000'
                        : t('Text')),
          ])}
        />
      </details>
      {a.role !== 'TA' && (
        <Button variant="outline" onClick={() => p.navigate('Accounting')}>
          {t('Accounting documents and source reconciliation')}
        </Button>
      )}
    </div>
  );
}
