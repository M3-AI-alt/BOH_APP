'use client';
import type { ReactNode } from 'react';
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
export function Choice({
  value,
  onChange,
  options,
  label,
  disabled = false,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <Select
      value={value || '__none'}
      onValueChange={(v) => onChange(v === '__none' ? '' : String(v ?? ''))}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={label} className="choice">
        <SelectValue>
          {options.find((o) => o.value === value)?.label || label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || '__none'} value={o.value || '__none'}>
            {o.label}
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
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  label: string;
  id?: string;
}) {
  return (
    <Combobox
      items={options}
      value={options.find((o) => o.id === value) ?? null}
      onValueChange={(v) => onChange(v?.id ?? '')}
      itemToStringLabel={(o) => o.label}
    >
      <ComboboxInput id={id} aria-label={label} placeholder={label} showClear />
      <ComboboxContent>
        <ComboboxEmpty>No matching records</ComboboxEmpty>
        <ComboboxList>
          {(item: any) => (
            <ComboboxItem key={item.id} value={item}>
              {item.label}
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
  const t =
    tone ??
    (/Overdue|Unpaid/i.test(String(children))
      ? 'red'
      : /Partial|pending|note|Text|Unassigned|confirmation|review|Payment expected|No package/i.test(
            String(children),
          )
        ? 'amber'
        : /Renewal|Planned|Expected|Trial|Transferred/i.test(String(children))
          ? 'blue'
          : /Paid|Covered|^Active$|Completed|^Open$|^Recorded$/i.test(
                String(children),
              )
            ? 'green'
            : 'grey');
  return <span className={'badge ' + t}>{children}</span>;
}
export function ClassTag({ cl }: { cl: any }) {
  return (
    <span
      className="class-tag"
      style={{
        borderColor: cl?.color ?? '#8895aa',
        background: (cl?.color ?? '#8895aa') + '12',
      }}
    >
      <i style={{ background: cl?.color ?? '#8895aa' }} />
      {cl?.name?.replace('BOH ', '') ?? 'No class'}
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
  return (
    <div className="long-cell">
      {lesson.classId ? (
        <ClassTag cl={classes.find((c) => c.id === lesson.classId)} />
      ) : (
        <span>{lesson.className || 'Home class not recorded'}</span>
      )}
      {lesson.makeupClassId && (
        <small>
          Makeup class:{' '}
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
  return (
    <div className="search-box">
      <Search size={17} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
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
  return (
    <div className="empty-state">
      <Inbox size={28} />
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}
export function DataTable({
  headings,
  rows,
}: {
  headings: string[];
  rows: ReactNode[][];
}) {
  return rows.length ? (
    <Table>
      <TableHeader>
        <TableRow>
          {headings.map((h, i) => (
            <TableHead key={i}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            {r.map((c, j) => (
              <TableCell key={j}>{c}</TableCell>
            ))}
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
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
