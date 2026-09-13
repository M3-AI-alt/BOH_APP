# UX-first pilot — implementation and acceptance

Updated 13 September 2026. **Implemented locally, not deployed.** This is the representative-workflow release in step 1 of the approved UX plan, plus the shared controls it needs. The full plan is not accepted or complete.

## What changed

| Surface | Working changes | Boundary |
| --- | --- | --- |
| Shared entry forms | Meaningful sections; required/optional labels; optional details; contextual selectors; bilingual field help; whole-VND input; specific save actions and inline errors | Existing record kinds and permissions are reused. This is not an arbitrary form builder. |
| Record payment | Payer/account → amount/date → allocation → review; receiving account starts blank; one receipt with existing supported package allocations; totals shown before recording | Unlinked cash is explicitly marked for allocation review. It is not represented as an available family-credit account. |
| Student profile | Identity, enrollment, contacts and learning details; pause fields appear when relevant and remain visible for existing pause history; returning an Active student requires a return date | Permanent identity and archive/transfer controls are preserved. No automatic merges or deletion of historical students. |
| Expense and bill payment | Clear VND amount/account/date inputs; approved-bill payment shows supplier and balance after payment; inline account/evidence errors; distinct record-new versus match-existing actions | No bank transfer execution or automatic bank verification. Accounting dialogs do not yet use private background entry drafts. |
| Private entry drafts | Background saving on supported record forms; visible saving/saved/failed state; revision protection; serialized writes; stable retry identity; explicit recovery/discard actions | Drafts belong to the signed-in account, not browser storage. Saving a draft does not record money or attendance. |
| Cash lists | Independent receipt/expense search and facets, quick filters, chips, result count, adjustable columns and matching totals; CSV uses the same complete matching array | Receipt class filtering follows linked students. The ineffective class filter is removed from expenses. Centre-wide cards are labelled separately. |
| Attendance grid | Search, lesson dates, missing/completed mark filters, current/history roster selection and exact filtered CSV; future lessons are not called missing | Current roster exclusions preserve history. Makeup/support/calendar subtab filtering still needs the broader rollout. |
| Leads | Local stage/class/follow-up facets, accent-insensitive search, overdue shortcut, columns and matching CSV | Source/owner/trial-date facets are not invented where central fields do not exist. |
| Saved views | Personal filter-bar settings and columns; management can share with compatible roles; own-view removal; server/RPC ownership and revision checks | Outer page month/class controls are not yet part of a saved view. Last-used preferences and editable named views remain follow-up work. |
| Responsive navigation | Mobile menu closes after selecting an area; long action labels/chips wrap; attendance tables and tabs keep contained horizontal scrolling | Full-app accessibility and staff usability acceptance remain outstanding. |

The period toolbar is omitted from pages that do not use it. Students/packages retain the historical review date without an ineffective month selector. Finance shows the selected month and actual cutoff, warning if the cutoff precedes the month; underlying historical calculations are unchanged.

## Verification completed

- **107 automated tests passed**, including existing financial/session rules, bilingual rendering, route authorization, import retry rules and the new form/filter checks. TypeScript and the Hostinger production build passed. Targeted lint on the new shared UX modules passed; repository-wide legacy lint is not claimed clean.
- Isolated database tests passed for saved-view ownership, compatible sharing, stale revisions, idempotent retries, suspended-owner hiding, and denied anonymous/authenticated direct access. Existing draft/entry/bill-payment SQL tests also passed and rolled back synthetic records.
- Synthetic browser tests intercepted every `/api/` request; **no live staff or financial records were changed**. Tested: English/Vietnamese VND typing, required-field focus, delayed draft saving, a lost record-save response followed by a duplicate-safe retry, and lost first-draft plus lost recovery-read responses followed by recovery using the original draft ID.
- The double-loss recovery test left exactly one private draft with the corrected account and **zero receipts**. A separate successful-payment/lost-response scenario recorded once on retry.
- Browser checks confirmed accent-insensitive Vietnamese search, matching result count/amount/CSV, named-view restoration and aligned configurable columns. Bill payment showed VND 60,000 paid against a VND 100,000 bill, leaving VND 40,000.
- At 390px width with 200% root text enlargement, the attendance page and profile panel had no horizontal page/panel overflow. Attendance student cells remained sticky while the table scrolled. Profile status selection worked by keyboard; the missing return date received focus. Native date-input automation required DOM input events in this browser adapter, so complete keyboard/calendar testing across browsers is **not** asserted.
- Browser errors were checked; these are component/flow checks with a fixture, not proof of live deployment or real staff acceptance.

## Reproduce automated checks

From the repository root:

```sh
npm test
npm run typecheck
npm run build:hostinger
npx oxlint app/entry-controls.tsx app/filter-bar.tsx lib/entry-experience.ts lib/record-filters.ts lib/saved-views-server.ts app/api/views/route.ts app/api/record/route.ts
```

Database tests are `supabase/tests/ux_saved_views.sql` and `supabase/tests/workspace.sql`. Run only against an isolated restored QA database. `scripts/browser-workspace-fixture.js` is a localhost-only network interceptor for synthetic browser checks; never include it in the production bundle.

## Deployment and remaining gates

No GitHub push, production Supabase migration, Hostinger deployment, MISA posting or accounting cutover was performed. The new client requires these additive migrations, in order, before production use:

1. `20260912174225_workspace_entry_safety.sql` — private drafts and guarded entry/payment commands.
2. `20260912185432_ux_saved_views.sql` — saved views and permission-checked RPC.

Back up, verify restoration, apply through the normal migration process, then smoke-test Director/manager, Finance and TA accounts. Do not drop populated draft/view/command tables to roll back.

Before expanding the pattern, test the pilot with the accountant, manager and TA: payment entry under one minute, enrollment under three minutes where the complete enrollment workflow is available, at least 90% unassisted task completion, and no critical identity/financial mistakes. Those tests have **not** been performed.

Still required: broader module-specific filters/exports, persisted outer date/class preferences, shared-view editing, complete guided enrollment/family credit/refunds/payroll, authenticated drafts for accounting dialogs, approved central account/supplier/employee masters, private attachments, and full mobile/keyboard/200% testing with long/duplicate names and large option sets. Existing worksheet imports retain normal central server validation; the new return-date invariant is explicitly covered by an import regression test. Every future workflow must meet the same standard before being called complete.

The larger centre-management and reconciled accounting scope remains tracked in [WORKSPACE-IMPLEMENTATION.md](./WORKSPACE-IMPLEMENTATION.md).
