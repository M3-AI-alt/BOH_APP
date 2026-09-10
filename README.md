# Ben Oxford Hub

Private attendance, student packages, renewals and monthly finance workspace.

## Everyday use

- **Teaching Assistants:** choose an assigned class and month, then enter attendance. Complete makeups against the original absence. Free support does not consume package sessions.
- **Finance:** record receipts and paid expenses by their actual dates. Manage packages, salary reviews, recurring commitments, tasks and statement reconciliation.
- **Director:** manage all records, students, leads, transfers and staff roles.

The monthly dashboard reports cash collected, cash paid and net cash—not accounting profit. Renewal dates are estimates based on recorded sessions and class timetables. No unselected renewal price is assumed. Imported opening balances are preserved, and unavailable historical debt is labelled unavailable.

## Architecture and privacy

- React / Vinext interface, server routes and private Sites hosting.
- Supabase Postgres is the authoritative shared database. Records are not stored in browser storage. Screens refresh every minute and on focus; attendance saves immediately.
- Individual email/password credentials are verified by Supabase Auth on the server. There is no public role selection or automatic staff enrolment. Temporary passwords require replacement before any business API is accessible.
- The browser receives only an opaque, HttpOnly, Secure, same-site session cookie. The database stores its SHA-256 hash, expires setup sessions after 20 minutes and normal sessions after 8 hours, and rechecks the active staff role on every request. Role/class changes revoke sessions. Password updates increment a credential version, revoke old sessions, and fail closed if the provider update cannot finish.
- A private-schema helper checks Auth bans, deleted users and password-version fingerprints, so externally changed credentials invalidate BOH sessions too. Provider tokens and privileged keys never reach browser code. Accounts are matched by immutable Auth user ID, not editable metadata.
- Supabase calls run only on the server. RLS is enabled; anonymous and authenticated Data API clients have no table or RPC grants. Only the server secret key may call the fixed, parameterized operations.
- Roles are stored in `boh_staff`, not user-editable JWT metadata. TA responses exclude financial records, salaries, leads and parent contacts.
- Writes use revision checks. Database changes, roster transfers and audit entries are committed together.
- All pages use one canonical student read model. Explicit, source-confirmed transfer identities share packages, payments and lesson history; original IDs and source text remain unchanged. Similar names are never merged automatically.
- A successful save waits for complete shared-state revalidation, including related memberships and leads. Older in-flight responses are discarded. Other tabs receive a data-free refresh signal; other devices refresh on focus or every minute while not editing a form.
- Staff must have both private-site viewer access and an enabled app role. Never grant TAs site-editor access.

**Hosting boundary:** business routes accept only the native BOH session, never gateway identity headers or a development owner fallback. The existing private Sites audience must not be changed without owner approval. A public login shell can be enabled after approval; it does not grant access to student or financial records. Server-only secrets must remain configured when deploying on another host.

## Local development

Use Node 22.13 or later. Install with `npm ci`. Copy `.env.example` to the ignored `.dev.vars` and configure `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `BOH_OWNER_EMAIL`. Keep the secret key server-only. Never use a `NEXT_PUBLIC_` prefix for it.

Run `npm run dev`. Development has a local-preview identity; the corresponding development staff record must be provisioned explicitly. It is not enabled in production builds. Use a separate development database for routine future changes.

Checks: `npm test`, `npm run typecheck`, `npm run build`. The GitHub workflow runs these checks without private data or credentials. Database verification lives in `supabase/tests/permissions.sql`; its synthetic records are rolled back.

## Database and import

The configured Supabase project is `sineiqiyvhqfefjdbtvu`. Versioned SQL migrations are under `supabase/migrations`. Apply only reviewed pending migrations; never reset the production database. The earlier D1 scaffold is retained for local recovery, but the running app uses Supabase exclusively.

Original workbooks and the private migration dataset are **not in this repository**. `.gitignore` excludes spreadsheets, private JSON, database copies and environment files. Production builds use an empty import placeholder and read actual records from Supabase. New clones therefore contain code, not student records.

The owner-only initial importer can use a privately supplied `db/import.json`. `scripts/import-private.mjs` uploads it with stable IDs and does not overwrite an already completed import. Do not use it to synchronize edits from Google Sheets. New source versions need a reviewed comparison/import procedure, not replacement of existing IDs.

### Student matching and historical source records

Use **Original records → Records needing a student match** to see unlinked tuition receipts, makeups and free support. Other income is not treated as a missing student payment. Finance can match receipts and explicitly allocate family payments; only the Director can attach a historical lesson to a confirmed student, with an evidence note. Linking history never creates a second lesson or consumes sessions again. Linked makeup/support records also appear in the student profile.

Student cash attribution and package allocation are distinct: a receipt identified to a student counts in that student's monthly cash, even if the package is not yet matched. Family receipts contribute only the confirmed allocation to each student. Profile balances opened from monthly finance use that month's review cutoff; the cutoff is shown in the profile header. Payment and lesson history lists explicitly show all recorded dates.

`scripts/reconcile-lesson-source.mjs` is a read-only planner for recovering exact ISO dates and unambiguous class fields from preserved source rows. It requires a private current backup and reviewed linkage evidence file. Its output contains private data: keep it under ignored `private-data`, inspect the change set, back up first, then apply only guarded/audited changes. Do not forward-fill missing dates, infer date ranges, or overwrite a makeup's home class with its destination class.

## Finance safeguards and remaining operational setup

- Verify source text amounts, allocate combined-family receipts, and reconcile to bank/cash statements before closing a month.
- Payroll is a review schedule. Tax/insurance values are accountant-approved inputs, not a statutory tax engine. Salary figures without payment dates are not automatically posted as cash expenses.
- A provided Google workbook still requires authenticated access. Its unread content has not been claimed as imported. Other accessible sources are retained as read-only records.
- Before staff rollout: confirm assigned classes, deliver each temporary password privately, approve the login-page audience and have each person complete first sign-in. Password provisioning/recovery is an administrator operation; adding a role row alone does not create credentials. A password change interrupted between Auth and Postgres remains locked pending administrator recovery.
- Configure and test backups and restoration in the Supabase project before relying on the app as the only copy of centre records. Keep the original workbooks archived.

Do not commit secret keys, payroll records, student data, production exports or database backups to this public repository.
