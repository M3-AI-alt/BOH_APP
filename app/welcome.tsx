'use client';
import { useLanguage } from '@/app/language';
import { LanguageSwitch } from './language';
import {
  ArrowRight,
  CalendarCheck2,
  ShieldCheck,
  Wallet,
  Users,
} from 'lucide-react';
import SignInForm from './sign-in-form';

export default function Welcome({ signedIn = false }: { signedIn?: boolean }) {
  const { t } = useLanguage();
  return (
    <main className="welcome-page">
      <section
        className="welcome-story"
        aria-label={t('Welcome to Ben Oxford Hub')}
      >
        <img
          className="welcome-photo"
          src="/brand/centre-entrance.jpg"
          alt={t('The entrance to Ben Oxford Hub in Hanoi')}
          width={960}
          height={1280}
        />
        <div className="welcome-shade" />
        <div className="welcome-story-top">
          <span className="brand-monogram">BOH</span>
          <span>{t('HANOI · VIETNAM')}</span>
        </div>
        <div className="welcome-story-copy">
          <span className="welcome-kicker">
            {t('SPEAK ENGLISH CONFIDENTLY')}
          </span>
          <h1>
            {t('One centre.')} <br /> {t('A world of')} <br />
            <em>{t('possibilities.')}</em>
          </h1>
          <p>
            {t('From first words to new opportunities.')} <br />{' '}
            {t('English for every age, level and ambition.')}
          </p>
          <div className="welcome-paths">
            <span>{t('Young learners')}</span>
            <span>{t('Exam preparation')}</span>
            <span>{t('Professional English')}</span>
          </div>
        </div>
        <div className="welcome-location">
          <span className="location-dot" /> {t('Your centre, connected.')}
        </div>
      </section>
      <section className="welcome-signin" aria-labelledby="welcome-title">
        <LanguageSwitch />
        <img
          className="welcome-logo"
          src="/brand/boh-navy.svg"
          alt="Ben Oxford Hub"
          width={1206}
          height={489.84}
        />
        <div className="welcome-form">
          <p className="eyebrow">{t('THE CENTRE WORKSPACE')}</p>
          <h2 id="welcome-title">{t('Welcome to your Hub.')}</h2>
          <p className="welcome-intro">
            {t('A little less admin.')} <br />{' '}
            {t('More time for what matters.')}
          </p>
          {signedIn ? (
            <a className="welcome-signin-button" href="/">
              {t('Open my workspace')} <ArrowRight size={19} />
            </a>
          ) : (
            <SignInForm />
          )}
          <p className="welcome-auth-note">
            {t(
              'Individual staff access. Your role is assigned by the Director—never selected at sign-up.',
            )}
          </p>
          <div
            className="welcome-roles"
            aria-label={t('Three connected workspaces')}
          >
            <div>
              <span className="role-icon teaching">
                <CalendarCheck2 size={18} />
              </span>
              <p>
                <strong>{t('Teaching team')}</strong>
                <small>{t('Attendance & makeup lessons')}</small>
              </p>
            </div>
            <div>
              <span className="role-icon finance">
                <Wallet size={18} />
              </span>
              <p>
                <strong>{t('Finance')}</strong>
                <small>{t('Collections, expenses & packages')}</small>
              </p>
            </div>
            <div>
              <span className="role-icon director">
                <Users size={18} />
              </span>
              <p>
                <strong>{t('Director')}</strong>
                <small>{t('Your whole centre, in one place')}</small>
              </p>
            </div>
          </div>
          <details className="welcome-help">
            <summary>{t('First time here?')}</summary>
            <p>
              {t(
                'Use the email and temporary password given to you by the Director. You will choose your own password before entering. For TAs, the Director must also assign your classes. This is a private staff app, not a student sign-up page.',
              )}
            </p>
          </details>
        </div>
        <footer className="welcome-footer">
          <ShieldCheck size={16} />
          <span>{t('Private staff workspace · Individual access')}</span>
        </footer>
      </section>
    </main>
  );
}
