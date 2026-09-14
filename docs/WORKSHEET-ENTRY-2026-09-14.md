# Worksheet entry release — 14 September 2026

## Implemented scope

Contextual manual entry, downloadable Excel samples and reviewed upload panels
cover the 16 existing operational worksheet tasks. Accounting now provides the
same choices for draft documents and source-review evidence. No unsupported
finance modules, tax filing or external accounting connection were added.

The new bilingual templates keep examples outside the importable Entry sheet.
Accounting accepts XLSX/CSV, returns per-row validation and uses stable private
references with database locks, role checks and closed-period validation.
Source evidence does not create cash; documents remain Draft. Approvals,
posting, matching, payment and corrections keep their existing separate rules.

## Verification

- Typecheck and Hostinger production build passed during implementation.
- All 155 automated tests pass, covering all 16 task placements, permissions, state retention,
  source/document parsing, balanced journal lines, duplicate keys and retry.
- New API included in anonymous, temporary-password, inactive and TA denial
  tests. Blank public templates contain no private data.
- Browser checks use synthetic localhost records and intercept all API calls;
  they do not create test records in the live company accounts.
- Before migration, a private schema/data backup was taken for public,
  boh_private and auth. Restored into a new isolated database; row count,
  fingerprint and August total match. SQL tests confirm closed-month rejection,
  partial-failure recovery, reference tombstones and permissions. Two concurrent
  requests saved one record and skipped one, returning the same record ID.
- Local browser completed a synthetic source entry from manual input through
  preview/save and refreshed review list without creating cash. Vietnamese,
  mobile controls and enlarged-text layouts were inspected; result headings
  receive focus and the confirmation controls stay visible.
- Pre-release live baseline: 10,579 operational records, fingerprint
  `34726e183526954a8741b3a0865a6f6e`, August collections VND 200,295,000;
  accounting documents and source-review rows both zero.
- Existing security advisor warning: leaked-password protection disabled.
  No authentication policy or paid service was changed.

## Release status

Migration `20260914085241_accounting_worksheets.sql` applied to the existing
Supabase project. Post-migration record fingerprint and totals match the
baseline; the new private worksheet registry is empty. Security advisors have
no new warnings. Application publishing remains to be confirmed below.

These are improvements to existing entry tools, not acceptance of the complete
finance roadmap. Staff usability acceptance and internal accounting cutover
remain separate from this release.
