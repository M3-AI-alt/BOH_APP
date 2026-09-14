# Internal accounting scope — 14 September 2026

The Director withdrew the former MISA integration and migration plan. BOH is an
independent internal finance workspace. E-invoice issuance/signing and tax filing
are outside its scope; external-service setup is not a BOH activation requirement.

## Changes

- Removed the connection warning and changed the Accounting workspace heading to
  **Internal accounting / Kế toán nội bộ**.
- New source review accepts manual Bank, Spreadsheet and Top ID files. The server
  and database reject new MISA-labelled batches. This is not an external connector.
- Historical source evidence is retained and cannot be relabelled. Existing
  approval, reconciliation, internal journal posting and role restrictions remain.
- Removed the tax-filing task option. Future preparation workbooks ask for internal
  policies and missing internal evidence, not API access, signatures or tax receipts.
- Previously issued signed preparation workbooks remain readable. Do not remove
  protected rows or change their references. Former external-service questions are
  no longer prerequisites; an accountant may mark them not applicable.

## Verification

- 138 application tests, TypeScript checking and the Hostinger build pass, including both-language UI
  rendering, rejected provider imports, retained provenance and old workbook support.
- Fresh restricted backup of `public`, `boh_private` and `auth` schema/data restored
  successfully into a separate local database. No production restore was performed.
- Transaction-rolled-back SQL tests on that restored database pass for internal
  imports, duplicate retries, rejected direct MISA inserts, unchanged legacy evidence,
  Director/Finance access, TA denial and private grants.
- The blank task template's category list and Guide match the manual form. Its
  other values, formatting, validations, tables and panes are unchanged.
- Applied migration `20260914045027_internal_accounting_only` to the existing
  Supabase project using `--skip-vault`. All 15 local/remote migrations agree.
- Production database lint reports no errors. The pre-existing disabled leaked
  password protection warning remains; no account settings were changed.
- Before/after production operational fingerprint:
  `34726e183526954a8741b3a0865a6f6e` across 10,579 records. Six login accounts and six
  staff entries remain. Import batches/rows, financial documents, journals and
  settlements each remain at zero. August receipts remain **VND 200,295,000**.

## Release status

Database changes are applied. Website publication and live checks are pending.

This is a scope correction, not completion of every planned finance module or
approval of internal accounting cutover. Reconciled balances, approved mappings,
remaining workflows and supervised staff acceptance are still required.
