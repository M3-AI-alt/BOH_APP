'use client';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Languages } from 'lucide-react';
import {
  LANGUAGE_COOKIE,
  parseLocale,
  localeTag,
  translate,
  translateMessage,
  formatMoney,
  formatMonth,
  formatPackage,
  type Locale,
} from '@/lib/i18n';

function helpers(locale: Locale) {
  return {
    locale,
    intlLocale: localeTag(locale),
    t: (key: string, params?: Record<string, string | number>) =>
      translate(locale, key, params),
    message: (key: string) => translateMessage(locale, key),
    money: (amount: number | null | undefined) => formatMoney(locale, amount),
    monthLabel: (month: string) => formatMonth(locale, month),
    packageTitle: (pkg: { sessions?: number | null }) =>
      formatPackage(locale, pkg),
  };
}
const LanguageContext = createContext({
  ...helpers('en'),
  setLocale: (_locale: Locale) => {},
});

export function LanguageProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLanguage] = useState(initialLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo(
    () => ({
      ...helpers(locale),
      setLocale: (next: Locale) => {
        const language = parseLocale(next);
        setLanguage(language);
        document.cookie = `${LANGUAGE_COOKIE}=${language}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
      },
    }),
    [locale],
  );
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}
export const useLanguage = () => useContext(LanguageContext);

export function LanguageSwitch() {
  const { locale, setLocale } = useLanguage();
  return (
    <fieldset className="language-switch" aria-label="Language / Ngôn ngữ">
      <Languages size={16} aria-hidden="true" />
      <button
        type="button"
        lang="en"
        aria-pressed={locale === 'en'}
        onClick={() => setLocale('en')}
      >
        English
      </button>
      <button
        type="button"
        lang="vi"
        aria-pressed={locale === 'vi'}
        onClick={() => setLocale('vi')}
      >
        Tiếng Việt
      </button>
    </fieldset>
  );
}
