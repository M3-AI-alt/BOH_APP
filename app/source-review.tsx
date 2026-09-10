'use client';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { sourceReviewIssues } from '@/lib/source-review';
import { cleanSearch } from '@/lib/domain';
import { Badge, DataTable, Panel, SearchBox } from './ui';
import type { ViewProps } from './views';

export function SourceReview(
  p: ViewProps & { showSheet: (sheet: string) => void },
) {
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const issues = useMemo(
    () => sourceReviewIssues(p.snapshot.records, p.reviewDate),
    [p.snapshot.records, p.reviewDate],
  );
  const filters = [
    ['all', 'All checks'],
    ['student', 'Student match'],
    ['payment', 'Payment allocation'],
    ['terms', 'Package details'],
    ['attendance', 'Unassigned attendance'],
  ];
  const filtered = issues.filter(
    (r) =>
      (category === 'all' || r.category === category) &&
      cleanSearch([r.name, r.source, r.reason].join(' ')).includes(
        cleanSearch(search),
      ),
  );
  const audit = p.snapshot.manifest.workbookAudit;
  return (
    <>
      {audit && (
        <Panel
          title="Latest workbook check"
          subtitle={`${audit.file} · Checked ${audit.checkedAt} · Source lesson dates through ${audit.dataDate}`}
        >
          <div className="notice compact">
            <div>
              <strong>
                {audit.sheets.length} sheets · {audit.preservedRows} populated
                rows preserved
              </strong>
              <p>
                The source copy includes original values, formulas and notes. It
                is separate from working records; it does not add another
                payment or use another lesson.
              </p>
            </div>
          </div>
          <details className="source-audit-details">
            <summary>See all sheets and remaining checks</summary>
            <DataTable
              headings={['Sheet', 'Rows preserved', 'Working-record check', '']}
              rows={audit.sheets.map((s: any) => [
                s.name,
                s.rows,
                s.result,
                <Button variant="outline" onClick={() => p.showSheet(s.name)}>
                  View source
                </Button>,
              ])}
            />
            {audit.notes?.map((note: string) => (
              <p className="muted" key={note}>
                {note}
              </p>
            ))}
          </details>
        </Panel>
      )}
      <Panel
        title="Data needing confirmation"
        subtitle="These are matching checks—not unpaid bills. Receipts remain counted once, and historical lessons are not charged again."
      >
        <div className="audit-filters" aria-label="Data review filters">
          {filters.map(([value, label]) => (
            <Button
              key={value}
              variant={value === category ? 'default' : 'outline'}
              aria-pressed={value === category}
              className={`audit-filter audit-${value}`}
              onClick={() => setCategory(value)}
            >
              {label}
              <span>
                {value === 'all'
                  ? issues.length
                  : issues.filter((r) => r.category === value).length}
              </span>
            </Button>
          ))}
        </div>
        <div className="section-toolbar">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Find a student or source record…"
          />
        </div>
        <DataTable
          headings={[
            'Student / source name',
            'Record',
            'What needs checking',
            'Source',
            '',
          ]}
          rows={filtered.map((r) => [
            r.studentId ? (
              <Button variant="link" onClick={() => p.detail(r.studentId)}>
                {r.name}
              </Button>
            ) : (
              r.name
            ),
            <Badge>
              {r.kind === 'support'
                ? 'Free support'
                : r.kind === 'unmatched'
                  ? 'Attendance'
                  : r.kind}
            </Badge>,
            r.reason,
            r.source,
            ['receipt', 'package'].includes(r.kind) ? (
              <Button
                variant="outline"
                onClick={() =>
                  p.open(
                    r.kind,
                    p.snapshot.records.find((x) => x.id === r.id),
                  )
                }
              >
                Review details
              </Button>
            ) : ['makeup', 'support'].includes(r.kind) &&
              p.snapshot.actor.role === 'Director' ? (
              <Button
                variant="outline"
                onClick={() =>
                  p.open(
                    'student-link',
                    p.snapshot.records.find((x) => x.id === r.id),
                  )
                }
              >
                Match student
              </Button>
            ) : (
              'Check original row'
            ),
          ])}
        />
        {filtered.length === 0 && (
          <p className="muted">
            No records match this filter. Other checks may still need
            confirmation.
          </p>
        )}
      </Panel>
    </>
  );
}
