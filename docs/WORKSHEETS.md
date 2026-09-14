# Self-service worksheets

Scope updated 14 September 2026: BOH worksheets support independent internal
accounting and centre operations. The former MISA connection/migration and
official-service activation plan is withdrawn. Existing source evidence and
record history are preserved; no service connection is required to use the
worksheets.

For the deployed workspace upgrade and explicit outstanding modules, see [implementation status](WORKSPACE-IMPLEMENTATION.md). Existing templates described here remain supported; new planned modules are not yet available as worksheet tasks.

On each supported entry page, use **Add manually · Download worksheet sample · Import completed worksheet** beside its records. Imports open in a panel without resetting the underlying page or filters. The central **Import & export** workspace remains available for the 16 operational tasks.

Supported tasks: students, leads, classes, class memberships, calendar changes, attendance, makeups, free support, package catalogue, student packages, collections, expenses, commitments, payroll drafts, reconciliation reviews and tasks.

Accounting also has two dedicated worksheets:

- **Documents:** `BOH-accounting-documents.xlsx` creates draft bills, payroll, refund requests and journals. Journals require balanced `JournalLines` linked to their Entry references. No import approves, posts or pays a document.
- **Import review:** `BOH-accounting-source.xlsx` stages bank, spreadsheet or Top ID evidence for checking. It does not create receipts, expenses, opening balances or journals. **Add manually** offers the same review flow for one source record. Existing CSV exports with different columns can still use the secondary **Map another CSV** action.

Both files contain a bilingual Guide, a blank Entry sheet and separate Examples that are never imported. Documents additionally have a blank JournalLines sheet (500 lines total, 100 per journal). Imports accept up to 200 entries. Use explicit whole VND amounts and valid dates; do not enter formulas. Accounting uploads use `/api/accounting-worksheets`, not the operational or accountant-preparation importer.

Accounting references are private, database-checked and stable across repeated uploads and concurrent saves. Changed data under an existing reference is rejected. Documents share one reference namespace; source references are scoped to source/dataset/category. Renaming the file does not evade duplicate checks. Deleting an unused draft retains its import reference to prevent accidental recreation. Review results show saved, skipped and failed rows; **Start another import** allows corrections and retry. Period/status filters can hide saved records, so the result explains where to look.

## Download, fill, review, save

1. Download the Excel template. Read its bilingual Guide; enter data only on Entry. Examples are deliberately separate from importable rows.
2. Keep column headings unchanged. Give each new record a permanent, unique entryKey. Download reference lists to identify existing students, classes and packages.
3. Use whole VND amounts and YYYY-MM-DD dates. Templates accept up to 200 data rows per upload. CSV files are limited to 1 MB; XLSX files to 2 MB, with additional decompression limits.
4. Upload and preview. Expand row values and correct every reported problem before saving.
5. Save, then review each row's result. Each row is transactional, not the entire file. If interrupted, retry the same file: matching references are skipped, not duplicated.

Imports add records; they do not overwrite existing records. Changing an already-used entryKey's data is rejected. Use the existing manual edit and approval workflows for corrections. Financial family allocations, approvals and period closing remain separate workflows; a worksheet does not bypass them.

## Permissions and exports

Directors manage all supported tasks. Finance can import financial tasks and read/export student/class references without editing student profiles. TAs can import/export attendance, makeups and free support within their permitted scope. Server-side validation enforces these restrictions.

Exports are CSV files with IDs, revisions and saved payload details. All-date exports include all permitted records, not just the current page. Exports are reporting files, not templates for blind re-import. Formula-like text is escaped for spreadsheet safety.

## Release boundary

This release supplies operational entry and worksheet tools. Legal e-invoice
issuance/signing, tax filing and statutory-service integration are outside BOH's
scope, not unfinished worksheet tasks. Reconciled opening balances, approved
internal mappings, remaining workflows and accountant acceptance are still
required for a full internal-accounting cutover. A completed workbook does not
itself authorize posting or make the remaining software complete.
