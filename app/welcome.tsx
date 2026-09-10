import {
  ArrowRight,
  CalendarCheck2,
  ShieldCheck,
  Wallet,
  Users,
} from 'lucide-react';
import SignInForm from './sign-in-form';

export default function Welcome({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <main className="welcome-page">
      <section className="welcome-story" aria-label="Welcome to Ben Oxford Hub">
        <img
          className="welcome-photo"
          src="/brand/centre-entrance.jpg"
          alt="The entrance to Ben Oxford Hub in Hanoi"
          width={960}
          height={1280}
        />
        <div className="welcome-shade" />
        <div className="welcome-story-top">
          <span className="brand-monogram">BOH</span>
          <span>HANOI · VIETNAM</span>
        </div>
        <div className="welcome-story-copy">
          <span className="welcome-kicker">SPEAK ENGLISH CONFIDENTLY</span>
          <h1>
            One centre. <br />A world of <br />
            <em>possibilities.</em>
          </h1>
          <p>
            From first words to new opportunities.
            <br />
            English for every age, level and ambition.
          </p>
          <div className="welcome-paths">
            <span>Young learners</span>
            <span>Exam preparation</span>
            <span>Professional English</span>
          </div>
        </div>
        <div className="welcome-location">
          <span className="location-dot" /> Your centre, connected.
        </div>
      </section>
      <section className="welcome-signin" aria-labelledby="welcome-title">
        <img
          className="welcome-logo"
          src="/brand/boh-navy.svg"
          alt="Ben Oxford Hub"
          width={1206}
          height={489.84}
        />
        <div className="welcome-form">
          <p className="eyebrow">THE CENTRE WORKSPACE</p>
          <h2 id="welcome-title">Welcome to your Hub.</h2>
          <p className="welcome-intro">
            A little less admin.
            <br />
            More time for what matters.
          </p>
          {signedIn ? (
            <a className="welcome-signin-button" href="/">
              Open my workspace
              <ArrowRight size={19} />
            </a>
          ) : (
            <SignInForm />
          )}
          <p className="welcome-auth-note">
            Individual staff access. Your role is assigned by the Director—never
            selected at sign-up.
          </p>
          <div
            className="welcome-roles"
            aria-label="Three connected workspaces"
          >
            <div>
              <span className="role-icon teaching">
                <CalendarCheck2 size={18} />
              </span>
              <p>
                <strong>Teaching team</strong>
                <small>Attendance & makeup lessons</small>
              </p>
            </div>
            <div>
              <span className="role-icon finance">
                <Wallet size={18} />
              </span>
              <p>
                <strong>Finance</strong>
                <small>Collections, expenses & packages</small>
              </p>
            </div>
            <div>
              <span className="role-icon director">
                <Users size={18} />
              </span>
              <p>
                <strong>Director</strong>
                <small>Your whole centre, in one place</small>
              </p>
            </div>
          </div>
          <details className="welcome-help">
            <summary>First time here?</summary>
            <p>
              Use the email and temporary password given to you by the Director.
              You will choose your own password before entering. For TAs, the
              Director must also assign your classes. This is a private staff
              app, not a student sign-up page.
            </p>
          </details>
        </div>
        <footer className="welcome-footer">
          <ShieldCheck size={16} />
          <span>Private staff workspace · Individual access</span>
        </footer>
      </section>
    </main>
  );
}
