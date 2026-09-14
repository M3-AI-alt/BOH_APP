# Accountant preparation — first release

## Delivered scope

This release supplies one Vietnamese workbook and a separate preparation-review
workflow. It does **not** complete the larger centre-finance programme, activate
official accounting, or turn spreadsheet proposals into live transactions.

The workbook was built from a read-only BOH snapshot captured at
2026-09-13 10:23:42 UTC (17:23:42 Vietnam time). Two consecutive paginated reads
matched. Source files remain outside the repository and are not public assets.

- 205 student rows, 128 agreements, 107 receipts, 129 expenses, 6 historical
  payroll totals, 22 commitments and 5 catalogue offers are prefilled.
- Company facts, two company account labels and employee names from payroll are
  included as preparation references, not newly verified accounting masters.
- The workbook has 25 working sheets, a **Bắt đầu** navigation page, examples and
  source coverage. Known values are protected; yellow fields accept additions or
  proposed corrections. Required fields for new rows have an asterisk.
- Dropdowns include review decisions, company accounts, existing references,
  source classes and school-specific choices. New reserved reference rows can be
  named before other sheets refer to them.
- Blank means “not supplied,” never zero, deletion or approval. Explicit zero and
  “Chưa rõ / Cần kiểm tra” remain different states.

August receipts total **VND 200,295,000**, matching the requested benchmark. The
January–May source expense totals are respectively VND 141,209,800; 118,223,132;
98,350,776; 147,927,800; and 79,318,850. Matching these source totals is not bank
reconciliation or approval. MISA coverage, opening balances, invoice evidence,
tax acknowledgements and missing supporting files remain unverified.

## Accountant instructions

1. Open **Bắt đầu** and choose a work area.
2. Keep gray original cells and row references unchanged. Use yellow cells only
   for missing information or proposed corrections, with a reason/evidence.
3. Mark checked rows; use **Chưa rõ / Cần kiểm tra** instead of guessing.
4. Keep existing rows, headings and sheet names. Use reserved new-entry rows.
5. Return the `.xlsx` file privately. It contains confidential records and is not
   encrypted. Sheet protection prevents accidental edits, not unauthorized access.

Do not upload the workbook to BOH's ordinary add-only worksheet importer. Use
**More → Import & export → Accountant preparation** to preview it and save
preparation evidence for review when this release is available.

## Screenshot-to-BOH workflow mapping

The supplied reference set comprises 37 entry screenshots and four menu
screenshots. These guide interaction patterns, not financial values or settings.

| Reference                     | BOH workflow                           | First-release preparation sheet        | Remaining operational work                                        |
| ----------------------------- | -------------------------------------- | -------------------------------------- | ----------------------------------------------------------------- |
| Items                         | Tuition packages and fees              | Gói học - danh mục; Thỏa thuận học phí | Extend catalogue/agreement entry without repricing old agreements |
| Customers                     | Students, families and payers          | Học sinh; Gia đình                     | Typed family/guardian links and consolidated statements           |
| Invoices / recurring invoices | Agreed fee requests and installments   | Lịch học phí                           | Requests linked to existing debt, scheduled reviewable drafts     |
| Receipts / payments received  | One receipt with allocations           | Thu tiền; Phân bổ                      | Full family credit, allocation correction and receipt workflow    |
| Credit notes                  | Fee adjustments and approved refunds   | Proposed corrections/evidence          | Linked adjustment/refund approval, no automatic cash refund       |
| Vendors                       | Suppliers and service providers        | Nhà cung cấp                           | Reusable supplier master and related-record pages                 |
| Purchase orders / bills       | Requests, orders, deliveries and bills | Hóa đơn nhà cung cấp                   | Connected approvals, partial delivery and settlement workflow     |
| Recurring expenses            | Scheduled centre costs                 | Chi định kỳ                            | Duplicate-safe draft generation and visible failure handling      |
| Payments made                 | Record or match existing payment       | Chi phí; Đối chiếu ngân hàng           | Linked settlements with separate bank verification                |
| Inventory adjustments         | Books and supplies counts              | Sách và vật tư                         | Reviewed opening counts, atomic movements and reversals           |
| Accounting / reports          | Reconciliation and monthly close       | Số dư đầu kỳ; Công ty; Danh sách tệp   | Approved mappings, ledger/subledger reconciliation and close      |
| Additional BOH scope          | Payroll, funding, budgets, equipment   | Dedicated working sheets               | Work-based payroll, approval, movements and schedules             |

Existing account policy is preserved: new cash-source choices are Company BIDV
and Company VCB, with no silent default. Personal recipients remain separate;
historical personal-account evidence is not rewritten.

## Review architecture and boundaries

- `lib/preparation-schema.mjs` supplies common sheet/field definitions, stable
  references, required-input metadata and approved choices. Existing operational
  entry validation remains authoritative when future commit adapters are built.
- The original baseline is HMAC-signed using a purpose-specific prefix and a
  server-side secret. No secret is embedded in the workbook. Rotation requires a
  fresh workbook; imports fail closed if the signature no longer matches.
- Bounded XLSX parsing rejects altered source cells, removed/duplicated rows,
  changed headers and formulas in entry fields. Examples are never imported.
- Preview distinguishes unchanged records, additions, proposed corrections,
  conflicts, missing information and invalid input. Current revisions are checked
  even for unchanged rows. Existing and proposed allocations share the same
  receipt limit.
- `POST /api/preparation` supports **preview** and **stage** only. Stage stores
  immutable review evidence in `boh_preparation_reviews`; it never calls a live
  student, receipt, expense, stock or journal mutation.
- Director and Finance access is checked at the route and again using active
  database staff roles. Anonymous, authenticated-client and TA direct access is
  denied. Service credentials stay on the server.
- Identical successful requests recover the original result after an interrupted
  response. Staging locks source revisions and serializes identical digests.
  Saved evidence is distinct from current approval; reopening it checks staleness.
- The review screen supports English/Vietnamese, status filters, expandable
  source/proposal details, saved batches and CSV export of the entire filtered
  result rather than only the visible page. Files are held in component memory,
  not persisted in browser storage.

There is deliberately **no apply/post button**. Unsupported additions remain
staged until their destination workflow is implemented and accepted. Supporting
file references are collected; private attachment upload/storage is not delivered
by this release. Recurring automation and full payroll are also not implemented
merely because their preparation sheets exist.

## Verification and deployment

The generated native XLSX is re-opened through the actual application parser.
Checks cover signatures, source totals, locked original cells, unlocked inputs,
validation dropdowns and hidden metadata. All 28 visible sheets were rendered
and inspected. The source values are preserved; no live financial data changed.

Automated suites cover authorization, conflicts, blank/zero distinctions,
allocation limits, tampering and lost-response retry recovery. Database tests run
against an isolated local database, including a schema with default broad
service-role grants to verify explicit privilege revocation. Browser checks use
synthetic records and mocked review responses, not real financial submissions.

Final verification: 131 application tests pass; the actual generated workbook
also passes the dedicated 13-test handover suite. Six simultaneous local staging
requests produced one review and the same result ID. Typechecking, scoped lint
and the Hostinger production build pass. Browser preview/save/filter/export were
checked with synthetic data; a one-row filter exported that same one row. Mobile
Vietnamese layouts fit a 390-pixel viewport, and the 640-pixel reflow equivalent
of a 1280-pixel browser at 200% has no page-wide horizontal overflow. This does
not replace staff usability acceptance or a complete app-wide accessibility audit.

Migration: `20260913111535_boh_preparation_review.sql`.
The release uses an additive migration followed by the corresponding Hostinger
application build. Do not publish the private workbook as a static website asset.

The 2026-09-14 pre-deployment database backup (public, private and authentication
schemas plus data) was restored into an isolated local database. Record count
(10,579), business-record fingerprint, six staff/auth accounts and August
collections matched production. The new migration and rollback-only permission,
retry and immutability tests passed against that restored database. This verifies
database restoration, not supporting-document file restoration or a monthly close.
Application tests (131), typechecking and the Hostinger build passed again.

Still required before full finance use: connected daily workflows, detailed
payroll/stock/assets/budgets/funding, reviewed commit adapters, private documents,
reconciled opening balances and source coverage, backup restoration including
files, supervised monthly close and representative staff acceptance. No statutory
invoice/tax activation or bank execution is implied.
