'use client';
import { useLanguage } from '@/app/language';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
import { Badge, ClassTag, DataTable, LessonClass } from './ui';
import {
  allocations,
  entries,
  studentDeletionBlockers,
  studentReceiptShare,
} from '@/lib/domain';
import type { DataRecord, Role } from '@/lib/types';

export default function StudentProfile({
  student: s,
  records,
  role,
  open,
  reload,
  close,
}: {
  student: any;
  records: DataRecord[];
  role: Role;
  open: (kind: string, record?: any, defaults?: any) => void;
  reload: () => Promise<void>;
  close: () => void;
}) {
  const { t, message, money, packageTitle } = useLanguage();
  const [action, setAction] = useState('');
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const record = records.find((r) => r.kind === 'student' && r.id === s.id)!;
  const classes = entries(records, 'class');
  const memberships = entries(records, 'membership').filter(
    (m) => m.studentId === s.id,
  );
  const allPackages = entries(records, 'package').filter(
    (p) => p.studentId === s.id,
  );
  const payments = entries(records, 'receipt').filter(
    (r) => studentReceiptShare(r, s.id) !== null,
  );
  const unknownBalance =
    allPackages.length > 0 &&
    !s.packages.some((p: any) => typeof p.balance === 'number');
  const attendance = entries(records, 'attendance')
    .filter((a) => a.studentId === s.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const lessons = [
    ...entries(records, 'makeup'),
    ...entries(records, 'support'),
  ]
    .filter((r) => r.studentId === s.id)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const dependencies = studentDeletionBlockers(records, s.id);
  const imported = !!(
    record.payload.source ||
    record.payload.imported ||
    /^(STU-|HIS-)/.test(s.id)
  );
  const canDelete = !imported && !dependencies.length;
  const details = [
    ['Preferred name', s.preferredName],
    ['Date of birth', s.birthDate],
    ['School', s.school],
    ['Parent', s.parent],
    ['Phone', s.phone],
    ['Parent email', s.parentEmail],
    ['Zalo', s.zalo],
    ['Second / emergency contact', s.secondParent],
    ['Second phone', s.secondPhone],
    ['Address', s.address],
    ['Enrollment date', s.enrollmentDate],
    ['Pause from', s.pauseFrom],
    ['Resume on', s.resumeDate],
  ];
  function chooseAction(value: string) {
    setReason('');
    setConfirmation('');
    setError('');
    setAction(value);
  }
  async function lifecycle() {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/student-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: s.id,
          revision: record.revision,
          action,
          reason,
          confirmation,
        }),
      });
      const result = (await r.json()) as { error?: string };
      if (!r.ok)
        throw new Error(result.error || 'Could not update the student.');
      setAction('');
      await reload();
      if (action === 'delete') close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update student.');
    } finally {
      setBusy(false);
    }
  }
  if (role === 'TA')
    return <p>{t('Use your assigned class attendance page.')}</p>;
  return (
    <div className="detail-body">
      <div className="button-row">
        <ClassTag cl={classes.find((c) => c.id === s.classId)} />
        <Badge>{s.enrollmentStatus}</Badge>
        <Badge>{s.paymentStatus}</Badge>
      </div>
      <div className="detail-stats">
        <div>
          <span>{t('Sessions remaining')}</span>
          <strong>{s.sessions ?? t('Needs confirmation')}</strong>
          {s.overrun > 0 && (
            <small className="red-text">
              {s.overrun} {t('lessons beyond package')}
            </small>
          )}
        </div>
        <div>
          <span>{t('Known package balance due')}</span>
          <strong>
            {unknownBalance ? t('Not available') : money(s.due)}
            {!unknownBalance && <small> VND</small>}
          </strong>
          {allPackages.some((p) => p.agreedFee == null || p.sourcePending) && (
            <small>{t('Some source terms need confirmation')}</small>
          )}
        </div>
      </div>
      <div className="profile-actions">
        {role === 'Director' && (
          <Button
            variant="outline"
            disabled={s.enrollmentStatus === 'Archived'}
            onClick={() => open('student', record)}
          >
            {t('Edit profile')}
          </Button>
        )}
        {role === 'Director' && (
          <Button
            variant="outline"
            disabled={s.enrollmentStatus === 'Archived'}
            onClick={() => open('student', record, { transferDate: '' })}
          >
            {t('Transfer / pause')}
          </Button>
        )}
        <Button
          className="primary"
          disabled={s.enrollmentStatus === 'Archived'}
          onClick={() =>
            open('package', undefined, { studentId: s.id, classId: s.classId })
          }
        >
          {t('Add package / renewal')}
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            open('receipt', undefined, { studentId: s.id, name: s.name })
          }
        >
          {t('Record payment')}
        </Button>
      </div>
      <Tabs defaultValue="details">
        <TabsList className="profile-tabs">
          <TabsTrigger value="details">{t('Details')}</TabsTrigger>
          <TabsTrigger value="packages">{t('Packages')}</TabsTrigger>
          <TabsTrigger value="payments">{t('Payments')}</TabsTrigger>
          <TabsTrigger value="history">{t('Class history')}</TabsTrigger>
          <TabsTrigger value="lessons">{t('Makeup & support')}</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <dl className="profile-details">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt>{t(label)}</dt>
                <dd>{value || '—'}</dd>
              </div>
            ))}
          </dl>
          <section className="profile-note">
            <h3>{t('Learning goals')}</h3>
            <p>{s.learningGoals || t('No learning goals added.')}</p>
          </section>
          <section className="profile-note">
            <h3>{t('Notes')}</h3>
            <p>{s.notes || t('No notes added.')}</p>
          </section>
          {s.source && (
            <p className="source-note-text">
              {t('Original record:')} {s.source}
            </p>
          )}
        </TabsContent>
        <TabsContent value="packages">
          <p className="profile-help">
            {t(
              'Each card is one purchase. Session count identifies the package; months are the advertised package name, not an expiry date.',
            )}
          </p>
          {!allPackages.length && (
            <p>
              {t(
                'No agreed package is linked. Review the source before creating one.',
              )}
            </p>
          )}
          {allPackages.map((p) => {
            const computed = s.displayPackages.find((x: any) => x.id === p.id);
            return (
              <section className="detail-package" key={p.id}>
                <div className="button-row">
                  <strong
                    className={
                      'package-chip package-' + (p.sessions || 'unknown')
                    }
                  >
                    {packageTitle(p)}
                  </strong>
                  <Badge>
                    {p.imported ? 'Imported agreement' : 'New agreement'}
                  </Badge>
                </div>
                <dl>
                  <dt>{t('Start date')}</dt>
                  <dd>{p.startDate || t('Needs confirmation')}</dd>
                  <dt>{t('Sessions purchased')}</dt>
                  <dd>{p.sessions ?? t('Needs confirmation')}</dd>
                  <dt>{t('Actual agreed / source value')}</dt>
                  <dd>
                    {p.agreedFee == null
                      ? t('Needs confirmation')
                      : t('{p1} VND', { p1: money(p.agreedFee) })}
                  </dd>
                  <dt>{t('Recorded paid at review date')}</dt>
                  <dd>
                    {computed?.paid == null
                      ? t('Needs confirmation')
                      : t('{p1} VND', { p1: money(computed.paid) })}
                  </dd>
                  <dt>{t('Sessions left at review date')}</dt>
                  <dd>
                    {computed?.remaining ??
                      t('Not available for this review date')}
                  </dd>
                  <dt>{t('Payment due date')}</dt>
                  <dd>{p.dueDate || t('Not recorded')}</dd>
                </dl>
                {p.sourceNote && (
                  <p className="source-note-text">{p.sourceNote}</p>
                )}
                {p.notes && <p>{p.notes}</p>}
                {!p.imported && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      open(
                        'package',
                        records.find((r) => r.id === p.id),
                      )
                    }
                  >
                    {t('Edit agreement')}
                  </Button>
                )}
                {p.imported && (
                  <p className="profile-help">
                    {t(
                      'Imported terms are preserved. A renewal is a new package, not an edit to this history.',
                    )}
                  </p>
                )}
              </section>
            );
          })}
        </TabsContent>
        <TabsContent value="payments">
          <p className="profile-help">
            {t(
              "All recorded dates. Student cash collected is separate from allocation to a package. Family receipts include only this student's confirmed share.",
            )}
          </p>
          <DataTable
            headings={[
              'Date',
              'Receipt total (VND)',
              'Student share (VND)',
              'Purpose',
              'Package match',
            ]}
            rows={payments
              .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
              .map((r) => [
                r.date || t('Date not recorded'),
                money(r.amount),
                money(studentReceiptShare(r, s.id)),
                t(r.purpose || 'Tuition'),
                allocations(r).some((a: any) => a.studentId === s.id)
                  ? t('Package linked')
                  : t('Student identified · package not matched'),
              ])}
          />
        </TabsContent>
        <TabsContent value="lessons">
          <p className="profile-help">
            {t(
              'The same linked records shown in Attendance. Historical records do not deduct sessions again; free support never uses package sessions.',
            )}
          </p>
          <DataTable
            headings={['Date', 'Type', 'Class', 'Details', 'Status']}
            rows={lessons.map((r) => [
              r.date || t('Not recorded'),
              r.kind === 'makeup' ? t('Makeup') : t('Free support'),
              <LessonClass lesson={r} classes={classes} />,
              <div className="long-cell">
                {r.notes || '—'}
                {r.evaluation && <small>{r.evaluation}</small>}
                <small>{r.source}</small>
              </div>,
              <Badge>{r.historical ? 'Original record' : r.status}</Badge>,
            ])}
          />
        </TabsContent>
        <TabsContent value="history">
          <h3>{t('Classes and transfers')}</h3>
          <DataTable
            headings={['Class', 'From', 'Until', 'Timetable']}
            rows={memberships.map((m) => [
              <ClassTag
                key={m.id}
                cl={classes.find((c) => c.id === m.classId)}
              />,
              m.from || t('Imported history'),
              m.until ||
                (m.forecast === false ? t('Historical roster') : t('Current')),
              t(m.schedule || 'Regular'),
            ])}
          />
          <h3>{t('Recent attendance')}</h3>
          <DataTable
            headings={['Date', 'Class', 'Attendance']}
            rows={attendance.slice(0, 50).map((a) => [
              a.date,
              <ClassTag
                key={a.id}
                cl={classes.find((c) => c.id === a.classId)}
              />,
              t(
                (
                  {
                    C: 'Present',
                    P: 'Present',
                    M: 'Late',
                    T: 'Late',
                    L: 'Historical excused absence',
                    K: 'Historical absence',
                    A: 'Absent',
                    N: 'Not scheduled',
                  } as Record<string, string>
                )[a.mark] || a.mark,
              ),
            ])}
          />
          {attendance.length > 50 && (
            <p className="profile-help">
              {t(
                'Showing the latest 50 lessons. All lessons remain in class attendance.',
              )}
            </p>
          )}
        </TabsContent>
      </Tabs>
      {role === 'Director' && (
        <section className="profile-lifecycle">
          <h3>{t('Manage student record')}</h3>
          <p>
            {t(
              'Archive removes a student from current lists and future renewal follow-up. Attendance, packages and receipts stay available.',
            )}
          </p>
          <div className="button-row">
            {s.enrollmentStatus === 'Archived' ? (
              <Button variant="outline" onClick={() => chooseAction('restore')}>
                {t('Restore student')}
              </Button>
            ) : (
              <Button variant="outline" onClick={() => chooseAction('archive')}>
                {t('Archive student')}
              </Button>
            )}
            <Button
              variant="destructive"
              disabled={!canDelete}
              onClick={() => chooseAction('delete')}
            >
              {t('Delete permanently')}
            </Button>
          </div>
          {!canDelete && (
            <p className="profile-help">
              {t('Permanent deletion is unavailable:')}{' '}
              {imported
                ? t('this student comes from an original source workbook')
                : t('{p1} linked records exist', { p1: dependencies.length })}
              {t('. Archive the student to preserve your records.')}
            </p>
          )}
        </section>
      )}
      <AlertDialog
        open={!!action}
        onOpenChange={(o) => !o && !busy && setAction('')}
      >
        <AlertDialogContent className="student-action-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {action === 'delete'
                ? t('Permanently delete')
                : action === 'restore'
                  ? t('Restore')
                  : t('Archive')}{' '}
              {s.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {action === 'delete'
                ? t(
                    'This unused student and its empty roster entries will be deleted permanently. An audit entry is retained.',
                  )
                : action === 'restore'
                  ? t(
                      'The previous enrollment status will be restored. Existing history and balances will stay unchanged.',
                    )
                  : t(
                      'This is reversible. Financial and attendance history will not be deleted.',
                    )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label htmlFor="student-action-reason">{t('Reason')}</label>
          <input
            id="student-action-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
          {action === 'delete' && (
            <>
              <label htmlFor="student-action-confirmation">
                {t('Type the student’s full name to confirm')}
              </label>
              <input
                id="student-action-confirmation"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </>
          )}
          {error && (
            <p role="alert" className="error-message">
              {message(error)}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant={action === 'delete' ? 'destructive' : 'default'}
              disabled={
                busy ||
                !reason.trim() ||
                (action === 'delete' && confirmation !== s.name)
              }
              onClick={lifecycle}
            >
              {busy
                ? t('Saving…')
                : t(
                    action === 'delete'
                      ? 'Confirm deletion'
                      : action === 'restore'
                        ? 'Confirm restore'
                        : 'Confirm archive',
                  )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
