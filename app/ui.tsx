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
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value || '__none'}
      onValueChange={(v) => onChange(v === '__none' ? '' : String(v ?? ''))}
      disabled={disabled}
    >
      <SelectTrigger aria-label={label} className="choice">
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
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  label: string;
}) {
  return (
    <Combobox
      items={options}
      value={options.find((o) => o.id === value) ?? null}
      onValueChange={(v) => onChange(v?.id ?? '')}
      itemToStringLabel={(o) => o.label}
    >
      <ComboboxInput aria-label={label} placeholder={label} showClear />
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
    (/Overdue|Unpaid/.test(String(children))
      ? 'red'
      : /Partial|pending|note|Text|Unassigned/.test(String(children))
        ? 'amber'
        : /Renewal|Planned|Expected|Trial/.test(String(children))
          ? 'blue'
          : /Paid|Covered|Active|Completed|Open|Recorded/.test(String(children))
            ? 'green'
            : 'grey');
  return <span className={'badge ' + t}>{children}</span>;
}
export function ClassTag({ cl }: { cl: any }) {
  return (
    <span className="class-tag">
      <i style={{ background: cl?.color ?? '#8895aa' }} />
      {cl?.name?.replace('BOH ', '') ?? 'No class'}
    </span>
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
