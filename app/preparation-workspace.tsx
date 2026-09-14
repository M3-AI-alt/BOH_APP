'use client';
import { useRef, useState } from 'react';
import { FileSpreadsheet, Upload, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel, Choice, Badge } from './ui';
import { useLanguage } from './language';
import { csvCell } from '@/lib/accounting';
import type { PreparationRow } from '@/lib/preparation-review';
import { preparationModules } from '@/lib/preparation-schema.mjs';
type ReviewReport = {
  rows: PreparationRow[];
  sourceDate: string;
  unreviewed: number;
  counts: Record<string, number>;
  digest?: string;
  saved?: boolean;
  staleRecords?: number;
  error?: string;
};
type HistoryRow = { id: string; file_name: string; created_at: string };
type HistoryResponse = {
  payload: ReviewReport;
  rows: HistoryRow[];
  total: number;
  staleRecords?: number;
  error?: string;
};
export function PreparationWorkspace() {
  const { t, message } = useLanguage();
  const [file, setFile] = useState<{ name: string; xlsx: string } | null>(null),
    [report, setReport] = useState<ReviewReport | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [filter, setFilter] = useState('');
  const [history, setHistory] = useState<HistoryRow[]>([]),
    [historyTotal, setHistoryTotal] = useState(0),
    [historyOpen, setHistoryOpen] = useState(false),
    [page, setPage] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const reading = useRef(0);
  async function choose(f?: File) {
    const request = ++reading.current;
    setError('');
    setReport(null);
    setFile(null);
    setPage(0);
    setFilter('');
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name) || f.size > 2_000_000) {
      setError(t('Choose an Excel preparation workbook smaller than 2 MB.'));
      return;
    }
    try {
      const xlsx = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () =>
          typeof r.result === 'string'
            ? resolve(r.result.split(',')[1])
            : reject(new Error('Unable to read file.'));
        r.onerror = reject;
        r.readAsDataURL(f);
      });
      if (request === reading.current) setFile({ name: f.name, xlsx });
    } catch {
      if (request === reading.current) setError(t('Unable to read file.'));
    }
  }
  async function run(action: 'preview' | 'stage') {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/preparation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          xlsx: file.xlsx,
          fileName: file.name,
          digest: report?.digest,
        }),
      });
      const data = (await response.json()) as ReviewReport;
      if (!response.ok) throw Error(data.error);
      setReport(data);
      setPage(0);
    } catch (e) {
      setError(message(e instanceof Error ? e.message : 'Unable to save.'));
    } finally {
      setBusy(false);
    }
  }
  async function loadHistory(offset = 0, id?: string) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        '/api/preparation?' +
          new URLSearchParams(id ? { id } : { offset: String(offset) }),
      );
      const data = (await response.json()) as HistoryResponse;
      if (!response.ok) throw Error(data.error);
      if (id) {
        ++reading.current;
        setReport({
          ...data.payload,
          saved: true,
          staleRecords: data.staleRecords,
        });
        setFile(null);
        setPage(0);
        setFilter('');
      } else {
        setHistory(offset ? [...history, ...data.rows] : data.rows);
        setHistoryTotal(data.total);
        setHistoryOpen(true);
      }
    } catch (e) {
      setError(message(e instanceof Error ? e.message : 'Unable to load.'));
    } finally {
      setBusy(false);
    }
  }
  const rows: PreparationRow[] = report?.rows || [];
  const label = (r: PreparationRow, key: string, original = false) => {
    const m = preparationModules.find((m) => m.key === r.module);
    return (
      (original ? m?.original : m?.inputs)?.find(
        (f: { key: string; label: string }) => f.key === key,
      )?.label ||
      (key === 'reason'
        ? t('Reason')
        : key === 'evidence'
          ? t('Supporting document')
          : key)
    );
  };
  const issueText = (issue: string) => {
    if (issue.startsWith('Missing: '))
      return t('Missing information') + ': ' + issue.slice(9);
    const split = issue.indexOf(': ');
    return split < 0
      ? message(issue)
      : issue.slice(0, split + 2) + message(issue.slice(split + 2));
  };
  const filtered = rows.filter((r) => !filter || r.status === filter);
  function download() {
    if (!report) return;
    const data = [
      [
        'Source date',
        'Sheet',
        'Reference',
        'Name',
        'Status',
        'Accountant decision',
        'Issues',
        'Original values',
        'Proposed values',
        'Financial changes',
      ],
      ...filtered.map((r) => [
        report.sourceDate,
        r.sheet,
        r.ref,
        r.name,
        r.status,
        r.decision,
        r.issues.join('; '),
        JSON.stringify(r.original),
        JSON.stringify(r.proposed),
        '0 — review only',
      ]),
    ];
    const u = URL.createObjectURL(
      new Blob(
        ['\uFEFF' + data.map((r) => r.map(csvCell).join(',')).join('\r\n')],
        { type: 'text/csv;charset=utf-8' },
      ),
    );
    const a = document.createElement('a');
    a.href = u;
    a.download = 'BOH-preparation-review.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  return (
    <Panel
      title={t('Accountant preparation')}
      subtitle={t(
        'Review the prefilled workbook separately from new-entry imports.',
      )}
    >
      <div className="preparation-content">
        <p>
          {t(
            'Source values stay protected. Corrections and missing information are saved for review only; no live records or balances change.',
          )}
        </p>
        <div className="bulk-toolbar">
          <input
            ref={input}
            type="file"
            accept=".xlsx"
            hidden
            disabled={busy}
            onChange={(e) => choose(e.target.files?.[0])}
          />
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Upload size={16} />
            {t('Choose completed workbook')}
          </Button>
          <span>{file?.name}</span>
          <Button disabled={busy || !file} onClick={() => run('preview')}>
            <FileSpreadsheet size={16} />
            {t('Preview preparation')}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => loadHistory()}
          >
            {t('Saved preparation reviews')}
          </Button>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {historyOpen && (
          <div className="preparation-history">
            <h3>{t('Saved preparation reviews')}</h3>
            {history.length === 0 ? (
              <p>{t('No saved reviews yet.')}</p>
            ) : (
              history.map((h) => (
                <Button
                  key={h.id}
                  variant="outline"
                  disabled={busy}
                  onClick={() => loadHistory(0, h.id)}
                >
                  {h.file_name} · {new Date(h.created_at).toLocaleDateString()}
                </Button>
              ))
            )}
            {history.length < historyTotal && (
              <Button
                disabled={busy}
                onClick={() => loadHistory(history.length)}
              >
                {t('Load more')}
              </Button>
            )}
          </div>
        )}
        {report && (
          <section aria-live="polite" className="preparation-results">
            <p>
              <strong>{t('Review only — no financial changes')}</strong> ·{' '}
              {t('Source date')}: {report.sourceDate.slice(0, 10)} ·{' '}
              {report.unreviewed} {t('not yet checked')}
            </p>
            {!!report.staleRecords && (
              <p role="alert">
                {t(
                  'Some records changed after this review was saved. Upload and preview the workbook again.',
                )}
              </p>
            )}
            <div className="bulk-toolbar">
              <Choice
                label={t('Preparation status')}
                value={filter}
                onChange={(v) => {
                  setFilter(v);
                  setPage(0);
                }}
                options={[
                  { value: '', label: t('All statuses') },
                  ...Object.entries(report.counts || {}).map(
                    ([value, count]) => ({
                      value,
                      label: t(value) + ' (' + count + ')',
                    }),
                  ),
                ]}
              />
              <span>
                {filtered.length} {t('matching records')}
              </span>
              <Button variant="outline" onClick={download}>
                <Download size={16} />
                {t('Export filtered review')}
              </Button>
              {!report.saved && (
                <Button disabled={busy || !file} onClick={() => run('stage')}>
                  {t('Save preparation for review')}
                </Button>
              )}
              {report.saved && (
                <Badge>{t('Saved for review — not imported')}</Badge>
              )}
            </div>
            <div className="preparation-rows">
              {filtered.slice(page * 20, page * 20 + 20).map((r) => (
                <details key={r.ref} className="preparation-row">
                  <summary>
                    <span>{r.name}</span>
                    <span>
                      {r.sheet} · {r.ref}
                    </span>
                    <Badge>{t(r.status)}</Badge>
                  </summary>
                  <div className="preparation-detail">
                    {r.issues.length > 0 && (
                      <ul>
                        {r.issues.map((issue, i) => (
                          <li key={i}>{issueText(issue)}</li>
                        ))}
                      </ul>
                    )}
                    <div>
                      <h4>{t('Original values')}</h4>
                      <dl>
                        {Object.entries(r.original).map(([k, v]) => (
                          <div key={k}>
                            <dt>{label(r, k, true)}</dt>
                            <dd>{String(v ?? '')}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                    <div>
                      <h4>{t('Proposed values')}</h4>
                      <dl>
                        {Object.entries(r.proposed).map(([k, v]) => (
                          <div key={k}>
                            <dt>{label(r, k)}</dt>
                            <dd>{String(v ?? '')}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </div>
                </details>
              ))}
            </div>
            <div className="bulk-toolbar">
              <Button
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                {t('Previous')}
              </Button>
              <span>
                {page + 1} / {Math.max(1, Math.ceil(filtered.length / 20))}
              </span>
              <Button
                variant="outline"
                disabled={(page + 1) * 20 >= filtered.length}
                onClick={() => setPage(page + 1)}
              >
                {t('Next')}
              </Button>
            </div>
          </section>
        )}
      </div>
    </Panel>
  );
}
