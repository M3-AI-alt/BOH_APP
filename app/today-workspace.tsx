'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarCheck2, CheckCircle2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { dailyWork, type WorkItem } from '@/lib/workspace-tasks';
import { today } from '@/lib/domain';
import { useLanguage } from './language';
import { Badge, Empty } from './ui';
import type { ViewProps } from './views';
type ApprovalRow = {
  id: string;
  title: string;
  date: string;
  due_date?: string;
};

export function TodayWorkspace(p: ViewProps) {
  const { t, message } = useLanguage();
  const [filter, setFilter] = useState('All');
  const date = today();
  const requestKey = `${p.snapshot.actor.userId}:${p.snapshot.actor.role}:${p.snapshot.loadedAt}`;
  const [result, setResult] = useState<{
    key: string;
    rows: WorkItem[];
    error: string;
  }>({ key: '', rows: [], error: '' });
  const approvals = result.key === requestKey ? result.rows : [];
  const approvalError = result.key === requestKey ? result.error : '';
  const approvalLoading = result.key !== requestKey;
  useEffect(() => {
    if (p.snapshot.actor.role === 'TA') return;
    const controller = new AbortController();
    fetch('/api/accounting?queue=1', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (r) => {
        const j = (await r.json()) as { rows?: ApprovalRow[]; error?: string };
        if (!r.ok || !Array.isArray(j.rows))
          throw Error(
            j.error || 'Approval queue unavailable. Open Accounting and retry.',
          );
        return j;
      })
      .then((j) => {
        if (!controller.signal.aborted)
          setResult({
            key: requestKey,
            error: '',
            rows: (j.rows || []).map((r) => ({
              id: 'approval:' + r.id,
              title: r.title,
              category: 'Approval',
              dueDate: r.due_date || r.date,
              owner: 'Centre manager',
              action: 'Review document',
              view: 'Accounting',
              target: { month: r.date.slice(0, 7), documentId: r.id },
            })),
          });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setResult({
            key: requestKey,
            rows: [],
            error: e instanceof Error ? e.message : 'Could not load draft.',
          });
      });
    return () => controller.abort();
  }, [requestKey, p.snapshot.actor.role]);
  const daily = useMemo(
    () => dailyWork(p.snapshot.records, p.snapshot.actor, date),
    [p.snapshot.records, p.snapshot.actor, date],
  );
  const items = [
    ...daily,
    ...(p.snapshot.actor.role === 'TA' ? [] : approvals),
  ];
  const categories = ['All', ...new Set(items.map((item) => item.category))];
  const activeFilter = categories.includes(filter) ? filter : 'All';
  const visible = items.filter(
    (item) =>
      (activeFilter === 'All' || item.category === activeFilter) &&
      (!p.search ||
        item.title.toLocaleLowerCase().includes(p.search.toLocaleLowerCase())),
  );
  function open(item: WorkItem) {
    p.navigate(item.view, item.target);
    if (item.kind && item.recordId)
      p.open(
        item.kind,
        p.snapshot.records.find((record) => record.id === item.recordId),
      );
  }
  return (
    <>
      <section className="today-start panel">
        <div>
          <span className="eyebrow">{t('Your next step')}</span>
          <h2>
            {t('Welcome back,')} {p.snapshot.actor.name}.
          </h2>
          <p>
            {t(
              'Open a task, finish the work, and your records stay connected.',
            )}
          </p>
        </div>
        <div className="button-row">
          {p.snapshot.actor.role !== 'TA' && (
            <Button className="primary" onClick={() => p.open('receipt')}>
              <Plus size={17} />
              {t('Record payment')}
            </Button>
          )}
          {p.snapshot.actor.role === 'Director' && (
            <Button variant="outline" onClick={() => p.open('lead')}>
              <Plus size={17} />
              {t('Add lead')}
            </Button>
          )}
          {p.snapshot.actor.role !== 'Finance' && (
            <Button
              variant="outline"
              onClick={() =>
                p.navigate('Attendance', { month: date.slice(0, 7) })
              }
            >
              <CalendarCheck2 size={17} />
              {t('Attendance')}
            </Button>
          )}
        </div>
      </section>
      <div className="section-toolbar">
        <div>
          <h2>{t('Work to review')}</h2>
          <p className="muted">
            {t('Current work through')} {date} ·{' '}
            {t('Open an item to see its records.')}
          </p>
        </div>
      </div>
      {p.snapshot.actor.role !== 'TA' && approvalLoading && (
        <output>{t('Checking pending approvals…')}</output>
      )}
      {p.snapshot.actor.role !== 'TA' && approvalError && (
        <p role="alert" className="form-error">
          {t('Approval queue unavailable. Open Accounting and retry.')}{' '}
          {message(approvalError)}
        </p>
      )}
      <div className="workspace-filter-tabs" aria-label={t('Task filter')}>
        {categories.map((category) => (
          <Button
            key={category}
            variant={activeFilter === category ? 'default' : 'outline'}
            aria-pressed={activeFilter === category}
            onClick={() => setFilter(category)}
          >
            {t(category)}{' '}
            <span>
              {category === 'All'
                ? items.length
                : items.filter((item) => item.category === category).length}
            </span>
          </Button>
        ))}
      </div>
      <div className="work-queue">
        {visible.map((item) => (
          <article
            className={'work-item work-' + item.category.toLowerCase()}
            key={item.id}
          >
            <div className="work-item-copy">
              <Badge
                tone={item.dueDate && item.dueDate < date ? 'amber' : 'blue'}
              >
                {t(item.category)}
              </Badge>
              <h3>{t(item.title)}</h3>
              <p>
                {t('Responsible')}: {t(item.owner)} ·{' '}
                {item.dueDate || t('No due date')}
              </p>
              {item.count != null && (
                <span className="muted">
                  {item.category === 'Attendance'
                    ? item.count
                      ? t('{count} attendance marks needed', {
                          count: item.count,
                        })
                      : t('Attendance recorded')
                    : t('{count} records', { count: item.count })}
                </span>
              )}
            </div>
            <Button variant="outline" onClick={() => open(item)}>
              {t(item.action)}
              <ArrowRight size={16} />
            </Button>
          </article>
        ))}
        {!visible.length && (
          <div className="panel today-empty">
            <CheckCircle2 size={26} />
            <Empty
              title={t('No items in this queue')}
              detail={t('You can still open any permitted workspace.')}
            />
          </div>
        )}
      </div>
      <p className="muted panel-foot">
        {t(
          'Queues highlight recorded work; they do not confirm that your accounting is reconciled.',
        )}
      </p>
      {approvals.length === 100 && p.snapshot.actor.role !== 'TA' && (
        <p>
          {t(
            'Showing the first 100 pending approvals. Open Accounting to review all records.',
          )}
        </p>
      )}
    </>
  );
}
