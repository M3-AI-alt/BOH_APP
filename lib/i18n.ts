import vietnamese from './locales/vi.json';

export type Locale = 'en' | 'vi';
export const LANGUAGE_COOKIE = 'boh-language';
export const localeTag = (locale: Locale) =>
  locale === 'vi' ? 'vi-VN' : 'en-GB';
export const parseLocale = (value: unknown): Locale =>
  value === 'vi' ? 'vi' : 'en';
const dictionary: Record<string, string> = vietnamese;

// Presentation only: never translate stored payloads, identifiers, or original notes.
export function translate(
  locale: Locale,
  key: string,
  params: Record<string, string | number> = {},
): string {
  let text = key;
  if (locale === 'vi') {
    text =
      dictionary[key] ??
      (dictionary[key.trim()] !== undefined
        ? (key.match(/^\s*/)?.[0] ?? '') +
          dictionary[key.trim()] +
          (key.match(/\s*$/)?.[0] ?? '')
        : key);
  }
  if (
    locale === 'en' &&
    /[\u00c0-\u024f\u1e00-\u1eff]/.test(key) &&
    key.includes(' / ')
  )
    text = key.split(' / ')[0];
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}
export function translateMessage(locale: Locale, message: string): string {
  if (locale === 'en' || dictionary[message]) return translate(locale, message);
  const patterns: [RegExp, string, string][] = [
    [/^(.+) is required\.$/, '{name} is required.', 'name'],
    [/^Check (.+)\.$/, 'Check {name}.', 'name'],
    [/^Enter a valid (.+)\.$/, 'Enter a valid {name}.', 'name'],
    [/^Select an existing (.+)\.$/, 'Select an existing {kind}.', 'kind'],
    [/^Select a (.+)\.$/, 'Select a {kind}.', 'kind'],
    [/^Please complete (.+)\.$/, 'Please complete {name}.', 'name'],
  ];
  for (const [pattern, key, field] of patterns) {
    const match = message.match(pattern);
    if (match)
      return translate(locale, key, { [field]: translate(locale, match[1]) });
  }
  return message;
}
export function formatMoney(locale: Locale, amount: number | null | undefined) {
  return typeof amount === 'number'
    ? new Intl.NumberFormat(localeTag(locale), {
        maximumFractionDigits: 0,
      }).format(amount)
    : '—';
}
export function formatMonth(locale: Locale, month: string) {
  return new Date(month + '-01T12:00:00Z').toLocaleDateString(
    localeTag(locale),
    { month: 'long', year: 'numeric', timeZone: 'UTC' },
  );
}
export function formatPackage(
  locale: Locale,
  pkg: { sessions?: number | null },
) {
  if (typeof pkg.sessions !== 'number')
    return translate(locale, 'Package terms need confirmation');
  const durations: Record<number, string> = {
    24: '3 months',
    48: '6 months',
    96: '1 year',
    192: '2 years',
    288: '3 years',
  };
  return translate(locale, '{sessions} sessions · {duration}', {
    sessions: pkg.sessions,
    duration: translate(locale, durations[pkg.sessions] ?? 'custom package'),
  });
}
