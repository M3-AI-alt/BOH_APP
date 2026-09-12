# Self-service worksheets

Open **Import & export** in BOH. Select a task to open its manual entry form, download an Excel/CSV template, preview an upload, or export saved records.

Supported tasks: students, leads, classes, class memberships, calendar changes, attendance, makeups, free support, package catalogue, student packages, collections, expenses, commitments, payroll drafts, reconciliation reviews and tasks.

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

This release supplies operational entry and worksheet tools. It does not activate official MISA posting, e-invoice signing, tax filing, statutory reports or an accounting cutover. Reconciled opening balances and accountant acceptance are still required before replacing those official processes.
