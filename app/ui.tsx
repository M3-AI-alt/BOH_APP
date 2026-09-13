'use client';
import type { ReactNode } from 'react';
import { Children } from 'react';
import { useLanguage } from './language';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@/components/ui/combobox';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Search, Inbox } from 'lucide-react';
import { cleanSearch } from '@/lib/domain';
export function Choice({
  value,
  onChange,
  options,
  label,
  disabled = false,
  id,
  translateOptions = false,
  invalid,
  describedBy,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
  disabled?: boolean;
  id?: string;
  translateOptions?: boolean;
  invalid?: boolean;
  describedBy?: string;
  required?: boolean;
}) {
  const { t } = useLanguage();
  const display = (text: string) => (translateOptions ? t(text) : text);
  return (
    <Select
      value={value || '__none'}
      onValueChange={(v) => onChange(v === '__none' ? '' : String(v ?? ''))}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={t(label)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-required={required}
        className="choice"
      >
        <SelectValue>
          {display(options.find((o) => o.value === value)?.label || t(label))}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || '__none'} value={o.value || '__none'}>
            {display(o.label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Picker({
  value,
  onChange,
  options,
  label,
  id,
  invalid,
  describedBy,
  required,
  disabled = false,
  emptyText,
}: {
  value: string;
  onChange: (v: string) => void;
  options: {
    id: string;
    label: string;
    secondary?: string;
    aliases?: string[];
    disabledReason?: string;
  }[];
  label: string;
  id?: string;
  invalid?: boolean;
  describedBy?: string;
  required?: boolean;
  disabled?: boolean;
  emptyText?: string;
}) {
  const { t } = useLanguage();
  return (
    <Combobox
      items={options}
      disabled={disabled}
      filter={(item, query) =>
        cleanSearch(
          [item.label, item.secondary, ...(item.aliases || [])].join(' '),
        ).includes(cleanSearch(query))
      }
      value={options.find((o) => o.id === value) ?? null}
      onValueChange={(v) => {
        if (!v?.disabledReason) onChange(v?.id ?? '');
      }}
      itemToStringLabel={(o) => o.label}
    >
      <ComboboxInput
        id={id}
        aria-label={t(label)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-required={required}
        placeholder={t(label)}
        showClear
      />
      <ComboboxContent>
        <ComboboxEmpty>{t(emptyText || 'No matching records')}</ComboboxEmpty>
        <ComboboxList>
          {(item: any) => (
            <ComboboxItem
              key={item.id}
              value={item}
              disabled={!!item.disabledReason}
            >
              <span className="entry-option">
                <span>{item.label}</span>
                {item.secondary && <small>{item.secondary}</small>}
                {item.disabledReason && <small>{t(item.disabledReason)}</small>}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
export function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: string;
}) {
  const { t } = useLanguage();
  const resolvedTone =
    tone ??
    (/Overdue|Unpaid/i.test(String(children))
      ? 'red'
      : /Partial|pending|note|Text|Unassigned|confirmation|review|Payment expected|No package/i.test(
            String(children),
          )
        ? 'amber'
        : /Renewal|Planned|Expected|Trial|Transferred/i.test(String(children))
          ? 'blue'
          : /Paid|Covered|^Active$|^Account active$|Completed|^Open$|^Recorded$/i.test(
                String(children),
              )
            ? 'green'
            : 'grey');
  return (
    <span className={'badge ' + resolvedTone}>
      {Children.map(children, (child) =>
        typeof child === 'string' ? t(child) : child,
      )}
    </span>
  );
}
export function ClassTag({ cl }: { cl: any }) {
  const { t } = useLanguage();
  return (
    <span
      className="class-tag"
      style={{
        borderColor: cl?.color ?? '#8895aa',
        background: (cl?.color ?? '#8895aa') + '12',
      }}
    >
      <i style={{ background: cl?.color ?? '#8895aa' }} />
      {cl?.name?.replace('BOH ', '') ?? t('No class')}
    </span>
  );
}
export function LessonClass({
  lesson,
  classes,
}: {
  lesson: any;
  classes: any[];
}) {
  const { t } = useLanguage();
  return (
    <div className="long-cell">
      {lesson.classId ? (
        <ClassTag cl={classes.find((c) => c.id === lesson.classId)} />
      ) : (
        <span>{lesson.className || t('Home class not recorded')}</span>
      )}
      {lesson.makeupClassId && (
        <small>
          {t('Makeup class:')}{' '}
          {classes.find((c) => c.id === lesson.makeupClassId)?.name ||
            lesson.makeupClass}
        </small>
      )}
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = 'Search names…',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const { t } = useLanguage();
  return (
    <div className="search-box">
      <Search size={17} />
      <input
        aria-label={t(placeholder)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t(placeholder)}
      />
    </div>
  );
}
export function Empty({
  title = 'No records yet',
  detail = 'New records will appear here.',
}: {
  title?: string;
  detail?: string;
}) {
  const { t } = useLanguage();
  return (
    <div className="empty-state">
      <Inbox size={28} />
      <strong>{t(title)}</strong>
      <p>{t(detail)}</p>
    </div>
  );
}
export function DataTable({
  headings,
  rows,
  visibleColumns,
}: {
  headings: string[];
  rows: ReactNode[][];
  visibleColumns?: number[];
}) {
  const { t } = useLanguage();
  return rows.length ? (
    <Table>
      <TableHeader>
        <TableRow>
          {headings.map((h, i) =>
            !visibleColumns || visibleColumns.includes(i) ? (
              <TableHead key={i}>{t(h)}</TableHead>
            ) : null,
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            {r.map((c, j) =>
              !visibleColumns || visibleColumns.includes(j) ? (
                <TableCell key={j}>{c}</TableCell>
              ) : null,
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ) : (
    <Empty
      title="No matching records"
      detail="Try another month, class or search."
    />
  );
}
export function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>{t(title)}</h2>
          {subtitle && <p>{t(subtitle)}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
