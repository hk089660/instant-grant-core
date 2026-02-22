# Asuka Network Core (Prototype)

Public prototype for auditable school/public participation and grant operations using PoP (Proof of Process).

[日本語 README](./README.ja.md)

## Top Summary
- What it is: a 3-layer system that binds operational process logs to verifiable receipts, and optionally to Solana settlement.
- Who it is for: students/users who join events, and operators (admin/master) who run and audit distribution.
- [Implemented] Student flow supports walletless `Participation Ticket (off-chain Attend)` with `confirmationCode + ticketReceipt`.
- [Optional] `On-chain Redeem` is executed only when wallet + event policy/config path is used; tx/receipt evidence appears only for those executions.
- Third-party verifiable today: PoP runtime status, audit integrity status, ticket verify-by-code API, and Explorer links when on-chain path is used.
- Design principle: non-custodial signatures where on-chain is used, plus accountability by immutable process audit chain.
- Current deployment: `https://instant-grant-core.pages.dev/` (user) and `/admin/login` (operator).
- Maturity: prototype focused on reproducibility and reviewer-verifiable evidence, not a production-complete public system.
- Source of truth in this repo: `api-worker/src/storeDO.ts`, `wene-mobile/src/screens/user/*`, `wene-mobile/src/screens/admin/*`, `grant_program/programs/grant_program/src/lib.rs`.

## Stage Clarity
> - [Implemented] Off-chain Attend issues a participation ticket (`confirmationCode` + `ticketReceipt`) without requiring a wallet when policy allows.
> - [Optional] On-chain redeem/proof runs only on the on-chain path; tx signature / receipt pubkey / Explorer evidence are conditional outputs.
> - [Implemented] PoP/runtime/audit operational checks are exposed via public endpoints and shown in admin UI.
> - [Planned] Advanced anti-sybil eligibility modules and broader federation are roadmap items.

## Why This Matters
Public grants, school participation, and benefit operations often expose only final outcomes, not the decision/process trail that produced them.

Result-only transparency is insufficient for public trust. Reviewers and auditors need to verify:
- who executed which operation,
- whether process logs are tamper-evident,
- and how process evidence links to settlement evidence.

This repository focuses on that process-accountability gap.

## What’s Implemented Now

### Truth Table (Implemented vs Planned)
| Capability | Status | Evidence |
|---|---|---|
| `Participation Ticket (off-chain Attend)` with immutable audit receipt | `Implemented` | `api-worker/src/storeDO.ts` (`/v1/school/claims`, `/api/events/:eventId/claim`, receipt builder/verify) |
| `On-chain Redeem (optional)` with Phantom signing | `Implemented` | `wene-mobile/src/screens/user/UserConfirmScreen.tsx`, `grant_program/programs/grant_program/src/lib.rs` |
| PoP runtime/public status endpoints | `Implemented` | `/v1/school/pop-status`, `/v1/school/runtime-status`, `/v1/school/audit-status` |
| Admin transfer audit split (`onchain` vs `offchain`) | `Implemented` | `wene-mobile/src/screens/admin/AdminEventDetailScreen.tsx`, `/api/admin/transfers` |
| Master strict disclosure (`master > admin`) | `Implemented` | `/api/master/transfers`, `/api/master/admin-disclosures`, `wene-mobile/app/master/index.tsx` |
| Server-side indexed search with DO SQLite persistence | `Implemented` | `/api/master/search`, `api-worker/src/storeDO.ts` (`master_search_*` tables) |
| FairScale/advanced anti-sybil identity layer | `Planned` | `docs/ROADMAP.md` |
| Dedicated sovereign chain operation | `Planned` | roadmap direction only (not implemented in this repo) |

### 1) Student/User Experience
- `Implemented`: User flow screens are present and connected: `/u/scan` → `/u/confirm` → `/u/success`.
  - Code: `wene-mobile/src/screens/user/UserScanScreen.tsx`, `wene-mobile/src/screens/user/UserConfirmScreen.tsx`, `wene-mobile/src/screens/user/UserSuccessScreen.tsx`
- `Implemented`: User registration/login by `displayName + PIN` / `userId + PIN`.
  - API: `/api/users/register`, `/api/auth/verify`
- `Implemented`: Attend creates artifacts:
  - `confirmationCode`
  - `ticketReceipt` (`receiptId`, `receiptHash`, `entryHash`, `prevHash`, `streamPrevHash`, immutable sink refs)
  - Code: `api-worker/src/storeDO.ts` (`buildParticipationTicketReceipt`, `storeParticipationTicketReceipt`)
- `Implemented`: walletless path exists, with policy conditions:
  - `/r/school/:eventId` web flow can use `joinToken` (walletless Attend)
  - `/u/*` flow can complete without wallet only when event/policy does not require on-chain proof
  - Code: `wene-mobile/src/hooks/useSchoolClaim.ts`, `api-worker/src/storeDO.ts`
- `Implemented`: `On-chain Redeem (optional)` path returns `txSignature`, `receiptPubkey`, `mint`, and PoP hashes when used.

### 2) Operator/Admin Experience
- `Implemented`: Admin login and role-based operator auth.
  - UI: `/admin/login`
  - API: `/api/admin/login`
- `Implemented`: Event issuance requires runtime readiness + wallet signing.
  - UI: runtime card and checks in `AdminCreateEventScreen`
  - API: `/v1/school/runtime-status`
- `Implemented`: Admin dashboard shows PoP runtime proof card and verification endpoint.
  - UI: `wene-mobile/src/screens/admin/AdminEventsScreen.tsx`
- `Implemented`: Event detail view includes:
  - participant list + confirmation codes
  - transfer audit grouped as `On-chain署名` and `Off-chain監査署名`
  - Code: `wene-mobile/src/screens/admin/AdminEventDetailScreen.tsx`
- `Implemented`: Master dashboard can issue/revoke/rename admin codes, inspect disclosures, and run indexed search.
  - UI: `wene-mobile/app/master/index.tsx`
  - API: `/api/admin/invite`, `/api/admin/revoke`, `/api/admin/rename`, `/api/master/admin-disclosures`, `/api/master/search`

### 3) Security / Abuse Resistance (Current + Planned)
- `Implemented`: per-subject claim gating with interval policy and `alreadyJoined` behavior.
  - Code: `api-worker/src/claimLogic.ts`
- `Implemented`: on-chain proof fields required when `ENFORCE_ONCHAIN_POP=true` and event has on-chain config.
  - API checks in `/v1/school/claims` and `/api/events/:eventId/claim`
- `Implemented`: immutable audit fail-close mode (`AUDIT_IMMUTABLE_MODE=required`) blocks mutating APIs if sink is not operational.
  - Code: `api-worker/src/storeDO.ts`
- `Implemented`: strict disclosure levels:
  - admin can view transfer identifiers without PII (`strictLevel: admin_transfer_visible_no_pii`)
  - master can view full disclosure (`strictLevel: master_full`)
- `Planned`: stronger anti-sybil/eligibility integration (e.g., FairScale-class gating).

## Architecture

```text
L3: UI (Implemented)
  - User screens: /u/* and /r/school/:eventId (RN/Web)
  - Admin/Master screens: /admin/*, /master/*
          |
          v
L2: Process Proof + Ops API (Implemented)
  - Cloudflare Worker + Durable Object
  - Append-only audit hash chain + immutable sinks
  - Receipt verify endpoints, admin/master disclosure/search
          |
          v
L1: Settlement (Implemented, policy-gated/optional per event)
  - Solana Anchor program (`grant_program`)
  - PoP-verified claim instructions + claim receipts

Dev-only optional path:
  - `wene-mobile/server/*` is a local mock API for development tests.
```

## Reviewer Quickstart (10 Minutes)

### A) Live URLs (recommended)
- User app: `https://instant-grant-core.pages.dev/`
- Admin login: `https://instant-grant-core.pages.dev/admin/login`
- Master login: `https://instant-grant-core.pages.dev/master/login`

### B) 2-minute runtime checks
```bash
BASE="https://instant-grant-core.pages.dev"
curl -s "$BASE/health"
curl -s "$BASE/v1/school/pop-status"
curl -s "$BASE/v1/school/runtime-status"
curl -s "$BASE/v1/school/audit-status"
```
Expected:
- `/health` returns `{"ok":true}`
- `pop-status.signerConfigured=true`
- `runtime-status.ready=true`
- `audit-status.operationalReady=true`

### C) UI click path (admin login → event → print QR → scan → confirm → success)
1. Open `/admin/login` and sign in with an issued admin code (or demo/admin password provided by operator).
2. Open a `Published` event, then open `印刷用PDF` and display the QR.
3. On user app (`/u`), do register/login (`/u/register` or `/u/login`), then scan (`/u/scan`) the QR.
4. Confirm on `/u/confirm` (PIN required; Phantom required only when event policy enforces on-chain proof).
5. Land on `/u/success`.

Expected output at the end:
- Off-chain Attend evidence:
  - `confirmationCode`
  - `監査レシート（参加券）` card with `receipt_id` and `receipt_hash`
- On-chain Redeem evidence (if that path is used):
  - `txSignature` + `receiptPubkey` + `mint`
  - Explorer buttons for tx/address evidence
  - PoP proof values (`signer`, `entry_hash`, `audit_hash`)

### D) Verify ticket evidence by code
Use `eventId` + `confirmationCode` from success UI:
```bash
curl -s -X POST "$BASE/api/audit/receipts/verify-code" \
  -H "content-type: application/json" \
  -d '{"eventId":"<EVENT_ID>","confirmationCode":"<CONFIRMATION_CODE>"}'
```
Expected: `ok=true` and a `verification.checks` object with chain/hash validations.

### E) Common failure modes and misconfiguration signals
- `runtime-status.ready=false`:
  - Check `blockingIssues` for `ADMIN_PASSWORD`, PoP signer, or immutable sink setup.
- `PoP signer not configured` / `PoP署名者公開鍵...`:
  - Check `POP_SIGNER_*` worker secrets and `EXPO_PUBLIC_POP_SIGNER_PUBKEY`.
- `on-chain claim proof required` / `wallet_required`:
  - Event is on-chain-configured + enforcement is on; wallet+proof fields are missing.
- `401 Unauthorized` on `/api/admin/*` or `/api/master/*`:
  - Missing/invalid bearer token for admin/master routes.

### F) Local run (minimal reproducibility)
```bash
cd api-worker && npm ci && npm test && npx tsc --noEmit
cd ../wene-mobile && npm ci && npm run test:server && npx tsc --noEmit
```

## Verification Evidence

### 1) Off-chain evidence `[Implemented]`
From `/u/success` after Attend:
- `confirmationCode`
- `監査レシート（参加券）` (`receipt_id`, `receipt_hash`)
- copy payload includes `verify_api: /api/audit/receipts/verify-code`

Verify by code:
```bash
curl -s -X POST "https://instant-grant-core.pages.dev/api/audit/receipts/verify-code" \
  -H "content-type: application/json" \
  -d '{"eventId":"<EVENT_ID>","confirmationCode":"<CONFIRMATION_CODE>"}'
```
Expected: `ok=true` with chain/hash checks in `verification.checks`.

### 2) On-chain evidence `[Optional]`
Only when on-chain path is actually executed in `wene-mobile/src/screens/user/UserConfirmScreen.tsx`:
- success UI shows `txSignature`, `receiptPubkey`, optional `mint`, PoP values
- Explorer links appear only when those values exist

Explorer format:
- Tx: `https://explorer.solana.com/tx/<signature>?cluster=devnet`
- Receipt/Mint: `https://explorer.solana.com/address/<pubkey>?cluster=devnet`

### 3) PoP/runtime operational status `[Implemented]`
Admin UI route:
- `/admin` events list shows `PoP稼働証明` card in `wene-mobile/src/screens/admin/AdminEventsScreen.tsx`
- card displays `verification endpoint: /v1/school/pop-status`

Runtime/API checks:
```bash
curl -s https://instant-grant-core.pages.dev/v1/school/pop-status
curl -s https://instant-grant-core.pages.dev/v1/school/runtime-status
curl -s https://instant-grant-core.pages.dev/v1/school/audit-status
```
Interpretation:
- `pop-status.enforceOnchainPop=true` and `pop-status.signerConfigured=true` indicates on-chain PoP enforcement is configured.
- `runtime-status.ready=true` means operational prerequisites are satisfied.
- `audit-status.operationalReady=true` means immutable sink path is available.
- `audit-integrity.ok=true` confirms recent chain integrity checks:
```bash
curl -s -H "Authorization: Bearer <MASTER_PASSWORD>" \
  "https://instant-grant-core.pages.dev/api/master/audit-integrity?limit=50"
```

### 4) Where evidence appears in UI
- PoP runtime evidence card:
  - `wene-mobile/src/screens/admin/AdminEventsScreen.tsx`
  - labels include `PoP稼働証明` and endpoint `/v1/school/pop-status`
- On-chain vs off-chain transfer separation:
  - `wene-mobile/src/screens/admin/AdminEventDetailScreen.tsx`
  - labels include `On-chain署名` and `Off-chain監査署名`
- Participation ticket evidence card and copy action:
  - `wene-mobile/src/screens/user/UserSuccessScreen.tsx`

## Milestones / What Grant Funds

| Milestone | Deliverable | Success Criteria | Reviewer-verifiable Evidence |
|---|---|---|---|
| M1: Reproducibility Pack | Fast reviewer runbook and stable verification steps for live + local | A reviewer can execute runtime checks and tests without hidden setup | This README + `api-worker/package.json` scripts + `wene-mobile/package.json` scripts |
| M2: Evidence-first Ticket UX/API | Make `Participation Ticket (off-chain)` the primary evidence artifact across flows | `confirmationCode + ticketReceipt` is visible in UI and verifiable by API for created/already paths | `wene-mobile/src/screens/user/UserSuccessScreen.tsx`, `/api/audit/receipts/verify-code`, `api-worker/src/storeDO.ts` |
| M3: Scale-ready operator verification (planned) | Harden indexed search and policy modules; add L1 adapter abstraction (not a new chain launch) | Search and disclosure stay stable with larger datasets; policy modules are test-covered and explicit | `/api/master/search`, `api-worker/src/storeDO.ts` (SQLite index), future PR/tests for adapter abstraction |

## Scope Clarity

> **In scope for this repo / this grant**
> - Reproducible school participation flow
> - `Participation Ticket (off-chain Attend)` with immutable audit receipt
> - Policy-gated `On-chain Redeem (optional)`
> - Admin/master auditability, disclosure separation, and verification endpoints
>
> **Out of scope (planned)**
> - Full walletless on-chain settlement for every event policy
> - Federation across institutions/municipalities
> - Dedicated sovereign chain deployment

## Links and Docs
- Architecture: `docs/ARCHITECTURE.md`
- Security: `docs/SECURITY.md`
- Roadmap: `docs/ROADMAP.md`
- Devnet setup: `docs/DEVNET_SETUP.md`
- Worker API details: `api-worker/README.md`
- UI verification report: `wene-mobile/docs/STATIC_VERIFICATION_REPORT.md`

### Reviewer Shortcut (source of truth files)
- `api-worker/src/storeDO.ts`
- `api-worker/src/claimLogic.ts`
- `grant_program/programs/grant_program/src/lib.rs`
- `wene-mobile/src/screens/user/UserConfirmScreen.tsx`
- `wene-mobile/src/screens/user/UserSuccessScreen.tsx`
- `wene-mobile/src/screens/admin/AdminEventsScreen.tsx`
- `wene-mobile/src/screens/admin/AdminEventDetailScreen.tsx`
- `wene-mobile/app/master/index.tsx`

## License
MIT
