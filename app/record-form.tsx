'use client';
import { Fragment, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Choice, Picker } from './ui';
import { entries, today, money } from '@/lib/domain';
import { priceList, type DataRecord } from '@/lib/types';
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
type Field = {
  key: string;
  label: string;
  type?: string;
  options?: string[];
  required?: boolean;
};
const fields: Record<string, Field[]> = {
  receipt: [
    {
      key: 'date',
      label: 'Payment date / Ngày thu',
      type: 'date',
      required: true,
    },
    { key: 'name', label: 'Payer / Người nộp', required: true },
    { key: 'studentId', label: 'Student / Học viên', type: 'student' },
    {
      key: 'packageId',
      label: 'Package receiving this payment',
      type: 'package',
    },
    {
      key: 'purpose',
      label: 'Purpose',
      type: 'select',
      options: ['Tuition', 'Deposit', 'Books', 'Other income'],
    },
    {
      key: 'amount',
      label: 'Amount received / Số tiền (VND)',
      type: 'number',
      required: true,
    },
    { key: 'account', label: 'Receiving account', required: true },
    { key: 'reference', label: 'Bank reference / Ghi chú' },
    { key: 'description', label: 'Description' },
    {
      key: 'reconciled',
      label: 'Matched to bank statement / cash record',
      type: 'checkbox',
    },
  ],
  expense: [
    {
      key: 'date',
      label: 'Payment date / Ngày chi',
      type: 'date',
      required: true,
    },
    {
      key: 'category',
      label: 'Category / Nhóm',
      type: 'select',
      options: [
        'Payroll',
        'Rent',
        'Utilities',
        'Teaching',
        'Books',
        'Marketing',
        'Insurance',
        'Bank fees',
        'Office',
        'Other',
      ],
    },
    { key: 'description', label: 'Description / Nội dung', required: true },
    {
      key: 'amount',
      label: 'Amount paid / Số tiền (VND)',
      type: 'number',
      required: true,
    },
    { key: 'account', label: 'Paying account', required: true },
    { key: 'reference', label: 'Invoice / reference' },
    {
      key: 'reconciled',
      label: 'Matched to bank statement / cash record',
      type: 'checkbox',
    },
  ],
  student: [
    { key: 'name', label: 'Student name / Họ tên', required: true },
    { key: 'preferredName', label: 'English / preferred name' },
    { key: 'birthDate', label: 'Date of birth / Ngày sinh', type: 'date' },
    { key: 'school', label: 'School / Trường học' },
    {
      key: 'classId',
      label: 'Home class / Lớp chính',
      type: 'class',
      required: true,
    },
    {
      key: 'status',
      label: 'Status / Trạng thái',
      type: 'select',
      options: [
        'Active',
        'Paused',
        'Stopped',
        'Roster only',
        'Free',
        'Ends without renewal',
      ],
    },
    { key: 'parent', label: 'Parent / Phụ huynh' },
    { key: 'phone', label: 'Phone / Điện thoại' },
    { key: 'parentEmail', label: 'Parent email', type: 'email' },
    { key: 'zalo', label: 'Zalo contact' },
    { key: 'secondParent', label: 'Second / emergency contact' },
    { key: 'secondPhone', label: 'Second contact phone', type: 'tel' },
    { key: 'address', label: 'Address / Địa chỉ' },
    {
      key: 'enrollmentDate',
      label: 'Enrollment date / Ngày nhập học',
      type: 'date',
    },
    { key: 'pauseFrom', label: 'Pause from', type: 'date' },
    { key: 'resumeDate', label: 'Resume on', type: 'date' },
    {
      key: 'learningGoals',
      label: 'Learning goals / Mục tiêu học tập',
      type: 'textarea',
    },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  package: [
    {
      key: 'studentId',
      label: 'Student / Học viên',
      type: 'student',
      required: true,
    },
    { key: 'sessions', label: 'Package / Gói học', type: 'price' },
    {
      key: 'startDate',
      label: 'Start date / Bắt đầu',
      type: 'date',
      required: true,
    },
    {
      key: 'agreedFee',
      label: 'Actual agreed fee after discount (VND)',
      type: 'number',
      required: true,
    },
    { key: 'dueDate', label: 'Payment due date / Hạn đóng', type: 'date' },
    {
      key: 'scope',
      label: 'Sessions apply to',
      type: 'select',
      options: ['all', 'class'],
    },
    {
      key: 'classId',
      label: 'Class (for class-specific packages)',
      type: 'class',
    },
    { key: 'notes', label: 'Agreement notes', type: 'textarea' },
  ],
  makeup: [
    {
      key: 'studentId',
      label: 'Student / Học viên',
      type: 'student',
      required: true,
    },
    {
      key: 'absenceId',
      label: 'Original absence / Buổi nghỉ',
      type: 'absence',
      required: true,
    },
    {
      key: 'date',
      label: 'Makeup date / Ngày bù',
      type: 'date',
      required: true,
    },
    { key: 'makeupClass', label: 'Makeup class or location' },
    { key: 'teacher', label: 'Teacher / Giáo viên' },
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: ['Planned', 'Completed', 'Cancelled'],
    },
    { key: 'notes', label: 'Lesson content', type: 'textarea' },
  ],
  support: [
    {
      key: 'studentId',
      label: 'Student / Học viên',
      type: 'student',
      required: true,
    },
    { key: 'classId', label: 'Class / Lớp', type: 'class', required: true },
    {
      key: 'date',
      label: 'Support date / Ngày học',
      type: 'date',
      required: true,
    },
    { key: 'teacher', label: 'Teacher / Giáo viên' },
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: ['Planned', 'Completed', 'Cancelled'],
    },
    {
      key: 'notes',
      label: 'Lesson content / Nội dung',
      type: 'textarea',
      required: true,
    },
    {
      key: 'evaluation',
      label: 'Student feedback / Đánh giá',
      type: 'textarea',
    },
  ],
  lead: [
    { key: 'name', label: 'Student / Lead name', required: true },
    { key: 'parent', label: 'Parent' },
    { key: 'phone', label: 'Phone' },
    { key: 'classId', label: 'Interested class', type: 'class' },
    {
      key: 'status',
      label: 'Stage',
      type: 'select',
      options: [
        'New',
        'Contacted',
        'Trial booked',
        'Trial completed',
        'Enrolled',
        'Not proceeding',
      ],
    },
    { key: 'followUp', label: 'Follow up on', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  membership: [
    { key: 'studentId', label: 'Student', type: 'student', required: true },
    { key: 'classId', label: 'Class', type: 'class', required: true },
    { key: 'from', label: 'First lesson date', type: 'date', required: true },
    {
      key: 'until',
      label: 'Last lesson date (leave blank if continuing)',
      type: 'date',
    },
    {
      key: 'schedule',
      label: 'Timetable',
      type: 'select',
      options: ['Regular', 'Saturday'],
    },
  ],
  calendar: [
    { key: 'classId', label: 'Class', type: 'class', required: true },
    {
      key: 'date',
      label: 'Lesson / holiday date',
      type: 'date',
      required: true,
    },
    { key: 'open', label: 'Class takes place on this date', type: 'checkbox' },
    { key: 'reason', label: 'Holiday or timetable note', required: true },
  ],
  commitment: [
    { key: 'description', label: 'Recurring expense', required: true },
    { key: 'category', label: 'Category' },
    {
      key: 'amount',
      label: 'Expected amount (VND)',
      type: 'number',
      required: true,
    },
    {
      key: 'frequency',
      label: 'Frequency',
      type: 'select',
      options: ['Monthly', 'Quarterly', 'Annually', 'Other'],
    },
    { key: 'account', label: 'Account' },
    { key: 'dueDate', label: 'Next due date', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  reconciliation: [
    { key: 'account', label: 'Account', required: true },
    {
      key: 'opening',
      label: 'Opening statement balance (VND)',
      type: 'number',
      required: true,
    },
    {
      key: 'statementClosing',
      label: 'Closing statement balance (VND)',
      type: 'number',
      required: true,
    },
    { key: 'notes', label: 'Statement reference', type: 'textarea' },
  ],
  close: [
    {
      key: 'status',
      label: 'Month status',
      type: 'select',
      options: ['Closed', 'Open'],
    },
    {
      key: 'notes',
      label: 'Close or reopen notes',
      type: 'textarea',
      required: true,
    },
  ],
  payroll: [
    { key: 'month', label: 'Salary month', type: 'month', required: true },
    { key: 'name', label: 'Staff name', required: true },
    { key: 'position', label: 'Position' },
    {
      key: 'gross',
      label: 'Gross salary (VND)',
      type: 'number',
      required: true,
    },
    {
      key: 'deductions',
      label: 'Approved tax and deductions (VND)',
      type: 'number',
      required: true,
    },
    {
      key: 'employerInsurance',
      label: 'Employer insurance (VND)',
      type: 'number',
    },
    {
      key: 'status',
      label: 'Review status',
      type: 'select',
      options: ['Draft', 'Approved', 'Needs confirmation'],
    },
    { key: 'notes', label: 'Payroll notes', type: 'textarea' },
  ],
  task: [
    { key: 'title', label: 'Task', required: true },
    { key: 'date', label: 'Work date', type: 'date' },
    { key: 'dueDate', label: 'Due date', type: 'date' },
    {
      key: 'category',
      label: 'Category',
      type: 'select',
      options: [
        'Payroll',
        'Bank',
        'Student invoices',
        'Tax filing',
        'Contracts',
        'Admin',
        'Work log',
      ],
    },
    { key: 'assignedTo', label: 'Responsible person' },
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: ['To do', 'In progress', 'Done', 'Logged in source'],
    },
    { key: 'notes', label: 'Details', type: 'textarea' },
  ],
  staff: [
    { key: 'name', label: 'Staff name', required: true },
    { key: 'email', label: 'Sign-in email', type: 'email', required: true },
    {
      key: 'role',
      label: 'Role',
      type: 'select',
      options: ['TA', 'Finance', 'Director'],
    },
    { key: 'active', label: 'Access enabled', type: 'checkbox' },
  ],
};
const titles: Record<string, string> = {
  receipt: 'Record payment',
  expense: 'Record expense',
  student: 'Student profile',
  package: 'Student package',
  makeup: 'Makeup lesson / Học bù',
  support: 'Free support / Học bổ trợ',
  lead: 'Lead',
  membership: 'Class membership',
  calendar: 'Class calendar',
  commitment: 'Recurring expense',
  reconciliation: 'Reconcile account',
  close: 'Monthly close',
  staff: 'Staff access',
  payroll: 'Payroll / Bảng lương',
  task: 'Accountant task',
};
export default function RecordForm({
  kind,
  record,
  defaults = {},
  records,
  onClose,
  onSaved,
}: {
  kind: string;
  record?: any;
  defaults?: any;
  records: DataRecord[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<any>(() => ({
    date: today(),
    startDate: today(),
    from: today(),
    scope: 'all',
    purpose: 'Tuition',
    account: 'Company BIDV',
    deductions: 0,
    employerInsurance: 0,
    status:
      kind === 'task'
        ? 'To do'
        : kind === 'payroll'
          ? 'Draft'
          : kind === 'student'
            ? 'Active'
            : kind === 'lead'
              ? 'New'
              : kind === 'close'
                ? 'Closed'
                : 'Planned',
    schedule: 'Regular',
    role: 'TA',
    active: true,
    open: false,
    allocations: [],
    classIds: [],
    ...(record?.payload ?? record ?? {}),
    ...defaults,
  }));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [reason, setReason] = useState('');
  const initial = useRef(JSON.stringify(data));
  const [discard, setDiscard] = useState(false);
  function requestClose() {
    if (busy) return;
    if (JSON.stringify(data) !== initial.current || reason) setDiscard(true);
    else onClose();
  }
  const students = entries(records, 'student'),
    classes = entries(records, 'class').filter((c) => !c.archived),
    packages = entries(records, 'package');
  const set = (key: string, v: any) =>
    setData((d: any) => ({
      ...d,
      [key]: v,
      ...(key === 'studentId'
        ? {
            packageId: '',
            name: d.name || students.find((s) => s.id === v)?.name,
          }
        : {}),
    }));
  const split = !!data.allocations?.length;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const p = { ...data };
      const missing = (fields[kind] || []).find(
        (f) => f.required && (p[f.key] === '' || p[f.key] == null),
      );
      if (missing) {
        document.getElementById('field-' + missing.key)?.focus();
        throw new Error('Please complete ' + missing.label + '.');
      }
      if (kind === 'package') {
        p.label = p.label || p.sessions + ' sessions';
        p.sessions = Number(p.sessions);
      }
      const r = await fetch(kind === 'staff' ? '/api/staff' : '/api/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          kind === 'staff'
            ? p
            : {
                kind,
                id: record?.id,
                revision: record?.revision,
                payload: p,
                reason,
              },
        ),
      });
      const j: any = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Unable to save.');
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save.');
    } finally {
      setBusy(false);
    }
  }
  function control(f: Field) {
    const v = data[f.key] ?? '';
    if (f.type === 'checkbox')
      return (
        <div className="checkbox-field">
          <Checkbox
            id={'field-' + f.key}
            checked={!!v}
            onCheckedChange={(v) => set(f.key, !!v)}
          />
          <label htmlFor={'field-' + f.key}>{f.label}</label>
        </div>
      );
    if (f.type === 'student')
      return (
        <Picker
          id={'field-' + f.key}
          label={f.label}
          value={v}
          onChange={(v) => set(f.key, v)}
          options={students.map((s) => ({
            id: s.id,
            label:
              s.name +
              ' · ' +
              (classes
                .find((c) => c.id === s.classId)
                ?.name.replace('BOH ', '') ?? s.id),
          }))}
        />
      );
    if (f.type === 'class')
      return (
        <Choice
          id={'field-' + f.key}
          label={f.label}
          value={v}
          onChange={(v) => set(f.key, v)}
          options={[
            { value: '', label: 'Select class' },
            ...classes.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      );
    if (f.type === 'package')
      return (
        <Picker
          id={'field-' + f.key}
          label="Select an agreed package"
          value={v}
          onChange={(v) => set(f.key, v)}
          options={packages
            .filter((p) => !data.studentId || p.studentId === data.studentId)
            .map((p) => ({
              id: p.id,
              label:
                (students.find((s) => s.id === p.studentId)?.name ??
                  'Student') +
                ' · ' +
                p.label +
                ' · ' +
                (p.startDate ?? ''),
            }))}
        />
      );
    if (f.type === 'absence') {
      const abs = entries(records, 'attendance').filter(
        (a) =>
          a.studentId === data.studentId && ['A', 'L', 'K'].includes(a.mark),
      );
      return (
        <Picker
          id={'field-' + f.key}
          label="Choose the missed lesson"
          value={v}
          onChange={(v) => {
            const a = abs.find((a) => a.id === v);
            setData((d: any) => ({
              ...d,
              absenceId: v,
              classId: a?.classId,
              missedDate: a?.date,
            }));
          }}
          options={abs.map((a) => ({
            id: a.id,
            label:
              a.date +
              ' · ' +
              (classes.find((c) => c.id === a.classId)?.name ?? '') +
              (a.historical ? ' · original record' : ''),
          }))}
        />
      );
    }
    if (f.type === 'price')
      return (
        <Choice
          id={'field-' + f.key}
          label="Select session package"
          value={String(v)}
          onChange={(v) => {
            const p = priceList.find((p) => p.sessions === Number(v));
            setData((d: any) => ({
              ...d,
              sessions: Number(v),
              label: v + ' sessions',
              agreedFee: p?.price ?? d.agreedFee,
            }));
          }}
          options={[
            ...priceList.map((p) => ({
              value: String(p.sessions),
              label: p.sessions + ' sessions · ' + money(p.price) + ' VND',
            })),
            ...(v && !priceList.some((p) => p.sessions === Number(v))
              ? [
                  {
                    value: String(v),
                    label: v + ' sessions · custom agreement',
                  },
                ]
              : []),
          ]}
        />
      );
    if (f.type === 'select')
      return (
        <Choice
          id={'field-' + f.key}
          label={f.label}
          value={v}
          onChange={(v) => set(f.key, v)}
          options={(f.options ?? []).map((v) => ({
            value: v,
            label:
              v === 'all'
                ? 'All classes'
                : v === 'class'
                  ? 'This class only'
                  : v,
          }))}
        />
      );
    if (f.type === 'textarea')
      return (
        <textarea
          id={'field-' + f.key}
          rows={3}
          value={v}
          onChange={(e) => set(f.key, e.target.value)}
          required={f.required}
        />
      );
    return (
      <input
        id={'field-' + f.key}
        type={f.type ?? 'text'}
        value={v}
        onChange={(e) =>
          set(
            f.key,
            f.type === 'number' && e.target.value !== ''
              ? Number(e.target.value)
              : e.target.value,
          )
        }
        required={f.required}
        step={f.type === 'number' ? '1' : undefined}
      />
    );
  }
  return (
    <>
      <Dialog open onOpenChange={(open) => !open && requestClose()}>
        <DialogContent className="record-dialog">
          <DialogHeader>
            <DialogTitle>
              {record ? 'Edit ' : ''}
              {titles[kind] ?? kind}
            </DialogTitle>
            <DialogDescription>
              {kind === 'package'
                ? 'Create a new record for each renewal. The agreed fee is the actual discounted amount.'
                : kind === 'staff'
                  ? 'Roles are enforced on the server. Staff also need permission to open the private site.'
                  : kind === 'support'
                    ? 'Free support does not use package sessions.'
                    : kind === 'makeup'
                      ? 'Link the original absence once. Historical records remain unchanged.'
                      : 'Required fields must be completed before saving.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit}>
            <div className="form-grid">
              {(fields[kind] ?? []).map((f) => (
                <Fragment key={f.key}>
                  {kind === 'student' &&
                    (
                      {
                        name: 'Student details',
                        classId: 'Enrollment',
                        parent: 'Parent & contact details',
                        enrollmentDate: 'Dates & study breaks',
                        learningGoals: 'Learning & notes',
                      } as Record<string, string>
                    )[f.key] && (
                      <h3 className="student-form-section">
                        {
                          (
                            {
                              name: 'Student details',
                              classId: 'Enrollment',
                              parent: 'Parent & contact details',
                              enrollmentDate: 'Dates & study breaks',
                              learningGoals: 'Learning & notes',
                            } as Record<string, string>
                          )[f.key]
                        }
                      </h3>
                    )}
                  <div
                    className={
                      (f.type === 'textarea' ? 'wide ' : '') + 'form-field'
                    }
                    key={f.key}
                  >
                    {f.type !== 'checkbox' && (
                      <label htmlFor={'field-' + f.key}>
                        {f.label}
                        {f.required ? ' *' : ''}
                      </label>
                    )}
                    {control(f)}
                  </div>
                </Fragment>
              ))}
              {kind === 'student' &&
                record &&
                data.classId !== record.payload?.classId && (
                  <div className="wide form-field">
                    <label htmlFor="transfer-date">
                      Transfer takes effect on
                    </label>
                    <input
                      id="transfer-date"
                      type="date"
                      required
                      value={data.transferDate ?? today()}
                      onChange={(e) => set('transferDate', e.target.value)}
                    />
                    <p className="field-help">
                      The old class history is retained. The new membership
                      starts on this date.
                    </p>
                  </div>
                )}
              {kind === 'package' && (
                <div className="wide discount-tools">
                  <span>Apply to the listed price:</span>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const p = priceList.find(
                        (p) => p.sessions === Number(data.sessions),
                      );
                      if (p) set('agreedFee', Math.round(p.price * 0.95));
                    }}
                  >
                    5% group discount
                  </Button>
                  <span>Or enter any agreed fee above.</span>
                </div>
              )}
              {kind === 'receipt' && (
                <div className="wide">
                  <div className="checkbox-field">
                    <Checkbox
                      id="split-receipt"
                      checked={split}
                      onCheckedChange={(v) =>
                        set(
                          'allocations',
                          v
                            ? [{ packageId: '', studentId: '', amount: 0 }]
                            : [],
                        )
                      }
                    />
                    <label htmlFor="split-receipt">
                      Split a family payment across packages
                    </label>
                  </div>
                  {split && (
                    <div className="split-rows">
                      {data.allocations.map((a: any, i: number) => (
                        <div className="split-row" key={i}>
                          <Picker
                            label="Package"
                            value={a.packageId}
                            onChange={(v) => {
                              const arr = [...data.allocations];
                              arr[i] = {
                                ...arr[i],
                                packageId: v,
                                studentId: packages.find((p) => p.id === v)
                                  ?.studentId,
                              };
                              set('allocations', arr);
                            }}
                            options={packages.map((p) => ({
                              id: p.id,
                              label:
                                (students.find((s) => s.id === p.studentId)
                                  ?.name ?? '') +
                                ' · ' +
                                p.label,
                            }))}
                          />
                          <input
                            aria-label={'Allocation ' + (i + 1) + ' amount'}
                            type="number"
                            value={a.amount}
                            min="1"
                            onChange={(e) => {
                              const arr = [...data.allocations];
                              arr[i] = { ...a, amount: Number(e.target.value) };
                              set('allocations', arr);
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              set(
                                'allocations',
                                data.allocations.filter(
                                  (_: any, j: number) => j !== i,
                                ),
                              )
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          set('allocations', [
                            ...data.allocations,
                            { packageId: '', studentId: '', amount: 0 },
                          ])
                        }
                      >
                        Add another student
                      </Button>
                      <p className="field-help">
                        Allocated{' '}
                        {money(
                          data.allocations.reduce(
                            (n: number, a: any) => n + Number(a.amount || 0),
                            0,
                          ),
                        )}{' '}
                        of {money(Number(data.amount || 0))} VND. These must
                        match.
                      </p>
                    </div>
                  )}
                </div>
              )}
              {kind === 'staff' && data.role === 'TA' && (
                <div className="wide">
                  <label>Assigned classes</label>
                  <div className="class-checks">
                    {classes.map((c) => (
                      <div className="checkbox-field" key={c.id}>
                        <Checkbox
                          id={'assign-' + c.id}
                          checked={data.classIds?.includes(c.id)}
                          onCheckedChange={(v) =>
                            set(
                              'classIds',
                              v
                                ? [...data.classIds, c.id]
                                : data.classIds.filter(
                                    (id: string) => id !== c.id,
                                  ),
                            )
                          }
                        />
                        <label htmlFor={'assign-' + c.id}>{c.name}</label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {record?.payload?.imported &&
                ['receipt', 'expense'].includes(kind) && (
                  <div className="wide form-field">
                    <label htmlFor="correction-reason">
                      Reason if correcting the original amount
                    </label>
                    <input
                      id="correction-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>
                )}
            </div>
            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={requestClose}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" className="primary" disabled={busy}>
                {busy
                  ? 'Saving…'
                  : 'Save ' + (kind === 'staff' ? 'access' : 'record')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={discard} onOpenChange={setDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your changes have not been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onClose}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
