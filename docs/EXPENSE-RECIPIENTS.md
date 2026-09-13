# Company expense sources and recipient details

Scope confirmed 13 September 2026: personal accounts must not be suggested as
the company's paying account. The actual recipient may be a person or supplier.

## Daily entry

- New expenses, payroll payment entry and approved-bill payments select
  **Company BIDV** or **Company VCB**, with no silent account default.
- A separate **Recipient details** section accepts `name` (recipient/account
  holder), `recipientBank` and `recipientAccount`. Staff enter the actual details;
  no personal account details are guessed or pre-populated from old cash records.
- These fields are optional when unknown. Entering bank details requires a name.
  Bank account numbers are text, including any leading zeros; they are never
  parsed as money or quantities. No new recipient master database is introduced.
- The same fields are included in expense worksheets, filtered cash exports and
  the expense description details/search. The worksheet Entry tab stays blank,
  with fictional examples only in Guide. `payrollId` and original validations are
  retained. The reviewed template version is 2026-09-13.
- English/Vietnamese labels, field errors, private drafts and existing saved-view
  column identifiers are retained. Director and Finance can enter expenses;
  TAs cannot access expense records, imports, exports or bill-payment actions.

## Historical integrity

`expense.account` remains the money's **source**, not the recipient's bank.
Historical personal/ambiguous account labels remain in original records and
report/reconciliation filters. On an existing record its old source is displayed
as a disabled historical selection. No original payment is renamed or moved.

Historical noncompany-source amounts and dates cannot be changed under that old
account, while ordinary notes/reconciliation evidence can still be saved. A
source-account correction needs a reason through normal entry. Existing locks
on matched/paid cash remain in force, including recipient changes. Blank new
fields are not added to legacy payloads during reconciliation.

The prospective AFTER insert/update database guard also covers actual upserts
and direct server writes. A rejection rolls back the command. Approved-bill
payment copies recipient fields into its single cash record while retaining the
existing command retry, approval, period, balance and settlement guards. This
change neither moves bank money nor creates another expense for the recipient.

## Verification before release

- 115 application tests pass, including text-account worksheet round trips,
  noncompany-source rejection, role checks and legacy bill-reconciliation shape.
- TypeScript and Hostinger production build pass.
- Isolated restored-database tests cover expense recipients, receiving accounts,
  workspace, upgrade and saved views. Actual concurrent bill/form saves pass.
  Synthetic writes are rolled back or removed only from the isolated database.
- The older `permissions.sql` anonymous-role test crashes the local PostgreSQL
  image; it is not reported as passed. Role denials, direct grants and private
  tables are covered by the other passing tests and HTTP checks instead.
- Pre-release business fingerprint remains
  `8a38c38929371bba1c18d575723ad0b917409857b7beb122b3b0124afca30c6c`:
  205 students, 7,001 attendance marks, 107 receipts, 129 expenses and 128
  packages. August collections remain VND 200,295,000; January–May expenses remain.
- Fresh private application and Auth backups were restored into a separate local
  database: 10,579 application/source records, 6 staff and 6 Auth accounts. The
  new migration and recipient tests passed on that restored copy. Backups and
  test fixtures are not part of the Git or hosting upload.
- Supabase security advisors show only the existing leaked-password-protection
  warning. Existing authentication settings and paid-service choices are not
  changed by this release. Database lint reports no errors before migration.

Real signed-in staff acceptance, browser/mobile visual checks and stored-document
file restoration are not claimed by these automated tests. This is a focused
expense-entry correction, not completion of the entire accounting roadmap.

## Published release

- Live at https://benoxfordhub.online/ from application commit
  `52105384fc515c897dde0b541602fee86dc9844e`, pushed to GitHub `main`.
- Hostinger build `01a099e8-ba15-7241-a6b2-e9550e4fe3a8` completed at
  08:37:15 UTC / 15:37:15 Vietnam time, 13 September 2026. Existing hosting,
  domain, runtime secrets and Supabase project are unchanged.
- Only additive migration `20260913082338_expense_recipients_company_accounts`
  was applied; all 13 migration versions match the linked production database.
  No seeds, staff changes, financial commands or data-import batches were run.
- Production guard grants deny `anon` and `authenticated`; server access remains.
  Post-migration database lint has no errors; security advisors retain only the
  pre-existing leaked-password warning. Business counts, August collections and
  the fingerprint above are identical before and after the change.
- Live homepage returns 200. Signed-out state, accounting, expense saved views
  and auth-status endpoints return 401 with `private, no-store`. The live expense
  worksheet returns 200 and its SHA-256 matches the validated workbook exactly.
- This release-note follow-up is documentation-only; the deployed application
  commit above is unchanged. The unrelated local `UI-DESIGN-SKILL.md` and private
  backups remain excluded from Git and the deployment archive.
