'use client';
import { useLanguage } from '@/app/language';
import { useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarCheck2,
  Wallet,
  Users,
  RefreshCw,
  Plus,
  Download,
  Check,
  Clock,
  ShieldCheck,
  Pencil,
  LockKeyhole,
  BookOpen,
  CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableCell,
  TableRow,
} from '@/components/ui/table';
import {
  Choice,
  Badge,
  ClassTag,
  LessonClass,
  SearchBox,
  Empty,
  DataTable,
  Panel,
} from './ui';
import { Payroll, AccountantTasks } from './finance-work';
import { SourceReview } from './source-review';
import {
  entries,
  attendanceRoster,
  cashSummary,
  studentReview,
  shiftMonth,
  monthEnd,
  scheduledDates,
  today,
  cleanSearch,
  allocations,
  studentReceiptShare,
  linkedStudentNames,
} from '@/lib/domain';
import { CUTOFF, priceList, type DataRecord, type Snapshot } from '@/lib/types';
export type ViewProps = {
  snapshot: Snapshot;
  month: string;
  reviewDate: string;
  search: string;
  classFilter: string;
  setClassFilter: (id: string) => void;
  open: (kind: string, record?: any, defaults?: any) => void;
  detail: (id: string, asOf?: string) => void;
  navigate: (view: string) => void;
  save: (kind: string, record: any, payload: any) => Promise<void>;
  refresh?: () => Promise<boolean>;
};
export function Metric({
  label,
  value,
  unit,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  detail: string;
  icon: any;
  tone?: string;
}) {
  const { t } = useLanguage();
  return (
    <section className={'metric ' + (tone ?? '')}>
      <div className="metric-top">
        <span>{t(label)}</span>
        <Icon size={19} />
      </div>
      <div className="metric-value">
        {value}
        <small>{unit}</small>
      </div>
      <p>{t(detail)}</p>
    </section>
  );
}
export function Overview(p: ViewProps) {
  const { t, intlLocale, money, monthLabel } = useLanguage();
  const { records } = p.snapshot;
  const s = cashSummary(records, p.month, p.reviewDate),
    previous = cashSummary(
      records,
      shiftMonth(p.month, -1),
      monthEnd(shiftMonth(p.month, -1)),
    );
  const review = useMemo(
      () => studentReview(records, p.reviewDate),
      [records, p.reviewDate],
    ),
    next = shiftMonth(p.month, 1);
  const nextDue = review.filter((s) => s.expectedDate?.startsWith(next)),
    thisDue = review.filter((s) => s.expectedDate?.startsWith(p.month));
  const months = Array.from({ length: 6 }, (_, i) =>
    shiftMonth(p.month, i - 5),
  );
  const series = months.map((m) => ({
    month: m,
    ...cashSummary(records, m, monthEnd(m)),
  }));
  const max = Math.max(1, ...series.flatMap((s) => [s.collected, s.paid]));
  const needs = review
    .filter(
      (s) =>
        s.overdue > 0 ||
        s.expectedDate?.startsWith(p.month) ||
        s.expectedDate?.startsWith(next),
    )
    .slice(0, 7);
  const classes = entries(records, 'class').filter((c) => !c.archived);
  return (
    <>
      <div className="metric-grid">
        <Metric
          label={t('Money collected')}
          value={s.coverage ? money(s.collected) : '—'}
          unit="VND"
          detail={s.receipts.length + t(' receipts · actual payment dates')}
          icon={Wallet}
          tone="blue"
        />
        <Metric
          label={t('Expenses paid')}
          value={money(s.paid)}
          unit="VND"
          detail={
            s.pendingExpenses
              ? s.pendingExpenses + t(' text amounts not included')
              : t('Net cash ') + money(s.net) + t(' VND')
          }
          icon={ArrowUpRight}
        />
        <Metric
          label={t('Renewals this month')}
          value={String(thisDue.length)}
          detail={t('Students expected to finish their sessions')}
          icon={CalendarCheck2}
        />
        <Metric
          label={t('Renewals next month')}
          value={String(nextDue.length)}
          detail={monthLabel(next) + t(' · no assumed package price')}
          icon={RefreshCw}
        />
      </div>
      <div className="overview-columns">
        <Panel
          title={t('Your cash flow')}
          subtitle={t('Money received and paid, by month')}
          action={
            <div className="chart-legend">
              <span>
                <i /> {t('Collected')}
              </span>
              <span>
                <i /> {t('Expenses')}
              </span>
            </div>
          }
        >
          <div
            className="cash-chart"
            role="img"
            aria-label={t(
              'Monthly collected money and expenses. Exact values appear beneath each month.',
            )}
          >
            {series.map((s) => (
              <div className="chart-month" key={s.month}>
                <div className="bars">
                  <div
                    className="bar receipt-bar"
                    style={{ height: (s.collected / max) * 100 + '%' }}
                  />
                  <div
                    className="bar expense-bar"
                    style={{ height: (s.paid / max) * 100 + '%' }}
                  />
                </div>
                <strong>
                  {new Date(s.month + '-01T12:00Z').toLocaleDateString(
                    intlLocale,
                    { month: 'short' },
                  )}
                </strong>
                <span>
                  {s.coverage
                    ? money(s.collected / 1000000) + t('m')
                    : t('Not supplied')}
                </span>
                <small>
                  {money(s.paid / 1000000)} {t('m spent')}
                </small>
              </div>
            ))}
          </div>
          <div className="panel-foot">
            {t(
              'Cash flow, not accounting profit. Amounts shown in million VND.',
            )}
          </div>
        </Panel>
        <section className="panel navy-panel">
          <div className="icon-tile">
            <Wallet />
          </div>
          <p className="navy-caption">{t('PREVIOUS MONTH')}</p>
          <h2>{monthLabel(shiftMonth(p.month, -1))}</h2>
          <div className="navy-number">
            {previous.coverage ? money(previous.collected) : '—'}
            <span>{t('VND collected')}</span>
          </div>
          <p>
            {previous.receipts.length}{' '}
            {t(
              'receipts recorded. See the payer list and the payment status at that month’s end.',
            )}
          </p>
          <Button onClick={() => p.navigate('Finance')}>
            {t('Open monthly finance')} <ArrowRight size={16} />
          </Button>
          <div className="navy-bottom">
            <ShieldCheck size={14} />{' '}
            {t('Cash is counted once, including family receipts.')}
          </div>
        </section>
      </div>
      <Panel
        title={t('Students to follow up')}
        subtitle={t(
          'Renewals are based on remaining sessions and class schedules',
        )}
        action={
          <Button variant="ghost" onClick={() => p.navigate('Renewals')}>
            {t('View all')} <ArrowRight size={15} />
          </Button>
        }
      >
        <DataTable
          headings={[
            'Student',
            'Class',
            'Sessions left',
            'Follow-up',
            'Expected date',
          ]}
          rows={needs.map((s) => [
            <button className="name-link" onClick={() => p.detail(s.id)}>
              {s.name}
            </button>,
            <ClassTag cl={classes.find((c) => c.id === s.classId)} />,
            s.sessions ?? '—',
            <Badge tone={s.overdue > 0 ? 'red' : 'blue'}>
              {s.overdue > 0 ? 'Payment overdue' : 'Renewal expected'}
            </Badge>,
            s.expectedDate ?? '—',
          ])}
        />
      </Panel>
      <section className="panel class-strip">
        <div>
          <h2>{t('Your classes')}</h2>
          <p>{t('Attendance, original history and makeups.')}</p>
        </div>
        <div className="class-pills">
          {classes.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                p.setClassFilter(c.id);
                p.navigate('Attendance');
              }}
              style={{ '--class-color': c.color } as React.CSSProperties}
            >
              <span />
              {c.name.replace('BOH ', '')}
              <ArrowUpRight size={14} />
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
export function Attendance(p: ViewProps) {
  const { t, message, intlLocale, monthLabel } = useLanguage();
  const { records, actor } = p.snapshot;
  const classes = entries(records, 'class'),
    students = entries(records, 'student');
  const cl =
    classes.find((c) => c.id === p.classFilter) ??
    classes.find((c) => !c.archived) ??
    classes[0];
  const [tab, setTab] = useState('grid'),
    [rosterScope, setRosterScope] = useState<'current' | 'history'>('current'),
    [saving, setSaving] = useState(''),
    [error, setError] = useState('');
  if (!cl)
    return (
      <Empty
        title={t('No classes assigned')}
        detail={t('Ask the Director to check class setup.')}
      />
    );
  const members = attendanceRoster(records, cl.id, today(), rosterScope);
  const attendance = entries(records, 'attendance').filter(
    (a) => a.classId === cl.id && a.date?.startsWith(p.month),
  );
  const dates = [
    ...new Set([
      ...attendance.map((a) => a.date),
      ...scheduledDates(records, cl.id, p.month + '-01', monthEnd(p.month)),
    ]),
  ].sort();
  const lookup = new Map(
    attendance.map((a) => [a.membershipId + ':' + a.date, a]),
  );
  const ms = members.filter((m) =>
    cleanSearch(
      students.find((s) => s.id === m.studentId)?.name ?? m.sourceName ?? '',
    ).includes(cleanSearch(p.search)),
  );
  async function mark(m: any, date: string, value: string) {
    const existing = lookup.get(m.id + ':' + date);
    setSaving(m.id + date);
    setError('');
    try {
      await p.save('attendance', existing, {
        membershipId: m.id,
        studentId: m.sourceStudentId || m.studentId,
        classId: cl.id,
        date,
        mark: value,
        note: '',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save attendance.');
    } finally {
      setSaving('');
    }
  }
  const canEdit =
    actor.role === 'Director' || (actor.role === 'TA' && !cl.archived);
  return (
    <>
      <div className="class-bar">
        <Choice
          label={t('Choose class')}
          value={cl.id}
          onChange={p.setClassFilter}
          options={classes.map((c) => ({
            value: c.id,
            label: c.name + (c.archived ? ' · archive' : ''),
          }))}
        />
        <div className="class-summary">
          <ClassTag cl={cl} />
          <span>
            {members.length} {t('roster rows')}
          </span>
          <span>
            {cl.weekdays
              ?.map((d: number) =>
                t(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d]),
              )
              .join(' + ') || t('Archived timetable')}
          </span>
        </div>
        {actor.role === 'Director' && (
          <Button
            variant="outline"
            onClick={() => p.open('calendar', undefined, { classId: cl.id })}
          >
            <CalendarDays size={16} /> {t('Holiday / lesson change')}
          </Button>
        )}
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList variant="line">
          <TabsTrigger value="grid">{t('Class attendance')}</TabsTrigger>
          <TabsTrigger value="makeup">{t('Makeup lessons')}</TabsTrigger>
          <TabsTrigger value="support">{t('Free support')}</TabsTrigger>
          <TabsTrigger value="calendar">{t('Calendar')}</TabsTrigger>
        </TabsList>
        <TabsContent value="grid">
          <div className="class-bar">
            <Choice
              label={t('Attendance list')}
              value={rosterScope}
              onChange={(value) =>
                setRosterScope(value as 'current' | 'history')
              }
              options={[
                { value: 'current', label: t('Current students') },
                { value: 'history', label: t('All attendance history') },
              ]}
            />
            <p className="muted">
              {rosterScope === 'current'
                ? t(
                    'Only current students. Stopped, paused and old class rows stay in history.',
                  )
                : t(
                    'Read-only history. No attendance, packages or payments have been deleted.',
                  )}
            </p>
          </div>
          <div className="attendance-guide">
            <span>
              <b className="green-text">P</b> {t('Present')}
            </span>
            <span>
              <b className="green-text">T</b> {t('Late')}
            </span>
            <span>
              <b className="red-text">A</b> {t('Absent')}
            </span>
            <span>
              <b>N</b> {t('Not scheduled')}
            </span>
            <span>{t('— Not entered')}</span>
            <small>{t('Original C / L / K codes are preserved.')}</small>
          </div>
          {error && (
            <div className="error-message" role="alert">
              {message(error)}
            </div>
          )}
          <section className="panel attendance-panel">
            <div className="panel-heading">
              <div>
                <h2>{cl.name}</h2>
                <p>
                  {monthLabel(p.month)}
                  {rosterScope === 'current' &&
                    t('· click a new lesson cell to mark attendance')}
                </p>
              </div>
              <span className="save-status" aria-live="polite">
                {saving
                  ? t('Saving attendance…')
                  : rosterScope === 'history'
                    ? t('Read-only history')
                    : t('Changes save automatically')}
              </span>
            </div>
            {!ms.length ? (
              <Empty
                title={t('No students in this view')}
                detail={t(
                  'Clear your search, choose another class or view all attendance history.',
                )}
              />
            ) : dates.length ? (
              <Table className="attendance-table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky-name">
                      {t('Student / Học viên')}
                    </TableHead>
                    {dates.map((d) => (
                      <TableHead
                        key={d}
                        className={d === today() ? 'today-col' : ''}
                      >
                        <span>
                          {new Date(d + 'T12:00Z').toLocaleDateString(
                            intlLocale,
                            {
                              weekday: 'short',
                            },
                          )}
                        </span>
                        <strong>
                          {d.slice(8)}{' '}
                          {new Date(d + 'T12:00Z').toLocaleDateString(
                            intlLocale,
                            {
                              month: 'short',
                            },
                          )}
                        </strong>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ms.map((m) => {
                    const st = students.find((s) => s.id === m.studentId);
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="sticky-name">
                          <div className="roster-name">
                            <div
                              className="avatar small"
                              style={{
                                color: cl.color,
                                background: cl.color + '13',
                              }}
                            >
                              {(st?.name ?? m.sourceName ?? '?')
                                .split(' ')
                                .filter(Boolean)
                                .slice(-2)
                                .map((s: string) => s[0])
                                .join('')}
                            </div>
                            <div>
                              <button
                                className="name-link"
                                onClick={() =>
                                  actor.role !== 'TA' && p.detail(m.studentId)
                                }
                              >
                                {st?.name ?? m.sourceName}
                              </button>
                              <small>
                                {m.forecast === false
                                  ? t('Original roster')
                                  : t(st?.status ?? '')}
                                {m.until ? t(' · Until ') + m.until : ''}
                              </small>
                            </div>
                            {actor.role === 'Director' && (
                              <button
                                className="quiet-button"
                                title={t('Edit class membership')}
                                onClick={() =>
                                  p.open(
                                    'membership',
                                    records.find((r) => r.id === m.id),
                                  )
                                }
                              >
                                <Pencil size={13} />
                              </button>
                            )}
                          </div>
                        </TableCell>
                        {dates.map((d) => {
                          const a = lookup.get(m.id + ':' + d);
                          const editable =
                            canEdit &&
                            rosterScope === 'current' &&
                            d > (p.snapshot.manifest?.cutoff || CUTOFF) &&
                            !a?.historical &&
                            m.sourceStudentId === m.studentId &&
                            ['Active', 'Free', 'Ends without renewal'].includes(
                              st?.status,
                            ) &&
                            d <= today() &&
                            (!m.from || d >= m.from) &&
                            (!m.until || d <= m.until);
                          return (
                            <TableCell
                              key={d}
                              className={d === today() ? 'today-col' : ''}
                            >
                              {editable ? (
                                <Choice
                                  label={st?.name + ' · ' + d}
                                  value={a?.mark ?? ''}
                                  disabled={saving === m.id + d}
                                  onChange={(v) => mark(m, d, v)}
                                  options={[
                                    { value: '', label: '—' },
                                    { value: 'P', label: 'P' },
                                    { value: 'T', label: 'T' },
                                    { value: 'A', label: 'A' },
                                    { value: 'N', label: 'N' },
                                  ]}
                                />
                              ) : (
                                <span
                                  className={
                                    'attendance-mark ' +
                                    (['P', 'T', 'C', 'M'].includes(a?.mark)
                                      ? 'present'
                                      : ['A', 'L', 'K'].includes(a?.mark)
                                        ? 'absent'
                                        : 'blank')
                                  }
                                  title={a?.source ?? t('Not entered')}
                                >
                                  {a?.mark ?? '—'}
                                </span>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <Empty
                title={t('No lessons in this month')}
                detail={t('Choose another month or add a class calendar date.')}
              />
            )}
            <div className="panel-foot">
              {t(
                'Present and late use one session. Absence uses none. A linked completed makeup is counted once. Historical balances remain as supplied.',
              )}
            </div>
          </section>
          {actor.role === 'Director' && (
            <Button
              variant="outline"
              className="below-action"
              onClick={() =>
                p.open('membership', undefined, { classId: cl.id })
              }
            >
              <Plus size={16} /> {t('Add existing student to this class')}
            </Button>
          )}
        </TabsContent>
        <TabsContent value="makeup">
          <LessonLog {...p} kind="makeup" classId={cl.id} />
        </TabsContent>
        <TabsContent value="support">
          <LessonLog {...p} kind="support" classId={cl.id} />
        </TabsContent>
        <TabsContent value="calendar">
          <Panel
            title={t('Timetable exceptions')}
            subtitle={t('Holiday closures and extra regular class dates')}
          >
            <DataTable
              headings={['Date', 'Class', 'Lesson status', 'Reason', '']}
              rows={entries(records, 'calendar')
                .filter((c) => c.classId === cl.id)
                .map((c) => [
                  c.date,
                  <ClassTag cl={cl} />,
                  <Badge tone={c.open ? 'green' : 'grey'}>
                    {t(c.open ? 'Class open' : 'Class closed')}
                  </Badge>,
                  c.reason,
                  actor.role === 'Director' ? (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        p.open(
                          'calendar',
                          records.find((r) => r.id === c.id),
                        )
                      }
                    >
                      {t('Edit')}
                    </Button>
                  ) : null,
                ])}
            />
          </Panel>
        </TabsContent>
      </Tabs>
    </>
  );
}
function LessonLog(
  p: ViewProps & { kind: 'makeup' | 'support'; classId: string },
) {
  const { t } = useLanguage();
  const [all, setAll] = useState(true);
  const list = entries(p.snapshot.records, p.kind)
    .filter(
      (m) =>
        (all || m.classId === p.classId) &&
        cleanSearch(
          linkedStudentNames(p.snapshot.records, m) +
            ' ' +
            (m.name ?? '') +
            ' ' +
            (m.notes ?? '') +
            ' ' +
            (m.teacher ?? ''),
        ).includes(cleanSearch(p.search)),
    )
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const students = entries(p.snapshot.records, 'student'),
    classes = entries(p.snapshot.records, 'class');
  return (
    <Panel
      title={
        p.kind === 'makeup'
          ? t('Makeup lessons / Học bù')
          : t('Free support / Học bổ trợ')
      }
      subtitle={t(
        'Original records are included, with the names and details exactly as recorded.',
      )}
      action={
        <div className="button-row">
          <Button variant="outline" onClick={() => setAll(!all)}>
            {all ? t('All accessible classes') : t('This class only')}
          </Button>
          {p.snapshot.actor.role !== 'Finance' && (
            <Button
              className="primary"
              onClick={() => p.open(p.kind, undefined, { classId: p.classId })}
            >
              <Plus size={15} /> {t('Add lesson')}
            </Button>
          )}
        </div>
      }
    >
      <DataTable
        headings={[
          'Student',
          'Class',
          'Date',
          'Teacher',
          'Content / original detail',
          'Status',
          '',
        ]}
        rows={list.map((m) => [
          <button
            className="name-link"
            disabled={!m.studentId || p.snapshot.actor.role === 'TA'}
            onClick={() => p.detail(m.studentId)}
          >
            {students.find((s) => s.id === m.studentId)?.name ??
              m.name ??
              t('Not entered in source')}
          </button>,
          <LessonClass lesson={m} classes={classes} />,
          m.date ?? t('Not recorded'),
          m.teacher || '—',
          <div className="long-cell">
            {m.notes || m.original?.filter(Boolean).join(' · ') || '—'}
            {m.evaluation && <small>{m.evaluation}</small>}
          </div>,
          <Badge>
            {!m.studentId
              ? 'Student match needed'
              : m.historical
                ? 'Original record'
                : m.status}
          </Badge>,
          !m.historical && p.snapshot.actor.role !== 'Finance' ? (
            <Button
              variant="ghost"
              onClick={() =>
                p.open(
                  p.kind,
                  p.snapshot.records.find((r) => r.id === m.id),
                )
              }
            >
              {t('Edit')}
            </Button>
          ) : !m.studentId && p.snapshot.actor.role === 'Director' ? (
            <Button
              variant="outline"
              onClick={() =>
                p.open(
                  'student-link',
                  p.snapshot.records.find((r) => r.id === m.id),
                )
              }
            >
              {t('Match student')}
            </Button>
          ) : null,
        ])}
      />
    </Panel>
  );
}
export function Students(p: ViewProps) {
  const { t, money, packageTitle } = useLanguage();
  const classes = entries(p.snapshot.records, 'class');
  const [scope, setScope] = useState('current');
  const [size, setSize] = useState('');
  const [sort, setSort] = useState('name');
  const review = useMemo(
    () => studentReview(p.snapshot.records, p.reviewDate),
    [p.snapshot.records, p.reviewDate],
  );
  const scopes = [
    { value: 'current', label: t('Current students') },
    { value: 'review', label: t('Needs review') },
    { value: 'inactive', label: t('Paused / stopped') },
    { value: 'history', label: t('All history') },
  ];
  const inScope = (s: any, value: string) =>
    value === 'history' ||
    (value === 'inactive'
      ? ['Paused', 'Stopped', 'Archived', 'Transferred'].includes(
          s.enrollmentStatus,
        )
      : value === 'review'
        ? !s.canonicalStudentId &&
          (s.enrollmentStatus === 'Roster only' ||
            s.sessions === null ||
            s.displayPackages.some(
              (pkg: any) => !pkg.sessions || pkg.sourcePending,
            ))
        : !s.canonicalStudentId &&
          ['Active', 'Free', 'Ends without renewal'].includes(
            s.enrollmentStatus,
          ));
  const list = review
    .filter(
      (s) =>
        inScope(s, scope) &&
        (!size ||
          s.displayPackages.some(
            (pkg: any) => String(pkg.sessions) === size,
          )) &&
        (!p.classFilter || s.classId === p.classFilter) &&
        cleanSearch(
          [s.name, s.preferredName, s.parent, s.phone, s.secondPhone]
            .filter(Boolean)
            .join(' '),
        ).includes(cleanSearch(p.search)),
    )
    .sort((a, b) =>
      sort === 'sessions'
        ? (a.sessions ?? Infinity) - (b.sessions ?? Infinity) ||
          a.name.localeCompare(b.name, 'vi')
        : a.name.localeCompare(b.name, 'vi'),
    );
  return (
    <Panel
      title={t('Student directory')}
      subtitle={t('{p1} shown · balances as of {p2}{p3}', {
        p1: list.length,
        p2: p.reviewDate,
        p3: p.snapshot.manifest?.sourceRefresh
          ? t(' · Sheet checked ') + p.snapshot.manifest.sourceRefresh.checkedAt
          : '',
      })}
    >
      <div
        role="group"
        aria-label={t('Student list view')}
        className="student-scope-tabs"
      >
        {scopes.map((s) => (
          <Button
            variant={scope === s.value ? 'default' : 'outline'}
            aria-pressed={scope === s.value}
            key={s.value}
            onClick={() => setScope(s.value)}
          >
            {t(s.label)}
            <span className="filter-count">
              {review.filter((r) => inScope(r, s.value)).length}
            </span>
          </Button>
        ))}
      </div>
      <div className="student-table-tools">
        <Choice
          label={t('Package size')}
          value={size}
          onChange={setSize}
          options={[
            { value: '', label: t('All package sizes') },
            ...Array.from(
              new Set(
                review
                  .flatMap((s) =>
                    s.displayPackages.map((pkg: any) => pkg.sessions),
                  )
                  .filter((n) => typeof n === 'number'),
              ),
            )
              .sort((a: any, b: any) => a - b)
              .map((n) => ({
                value: String(n),
                label: t('{p1} sessions', { p1: n }),
              })),
          ]}
        />
        <Choice
          label={t('Sort students')}
          value={sort}
          onChange={setSort}
          options={[
            { value: 'name', label: t('Name A–Z') },
            { value: 'sessions', label: t('Fewest sessions first') },
          ]}
        />
        {(size || p.classFilter) && (
          <Button
            variant="ghost"
            onClick={() => {
              setSize('');
              p.setClassFilter('');
            }}
          >
            {t('Clear package / class filters')}
          </Button>
        )}
      </div>
      <DataTable
        headings={[
          'Student',
          'Class',
          'Enrollment / payment',
          'Sessions left',
          'Package purchased',
          'Parent',
          '',
        ]}
        rows={list.map((s) => [
          <button
            className="name-link"
            onClick={() => p.detail(s.canonicalStudentId || s.id)}
          >
            {s.name}
          </button>,
          <ClassTag cl={classes.find((c) => c.id === s.classId)} />,
          <div className="student-badge-stack">
            <Badge>
              {s.enrollmentStatus === 'Roster only'
                ? 'History / needs review'
                : s.enrollmentStatus}
            </Badge>
            {!s.canonicalStudentId && <Badge>{s.paymentStatus}</Badge>}
          </div>,
          s.canonicalStudentId ? (
            t('See current profile')
          ) : (
            <div className="student-session-cell">
              <strong>
                {s.sessions === null ? t('Needs confirmation') : s.sessions}
              </strong>
              {s.overrun > 0 && (
                <small className="red-text">
                  {s.overrun} {t('lessons beyond package')}
                </small>
              )}
            </div>
          ),
          s.canonicalStudentId ? (
            <button
              className="name-link"
              onClick={() => p.detail(s.canonicalStudentId)}
            >
              {t('Open linked package →')}
            </button>
          ) : (
            <div className="student-package-list">
              {s.displayPackages.length ? (
                [...s.displayPackages]
                  .sort(
                    (a: any, b: any) =>
                      Number((b.remaining ?? 0) > 0) -
                      Number((a.remaining ?? 0) > 0),
                  )
                  .map((pkg: any) => (
                    <div key={pkg.id}>
                      <span
                        className={
                          'package-chip package-' + (pkg.sessions || 'unknown')
                        }
                      >
                        {packageTitle(pkg)}
                      </span>
                      <small>
                        {pkg.startDate > p.reviewDate ? t('Upcoming · ') : ''}
                        {pkg.startDate || t('Start not recorded')}
                        {pkg.remaining === 0 ? t(' · Completed') : ''}
                      </small>
                    </div>
                  ))
              ) : (
                <span className="muted">
                  {s.enrollmentStatus === 'Roster only'
                    ? t('No paid package linked to this historical row')
                    : t('No agreed package recorded')}
                </span>
              )}
              {s.due > 0 && (
                <small className="red-text">
                  {money(s.due)} {t('VND balance')}
                </small>
              )}
            </div>
          ),
          s.parent || '—',
          p.snapshot.actor.role === 'Director' ? (
            <Button
              variant="ghost"
              disabled={s.enrollmentStatus === 'Archived'}
              onClick={() =>
                p.open(
                  'student',
                  p.snapshot.records.find(
                    (r) => r.id === (s.canonicalStudentId || s.id),
                  ),
                )
              }
            >
              {t('Edit')}
            </Button>
          ) : null,
        ])}
      />
    </Panel>
  );
}
export function Renewals(p: ViewProps) {
  const { t, money, monthLabel } = useLanguage();
  const [window, setWindow] = useState('next');
  const review = useMemo(
    () => studentReview(p.snapshot.records, p.reviewDate),
    [p.snapshot.records, p.reviewDate],
  );
  const target = window === 'next' ? shiftMonth(p.month, 1) : p.month;
  const classes = entries(p.snapshot.records, 'class');
  const list = review.filter(
    (s) =>
      (window === 'unpaid'
        ? s.overdue > 0
        : window === 'all'
          ? s.expectedDate
          : s.expectedDate?.startsWith(target)) &&
      (!p.classFilter || s.classId === p.classFilter) &&
      cleanSearch(s.name).includes(cleanSearch(p.search)),
  );
  return (
    <>
      <div className="section-toolbar">
        <Choice
          label={t('Follow-up list')}
          value={window}
          onChange={setWindow}
          options={[
            {
              value: 'next',
              label: t('Renewals · ') + monthLabel(shiftMonth(p.month, 1)),
            },
            { value: 'this', label: t('Renewals · ') + monthLabel(p.month) },
            { value: 'unpaid', label: t('Confirmed overdue payments') },
            { value: 'all', label: t('All expected renewals') },
          ]}
        />
        <Badge tone="blue">
          {t('{count} students', { count: list.length })}
        </Badge>
        <Button
          variant="outline"
          onClick={() =>
            downloadCsv('renewals-' + target, [
              [
                'Student',
                'Class',
                'Sessions remaining',
                'Expected date',
                'Status',
                'Confirmed amount due',
              ].map((h) => t(h)),
              ...list.map((s) => [
                s.name,
                classes.find((c) => c.id === s.classId)?.name,
                s.sessions,
                s.expectedDate,
                t(s.status),
                s.due,
              ]),
            ])
          }
        >
          <Download size={15} /> {t('Export list')}
        </Button>
      </div>
      <Panel
        title={
          window === 'unpaid'
            ? t('Payments to follow up')
            : t('Who needs to renew?')
        }
        subtitle={t(
          'No new package price is assumed. Dates are estimates based on the timetable and recorded attendance.',
        )}
      >
        <DataTable
          headings={[
            'Student',
            'Class',
            'Sessions left',
            'Expected renewal',
            'Status',
            '',
          ]}
          rows={list.map((s) => [
            <button className="name-link" onClick={() => p.detail(s.id)}>
              {s.name}
            </button>,
            <ClassTag cl={classes.find((c) => c.id === s.classId)} />,
            s.sessions ?? '—',
            s.expectedDate ?? '—',
            <Badge tone={s.overdue > 0 ? 'red' : 'blue'}>
              {s.overdue > 0
                ? money(s.overdue) + t(' VND overdue')
                : s.advanceCovered
                  ? 'Advance package included'
                  : 'Renewal expected'}
            </Badge>,
            <Button
              variant="outline"
              onClick={() =>
                p.open('package', undefined, {
                  studentId: s.id,
                  classId: s.classId,
                })
              }
            >
              {t('Add renewal')}
            </Button>,
          ])}
        />
      </Panel>
    </>
  );
}
export function Packages(p: ViewProps) {
  const { t, money, packageTitle } = useLanguage();
  const catalogue = entries(p.snapshot.records, 'catalogue');
  const prices = catalogue.length
    ? catalogue.filter((c) => c.active !== false)
    : priceList;
  const review = useMemo(
    () => studentReview(p.snapshot.records, p.reviewDate),
    [p.snapshot.records, p.reviewDate],
  );
  const flat = review.flatMap((s) =>
    s.displayPackages.map((pkg: any) => ({
      ...pkg,
      name: s.name,
      homeClassId: s.classId,
    })),
  );
  const classes = entries(p.snapshot.records, 'class');
  return (
    <>
      <div className="price-strip">
        {prices.map((x) => (
          <div key={x.sessions}>
            <strong>
              {x.sessions}
              <span>{t('sessions')}</span>
            </strong>
            <span>{money(x.price)} VND</span>
            <small>
              {t('With 5%:')} {money(Math.round(x.price * 0.95))}
            </small>
          </div>
        ))}
      </div>
      <Panel
        title={t('Student packages')}
        subtitle={t(
          'Every renewal is a separate record. Existing source balances are retained.',
        )}
      >
        <DataTable
          headings={[
            'Student',
            'Package',
            'Start date',
            'Agreed / source amount',
            'Recorded paid',
            'Balance',
            'Sessions left',
            '',
          ]}
          rows={flat
            .filter(
              (x) =>
                (!p.classFilter || x.homeClassId === p.classFilter) &&
                cleanSearch(x.name).includes(cleanSearch(p.search)),
            )
            .map((x) => [
              <button
                className="name-link"
                onClick={() => p.detail(x.studentId)}
              >
                {x.name}
                <small>
                  {classes.find((c) => c.id === x.homeClassId)?.name}
                </small>
              </button>,
              packageTitle(x),
              x.startDate ?? '—',
              money(x.agreedFee),
              money(x.paid),
              money(x.balance),
              x.remaining ?? '—',
              x.imported ? (
                <Badge>Original package</Badge>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() =>
                    p.open(
                      'package',
                      p.snapshot.records.find((r) => r.id === x.id),
                    )
                  }
                >
                  {t('Edit')}
                </Button>
              ),
            ])}
        />
      </Panel>
    </>
  );
}
export function Finance(p: ViewProps) {
  const { t, money } = useLanguage();
  const [tab, setTab] = useState('receipts');
  const { records } = p.snapshot;
  const summary = cashSummary(records, p.month, p.reviewDate),
    students = entries(records, 'student');
  const cutoff =
    p.reviewDate < monthEnd(p.month) ? p.reviewDate : monthEnd(p.month);
  const review = useMemo(
    () => studentReview(records, cutoff),
    [records, cutoff],
  );
  const close = entries(records, 'close').find((c) => c.month === p.month);
  const filter = (x: any) =>
    cleanSearch(
      [
        linkedStudentNames(records, x),
        x.name,
        x.description,
        x.account,
        x.category,
      ].join(' '),
    ).includes(cleanSearch(p.search));
  const rec = summary.receipts.filter(filter),
    exp = summary.expenses.filter(filter);
  const classes = entries(records, 'class');
  function paidFor(studentId: string, list: any[]) {
    return list.reduce(
      (n, r) => n + (studentReceiptShare(r, studentId) ?? 0),
      0,
    );
  }
  return (
    <>
      <div className="metric-grid finance-metrics">
        <Metric
          label={t('Collected / Đã thu')}
          value={summary.coverage ? money(summary.collected) : '—'}
          unit="VND"
          detail={summary.receipts.length + t(' receipts')}
          icon={Wallet}
          tone="blue"
        />
        <Metric
          label={t('Expenses / Đã chi')}
          value={money(summary.paid)}
          unit="VND"
          detail={
            summary.pendingExpenses
              ? summary.pendingExpenses + t(' text amounts pending')
              : t('Actual payments recorded')
          }
          icon={ArrowUpRight}
        />
        <Metric
          label={t('Net cash / Thu trừ chi')}
          value={summary.coverage ? money(summary.net) : '—'}
          unit="VND"
          detail={t('Not accounting profit')}
          icon={BookOpen}
        />
        <Metric
          label={t('Students who paid')}
          value={String(summary.payerIds.length)}
          detail={t('Identified students · family totals counted once')}
          icon={Users}
        />
      </div>
      <div className="section-toolbar">
        <Badge tone={close?.status === 'Closed' ? 'grey' : 'green'}>
          {close?.status === 'Closed' ? 'Month closed' : 'Month open'}
        </Badge>
        <span className="muted">
          {t('Through')} {cutoff}
        </span>
        <Button
          variant="outline"
          onClick={() =>
            p.open(
              'close',
              close ? records.find((r) => r.id === close.id) : undefined,
              {
                month: p.month,
                status: close?.status === 'Closed' ? 'Open' : 'Closed',
              },
            )
          }
        >
          <LockKeyhole size={15} />
          {close?.status === 'Closed' ? t('Reopen month') : t('Close month')}
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            p.open('expense', undefined, {
              date:
                p.month === today().slice(0, 7) ? today() : monthEnd(p.month),
            })
          }
        >
          <Plus size={15} /> {t('Record expense')}
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            downloadCsv('finance-' + p.month, [
              [
                'Type',
                'Date',
                'Name / Description',
                'Amount',
                'Account',
                'Reference',
              ].map((h) => t(h)),
              ...summary.receipts.map((r) => [
                t('Receipt'),
                r.date,
                r.name,
                r.amount,
                r.account,
                r.reference,
              ]),
              ...summary.expenses.map((r) => [
                t('Expense'),
                r.date,
                r.description,
                r.amount,
                r.account,
                r.reference,
              ]),
            ])
          }
        >
          <Download size={15} /> {t('Export month')}
        </Button>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList variant="line">
          <TabsTrigger value="receipts">{t('Money collected')}</TabsTrigger>
          <TabsTrigger value="expenses">{t('Expenses paid')}</TabsTrigger>
          <TabsTrigger value="review">
            {t('Student payment review')}
          </TabsTrigger>
          <TabsTrigger value="recurring">{t('Recurring expenses')}</TabsTrigger>
          <TabsTrigger value="payroll">{t('Payroll')}</TabsTrigger>
          <TabsTrigger value="tasks">{t('Tasks')}</TabsTrigger>
          <TabsTrigger value="reconcile">{t('Reconciliation')}</TabsTrigger>
        </TabsList>
        <TabsContent value="receipts">
          <Panel
            title={t('Money collected')}
            subtitle={t(
              'A payment appears in the month it was received, including deposits and partial payments.',
            )}
          >
            <DataTable
              headings={[
                'Date',
                'Payer / student',
                'Purpose',
                'Amount (VND)',
                'Account',
                'Allocation',
                '',
              ]}
              rows={rec.map((r) => [
                r.date ?? t('Not recorded'),
                <div className="long-cell">
                  {r.studentId ? (
                    <button
                      className="name-link"
                      onClick={() => p.detail(r.studentId, cutoff)}
                    >
                      {linkedStudentNames(records, r)}
                    </button>
                  ) : (
                    <strong>{linkedStudentNames(records, r) || r.name}</strong>
                  )}
                  {linkedStudentNames(records, r) && (
                    <small>
                      {t('Receipt payer:')} {r.name}
                    </small>
                  )}
                </div>,
                t(r.purpose || ''),
                <strong className="amount">{money(r.amount)}</strong>,
                r.account,
                <Badge
                  tone={
                    r.packageId || r.allocations?.length ? 'green' : 'amber'
                  }
                >
                  {r.allocations?.length
                    ? 'Family split'
                    : r.packageId
                      ? 'Package linked'
                      : r.studentId
                        ? 'Student identified'
                        : 'Unallocated'}
                </Badge>,
                <Button
                  variant="ghost"
                  onClick={() =>
                    p.open(
                      'receipt',
                      records.find((x) => x.id === r.id),
                    )
                  }
                >
                  {t('Details / match')}
                </Button>,
              ])}
            />
          </Panel>
        </TabsContent>
        <TabsContent value="expenses">
          <Panel
            title={t('Expenses paid')}
            subtitle={t(
              'Text-formatted source amounts stay visible separately until entered as verified numbers.',
            )}
          >
            <DataTable
              headings={[
                'Date',
                'Category',
                'Description',
                'Amount (VND)',
                'Account',
                'Reconciled',
                '',
              ]}
              rows={exp.map((r) => [
                r.date ?? t('Not recorded'),
                <Badge>{r.category}</Badge>,
                <div className="long-cell">{r.description}</div>,
                typeof r.amount === 'number' ? (
                  <strong className="amount">{money(r.amount)}</strong>
                ) : (
                  <span className="amber-text">
                    {String(r.originalAmount)}
                    <small>{t('Source text · excluded from total')}</small>
                  </span>
                ),
                r.account,
                <Badge tone={r.reconciled ? 'green' : 'grey'}>
                  {r.reconciled ? 'Matched' : 'Not matched'}
                </Badge>,
                <Button
                  variant="ghost"
                  onClick={() =>
                    p.open(
                      'expense',
                      records.find((x) => x.id === r.id),
                    )
                  }
                >
                  {t('Edit')}
                </Button>,
              ])}
            />
          </Panel>
        </TabsContent>
        <TabsContent value="review">
          <Panel
            title={t('Student payment review')}
            subtitle={
              t('Balances as at ') +
              cutoff +
              t('. A later payment does not rewrite the earlier month.')
            }
          >
            <DataTable
              headings={[
                'Student',
                'Class',
                'Paid this month',
                'Confirmed balance',
                'Status at cutoff',
                'Later payments',
              ]}
              rows={review
                .filter(
                  (s) =>
                    (!p.classFilter || s.classId === p.classFilter) &&
                    cleanSearch(s.name).includes(cleanSearch(p.search)),
                )
                .map((s) => [
                  <button
                    className="name-link"
                    onClick={() => p.detail(s.id, cutoff)}
                  >
                    {s.name}
                  </button>,
                  <ClassTag cl={classes.find((c) => c.id === s.classId)} />,
                  money(paidFor(s.id, summary.receipts)),
                  cutoff < CUTOFF ? t('Not available') : money(s.due),
                  <Badge>
                    {cutoff < CUTOFF
                      ? 'Historical balance unavailable'
                      : s.status}
                  </Badge>,
                  money(
                    paidFor(
                      s.id,
                      entries(records, 'receipt').filter(
                        (r) => r.date > cutoff && r.date <= today(),
                      ),
                    ),
                  ),
                ])}
            />
          </Panel>
        </TabsContent>
        <TabsContent value="recurring">
          <Panel
            title={t('Recurring commitments')}
            subtitle={t(
              'Expected bills are kept separate from expenses actually paid.',
            )}
            action={
              <Button variant="outline" onClick={() => p.open('commitment')}>
                <Plus size={15} /> {t('Add commitment')}
              </Button>
            }
          >
            <DataTable
              headings={[
                'Category',
                'Description',
                'Expected amount',
                'Frequency',
                'Next due',
                '',
              ]}
              rows={entries(records, 'commitment')
                .filter(filter)
                .map((r) => [
                  t(r.category || ''),
                  <div className="long-cell">{r.description}</div>,
                  money(r.amount),
                  t(r.frequency || ''),
                  r.dueDate || t('Not recorded'),
                  <Button
                    variant="ghost"
                    onClick={() =>
                      p.open(
                        'commitment',
                        records.find((x) => x.id === r.id),
                      )
                    }
                  >
                    {t('Edit')}
                  </Button>,
                ])}
            />
          </Panel>
        </TabsContent>
        <TabsContent value="payroll">
          <Payroll {...p} />
        </TabsContent>
        <TabsContent value="tasks">
          <AccountantTasks {...p} />
        </TabsContent>
        <TabsContent value="reconcile">
          <Reconciliation {...p} />
        </TabsContent>
      </Tabs>
    </>
  );
}
function Reconciliation(p: ViewProps) {
  const { t, money } = useLanguage();
  const { records } = p.snapshot;
  const s = cashSummary(records, p.month, monthEnd(p.month));
  const accounts = [
    ...new Set([...s.receipts, ...s.expenses].map((r) => r.account)),
  ];
  const rows = entries(records, 'reconciliation').filter(
    (r) => r.month === p.month,
  );
  return (
    <Panel
      title={t('Bank & cash reconciliation')}
      subtitle={t(
        'Enter statement balances for each account. Original workbooks did not include bank statements.',
      )}
      action={
        <Button
          variant="outline"
          onClick={() =>
            p.open('reconciliation', undefined, { month: p.month })
          }
        >
          <Plus size={15} /> {t('Add statement balances')}
        </Button>
      }
    >
      <DataTable
        headings={[
          'Account',
          'Opening',
          'Receipts',
          'Payments',
          'Expected closing',
          'Statement closing',
          'Difference',
          '',
        ]}
        rows={[...new Set([...accounts, ...rows.map((r) => r.account)])].map(
          (account) => {
            const r = rows.find((r) => r.account === account);
            const received = s.receipts
                .filter((x) => x.account === account)
                .reduce((n, x) => n + Number(x.amount || 0), 0),
              paid = s.expenses
                .filter((x) => x.account === account)
                .reduce((n, x) => n + Number(x.amount || 0), 0);
            const expected = r ? r.opening + received - paid : null;
            return [
              account,
              money(r?.opening),
              money(received),
              money(paid),
              money(expected),
              money(r?.statementClosing),
              r ? (
                <Badge tone={r.statementClosing === expected ? 'green' : 'red'}>
                  {money(r.statementClosing - Number(expected))}
                </Badge>
              ) : (
                <Badge>Statement needed</Badge>
              ),
              <Button
                variant="ghost"
                onClick={() =>
                  p.open(
                    'reconciliation',
                    r ? records.find((x) => x.id === r.id) : undefined,
                    { month: p.month, account },
                  )
                }
              >
                {t('Enter / edit')}
              </Button>,
            ];
          },
        )}
      />
    </Panel>
  );
}
export function Leads(p: ViewProps) {
  const { t } = useLanguage();
  const classes = entries(p.snapshot.records, 'class');
  const list = entries(p.snapshot.records, 'lead').filter((r) =>
    cleanSearch([r.name, r.parent, r.phone].join(' ')).includes(
      cleanSearch(p.search),
    ),
  );
  return (
    <Panel
      title={t('Leads & trials')}
      subtitle={t('Track the next conversation, trial lesson and enrolment.')}
    >
      <DataTable
        headings={[
          'Name',
          'Parent / contact',
          'Class',
          'Stage',
          'Follow-up date',
          'Notes',
          '',
        ]}
        rows={list.map((r) => [
          r.name,
          <span>
            {r.parent}
            <small>{r.phone}</small>
          </span>,
          <ClassTag cl={classes.find((c) => c.id === r.classId)} />,
          <Badge>{r.status}</Badge>,
          r.followUp || '—',
          <div className="long-cell">{r.notes}</div>,
          <div className="button-row">
            <Button
              variant="ghost"
              onClick={() =>
                p.open(
                  'lead',
                  p.snapshot.records.find((x) => x.id === r.id),
                )
              }
            >
              {t('Edit')}
            </Button>
            {r.status !== 'Enrolled' && (
              <Button
                variant="outline"
                onClick={() =>
                  p.open('student', undefined, {
                    name: r.name,
                    parent: r.parent,
                    phone: r.phone,
                    classId: r.classId,
                    leadId: r.id,
                    notes: 'From lead: ' + r.name,
                  })
                }
              >
                {t('Add as student')}
              </Button>
            )}
          </div>,
        ])}
      />
    </Panel>
  );
}
export function Team(p: ViewProps) {
  const { t, intlLocale } = useLanguage();
  const classes = entries(p.snapshot.records, 'class');
  return (
    <>
      <div className="notice">
        <ShieldCheck size={19} />
        <div>
          <strong>{t('Individual accounts. One connected team.')}</strong>
          <p>
            {t(
              'Staff use individual accounts. TAs manage attendance in all classes; Finance manages money; the Director manages the centre.',
            )}
          </p>
        </div>
      </div>
      <Panel
        title={t('Team & access')}
        subtitle={t(
          'TA access is limited to the classes assigned here. Finance data is never sent to TA accounts.',
        )}
      >
        <DataTable
          headings={[
            'Staff member',
            'Sign-in email',
            'Role',
            'Assigned classes',
            'Sign-in status',
            '',
          ]}
          rows={p.snapshot.members.map((m: any) => [
            m.name,
            m.email,
            <Badge
              tone={
                m.role === 'Director'
                  ? 'blue'
                  : m.role === 'Finance'
                    ? 'green'
                    : 'grey'
              }
            >
              {t(m.role === 'Finance' ? 'Finance manager' : m.role)}
            </Badge>,
            m.role === 'TA'
              ? t('All classes · teaching only')
              : t('All classes'),
            <Badge>
              {!m.active
                ? 'Disabled'
                : !m.password_ready
                  ? 'Password setup needed'
                  : m.must_change_password
                    ? 'Temporary password'
                    : m.last_sign_in_at
                      ? 'Account active'
                      : 'Awaiting first sign-in'}
            </Badge>,
            m.id !== 'owner' ? (
              <Button
                variant="ghost"
                onClick={() =>
                  p.open('staff', {
                    ...m,
                    classIds: Array.isArray(m.class_ids) ? m.class_ids : [],
                    active: !!m.active,
                  })
                }
              >
                {t('Edit access')}
              </Button>
            ) : (
              <span className="muted">{t('Owner')}</span>
            ),
          ])}
        />
      </Panel>
      <div className="team-guide">
        <div>
          <span>01</span>
          <strong>{t('Prepare access')}</strong>
          <p>
            {t(
              'Add the exact sign-in email and role. TAs automatically receive teaching access to all classes.',
            )}
          </p>
        </div>
        <div>
          <span>02</span>
          <strong>{t('Give individual credentials')}</strong>
          <p>
            {t(
              'Arrange a temporary password for each approved account. Adding a role row alone does not create a password.',
            )}
          </p>
        </div>
        <div>
          <span>03</span>
          <strong>{t('First sign-in')}</strong>
          <p>
            {t(
              'Open the app link, sign in and set a personal password. The account status updates after entry.',
            )}
          </p>
        </div>
      </div>
      <Panel
        title={t('Recent activity')}
        subtitle={t(
          'Saved changes are attributed to the signed-in staff member.',
        )}
      >
        <DataTable
          headings={['When', 'Staff member', 'Change']}
          rows={p.snapshot.activity.map((a: any) => [
            new Date(a.at).toLocaleString(intlLocale, {
              timeZone: 'Asia/Ho_Chi_Minh',
            }),
            a.actor_name,
            a.action,
          ])}
        />
      </Panel>
    </>
  );
}
export function SourceRecords(p: ViewProps) {
  const { t, message } = useLanguage();
  const [query, setQuery] = useState('Check học phí ver2'),
    [rows, setRows] = useState<DataRecord[]>([]),
    [busy, setBusy] = useState(false),
    [searched, setSearched] = useState(false),
    [latestOnly, setLatestOnly] = useState(true),
    [error, setError] = useState('');
  async function load(target = query) {
    setBusy(true);
    setError('');
    try {
      const book = latestOnly
        ? p.snapshot.manifest.workbookAudit?.file || ''
        : '';
      const r = await fetch(
        '/api/source?q=' +
          encodeURIComponent(target) +
          '&book=' +
          encodeURIComponent(book),
      );
      const j: any = await r.json();
      if (!r.ok) throw new Error(j.error);
      setRows(j);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load source.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="notice">
        <BookOpen size={20} />
        <div>
          <strong>{t('Source records & data checks')}</strong>
          <p>
            {t(
              'Student balances use the original “Check học phí ver2” values. New attendance starts after',
            )}{' '}
            {p.snapshot.manifest.sourceRefresh?.dataDate || CUTOFF}
            {t('. Source rows below are read-only.')}
          </p>
        </div>
      </div>
      <SourceReview
        {...p}
        showSheet={(sheet) => {
          setQuery(sheet);
          void load(sheet);
        }}
      />
      <div className="section-toolbar">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder={t('Search source sheet or student name')}
        />
        <Button className="primary" onClick={() => void load()} disabled={busy}>
          {busy ? t('Loading…') : t('Search original records')}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          aria-pressed={latestOnly}
          onClick={() => {
            setLatestOnly(!latestOnly);
            setRows([]);
            setSearched(false);
          }}
        >
          {latestOnly ? t('Latest workbook only') : t('All source versions')}
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            downloadCsv('boh-records-backup', [
              ['Record type', 'ID', 'Class', 'Student', 'Date', 'Data'],
              ...p.snapshot.records.map((r) => [
                r.kind,
                r.id,
                r.classId,
                r.studentId,
                r.date,
                JSON.stringify(r.payload),
              ]),
            ])
          }
        >
          <Download size={16} /> {t('Export working records')}
        </Button>
      </div>
      {error && <div className="error-message">{message(error)}</div>}
      <Panel
        title={t('Original workbook rows')}
        subtitle={
          !searched
            ? t('Search a sheet or student above to show preserved rows.')
            : rows.length >= 400
              ? t(
                  'First 400 matches. Search a specific sheet or student to narrow the results.',
                )
              : t(
                  'Column letters refer to the original Excel sheet. Older versions are kept separately.',
                )
        }
      >
        <DataTable
          headings={['Workbook', 'Sheet / row', 'Original data']}
          rows={rows
            .filter(
              (r) =>
                !latestOnly ||
                !p.snapshot.manifest.workbookAudit ||
                r.payload.book === p.snapshot.manifest.workbookAudit.file,
            )
            .map((r) => [
              r.payload.book,
              r.payload.sheet + t(' · row ') + r.payload.row,
              <div className="source-cells">
                {Object.entries(r.payload.cells).map(([k, v]) => (
                  <span key={k}>
                    <b>{k}</b>
                    {String(v)}
                  </span>
                ))}
              </div>,
            ])}
        />
        {searched &&
          !rows.some(
            (r) =>
              !latestOnly ||
              !p.snapshot.manifest.workbookAudit ||
              r.payload.book === p.snapshot.manifest.workbookAudit.file,
          ) && (
            <p className="muted">
              {t(
                'No rows found in this source version. Try a sheet name or switch to all source versions.',
              )}
            </p>
          )}
      </Panel>
      <Panel
        title={t('Unassigned source marks')}
        subtitle={t(
          '{p1} source marks have no confirmed student. No identity has been guessed.',
          { p1: entries(p.snapshot.records, 'unmatched').length },
        )}
      >
        <DataTable
          headings={['Source cell', 'Date', 'Mark', 'Reason']}
          rows={entries(p.snapshot.records, 'unmatched').map((r) => [
            r.source,
            r.date,
            r.mark,
            r.reason,
          ])}
        />
      </Panel>
    </>
  );
}
export function downloadCsv(name: string, rows: any[][]) {
  const escape = (v: any) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const blob = new Blob(
    ['\uFEFF' + rows.map((r) => r.map(escape).join(',')).join('\r\n')],
    { type: 'text/csv;charset=utf-8' },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
