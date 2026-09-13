'use client';
import { useState, type ReactNode } from 'react';
import { useLanguage } from './language';
import { parseVnd } from '@/lib/entry-experience';
export function MoneyInput({
  id,
  value,
  onChange,
  label,
  invalid,
  describedBy,
}: {
  id?: string;
  value: number | string;
  onChange: (value: number | string) => void;
  label?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const { money, t } = useLanguage();
  const [focused, setFocused] = useState(false);
  return (
    <div className="money-entry">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        value={typeof value === 'number' && !focused ? money(value) : value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(parseVnd(e.target.value))}
      />
      <span>{t('VND')}</span>
    </div>
  );
}
export function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <section className="entry-section" aria-label={t(title)}>
      <h3>{t(title)}</h3>
      <div className="form-grid">{children}</div>
    </section>
  );
}
export function FinancialReview({
  title = 'Review before recording',
  items,
  children,
}: {
  title?: string;
  items: { label: string; value: ReactNode }[];
  children?: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <section className="entry-review" aria-label={t(title)}>
      <h3>{t(title)}</h3>
      <dl>
        {items.map((item) => (
          <div key={item.label}>
            <dt>{t(item.label)}</dt>
            <dd>{item.value ?? t('Not recorded')}</dd>
          </div>
        ))}
      </dl>
      {children}
    </section>
  );
}
