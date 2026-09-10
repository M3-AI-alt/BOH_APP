'use client';
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
import { Badge, ClassTag, DataTable } from './ui';
import {
  allocations,
  entries,
  money,
  packageTitle,
  studentDeletionBlockers,
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
  reload: () => void;
  close: () => void;
}) {
  const [action, setAction] = useState('');
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const record = records.find((r) => r.kind === 'student' && r.id === s.id)!;
  const classes = entries(records, 'class');
  const historyIds = new Set([
    s.id,
    ...entries(records, 'student')
      .filter((x) => x.canonicalStudentId === s.id)
      .map((x) => x.id),
  ]);
  const memberships = entries(records, 'membership').filter((m) =>
    historyIds.has(m.studentId),
  );
  const allPackages = entries(records, 'package').filter(
    (p) => p.studentId === s.id,
  );
  const payments = entries(records, 'receipt').filter(
    (r) =>
      r.studentId === s.id ||
      allocations(r).some((a: any) => a.studentId === s.id),
  );
  const attendance = entries(records, 'attendance')
    .filter((a) => historyIds.has(a.studentId))
    .sort((a, b) => b.date.localeCompare(a.date));
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
    ['Enrolled', s.enrollmentDate],
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
      reload();
      if (action === 'delete') close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update student.');
    } finally {
      setBusy(false);
    }
  }
  if (role === 'TA') return <p>Use your assigned class attendance page.</p>;
  return (
    <div className="detail-body">
      <div className="button-row">
        <ClassTag cl={classes.find((c) => c.id === s.classId)} />
        <Badge>{s.enrollmentStatus}</Badge>
        <Badge>{s.paymentStatus}</Badge>
      </div>
      <div className="detail-stats">
        <div>
          <span>Sessions remaining</span>
          <strong>{s.sessions ?? 'Needs confirmation'}</strong>
          {s.overrun > 0 && (
            <small className="red-text">
              {s.overrun} lessons beyond package
            </small>
          )}
        </div>
        <div>
          <span>Known package balance due</span>
          <strong>
            {money(s.due)}
            <small> VND</small>
          </strong>
          {allPackages.some((p) => p.agreedFee == null || p.sourcePending) && (
            <small>Some source terms need confirmation</small>
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
            Edit profile
          </Button>
        )}
        {role === 'Director' && (
          <Button
            variant="outline"
            disabled={s.enrollmentStatus === 'Archived'}
            onClick={() => open('student', record, { transferDate: '' })}
          >
            Transfer / pause
          </Button>
        )}
        <Button
          className="primary"
          disabled={s.enrollmentStatus === 'Archived'}
          onClick={() =>
            open('package', undefined, { studentId: s.id, classId: s.classId })
          }
        >
          Add package / renewal
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            open('receipt', undefined, { studentId: s.id, name: s.name })
          }
        >
          Record payment
        </Button>
      </div>
      <Tabs defaultValue="details">
        <TabsList className="profile-tabs">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="packages">Packages</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="history">Class history</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <dl className="profile-details">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || '—'}</dd>
              </div>
            ))}
          </dl>
          <section className="profile-note">
            <h3>Learning goals</h3>
            <p>{s.learningGoals || 'No learning goals added.'}</p>
          </section>
          <section className="profile-note">
            <h3>Notes</h3>
            <p>{s.notes || 'No notes added.'}</p>
          </section>
          {s.source && (
            <p className="source-note-text">Original record: {s.source}</p>
          )}
        </TabsContent>
        <TabsContent value="packages">
          <p className="profile-help">
            Each card is one purchase. Session count identifies the package;
            months are the advertised package name, not an expiry date.
          </p>
          {!allPackages.length && (
            <p>
              No agreed package is linked. Review the source before creating
              one.
            </p>
          )}
          {allPackages.map((p) => {
            const computed = s.packages.find((x: any) => x.id === p.id);
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
                  <dt>Start date</dt>
                  <dd>{p.startDate || 'Needs confirmation'}</dd>
                  <dt>Sessions purchased</dt>
                  <dd>{p.sessions ?? 'Needs confirmation'}</dd>
                  <dt>Actual agreed / source value</dt>
                  <dd>
                    {p.agreedFee == null
                      ? 'Needs confirmation'
                      : `${money(p.agreedFee)} VND`}
                  </dd>
                  <dt>Recorded paid at review date</dt>
                  <dd>
                    {computed?.paid == null
                      ? 'Needs confirmation'
                      : `${money(computed.paid)} VND`}
                  </dd>
                  <dt>Sessions left at review date</dt>
                  <dd>
                    {computed?.remaining ??
                      'Not available for this review date'}
                  </dd>
                  <dt>Payment due date</dt>
                  <dd>{p.dueDate || 'Not recorded'}</dd>
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
                    Edit agreement
                  </Button>
                )}
                {p.imported && (
                  <p className="profile-help">
                    Imported terms are preserved. A renewal is a new package,
                    not an edit to this history.
                  </p>
                )}
              </section>
            );
          })}
        </TabsContent>
        <TabsContent value="payments">
          <p className="profile-help">
            Family receipts appear once here. Only the allocated share belongs
            to this student.
          </p>
          <DataTable
            headings={[
              'Date',
              'Receipt total (VND)',
              'Allocated to student (VND)',
              'Purpose',
            ]}
            rows={payments
              .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
              .map((r) => [
                r.date || 'Date not recorded',
                money(r.amount),
                allocations(r).length
                  ? money(
                      allocations(r)
                        .filter((a: any) => a.studentId === s.id)
                        .reduce((sum: number, a: any) => sum + a.amount, 0),
                    )
                  : 'Not allocated',
                r.purpose || 'Tuition',
              ])}
          />
        </TabsContent>
        <TabsContent value="history">
          <h3>Classes and transfers</h3>
          <DataTable
            headings={['Class', 'From', 'Until', 'Timetable']}
            rows={memberships.map((m) => [
              <ClassTag
                key={m.id}
                cl={classes.find((c) => c.id === m.classId)}
              />,
              m.from || 'Imported history',
              m.until ||
                (m.forecast === false ? 'Historical roster' : 'Current'),
              m.schedule || 'Regular',
            ])}
          />
          <h3>Recent attendance</h3>
          <DataTable
            headings={['Date', 'Class', 'Attendance']}
            rows={attendance.slice(0, 50).map((a) => [
              a.date,
              <ClassTag
                key={a.id}
                cl={classes.find((c) => c.id === a.classId)}
              />,
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
            ])}
          />
          {attendance.length > 50 && (
            <p className="profile-help">
              Showing the latest 50 lessons. All lessons remain in class
              attendance.
            </p>
          )}
        </TabsContent>
      </Tabs>
      {role === 'Director' && (
        <section className="profile-lifecycle">
          <h3>Manage student record</h3>
          <p>
            Archive removes a student from current lists and future renewal
            follow-up. Attendance, packages and receipts stay available.
          </p>
          <div className="button-row">
            {s.enrollmentStatus === 'Archived' ? (
              <Button variant="outline" onClick={() => chooseAction('restore')}>
                Restore student
              </Button>
            ) : (
              <Button variant="outline" onClick={() => chooseAction('archive')}>
                Archive student
              </Button>
            )}
            <Button
              variant="destructive"
              disabled={!canDelete}
              onClick={() => chooseAction('delete')}
            >
              Delete permanently
            </Button>
          </div>
          {!canDelete && (
            <p className="profile-help">
              Permanent deletion is unavailable:{' '}
              {imported
                ? 'this student comes from an original source workbook'
                : `${dependencies.length} linked records exist`}
              . Archive the student to preserve your records.
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
                ? 'Permanently delete'
                : action === 'restore'
                  ? 'Restore'
                  : 'Archive'}{' '}
              {s.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {action === 'delete'
                ? 'This unused student and its empty roster entries will be deleted permanently. An audit entry is retained.'
                : action === 'restore'
                  ? 'The previous enrollment status will be restored. Existing history and balances will stay unchanged.'
                  : 'This is reversible. Financial and attendance history will not be deleted.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label htmlFor="student-action-reason">Reason</label>
          <input
            id="student-action-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
          {action === 'delete' && (
            <>
              <label htmlFor="student-action-confirmation">
                Type the student’s full name to confirm
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
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={action === 'delete' ? 'destructive' : 'default'}
              disabled={
                busy ||
                !reason.trim() ||
                (action === 'delete' && confirmation !== s.name)
              }
              onClick={lifecycle}
            >
              {busy ? 'Saving…' : 'Confirm ' + action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
