'use client';
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
  monthLabel,
  money,
  studentReview,
  cleanSearch,
  monthEnd,
  scheduledDates,
  addDays,
} from '@/lib/domain';
import { CUTOFF, type Snapshot, type DataRecord } from '@/lib/types';
const nav = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Attendance', icon: CalendarCheck2 },
  { label: 'Students', icon: Users },
  { label: 'Finance', icon: Wallet },
  { label: 'Renewals', icon: RefreshCw },
  { label: 'Packages', icon: BookOpen },
  { label: 'Leads', icon: UserPlus },
  { label: 'Team & access', icon: ShieldCheck },
  { label: 'Original records', icon: Database },
];
const views: Record<string, React.ComponentType<ViewProps>> = {
  Overview: Overview,
  Attendance: Attendance,
  Students: Students,
  Finance: Finance,
  Renewals: Renewals,
  Packages: Packages,
  Leads: Leads,
  'Team & access': Team,
  'Original records': SourceRecords,
};
export default function Workspace({ userName }: { userName: string }) {
  const [view, setView] = useState('Overview'),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [month, setMonth] = useState(today().slice(0, 7)),
    [reviewDate, setReviewDate] = useState(today()),
    [search, setSearch] = useState(''),
    [classFilter, setClassFilter] = useState(''),
    [dialog, setDialog] = useState<any>(null),
    [studentId, setStudentId] = useState(''),
    [help, setHelp] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<number | null>(null),
    [saved, setSaved] = useState('');
  const loading = useRef(false),
    current = useRef<any>({});
  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    setBusy(true);
    try {
      let r = await fetch('/api/state', { cache: 'no-store' });
      let j: any = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not load the workspace.');
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
          throw new Error(j.error || 'Could not load imported records.');
      }
      setSnapshot(j);
      setProgress(null);
      setError('');
      if (j.actor.role === 'TA') setView('Attendance');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not load the workspace.',
      );
    } finally {
      setBusy(false);
      loading.current = false;
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible' && !dialog && !loading.current)
        void load();
    };
    const timer = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [load, dialog]);
  const navigate = useCallback((v: string) => {
    setView(v);
    setSearch('');
    setError('');
  }, []);
  const open = useCallback(
    (kind: string, record?: any, defaults?: any) =>
      setDialog({ kind, record, defaults }),
    [],
  );
  const save = useCallback(async (kind: string, record: any, payload: any) => {
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
    if (!r.ok) throw new Error(j.error || 'Could not save.');
    setSnapshot((s) =>
      s
        ? {
            ...s,
            records: [...s.records.filter((x) => x.id !== j.id), j],
            loadedAt: new Date().toISOString(),
          }
        : s,
    );
    setSaved(
      new Date().toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
  }, []);
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
      ? n.label === 'Attendance'
      : role === 'Finance'
        ? !['Leads', 'Team & access'].includes(n.label)
        : true,
  );
  const classes = snapshot ? entries(snapshot.records, 'class') : [];
  const canCreate =
    view === 'Attendance'
      ? role !== 'Finance'
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
        detail: setStudentId,
        navigate,
        save,
      }
    : (null as any);
  const View = views[view] ?? Overview;
  const st = useMemo(
    () =>
      snapshot && studentId
        ? studentReview(snapshot.records, reviewDate).find(
            (s) => s.id === studentId,
          )
        : null,
    [snapshot, studentId, reviewDate],
  );
  return (
    <SidebarProvider>
      <Sidebar className="boh-sidebar">
        <SidebarHeader>
          <div className="brand">
            <img
              className="brand-logo"
              src="/brand/boh-logo.svg"
              alt="Ben Oxford Hub"
              width={1206}
              height={489.84}
            />
            <span>Centre workspace</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <p className="nav-caption">WORKSPACE</p>
          <SidebarMenu>
            {navigation.map((n) => (
              <SidebarMenuItem key={n.label}>
                <SidebarMenuButton
                  isActive={view === n.label}
                  onClick={() => navigate(n.label)}
                >
                  <n.icon size={19} />
                  <span>{n.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <div className="sidebar-note">
            <ShieldCheck size={18} />
            <p>
              Private workspace
              <span>
                {role === 'TA'
                  ? 'Assigned classes only'
                  : 'Source balances preserved'}
              </span>
            </p>
          </div>
        </SidebarContent>
        <SidebarFooter>
          <button className="help-button" onClick={() => setHelp(true)}>
            <HelpCircle size={17} />
            How to use your workspace
          </button>
          <div className="identity">
            <div className="avatar">{role === 'TA' ? 'TA' : role[0]}</div>
            <div>
              <strong>{snapshot?.actor.name ?? userName}</strong>
              <span>{role === 'TA' ? 'Teaching Assistant' : role}</span>
            </div>
            <a
              className="signout"
              href="/signout-with-chatgpt?return_to=/"
              target="_top"
              aria-label="Sign out"
            >
              <LogOut size={15} />
            </a>
          </div>
        </SidebarFooter>
      </Sidebar>
      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger />
            <span>Workspace</span>
            <span>/</span>
            <strong>{view}</strong>
          </div>
          <div className="topbar-right">
            <span className="secure">
              <span />
              {error
                ? 'Refresh needed'
                : snapshot
                  ? 'Connected · ' + role
                  : 'Private workspace'}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh latest records"
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
                {role === 'TA' ? 'TEACHING WORKSPACE' : 'BEN OXFORD HUB'}
              </p>
              <h1>{title[view]}</h1>
              <p>{subtitles[view]}</p>
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
                {primary[view][1]}
              </Button>
            )}
          </div>
          {error && (
            <div className="error-message" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <Button variant="outline" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          )}
          {progress !== null && (
            <section className="panel import-progress">
              <h2>Bringing in your existing records</h2>
              <p>
                Attendance, packages, finance and original history. No re-entry
                needed.
              </p>
              <Progress value={progress} aria-label="Import progress" />
              <strong>{progress}%</strong>
            </section>
          )}
          {!snapshot && !error && progress === null && (
            <div className="connecting">
              <Loader2 className="spin" />
              <span>Opening your private workspace…</span>
            </div>
          )}
          {snapshot && (
            <>
              <div className="period-toolbar">
                <div className="period">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Previous month"
                    onClick={() => setMonth(shiftMonth(month, -1))}
                  >
                    <ChevronLeft />
                  </Button>
                  <input
                    type="month"
                    aria-label="Reporting month"
                    value={month}
                    onChange={(e) => e.target.value && setMonth(e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Next month"
                    onClick={() => setMonth(shiftMonth(month, 1))}
                  >
                    <ChevronRight />
                  </Button>
                </div>
                <div className="review-control">
                  <label htmlFor="review-date">Review through</label>
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
                <span className="source-note" aria-live="polite">
                  {saved
                    ? 'Saved at ' + saved
                    : 'Updated ' +
                      new Date(snapshot.loadedAt).toLocaleTimeString('en-GB', {
                        timeZone: 'Asia/Ho_Chi_Minh',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                </span>
              </div>
              {missing > 0 &&
                ['Overview', 'Renewals', 'Attendance'].includes(view) && (
                  <div className="notice compact">
                    <CalendarCheck2 size={18} />
                    <p>
                      <strong>
                        {missing} lesson marks are still blank through{' '}
                        {reviewDate}.
                      </strong>{' '}
                      Renewal dates remain estimates until attendance is up to
                      date.
                    </p>
                  </div>
                )}
              {!['Overview', 'Original records', 'Team & access'].includes(
                view,
              ) && (
                <div className="filter-toolbar">
                  <SearchBox
                    value={search}
                    onChange={setSearch}
                    placeholder={
                      view === 'Finance'
                        ? 'Search payer, description or account…'
                        : 'Search student or lesson…'
                    }
                  />
                  {!['Attendance', 'Leads'].includes(view) && (
                    <Choice
                      label="All classes"
                      value={classFilter}
                      onChange={setClassFilter}
                      options={[
                        { value: '', label: 'All classes' },
                        ...classes.map((c) => ({ value: c.id, label: c.name })),
                      ]}
                    />
                  )}
                </div>
              )}
              <View {...props} />
            </>
          )}
        </div>
      </main>
      {dialog && snapshot && (
        <RecordForm
          key={dialog.kind + ':' + (dialog.record?.id ?? 'new')}
          {...dialog}
          records={snapshot.records}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setSaved(
              new Date().toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              }),
            );
            void load();
          }}
        />
      )}
      <Sheet open={!!studentId} onOpenChange={(o) => !o && setStudentId('')}>
        <SheetContent className="student-sheet">
          <SheetHeader>
            <SheetTitle>{st?.name ?? 'Student'}</SheetTitle>
            <SheetDescription>
              Student profile and package history
            </SheetDescription>
          </SheetHeader>
          {st && snapshot && (
            <div className="detail-body">
              <div className="button-row">
                <ClassTag cl={classes.find((c) => c.id === st.classId)} />
                <Badge>{st.status}</Badge>
              </div>
              <div className="detail-stats">
                <div>
                  <span>Sessions remaining</span>
                  <strong>{st.sessions ?? '—'}</strong>
                </div>
                <div>
                  <span>Confirmed amount due</span>
                  <strong>
                    {money(st.due)}
                    <small> VND</small>
                  </strong>
                </div>
              </div>
              <div className="detail-contact">
                <span>Parent</span>
                <strong>{st.parent || 'Not recorded'}</strong>
                <span>Phone</span>
                <strong>{st.phone || 'Not recorded'}</strong>
              </div>
              <h2>Packages</h2>
              {st.packages.map((p: any) => (
                <section className="detail-package" key={p.id}>
                  <div className="button-row">
                    <strong>{p.label}</strong>
                    <Badge>
                      {p.imported ? 'Original package' : 'New package'}
                    </Badge>
                  </div>
                  <dl>
                    <dt>Start</dt>
                    <dd>{p.startDate ?? '—'}</dd>
                    <dt>Agreed / source value</dt>
                    <dd>{money(p.agreedFee)} VND</dd>
                    <dt>Recorded paid</dt>
                    <dd>{money(p.paid)} VND</dd>
                    <dt>Sessions left</dt>
                    <dd>{p.remaining ?? '—'}</dd>
                    {p.imported && (
                      <>
                        <dt>Original remaining balance</dt>
                        <dd>{p.sourceRemaining ?? '—'}</dd>
                      </>
                    )}
                  </dl>
                  {p.sourceNote && (
                    <p className="source-note-text">{p.sourceNote}</p>
                  )}
                </section>
              ))}
              <div className="button-row">
                {role === 'Director' && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      open(
                        'student',
                        snapshot.records.find((r) => r.id === st.id),
                      )
                    }
                  >
                    Edit student
                  </Button>
                )}
                <Button
                  className="primary"
                  onClick={() =>
                    open('package', undefined, {
                      studentId: st.id,
                      classId: st.classId,
                    })
                  }
                >
                  Add renewal
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    open('receipt', undefined, {
                      studentId: st.id,
                      name: st.name,
                    })
                  }
                >
                  Record payment
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <Sheet open={help} onOpenChange={setHelp}>
        <SheetContent className="student-sheet">
          <SheetHeader>
            <SheetTitle>Your daily workflow</SheetTitle>
            <SheetDescription>
              Start with the task you need to do.
            </SheetDescription>
          </SheetHeader>
          <div className="detail-body help-content">
            {role === 'TA' ? (
              <>
                <h2>Take attendance</h2>
                <p>
                  Open Attendance, choose your class and month, then use the
                  lesson cell: P present, T late, A absent, N not scheduled.
                  Each change saves immediately.
                </p>
                <h2>Complete a makeup</h2>
                <p>
                  Open Makeup lessons, add the student, select their original
                  absence and choose the makeup date. Mark it Completed after
                  the lesson. Do not change the original absence to present.
                </p>
              </>
            ) : (
              <>
                <h2>See this month’s money</h2>
                <p>
                  Choose the month at the top. Overview shows collections and
                  expenses; Finance shows every receipt and payment.
                </p>
                <h2>Record a payment</h2>
                <p>
                  Click Record payment. Enter the actual payment date and
                  amount. Select the student and their purchased package. Use
                  the family split option for a payment covering several
                  students.
                </p>
                <h2>Add a renewal</h2>
                <p>
                  Open Packages and Add package. Select the student, sessions
                  and actual agreed fee. Each renewal keeps its own history.
                  Then record the payment separately.
                </p>
                <h2>Add or transfer a student</h2>
                <p>
                  Director: use Students → Add student. Changing a student’s
                  home class creates a new membership and retains the old class
                  history.
                </p>
                <h2>See next month’s renewals</h2>
                <p>
                  Open Renewals and choose next month. The list contains
                  students and expected dates, not guessed future fees.
                </p>
                <h2>Give staff access</h2>
                <p>
                  Add the staff member’s ChatGPT sign-in email under Team &
                  access and choose their role. TAs also need their classes
                  assigned. The owner must share this private site with those
                  same people as viewers.
                </p>
              </>
            )}
            <h2>Original history</h2>
            <p>
              All original class history is visible by choosing an earlier
              month. Historical makeup and support entries appear in their
              lesson tables. Opening package balances are preserved from 8
              September 2026.
            </p>
            <h2>Important distinctions</h2>
            <p>
              Cash collected is not earned revenue or accounting profit. A
              renewal forecast is not an unpaid bill. Missing historical payment
              dates are not invented. Attendance and finance share one saved
              database; open screens refresh each minute or when you return to
              the window.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  );
}
