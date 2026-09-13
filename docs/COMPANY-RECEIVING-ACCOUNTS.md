# Company collections and Director identity

Policy confirmed by the founder on 13 September 2026.

Outgoing payment sources and manually entered payee bank details are covered by
[Company expense sources and recipient details](EXPENSE-RECIPIENTS.md).

## Daily collections

New receipt entry and operational worksheet imports allow **Company BIDV** and **Company VCB** only. These are the existing named company accounts; no bank details or additional destinations were invented. The account must be selected explicitly. Karam Mouelhi, Founder and Director, is responsible for company accounts.

Personal and ambiguous account labels are not options for new receipts. Historical account labels remain in original records, reports and reconciliation; they are not automatically renamed or reallocated. Historical receipts can still receive notes or reconciliation evidence without changing their account, amount or date. Correcting an account to a company account requires a reason through the normal application save and retains activity history. Cash amount/date changes cannot be entered against a preserved historical personal account.

The receipt selector, server validation, operational import validation and database trigger enforce the same company-only rule. Historical source staging remains separate from operational receipt creation. This does not execute bank payments or move money.

The database trigger runs **after** the actual insert/update so `INSERT ... ON CONFLICT DO UPDATE` can preserve an existing historical receipt. A policy failure rolls back the entire command. Tests cover the real save RPC as well as direct database writes.

## Identity and authority

The founder's canonical display name is **Karam Mouelhi**, and his application role/title is **Director**. Ben, Karam Ben and Karam Ben Mouelhi refer to the same founder; they are not additional staff identities. The existing owner account is retained. Old actor-name snapshots and financial source records are not rewritten.

Director includes all Finance navigation, financial preparation, reporting, entry, worksheets and accounting tools, plus management approvals and administration. Finance-shared saved views are also visible to Directors. Another person's private drafts or private personal views remain owner-only. Thảo's existing staff role is unchanged.

## Verification and limits

Application tests cover company receipt entry for both Finance and Director, invalid receiving accounts, legacy evidence updates, correction reasons, import rejection and Director capability inheritance. Isolated SQL tests cover the actual save RPC, atomic rejection, private/shared view boundaries, revisions and inactive publishers.

No historical cash is changed by the schema migration. Full repository lint is not clean because of existing `any`, accessibility and floating-promise diagnostics; a passing build/test run must not be described as a passing repository lint run. Real signed-in staff acceptance remains distinct from synthetic/API/database testing.

## Production release — 13 September 2026

- Application source `1021f9318153a8a19f50089b4ccda598cc87f1c8`, pushed to GitHub `main` and deployed to the existing https://benoxfordhub.online/ Hostinger website.
- Hostinger build `01a0999a-9415-7231-83d9-97b7de55b074` completed at **07:11:48 UTC / 14:11:48 Vietnam time**. Published login/translation assets contain the new Director name and account-policy copy.
- Applied only `20260913065434_company_receiving_accounts.sql`. All 12 migration versions now match production. No seeds, roles, Vault settings, Auth configuration or bank details were changed.
- The existing `owner` staff profile was updated from Karam Ben to Karam Mouelhi, retaining Director role, active status and the same account identity. This exact, owner-authorized name-only correction has a before/after activity entry; aliases are recorded in its reason. No credentials or historical actor snapshots were rewritten.
- Fresh private application and Auth schema/data backups restored into an isolated database: **6 Auth accounts, 6 staff and 10,579 application/source records**. The migration, owner-name correction and 22 receipt/view SQL assertions passed on that restored copy. Existing workspace and saved-view SQL suites also passed with the new guard. Fixtures never ran on production. Document-file restoration is not part of this database-only drill.
- **112 application tests**, TypeScript and Hostinger production build passed. The new receipt-account module passes targeted lint; full repository lint remains an existing failing check as described above.
- Production before/after business fingerprint: `8a38c38929371bba1c18d575723ad0b917409857b7beb122b3b0124afca30c6c`, unchanged. **205 students, 7,001 attendance marks, 107 receipts, 129 expenses and 128 packages** remain. August collections remain **VND 200,295,000**, with January–May expenses retained. No accounting documents, journals, settlements or import batches were created.
- Signed-out state, saved-view, accounting and auth-status endpoints return **401**, no records and `Cache-Control: private, no-store`. Browser users cannot execute the private receiving-account guard directly. Signed-in staff acceptance was not performed and no password reset/login attempts were made for verification.
- Private backups and the unrelated local `UI-DESIGN-SKILL.md` were excluded from Git and the deployment archive. Subsequent release-documentation commits do not change the application version above.
