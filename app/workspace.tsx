'use client';
import { useLanguage } from '@/app/language';
import { LanguageSwitch } from './language';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard,
  CalendarCheck2,
  Users,
  Wallet,
  RefreshCw,
  BookOpen,
  UserPlus,
  ShieldCheck,
  Plus,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  LogOut,
  AlertCircle,
  Check,
  Database,
  Loader2,
  ArrowUpRight,
  KeyRound,
  FileInput,
} from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Progress } from '@/components/ui/progress';
import { Badge, Choice, ClassTag, SearchBox, DataTable } from './ui';
import RecordForm from './record-form';
import StudentProfile from './student-profile';
import { Accounting } from './accounting-workspace';
import { BulkWorkspace } from './bulk-workspace';
import { CentreSettings } from './centre-settings';
import StudentLinkForm from './student-link-form';
import { createRefreshQueue } from '@/lib/refresh-queue';
import {
  accessScope,
  AccessError,
  homeView,
  isAccessDenied,
} from '@/lib/access';
import {
  Overview,
  Attendance,
  Students,
  Finance,
  Renewals,
  Packages,
  Leads,
  Team,
  SourceRecords,
  type ViewProps,
} from './views';
import {
  today,
  entries,
  shiftMonth,
  studentReview,
  cleanSearch,
  monthEnd,
  scheduledDates,
  addDays,
  resolveStudentId,
} from '@/lib/domain';
import { CUTOFF, type Snapshot, type DataRecord } from '@/lib/types';
const nav = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Attendance', icon: CalendarCheck2 },
  { label: 'Students', icon: Users },
  { label: 'Finance', icon: Wallet },
  { label: 'Accounting', icon: FileInput },
  { label: 'Import & export', icon: FileInput },
  { label: 'Renewals', icon: RefreshCw },
  { label: 'Packages', icon: BookOpen },
  { label: 'Classes & catalogue', icon: BookOpen },
  { label: 'Leads', icon: UserPlus },
  { label: 'Team & access', icon: ShieldCheck },
  { label: 'Original records', icon: Database },
];
const views: Record<string, React.ComponentType<ViewProps>> = {
  Overview: Overview,
  Attendance: Attendance,
  Students: Students,
  Finance: Finance,
  Accounting,
  'Import & export': BulkWorkspace,
  'Classes & catalogue': CentreSettings,
  Renewals: Renewals,
  Packages: Packages,
  Leads: Leads,
  'Team & access': Team,
  'Original records': SourceRecords,
};
export default function Workspace({ userName }: { userName: string }) {
  const { t, message, intlLocale } = useLanguage();
  const [view, setView] = useState('Overview'),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [month, setMonth] = useState(today().slice(0, 7)),
    [reviewDate, setReviewDate] = useState(today()),
    [search, setSearch] = useState(''),
    [classFilter, setClassFilter] = useState(''),
    [dialog, setDialog] = useState<any>(null),
    [studentId, setStudentId] = useState(''),
    [profileDate, setProfileDate] = useState(''),
    [help, setHelp] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<number | null>(null),
    [saved, setSaved] = useState('');
  const current = useRef<any>({});
  const scope = useRef('');
  const discardPrivateState = useCallback(() => {
    scope.current = '';
    setSnapshot(null);
    setDialog(null);
    setStudentId('');
    setProfileDate('');
    setClassFilter('');
    setSearch('');
    setSaved('');
    setHelp(false);
  }, []);
  const refreshQueue = useMemo(
    () =>
      createRefreshQueue<Snapshot>({
        busy: setBusy,
        read: async () => {
          let r = await fetch('/api/state', { cache: 'no-store' });
          let j: any = await r.json();
          if (!r.ok)
            throw new AccessError(
              j.error || 'Could not load the workspace.',
              r.status,
            );
          if (j.needsImport) {
            if (j.actor.role !== 'Director')
              throw new Error(
                'The Director needs to finish the initial import before staff can enter records.',
              );
            let done = false;
            while (!done) {
              setProgress((v) => v ?? 0);
              const ir = await fetch('/api/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
              });
              const ij: any = await ir.json();
              if (!ir.ok)
                throw new Error(
                  ij.error ||
                    'Import paused. Retry to continue without duplicating records.',
                );
              setProgress(ij.progress);
              done = ij.done;
            }
            r = await fetch('/api/state', { cache: 'no-store' });
            j = await r.json();
            if (!r.ok)
              throw new AccessError(
                j.error || 'Could not load imported records.',
                r.status,
              );
          }
          return j;
        },
        apply: (j) => {
          const nextScope = accessScope(j.actor);
          if (scope.current !== nextScope) {
            discardPrivateState();
            setView(homeView(j.actor.role));
            scope.current = nextScope;
          }
          setSnapshot(j);
          setProgress(null);
          setError('');
        },
        error: (e) => {
          if (isAccessDenied(e)) discardPrivateState();
          if (e instanceof AccessError && e.status === 428)
            window.location.assign('/change-password');
          setError(
            e instanceof Error ? e.message : 'Could not load the workspace.',
          );
        },
      }),
    [discardPrivateState],
  );
  const load = useCallback(() => refreshQueue.refresh(), [refreshQueue]);
  const afterSaved = useCallback(
    async (_record?: DataRecord) => {
      // Only an authorised snapshot can repopulate views after a role change.
      const refreshed = await load();
      setSaved(
        new Date().toLocaleTimeString(intlLocale, {
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
      if (!refreshed)
        setError(
          'Your change was saved. Refresh is needed to update all pages; do not enter the same record again.',
        );
      // Notify other open tabs without putting student or financial data in storage.
      try {
        window.localStorage.setItem('boh-records-changed', String(Date.now()));
      } catch {
        /* Other devices still refresh on focus / each minute. */
      }
    },
    [load, intlLocale],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const timer = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    const changed = (e: StorageEvent) => {
      if (e.key === 'boh-records-changed') void load();
    };
    window.addEventListener('storage', changed);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', changed);
    };
  }, [load]);
  const navigate = useCallback((v: string) => {
    setView(v);
    setSearch('');
    setError('');
  }, []);
  const signOut = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!r.ok)
        throw new Error('Sign-out could not finish. Please try again.');
      discardPrivateState();
      window.localStorage.setItem('boh-records-changed', String(Date.now()));
      window.location.assign('/login');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Please try signing out again.',
      );
    }
  }, [discardPrivateState]);
  const open = useCallback(
    (kind: string, record?: any, defaults?: any) =>
      setDialog({ kind, record, defaults }),
    [],
  );
  const save = useCallback(
    async (kind: string, record: any, payload: any) => {
      const r = await fetch('/api/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          id: record?.id,
          revision: record?.revision,
          payload,
        }),
      });
      const j: any = await r.json();
      if (!r.ok) {
        if ([401, 403].includes(r.status)) {
          discardPrivateState();
          void load();
        }
        throw new Error(j.error || 'Could not save.');
      }
      await afterSaved(j);
    },
    [afterSaved, discardPrivateState, load],
  );
  current.current = { snapshot, month, view, navigate, setMonth };
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const defs = [
      {
        name: 'boh_open_workspace_view',
        title: 'Open Ben Oxford Hub view',
        description:
          'Navigate the signed-in user to an allowed workspace view. Does not change business records.',
        inputSchema: {
          type: 'object',
          properties: {
            view: { type: 'string', enum: nav.map((n) => n.label) },
            month: { type: 'string' },
          },
          required: ['view'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: async (input: any) => {
          const c = current.current;
          const role = c.snapshot?.actor.role;
          if (!role) throw new Error('Sign in first.');
          const allowed =
            role === 'TA'
              ? ['Attendance']
              : role === 'Finance'
                ? nav
                    .map((n) => n.label)
                    .filter((n) => !['Leads', 'Team & access'].includes(n))
                : nav.map((n) => n.label);
          if (!allowed.includes(input.view))
            throw new Error('View not permitted for your role.');
          if (input.month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month))
            throw new Error('Invalid month.');
          c.navigate(input.view);
          if (input.month) c.setMonth(input.month);
          return { opened: input.view, month: input.month || c.month };
        },
      },
      {
        name: 'boh_read_workspace_summary',
        title: 'Read Ben Oxford Hub summary',
        description:
          'Read the signed-in role and counts of accessible records; no private finance data is returned to a TA.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async () => {
          const c = current.current;
          if (!c.snapshot) throw new Error('Sign in first.');
          return {
            role: c.snapshot.actor.role,
            view: c.view,
            month: c.month,
            students: entries(c.snapshot.records, 'student').length,
            classes: entries(c.snapshot.records, 'class').length,
          };
        },
      },
    ];
    for (const def of defs)
      Promise.resolve(
        context.registerTool(def, { signal: lifecycle.signal }),
      ).catch(() => {});
    return () => lifecycle.abort();
  }, []);
  const role = snapshot?.actor.role ?? 'Director';
  const navigation = nav.filter((n) =>
    role === 'TA'
      ? ['Attendance', 'Import & export'].includes(n.label)
      : role === 'Finance'
        ? !['Leads', 'Team & access'].includes(n.label)
        : true,
  );
  const classes = snapshot ? entries(snapshot.records, 'class') : [];
  const canCreate =
    view === 'Attendance'
      ? role !== 'Finance' && classes.length > 0
      : view === 'Students'
        ? role === 'Director'
        : true;
  const primary: Record<string, [string, string]> = {
    Overview: ['receipt', 'Record payment'],
    Finance: ['receipt', 'Record payment'],
    Students: ['student', 'Add student'],
    Attendance: ['makeup', 'Add makeup'],
    Packages: ['package', 'Add package'],
    Renewals: ['package', 'Add renewal'],
    Leads: ['lead', 'Add lead'],
    'Team & access': ['staff', 'Add staff'],
  };
  const title: Record<string, string> = {
    Overview: 'Centre overview',
    Attendance: 'Class attendance',
    Students: 'Student directory',
    Finance: 'Monthly finance',
    Accounting: 'Accounting review',
    'Import & export': 'Import & export',
    'Classes & catalogue': 'Classes & catalogue',
    Renewals: 'Upcoming renewals',
    Packages: 'Student packages',
    Leads: 'Leads & trials',
    'Team & access': 'Team & access',
    'Original records': 'Your original records, preserved.',
  };
  const subtitles: Record<string, string> = {
    Overview: 'Collections, classes and the next conversations to have.',
    Attendance: 'Choose a class. Mark the date. The balance updates.',
    Students:
      'Students, parent contacts, class membership and session balances.',
    Finance:
      'Actual collections and payments. Separate from expected renewals.',
    Accounting: 'Review source documents, approvals and payment evidence.',
    'Import & export':
      'Enter one record or fill a worksheet. Review before saving.',
    'Classes & catalogue':
      'Maintain classes and the price list without changing past agreements.',
    Renewals: 'Names and expected dates. No guessed renewal prices.',
    Packages: 'Actual agreed fees, payments and sessions remaining.',
    Leads: 'Keep the next action and the next follow-up in sight.',
    'Team & access':
      'Individual sign-ins. Director, Finance and Teaching Assistant roles.',
    'Original records': 'Read-only history from the workbooks you supplied.',
  };
  const missing = useMemo(() => {
    if (!snapshot) return 0;
    const records = snapshot.records,
      ms = entries(records, 'membership').filter((m) => m.forecast !== false),
      atts = new Set(
        entries(records, 'attendance').map(
          (a) => a.membershipId + ':' + a.date,
        ),
      );
    let count = 0;
    for (const m of ms) {
      const st = entries(records, 'student').find((s) => s.id === m.studentId);
      if (['Stopped', 'Roster only'].includes(st?.status)) continue;
      for (const d of scheduledDates(
        records,
        m.classId,
        addDays(CUTOFF, 1),
        reviewDate,
        st,
      ))
        if (
          (!m.from || d >= m.from) &&
          (!m.until || d <= m.until) &&
          (m.schedule !== 'Saturday' ||
            new Date(d + 'T12:00Z').getUTCDay() === 6) &&
          !atts.has(m.id + ':' + d)
        )
          count++;
    }
    return count;
  }, [snapshot, reviewDate]);
  const props: ViewProps = snapshot
    ? {
        snapshot,
        month,
        reviewDate,
        search,
        classFilter,
        setClassFilter,
        open,
        detail: (id, asOf) => {
          setStudentId(resolveStudentId(snapshot.records, id));
          setProfileDate(asOf || reviewDate);
        },
        navigate,
        save,
        refresh: load,
      }
    : (null as any);
  const View = views[view] ?? Overview;
  const st = useMemo(
    () =>
      snapshot && studentId
        ? studentReview(snapshot.records, profileDate || reviewDate).find(
            (s) => s.id === resolveStudentId(snapshot.records, studentId),
          )
        : null,
    [snapshot, studentId, reviewDate, profileDate],
  );
  if (!snapshot && error)
    return (
      <main className="password-page">
        <section className="password-card">
          <LanguageSwitch />
          <img
            src="/brand/boh-navy.svg"
            alt="Ben Oxford Hub"
            width={210}
            height={85}
          />
          <h1>{t('Let’s check your access.')}</h1>
          <p role="alert">{message(error)}</p>
          <a className="welcome-signin-button" href="/login">
            {t('Go to sign in')} <ArrowUpRight size={18} />
          </a>
          <Button variant="ghost" onClick={() => void load()} disabled={busy}>
            {t('Check again')}
          </Button>
        </section>
      </main>
    );
  return (
    <SidebarProvider>
      <Sidebar
        className="boh-sidebar"
        role="complementary"
        aria-label={t('Workspace')}
      >
        <SidebarHeader>
          <div className="brand">
            <img
              className="brand-logo"
              src="/brand/boh-navy.svg"
              alt="Ben Oxford Hub"
              width={1206}
              height={489.84}
            />
            <span>{t('Centre workspace')}</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <p className="nav-caption">{t('WORKSPACE')}</p>
          <SidebarMenu>
            {navigation.map((n) => (
              <SidebarMenuItem key={n.label}>
                <SidebarMenuButton
                  isActive={view === n.label}
                  onClick={() => navigate(n.label)}
                >
                  <n.icon size={19} />
                  <span>{t(n.label)}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <div className="sidebar-note">
            <ShieldCheck size={18} />
            <p>
              {t('Private workspace')}{' '}
              <span>
                {role === 'TA'
                  ? t('All classes · teaching only')
                  : t('Source balances preserved')}
              </span>
            </p>
          </div>
        </SidebarContent>
        <SidebarFooter>
          <a className="help-button" href="/change-password">
            <KeyRound size={17} /> {t('Change my password')}
          </a>
          <button className="help-button" onClick={() => setHelp(true)}>
            <HelpCircle size={17} /> {t('How to use your workspace')}
          </button>
          <div className="identity">
            <div className="avatar">{role === 'TA' ? 'TA' : role[0]}</div>
            <div>
              <strong>{snapshot?.actor.name ?? userName}</strong>
              <span>{t(role === 'TA' ? 'Teaching Assistant' : role)}</span>
            </div>
            <button
              className="signout"
              onClick={() => void signOut()}
              aria-label={t('Sign out')}
            >
              <LogOut size={15} />
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger />
            <span>{t('Workspace')}</span>
            <span>/</span>
            <strong>{t(view)}</strong>
          </div>
          <div className="topbar-right">
            <LanguageSwitch />
            <span className="secure">
              <span />
              {error
                ? t('Refresh needed')
                : snapshot
                  ? t('Connected · ') + t(role)
                  : t('Private workspace')}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('Refresh latest records')}
              onClick={() => void load()}
              disabled={busy}
            >
              <RefreshCw className={busy ? 'spin' : ''} size={17} />
            </Button>
          </div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {role === 'TA' ? t('TEACHING WORKSPACE') : 'BEN OXFORD HUB'}
              </p>
              <h1>{t(title[view])}</h1>
              <p>{t(subtitles[view])}</p>
            </div>
            {snapshot && primary[view] && canCreate && (
              <Button
                className="primary"
                onClick={() =>
                  open(
                    primary[view][0],
                    undefined,
                    view === 'Attendance'
                      ? { classId: classFilter || classes[0]?.id }
                      : {},
                  )
                }
              >
                <Plus size={17} />
                {t(primary[view][1])}
              </Button>
            )}
          </div>
          {error && (
            <div className="error-message" role="alert">
              <AlertCircle size={18} />
              <span>{message(error)}</span>
              <Button variant="outline" onClick={() => void load()}>
                {t('Retry')}
              </Button>
              {!snapshot && <a href="/login">{t('Sign in')}</a>}
            </div>
          )}
          {progress !== null && (
            <section className="panel import-progress">
              <h2>{t('Bringing in your existing records')}</h2>
              <p>
                {t(
                  'Attendance, packages, finance and original history. No re-entry needed.',
                )}
              </p>
              <Progress value={progress} aria-label={t('Import progress')} />
              <strong>{progress}%</strong>
            </section>
          )}
          {!snapshot && !error && progress === null && (
            <div className="connecting">
              <Loader2 className="spin" />
              <span>{t('Opening your private workspace…')}</span>
            </div>
          )}
          {snapshot && (
            <>
              {view === homeView(role) && (
                <section
                  className="workspace-welcome"
                  aria-label={t('Your workspace home')}
                >
                  <div className="workspace-welcome-copy">
                    <span className={'role-label role-' + role.toLowerCase()}>
                      {t(role === 'TA' ? 'TEACHING TEAM' : role.toUpperCase())}{' '}
                      {t('WORKSPACE')}
                    </span>
                    <h2>
                      {t('Welcome back,')} {snapshot.actor.name || userName}.
                    </h2>
                    <p>
                      {role === 'TA'
                        ? t(
                            'Your classes. Your students. One clear place to begin.',
                          )
                        : role === 'Finance'
                          ? t(
                              'Every payment, every package. A clear view of the month.',
                            )
                          : t('Your people, classes and finances. Connected.')}
                    </p>
                    <div className="welcome-shortcuts">
                      {role === 'Director' ? (
                        <>
                          <button onClick={() => navigate('Attendance')}>
                            <CalendarCheck2 size={16} /> {t('Attendance')}{' '}
                            <ArrowUpRight size={14} />
                          </button>
                          <button onClick={() => navigate('Finance')}>
                            <Wallet size={16} /> {t('Monthly finance')}{' '}
                            <ArrowUpRight size={14} />
                          </button>
                          <button onClick={() => navigate('Team & access')}>
                            <Users size={16} /> {t('My team')}{' '}
                            <ArrowUpRight size={14} />
                          </button>
                        </>
                      ) : role === 'Finance' ? (
                        <>
                          <button onClick={() => open('receipt')}>
                            <Plus size={16} /> {t('Record payment')}
                          </button>
                          <button onClick={() => navigate('Renewals')}>
                            <RefreshCw size={16} /> {t('Renewal review')}{' '}
                            <ArrowUpRight size={14} />
                          </button>
                        </>
                      ) : (
                        <button onClick={() => setHelp(true)}>
                          <HelpCircle size={16} /> {t('Attendance guide')}
                        </button>
                      )}
                    </div>
                  </div>
                  <img
                    src="/brand/centre-entrance.jpg"
                    alt=""
                    width={160}
                    height={180}
                  />
                </section>
              )}
              <div className="period-toolbar">
                <div className="period">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('Previous month')}
                    onClick={() => setMonth(shiftMonth(month, -1))}
                  >
                    <ChevronLeft />
                  </Button>
                  <input
                    type="month"
                    aria-label={t('Reporting month')}
                    value={month}
                    onChange={(e) => e.target.value && setMonth(e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('Next month')}
                    onClick={() => setMonth(shiftMonth(month, 1))}
                  >
                    <ChevronRight />
                  </Button>
                </div>
                {!['Accounting', 'Classes & catalogue'].includes(view) && (
                  <div className="review-control">
                    <label htmlFor="review-date">{t('Review through')}</label>
                    <input
                      type="date"
                      id="review-date"
                      value={reviewDate}
                      max={today()}
                      onChange={(e) =>
                        e.target.value && setReviewDate(e.target.value)
                      }
                    />
                  </div>
                )}
                <span className="source-note" aria-live="polite">
                  {saved
                    ? t('Saved at ') + saved
                    : t('App refreshed ') +
                      new Date(snapshot.loadedAt).toLocaleTimeString(
                        intlLocale,
                        {
                          timeZone: 'Asia/Ho_Chi_Minh',
                          hour: '2-digit',
                          minute: '2-digit',
                        },
                      )}
                </span>
              </div>
              {missing > 0 &&
                ['Overview', 'Renewals', 'Attendance'].includes(view) && (
                  <div className="notice compact">
                    <CalendarCheck2 size={18} />
                    <p>
                      <strong>
                        {missing} {t('lesson marks are still blank through')}{' '}
                        {reviewDate}.
                      </strong>{' '}
                      {t(
                        'Renewal dates remain estimates until attendance is up to date.',
                      )}
                    </p>
                  </div>
                )}
              {![
                'Overview',
                'Original records',
                'Team & access',
                'Accounting',
                'Import & export',
                'Classes & catalogue',
              ].includes(view) && (
                <div className="filter-toolbar">
                  <SearchBox
                    value={search}
                    onChange={setSearch}
                    placeholder={
                      view === 'Finance'
                        ? t('Search payer, description or account…')
                        : t('Search student or lesson…')
                    }
                  />
                  {!['Attendance', 'Leads'].includes(view) && (
                    <Choice
                      label={t('All classes')}
                      value={classFilter}
                      onChange={setClassFilter}
                      options={[
                        { value: '', label: t('All classes') },
                        ...classes.map((c) => ({ value: c.id, label: c.name })),
                      ]}
                    />
                  )}
                </div>
              )}
              <View key={accessScope(snapshot.actor) + ':' + view} {...props} />
            </>
          )}
        </div>
      </main>
      {dialog?.kind === 'student-link' && snapshot && (
        <StudentLinkForm
          record={dialog.record}
          records={snapshot.records}
          onClose={() => setDialog(null)}
          onSaved={afterSaved}
        />
      )}
      {dialog && dialog.kind !== 'student-link' && snapshot && (
        <RecordForm
          key={dialog.kind + ':' + (dialog.record?.id ?? 'new')}
          {...dialog}
          records={snapshot.records}
          onClose={() => setDialog(null)}
          onSaved={afterSaved}
          onRefresh={load}
        />
      )}
      <Sheet open={!!studentId} onOpenChange={(o) => !o && setStudentId('')}>
        <SheetContent className="student-sheet">
          <SheetHeader>
            <SheetTitle>{st?.name ?? t('Student')}</SheetTitle>
            <SheetDescription>
              {t('One student record · balances as at')}{' '}
              {profileDate || reviewDate}
            </SheetDescription>
          </SheetHeader>
          {st && snapshot && (
            <StudentProfile
              key={st.id}
              student={st}
              records={snapshot.records}
              role={role}
              open={open}
              reload={() => afterSaved()}
              close={() => setStudentId('')}
            />
          )}
        </SheetContent>
      </Sheet>
      <Sheet open={help} onOpenChange={setHelp}>
        <SheetContent className="student-sheet">
          <SheetHeader>
            <SheetTitle>{t('Your daily workflow')}</SheetTitle>
            <SheetDescription>
              {t('Start with the task you need to do.')}
            </SheetDescription>
          </SheetHeader>
          <div className="detail-body help-content">
            {role === 'TA' ? (
              <>
                <h2>{t('Take attendance')}</h2>
                <p>
                  {t(
                    'Open Attendance, choose your class and month, then use the lesson cell: P present, T late, A absent, N not scheduled. Each change saves immediately.',
                  )}
                </p>
                <h2>{t('Complete a makeup')}</h2>
                <p>
                  {t(
                    'Open Makeup lessons, add the student, select their original absence and choose the makeup date. Mark it Completed after the lesson. Do not change the original absence to present.',
                  )}
                </p>
              </>
            ) : (
              <>
                <h2>{t('See this month’s money')}</h2>
                <p>
                  {t(
                    'Choose the month at the top. Overview shows collections and expenses; Finance shows every receipt and payment.',
                  )}
                </p>
                <h2>{t('Record a payment')}</h2>
                <p>
                  {t(
                    'Click Record payment. Enter the actual payment date and amount. Select the student and their purchased package. Use the family split option for a payment covering several students.',
                  )}
                </p>
                <h2>{t('Add a renewal')}</h2>
                <p>
                  {t(
                    'Open Packages and Add package. Select the student, sessions and actual agreed fee. Each renewal keeps its own history. Then record the payment separately.',
                  )}
                </p>
                <h2>{t('Add or transfer a student')}</h2>
                <p>
                  {t(
                    'Director: use Students → Add student. Changing a student’s home class creates a new membership and retains the old class history.',
                  )}
                </p>
                <h2>{t('See next month’s renewals')}</h2>
                <p>
                  {t(
                    'Open Renewals and choose next month. The list contains students and expected dates, not guessed future fees.',
                  )}
                </p>
                <h2>{t('Give staff access')}</h2>
                <p>
                  {t(
                    'Add the staff member’s individual email under Team & access and choose their role. TAs also need their classes assigned. Arrange an individual temporary password before their first sign-in; do not give anyone your own login.',
                  )}
                </p>
              </>
            )}
            <h2>{t('Original history')}</h2>
            <p>
              {t(
                'All original class history is visible by choosing an earlier month. Historical makeup and support entries appear in their lesson tables. Opening package balances are preserved from 8 September 2026.',
              )}
            </p>
            <h2>{t('Important distinctions')}</h2>
            <p>
              {t(
                'Cash collected is not earned revenue or accounting profit. A renewal forecast is not an unpaid bill. Missing historical payment dates are not invented. Attendance and finance share one saved database; open screens refresh each minute or when you return to the window.',
              )}
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  );
}
