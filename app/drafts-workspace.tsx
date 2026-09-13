'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { EntryDraft } from '@/lib/drafts';
import { useLanguage } from './language';
import { Panel, DataTable, Empty } from './ui';
import type { ViewProps } from './views';

export function DraftsWorkspace(p: ViewProps) {
  const { t, message } = useLanguage();
  const [result, setResult] = useState<{
      key: string;
      rows: EntryDraft[];
      error: string;
    }>({ key: '', rows: [], error: '' }),
    [actionError, setError] = useState(''),
    [saving, setBusy] = useState(false),
    [version, setVersion] = useState(0);
  const requestKey = `${version}:${p.snapshot.actor.userId}:${p.snapshot.loadedAt}`;
  const busy = saving || result.key !== requestKey;
  const rows = result.key === requestKey ? result.rows : [];
  const error = actionError || (result.key === requestKey ? result.error : '');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/drafts', { cache: 'no-store', signal: controller.signal })
      .then(async (r) => {
        const j = (await r.json()) as EntryDraft[] | { error?: string };
        if (!r.ok || !Array.isArray(j))
          throw Error(
            !Array.isArray(j)
              ? j.error || 'Could not load draft.'
              : 'Could not load draft.',
          );
        return j;
      })
      .then((j) => {
        if (!controller.signal.aborted)
          setResult({ key: requestKey, rows: j, error: '' });
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setResult({
            key: requestKey,
            rows: [],
            error: e instanceof Error ? e.message : 'Could not load draft.',
          });
        }
      });
    return () => controller.abort();
  }, [requestKey]);
  function resume(draft: EntryDraft) {
    const current = draft.record_id
      ? p.snapshot.records.find((r) => r.id === draft.record_id)
      : undefined;
    if (draft.record_id && !current) {
      setError('Original record is unavailable. Refresh before continuing.');
      return;
    }
    p.open(
      draft.kind,
      current ? { ...current, revision: draft.record_revision } : undefined,
      { ...draft.payload.data, __draft: draft },
    );
  }
  async function discard(draft: EntryDraft) {
    if (
      !window.confirm(
        t('Delete this private draft? Saved records are not affected.'),
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'delete',
          id: draft.id,
          revision: draft.revision,
        }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(j.error);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete draft.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title={t('My drafts')}
      subtitle={t(
        'Private to your account. Drafts do not change balances, attendance or approvals.',
      )}
    >
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => {
          setError('');
          setVersion((v) => v + 1);
        }}
      >
        {t('Refresh')}
      </Button>
      {error && (
        <p role="alert" className="form-error">
          {message(error)}
        </p>
      )}
      {busy ? (
        <output>{t('Loading records…')}</output>
      ) : (
        <DataTable
          headings={['Record', 'Type', 'Last updated', 'Actions']}
          rows={rows.map((d) => [
            [
              d.payload.data.name,
              d.payload.data.title,
              d.payload.data.description,
            ].find(
              (value): value is string => typeof value === 'string' && !!value,
            ) || t('Untitled draft'),
            t(d.kind),
            new Date(d.updated_at).toLocaleString(),
            <div className="button-row" key={d.id}>
              <Button onClick={() => resume(d)}>{t('Continue editing')}</Button>
              <Button variant="outline" onClick={() => discard(d)}>
                {t('Delete draft')}
              </Button>
            </div>,
          ])}
        />
      )}
      {!busy && !error && !rows.length && (
        <Empty
          title={t('No saved drafts')}
          detail={t(
            'Choose Save draft & close in an entry form to continue later.',
          )}
        />
      )}
      {rows.length === 100 && (
        <p>{t('Showing the 100 most recently updated drafts.')}</p>
      )}
    </Panel>
  );
}
