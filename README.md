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
- Sign-in uses the hosting platform's ChatGPT sign-in. This is not Microsoft 365 or Supabase Auth sign-in.
- Supabase calls run only on the server. RLS is enabled; anonymous and authenticated Data API clients have no table or RPC grants. Only the server secret key may call the fixed, parameterized operations.
- Roles are stored in `boh_staff`, not user-editable JWT metadata. TA responses exclude financial records, salaries, leads and parent contacts.
- Writes use revision checks. Database changes, roster transfers and audit entries are committed together.
- Staff must have both private-site viewer access and an enabled app role. Never grant TAs site-editor access.

**Hosting boundary:** the server trusts identity headers only because the private Sites gateway authenticates users and owns those headers. Do not expose this worker directly or deploy it on another host without replacing/verifying that identity boundary. Vercel or another host would require a separately configured authentication integration.

## Local development

Use Node 22.13 or later. Install with `npm ci`. Copy `.env.example` to the ignored `.dev.vars` and configure `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `BOH_OWNER_EMAIL`. Keep the secret key server-only. Never use a `NEXT_PUBLIC_` prefix for it.

Run `npm run dev`. Development has a local-preview identity; the corresponding development staff record must be provisioned explicitly. It is not enabled in production builds. Use a separate development database for routine future changes.

Checks: `npm test`, `npm run typecheck`, `npm run build`. The GitHub workflow runs these checks without private data or credentials. Database verification lives in `supabase/tests/permissions.sql`; its synthetic records are rolled back.

## Database and import

The configured Supabase project is `sineiqiyvhqfefjdbtvu`. Versioned SQL migrations are under `supabase/migrations`. Apply only reviewed pending migrations; never reset the production database. The earlier D1 scaffold is retained for local recovery, but the running app uses Supabase exclusively.

Original workbooks and the private migration dataset are **not in this repository**. `.gitignore` excludes spreadsheets, private JSON, database copies and environment files. Production builds use an empty import placeholder and read actual records from Supabase. New clones therefore contain code, not student records.

The owner-only initial importer can use a privately supplied `db/import.json`. `scripts/import-private.mjs` uploads it with stable IDs and does not overwrite an already completed import. Do not use it to synchronize edits from Google Sheets. New source versions need a reviewed comparison/import procedure, not replacement of existing IDs.

## Finance safeguards and remaining operational setup

- Verify source text amounts, allocate combined-family receipts, and reconcile to bank/cash statements before closing a month.
- Payroll is a review schedule. Tax/insurance values are accountant-approved inputs, not a statutory tax engine. Salary figures without payment dates are not automatically posted as cash expenses.
- A provided Google workbook still requires authenticated access. Its unread content has not been claimed as imported. Other accessible sources are retained as read-only records.
- Before staff rollout: confirm staff sign-in emails, roles and assigned classes; grant private-site viewer access; perform a real TA and Finance sign-in acceptance check.
- Configure and test backups and restoration in the Supabase project before relying on the app as the only copy of centre records. Keep the original workbooks archived.

Do not commit secret keys, payroll records, student data, production exports or database backups to this public repository.
