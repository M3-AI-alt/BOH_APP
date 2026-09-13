# Company collections and Director identity

Policy confirmed by the founder on 13 September 2026.

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
