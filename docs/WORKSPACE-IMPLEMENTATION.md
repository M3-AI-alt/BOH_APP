# Complete workspace — implementation status

Updated 13 September 2026. **The full approved plan is not complete.** This is a tested local increment, not a production deployment or an approved accounting cutover.

The subsequent UX-first pilot is detailed in [UX-FIRST-IMPLEMENTATION.md](./UX-FIRST-IMPLEMENTATION.md), including guided payments, background drafts, contextual filters, saved views and remaining staff-acceptance gates.

## Implemented in this increment

| Capability                 | What works                                                                                                                                                                 | Boundary                                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Five-area navigation       | Today, People, Classes, Money, More; permitted destinations per role                                                                                                       | Existing records/pages are reused; no second student or payment database                                                                           |
| Today checklist            | Current class attendance, due lead follow-ups, unfinished accountant tasks, payroll needing review, unmatched cash including earlier months, submitted financial approvals | Derived from existing records; not a claim that accounting reconciles                                                                              |
| Exact approval links       | A Today approval opens its permanent document ID and current status, even beyond page one                                                                                  | Management still explicitly approves the current version                                                                                           |
| Private saved drafts       | Background-save incomplete entry forms; explicit Save draft & close; resume/delete under More → My drafts; owner-only access; revision conflicts                            | Supported existing operational forms only, not a new detailed payroll/admissions workflow or accounting-dialog draft system |
| Retry-safe form submission | Stable command IDs and canonical request hashes survive JSONB field reordering; lost-response recovery; atomic draft consumption                                           | Normal record forms upgraded; worksheet imports retain their existing entry-key mechanism                                                          |
| Bill payment               | Record actual payment against an approved bill; partial payments; one cash entry plus one allocation; retries/concurrency capped                                           | Does not execute bank payments or mark the cash as bank-verified; existing-payment matching remains a separate action                              |
| Accounting exports         | Every matching document/source row, not only the visible 50-row page; period, filters, basis and generation timestamp; selected-document exports                           | CSV reporting export, not an automatic re-import/template                                                                                          |
| Package price shortcut     | Group discount uses the selected active catalogue price                                                                                                                    | Existing agreements are not repriced                                                                                                               |
| History and permissions    | Financial history SQL ambiguity fixed; Finance snapshot history limited to readable operational records; TA excluded from financial/draft APIs                             | Existing Director/manager account roles retained                                                                                                   |

New database migration: `20260912174225_workspace_entry_safety.sql`. It adds private drafts and guarded commands, and fixes the existing financial-history query. It does not rewrite students, source balances, past receipts, payroll totals or MISA records.

## Staff use

- Start in **Today**. Open the relevant item or use the existing manual-entry shortcuts.
- Supported forms show background draft status. Choose **Save draft & close** to leave explicitly, then continue from **More → My drafts**. Drafts are private to the signed-in account and are not money or attendance records.
- A conflict never silently overwrites another editor. **Load latest saved values** replaces the displayed unsaved version after an explicit click. If a draft was already submitted or deleted elsewhere, review saved records before entering it again.
- For an approved bill, use **Record bill payment** only for an actual payment not yet recorded in Finance. If cash already exists, use **Match existing payment**. Review bank evidence separately.
- Exporting accounting records includes the selected filters and all matching rows. A document opened from Today is explicitly identified as a selected-document view; **Show all documents** returns to the normal list.

## Verification and evidence boundaries

- All **107 application unit, route and bilingual component tests passed**, as did TypeScript and the Hostinger production build. Targeted lint checks passed for the shared UX modules; this is not a claim that repository-wide legacy lint is clean.
- SQL tests on an isolated restored database: bill approval/payment caps, exact document links, history, draft ownership/revisions, failed-save rollback and atomic consumption, permission grants and RLS.
- Separate concurrent SQL connections: identical bill-payment retries record once; competing payments cannot exceed the bill; identical entry commands record once. Synthetic committed fixtures are then removed.
- Restored operational-data baseline: August collections **VND 200,295,000**, with January–May expenses retained.
- Browser tests use `scripts/browser-workspace-fixture.js`, which intercepts API requests with synthetic data. They cover navigation, draft resume, delayed saving, a lost-response/reordered-draft retry, two-tab draft conflict recovery, bill-payment presentation and responsive layout. The production-built Today screen was checked in English/Vietnamese and at 390px width with 200% text enlargement, without horizontal page overflow. These are not live staff acceptance tests or full-app accessibility acceptance.
- Local Supabase security advisors found no warnings/errors. Database lint exposed the existing history error, now fixed; it still reports an existing unused `batch_id` variable in the old finance function.
- A local PostgreSQL image crashed during an anonymous-role execution experiment. That test is not counted as passing. ACL catalogue checks and actual route authentication tests cover the new access boundaries instead.

Fresh private public/boh_private schema and data backups were restored into a separate QA database. **This increment has not demonstrated full recovery of Auth accounts or stored document files.** No production migration, GitHub push, Hostinger deployment or official-service activation was performed.

## Still required from the approved plan

| Area                            | Outstanding work                                                                                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation                      | Private supporting-file storage and record-level attachment UI; broader record-page consistency; paginated draft management; full mobile/keyboard/200% acceptance across all existing screens |
| Admissions and families         | Atomic lead → student → membership → agreement enrollment; explicit family and multiple-guardian masters; stage board, reopening and duplicate-review journey                                 |
| Collections and agreements      | Durable unallocated family credit, installments, guided reallocations and management-approved linked refunds; downloadable consolidated family statements                                     |
| Purchasing and banking          | Supplier/account masters; requests/orders/partial deliveries; recurring draft generation; reimbursements, deposits, supplier credits, split bank matching, cash counts and exception queues   |
| Payroll                         | Employee pay profiles; effective-dated rates; independently confirmed work; allowances/advances/adjustments; payslips and configured tax/insurance calculations                               |
| Stock and assets                | Opening counts and concurrency-safe movements; returns/reversals; equipment register; reviewed depreciation and prepayment schedules                                                          |
| Budgets and funding             | Monthly/annual category budgets, commitments versus actuals, explicit forecasts, owner loans/contributions/repayments                                                                         |
| Accounting close                | Reconciled opening balances and mappings; complete posted journals/reversals; subledger-to-ledger reconciliation; controlled period close/reopening and accepted reports                      |
| Communications                  | Reviewed bilingual communication templates and honest manual-send recording                                                                                                                   |
| Migration and official services | Source coverage/reconciliation, supported MISA exports/API entitlement, asynchronous status evidence, invoice XML/signatures and tax acknowledgements                                         |
| Rollout                         | Full records-and-files restoration drill; supervised role acceptance; accountant/director monthly close; approved production deployment and cutover                                           |

Existing worksheet templates remain available for supported operational record kinds. New modules above must receive their own manual forms, validated templates, preview/commit imports, exports and history when implemented; no unsupported module is labelled complete merely because it has a navigation destination.

## Safe next release sequence

1. Private documents and explicit family/supplier/account/employee references, without replacing permanent student identities.
2. Atomic admissions plus guided receipts/credits/installments and approved refund links.
3. Purchasing/banking and work-based payroll, followed by stock/assets and budgets/funding.
4. Reconciled internal ledger/close acceptance, then separately approved official-service activation.

Production release must include the database migration before shipping clients that call the new commands. Preserve live staff entries; validate backup restoration and smoke-test each role. Do not roll back a migration by dropping populated draft or command tables.
