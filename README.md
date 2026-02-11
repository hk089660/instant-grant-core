# We-ne (instant-grant-core)

Open-source public-good prototype for **non-custodial support distribution and participation tickets** on Solana.

> Status (as of February 11, 2026): **PoC / devnet-first**. Built for reproducibility and third-party verification, not for production mainnet use.

[Japanese README](./README.ja.md) | [Architecture](./docs/ARCHITECTURE.md) | [Devnet Setup](./docs/DEVNET_SETUP.md) | [Security](./docs/SECURITY.md)

## Problem
Public benefit and participation programs often fail on five points:

- Slow delivery from approval to receipt
- Expensive operations for small-value grants
- Weak auditability (hard for third parties to verify outcomes)
- Abuse pressure (duplicate claims, repeated participation attempts)
- Privacy risk when systems require excessive personal data

## Solution
We-ne combines two approaches:

- **On-chain non-custodial claim flow (Solana devnet)**
- **Operational school PoC flow (QR-based participation UX + API)**

Core design principles:

- Recipient keeps custody (wallet signs, app does not hold private keys)
- On-chain `ClaimReceipt` PDA enforces one-claim-per-period
- Explorer-verifiable transaction trail for independent review
- Practical event-day UX (printable QR, confirm/success flow, already-joined treated as operational completion)

## What Is Built Now (Fact-Based)

- **Anchor grant program** in `./grant_program/programs/grant_program/src/lib.rs`
- `ClaimReceipt` PDA double-claim prevention (`receipt` seeded by grant + claimer + period index)
- Devnet program ID wired in code and Anchor config (`GZcUoGHk8SfAArTKicL1jiRHZEQa3EuzgYcC2u4yWfSR`)
- **School PoC UI routes** implemented:
  - `/admin` (events)
  - `/admin/print/[eventId]` (printable QR + event ID text)
  - `/u/scan` -> `/u/confirm?eventId=...` -> `/u/success?eventId=...`
- **School API surface** implemented in both local server and Workers:
  - `GET /v1/school/events`
  - `GET /v1/school/events/:eventId`
  - `POST /v1/school/claims`
  - `POST /api/users/register`
- **Cloudflare Pages proxy hardening path** implemented:
  - `npm run export:web` generates `dist` and runs `scripts/gen-redirects.js`
  - `_redirects` includes `/api/*` and `/v1/*` proxy rules plus SPA fallback
- **Verification assets** are present:
  - `./wene-mobile/scripts/verify-pages-build.sh`
  - `./wene-mobile/scripts/gen-redirects.js`
  - `./api-worker/test/claimPersistence.test.ts`
  - `./wene-mobile/server/__tests__/schoolApi.test.ts`

### Important Current Constraints

- Devnet-only assumption for Solana claim testing
- PoC is not audited
- School `/u/scan` screen currently uses a mock camera UI; QR handoff is URL-driven (`/u/scan?eventId=...`)
- School mode and Solana wallet flow are both in the repo, but they are different runtime paths

## Demo (Fastest Review Path)

### A. School PoC Demo (QR -> confirm -> success)

1. Open admin events page: `/admin`
2. Open print page: `/admin/print/evt-001`
3. Print QR (or save PDF) containing `/u/scan?eventId=evt-001`
4. Open scanned URL on user side
5. Continue to `/u/confirm?eventId=evt-001`
6. Submit participation and reach `/u/success?eventId=evt-001`

Operational behavior already implemented:

- `alreadyJoined` is handled as completion (reduces event-day dead-ends)
- Event state gating exists (`published` vs non-published)
- Retryable error path exists (`evt-003` test case)

### B. Solana Devnet E2E Claim (wallet sign -> send -> Explorer)

- Route: `/r/demo-campaign?code=demo-invite`
- Flow: Phantom connect -> sign transaction -> send -> show tx status
- Explorer tx verification link pattern:
  - `https://explorer.solana.com/tx/<signature>?cluster=devnet`
- Receipt account is created by on-chain logic (ClaimReceipt PDA); seeds and behavior are test-covered in `grant_program` tests

## Repro / Verify (Copy-Paste)

### 1) Local API and Worker Logic Tests

```bash
# School API integration tests
cd wene-mobile
npm run test:server

# Worker claim persistence tests
cd ../api-worker
npm test
```

### 2) Devnet Grant Setup (for on-chain claim demos)

```bash
cd grant_program
yarn devnet:setup
```

Then paste `_RAW` output into `./wene-mobile/src/solana/devnetConfig.ts`.

Detailed guide: `./docs/DEVNET_SETUP.md`

### 3) Pages Deploy Verification Chain (required)

```bash
cd wene-mobile
npm run export:web
npm run deploy:pages
npm run verify:pages
```

`verify:pages` is intended to fail fast when production routing is wrong. It checks:

- Local `dist` JS bundle hash vs production `/admin` bundle hash
- `/v1/school/events` is API-like (JSON) rather than Pages HTML
- `POST /api/users/register` is **not** `405 Method Not Allowed`

Expected behavior:

- Success path logs `OK:` lines and exits `0`
- Failure path logs `FAIL:` line and exits non-zero

### 4) Manual API Reachability Check (curl)

```bash
BASE="https://<your-pages-domain>"

# Should be HTTP 200 + content-type containing application/json
curl -sS -D - "$BASE/v1/school/events" -o /tmp/wene_events.json | sed -n '1p;/content-type/p'
head -c 160 /tmp/wene_events.json && echo

# Should NOT be 405 (400/401/200 can be valid depending validation/auth)
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Content-Type: application/json' \
  -d '{}' \
  "$BASE/api/users/register"
```

If you see `text/html` for `/v1/school/events` or `405` for `/api/users/register`, Pages is still handling API paths directly (proxy misroute).

## Deployment (Cloudflare Pages + Workers)

### Recommended: Wrangler-based deploy

1. Deploy Worker API:

```bash
cd api-worker
npm i
npm run deploy
```

2. Set Pages env vars:

- `EXPO_PUBLIC_API_MODE=http`
- `EXPO_PUBLIC_API_BASE_URL=https://<your-worker>.workers.dev`
- `EXPO_PUBLIC_BASE_URL=https://<your-pages>.pages.dev`

3. Build and deploy Pages from `./wene-mobile`:

```bash
npm run export:web
npm run deploy:pages
```

Why this matters:

- `scripts/gen-redirects.js` writes proxy-safe `dist/_redirects`
- Prevents `/api/*` and `/v1/*` from falling through to static Pages responses

### Not Recommended: Manual ZIP upload

Manual ZIP is error-prone (common failure: `_redirects` missing or wrong path). Prefer `wrangler pages deploy`.

Fallback helper exists at `./wene-mobile/scripts/make-dist-upload-zip.sh` if manual upload is unavoidable.

## Roadmap (With a $3,000 Microgrant)

Target: small, realistic, measurable improvements for reproducibility and trust.

- **Workstream 1: Verification hardening**
  - Stabilize Pages verification script path and outputs
  - Add one-command reviewer checklist for routing and API reachability
- **Workstream 2: Demo reliability**
  - Tighten QR print -> user completion walkthrough
  - Produce repeatable devnet demo script for external reviewers
- **Workstream 3: Minimal abuse controls v0**
  - Strengthen duplicate-participation checks in school flow
  - Clarify operator runbooks for already-joined and retryable cases
- **Workstream 4: Documentation for grant reviewers**
  - Keep README + docs aligned with live commands only
  - Add explicit evidence paths (tests, scripts, explorer links)

## Milestones (2-4 Weeks)

1. **Week 1: Repro Baseline**
- Deliverable: updated verification checklist + green local tests
- Verification: `npm run test:server`, `cd api-worker && npm test`

2. **Week 2: Pages/Workers Reliability**
- Deliverable: repeatable deploy + proxy verification flow
- Verification: `npm run export:web && npm run deploy:pages && npm run verify:pages`

3. **Week 3: Demo Packaging for Reviewers**
- Deliverable: short reviewer script for school PoC and devnet claim path
- Verification: route walkthrough (`/admin/print/evt-001` to `/u/success`) + devnet explorer tx link

4. **Week 4: Abuse-Resilience v0 + Docs Finalization**
- Deliverable: tightened edge-case handling docs and tests
- Verification: test updates + reproducible runbook from clean environment

## Why This Fits a Microgrant

- Open-source MIT project with public-good orientation
- Concrete, verifiable scope sized for **sub-$10k / microgrant** execution
- Focus on reproducibility, operational clarity, and auditable behavior over speculative expansion

## Links

- Public demo URL (Pages): [https://we-ne-school-ui.pages.dev](https://we-ne-school-ui.pages.dev)
- School PoC guide: `./wene-mobile/README_SCHOOL.md`
- Cloudflare Pages setup: `./wene-mobile/docs/CLOUDFLARE_PAGES.md`
- Worker API details: `./api-worker/README.md`
- Devnet setup guide: `./docs/DEVNET_SETUP.md`
- Architecture: `./docs/ARCHITECTURE.md`
- Security model: `./docs/SECURITY.md`
- GitHub issues: [https://github.com/hk089660/instant-grant-core/issues](https://github.com/hk089660/instant-grant-core/issues)
- GitHub pull requests: [https://github.com/hk089660/instant-grant-core/pulls](https://github.com/hk089660/instant-grant-core/pulls)

---

Short Japanese note: このREADMEは「いま再現できる手順」と「第三者検証できる導線」を優先して更新しています。PoC段階のため、mainnet運用前提の記述は避けています。
