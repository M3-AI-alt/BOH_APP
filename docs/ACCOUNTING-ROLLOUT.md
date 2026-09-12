# BOH accounting upgrade — incremental release, 12 September 2026

This is the first tested foundation release, **not completion of the full migration or official accounting activation**.

## Delivered

- Permanent student identities retained; backdated enrollment creates the first class membership on the entered date.
- Overlapping same-class memberships and duplicate student/class/date attendance rejected. Domain calculations also deduplicate legacy lesson/makeup duplicates without changing original history.
- Class-specific packages require a class; closed-month package inserts/term changes are blocked.
- TAs have teaching-only access to all current/future classes. Finance cannot edit student profiles or class setup.
- Classes & catalogue: directors maintain class names, colours, weekdays and archive state. Director/Finance maintain package catalogue prices; purchased agreements are not repriced.
- Payroll approvals are Director-only. Editing approved unpaid terms clears approval; paid terms and payroll-payment associations are protected; the database computes and caps net pay.
- Accounting: paginated monthly documents, drafts, edits, submission, approval, archive/restore, deletion of unused never-approved drafts, history and current-page CSV export.
- CSV source preview with explicit date/number mappings, raw values, source IDs, dataset/view/period/file provenance, duplicate-file protection and possible-duplicate warnings. Source rows are staged, matched to existing cash, excluded with reasons, or converted to a draft obligation. Reviewed matches can be reopened.
- One cash transaction can corroborate multiple overlapping MISA views; it is never counted twice.
- Approved bill/payroll/refund obligations can be matched to already-recorded, reconciled expenses within both balances. This is matching, not payment execution or an extra expense.
- MISA posting remains locked. No MISA records were bulk exported/imported by this release.

## Accountant's daily steps / Quy trình kế toán

1. Record actual collections and payments in **Finance / Tài chính**. Enter dates, accounts, references and the actual agreed package—not a guessed renewal price.
2. Maintain package offers in **Classes & catalogue / Lớp học & bảng giá**. This does not alter old agreements.
3. Prepare a bill, payroll obligation, refund request or journal draft in **Accounting / Kế toán**. Submit for Director/manager approval. Any subsequent edit removes approval.
4. Match approved obligations to reconciled expense records. Existing payroll-linked payments keep their original payroll link.
5. For historical review, export a document list from MISA/bank/spreadsheet as CSV, choose its source period and column formats, preview the values, then save **to review**.
6. Review duplicates and evidence. An invoice is not proof of payment, issuance, signing or tax acceptance.
7. Use the month selector and status filter for details. Summary cards explicitly cover all periods; exports contain the current page only.

Director / Giám đốc: approve sensitive documents and payroll. Finance / Kế toán: prepare, edit, reconcile and submit. TAs / Trợ giảng: attendance, makeups and support only.

## Verification

- Full application automated suite and type check.
- Isolated restore of a fresh public/auth/boh_private schema backup and public/auth data backup; the test database is not the live application database.
- Transaction-rolled-back SQL tests for permissions, dates, duplicates, approvals, edits, settlement caps, closed periods, import retries and non-duplication of cash.
- Concurrent approval test: access revoked while waiting is rejected; identical simultaneous commands apply once.
- Restored August receipt total: **VND 200,295,000**. January–May expenses retained.
- Browser UI checks use explicitly synthetic network fixtures; they are not presented as live staff sign-in or financial acceptance tests.
- Repository-wide strict lint has existing errors (including broad legacy record types). Passing functional/type/build tests does not mean lint is clean.

## Still required before full-plan acceptance

- Supported MISA exports, dataset/period inventory, account/partner masters, opening balances and source coverage reconciliation. The previously observed views (93 sales, 233 bank, 3 cash, 1 purchase) overlap and are not additive.
- Verify issued invoice XML/PDF and tax submission acknowledgements; no claimed verification yet.
- Accountant-approved cutover and balances, accounting regime/report mappings and API entitlement/configuration. Do not enable paid services automatically.
- Supported API adapter with credentials stored privately, registered callback verification, duplicate-safe asynchronous processing and actionable error/status handling.
- Full posted-journal adjustment/reversal workflow and official ledger close. Do not manually enable the posting gate merely because the database supports prepared journals.
- Private attachment upload/download and retention policy, import-batch corrections, richer bill/vendor/advance/transfer workflows, detailed payroll rate/work/allowance calculations and payslips.
- Supervised real Director/Finance/TA acceptance and monthly close before replacing spreadsheets/Top ID as daily entry.

The existing cash-first close is not acceptance of a reconciled statutory ledger. No accounting, tax or payroll legal treatment is inferred from this release.

## Recovery

Pre-release backups are local under the ignored private-data directory, with restricted permissions. They contain confidential data and must never enter Git or a website archive. Restore only into a separate test database first. Production recovery requires an explicit reviewed restore/cutover decision, not an automatic destructive reset.
