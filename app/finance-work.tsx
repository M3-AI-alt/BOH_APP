'use client';
import { useLanguage } from '@/app/language';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Panel, DataTable, Badge, Choice } from './ui';
import { entries, cleanSearch, today } from '@/lib/domain';
import type { ViewProps } from './views';
export function Payroll(p: ViewProps) {
  const { t, money } = useLanguage();
  const rows = entries(p.snapshot.records, 'payroll').filter(
      (r) =>
        r.month === p.month &&
        cleanSearch(r.name).includes(cleanSearch(p.search)),
    ),
    expenses = entries(p.snapshot.records, 'expense');
  return (
    <Panel
      title={t('Payroll / Bảng lương')}
      subtitle={t(
        'Approved salary calculations are separate from actual cash payments. Tax and insurance amounts are entered and confirmed by your accountant.',
      )}
      action={
        <Button
          variant="outline"
          onClick={() => p.open('payroll', undefined, { month: p.month })}
        >
          {t('Add payroll entry')}
        </Button>
      }
    >
      <DataTable
        headings={[
          'Staff member',
          'Gross',
          'Deductions',
          'Net salary',
          'Employer insurance',
          'Source payment',
          'Linked cash paid',
          'Review / actions',
        ]}
        rows={rows.map((r) => {
          const paid = expenses
            .filter((e) => e.payrollId === r.id && e.date <= p.reviewDate)
            .reduce((n, e) => n + Number(e.amount || 0), 0);
          return [
            <strong>
              {r.name}
              <small>{r.position}</small>
            </strong>,
            money(r.gross),
            money(r.deductions),
            money(r.net),
            money(r.employerInsurance),
            r.imported ? (
              <span>
                {money(r.sourceBankAmount)}
                <small>{t('Date not recorded')}</small>
              </span>
            ) : (
              '—'
            ),
            money(paid),
            <div className="button-row">
              <Badge tone={r.status === 'Approved' ? 'green' : 'amber'}>
                {r.status}
              </Badge>
              <Button
                variant="ghost"
                onClick={() =>
                  p.open(
                    'payroll',
                    p.snapshot.records.find((x) => x.id === r.id),
                  )
                }
              >
                {t('Review')}
              </Button>
              {r.status === 'Approved' && r.net > paid && (
                <Button
                  variant="outline"
                  onClick={() =>
                    p.open('expense', undefined, {
                      date: today(),
                      payrollId: r.id,
                      category: 'Payroll',
                      description: 'Salary ' + r.month + ' · ' + r.name,
                      amount: r.net - paid,
                    })
                  }
                >
                  {t('Record payment')}
                </Button>
              )}
            </div>,
          ];
        })}
      />
      <p className="panel-foot">
        {t(
          'Before approving an imported salary, check whether the payment already exists in Expenses paid. Review status never changes cash totals. Record a salary payment only when money is actually paid.',
        )}
      </p>
    </Panel>
  );
}
export function AccountantTasks(p: ViewProps) {
  const { t } = useLanguage();
  const [filter, setFilter] = useState('Open');
  const rows = entries(p.snapshot.records, 'task')
    .filter(
      (r) =>
        (filter === 'All' || filter === 'History'
          ? filter !== 'History' || r.historical
          : !['Done', 'Logged in source'].includes(r.status)) &&
        cleanSearch([r.title, r.notes, r.assignedTo].join(' ')).includes(
          cleanSearch(p.search),
        ),
    )
    .sort((a, b) =>
      (a.dueDate || a.date || '9999').localeCompare(
        b.dueDate || b.date || '9999',
      ),
    );
  return (
    <Panel
      title={t('Accountant tasks')}
      subtitle={t(
        'Daily work, due dates and the original work diary. A logged source entry is not treated as a verified completed task.',
      )}
      action={
        <div className="button-row">
          <Choice
            label={t('Task filter')}
            value={filter}
            onChange={setFilter}
            options={['Open', 'All', 'History'].map((v) => ({
              value: v,
              label: t(v === 'Open' ? 'Unfinished tasks' : v),
            }))}
          />
          <Button
            variant="outline"
            onClick={() =>
              p.open('task', undefined, { assignedTo: 'Accountant' })
            }
          >
            {t('Add task')}
          </Button>
        </div>
      }
    >
      <DataTable
        headings={[
          'Work date / due',
          'Task',
          'Category',
          'Responsible',
          'Status',
          '',
        ]}
        rows={rows.map((r) => [
          <span>
            {r.date || '—'}
            <small>{r.dueDate ? t('Due ') + r.dueDate : ''}</small>
          </span>,
          <div className="long-cell">
            <strong>{r.title}</strong>
            <details>
              <summary>{t('Details')}</summary>
              <p style={{ whiteSpace: 'pre-wrap' }}>{r.notes}</p>
            </details>
          </div>,
          t(r.category || ''),
          r.assignedTo === 'Accountant' ? t('Accountant') : r.assignedTo,
          <Badge
            tone={
              r.status === 'Done'
                ? 'green'
                : r.dueDate &&
                    r.dueDate < today() &&
                    r.status !== 'Logged in source'
                  ? 'red'
                  : 'amber'
            }
          >
            {r.status}
          </Badge>,
          r.historical ? (
            <Badge>Original diary</Badge>
          ) : (
            <Button
              variant="ghost"
              onClick={() =>
                p.open(
                  'task',
                  p.snapshot.records.find((x) => x.id === r.id),
                )
              }
            >
              {t('Update')}
            </Button>
          ),
        ])}
      />
    </Panel>
  );
}
