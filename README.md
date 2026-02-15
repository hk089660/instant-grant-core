# We-ne (instant-grant-core)

We-ne is an open-source prototype/evaluation kit for validating non-custodial support distribution and participation-ticket operations on Solana. It emphasizes third-party verifiability and duplicate-claim prevention using receipt records.

> Status (as of February 11, 2026): **PoC / devnet-first**. This is not for production mainnet operations; the goal is reproducibility and reviewer verification.

[Japanese README](./README.ja.md) | [Architecture](./docs/ARCHITECTURE.md) | [Devnet Setup](./docs/DEVNET_SETUP.md) | [Security](./docs/SECURITY.md)

## What This Prototype Solves

- Non-custodial distribution: recipients sign with their own wallets, and the app does not hold private keys.
- Auditability: tx/receipt records can be independently verified in Solana Explorer.
- Duplicate-claim prevention: receipt logic enforces one claim, and re-applications in the school flow are treated as operational completion with `already joined`, not double payout.

## Current PoC Status

- Devnet E2E claim flow is available (wallet sign -> send -> Explorer verification).
- School event QR flow is available (`/admin` -> print QR -> `/u/scan` -> `/u/confirm` -> `/u/success`).
- On the success screen, you can check tx signature + receipt pubkey + Explorer links (devnet).
- Re-applications are treated as operational completion with `already joined`; no double payout is made.

## Trust Layer: Participation and Claim Eligibility Gate with FairScale

Status: Planned

- FairScale is planned as a trust signal for abuse resistance (Sybil pressure), not a cosmetic label.
- The planned eligibility-gate points are before claim acceptance on `POST /v1/school/claims`, and before server-side issuance/validation of participant identity tokens.
- Eligibility gating currently enforced in code is event-state eligibility (`published` only) and duplicate-subject checks by `walletAddress` / `joinToken` (for duplicates, it returns `alreadyJoined` instead of double payout).
- FairScale runtime integration is not implemented yet; the milestone is listed in `./docs/ROADMAP.md` (`FairScale Integration`) and referenced as planned in `./docs/SECURITY.md`.
- As an abuse-suppression effect, combining on-chain receipt controls with off-chain eligibility gating can reduce duplicate-claim paths while preserving non-custodial onboarding.
- Current review verification: run `cd wene-mobile && npm run test:server` and `cd api-worker && npm test`, then check `/v1/school/claims` behavior for `eligibility` / `alreadyJoined`.

Reviewer shortcut: check `./wene-mobile/server/routes/v1School.ts`, `./api-worker/src/claimLogic.ts`, `./docs/SECURITY.md`, and `./docs/ROADMAP.md`.

Why it matters for Solana Foundation / Instagrant: this is an element for balancing permissionless onboarding that preserves auditability with stronger abuse resistance.

## Camera / QR Scan Implementation Status

Status: Implemented (PoC)

- Currently working: the admin print page (`/admin/print/<eventId>`) generates a QR for `/u/scan?eventId=<eventId>`, and supports print/PDF output.
- Currently working: the user page `/u/scan` implements QR reading with camera permission handling (in-app decode).
- Currently working: `eventId` is extracted from QR text and can navigate to `/u/confirm?eventId=<eventId>`.
- Currently working: web uses `@zxing/browser` for reading (fallback for browsers without BarcodeDetector support).
- Current limitation: scan fallback is URL-based (`evt-001` when `eventId` is unspecified), prioritizing PoC demo reproducibility.
- Current reviewer test: follow the current Demo steps and verify `/u/scan -> /u/confirm -> /u/success` and Explorer links.

Reviewer shortcut: check `./wene-mobile/src/screens/user/UserScanScreen.tsx` and `./wene-mobile/src/screens/admin/AdminPrintScreen.tsx`.

### Roadmap (PoC Completion)

- Milestone 1 (`Status: Completed`): implement real scan processing in `/u/scan` (QR decode + permission handling).
- Milestone 2 (`Status: Planned`): add manual `eventId` fallback + expired/invalid QR messages, and lock behavior with UI/API tests.

## Quickstart (Local)

```bash
cd wene-mobile
npm i
npm run dev:full
```

After startup, check:

- Admin list page: `http://localhost:8081/admin`
- User scan path: `http://localhost:8081/u/scan?eventId=evt-001`

## Quickstart (Cloudflare Pages)

Cloudflare Pages settings for this monorepo:

- Root directory: `wene-mobile`
- Build command: `npm ci && npm run export:web`
- Output directory: `dist`

Required conditions for `export:web`:

- Set the Worker URL in `EXPO_PUBLIC_API_BASE_URL` (or `EXPO_PUBLIC_SCHOOL_API_BASE_URL`).
- If it is not set, `scripts/gen-redirects.js` fails. If proxy redirects are not generated, `/api/*` and `/v1/*` may hit Pages directly and return `405` or HTML.

Copy-paste deployment commands:

```bash
cd wene-mobile
EXPO_PUBLIC_API_BASE_URL="https://<your-worker>.workers.dev" npm run export:web
npm run deploy:pages
npm run verify:pages
```

## Demo / Reproduction (1-page)

1. Open the admin event list: `/admin`
2. Open event details: `/admin/events/<eventId>` (example: `evt-001`; state should preferably be `published`).
3. From "印刷用PDF" on the details page, go to the print page: `/admin/print/<eventId>`.
4. Confirm the printed QR points to `/u/scan?eventId=<eventId>`.
5. On the user side, open the QR URL -> `/u/confirm?eventId=<eventId>` -> claim -> `/u/success?eventId=<eventId>`.
6. On the success screen, check Explorer links for tx signature and receipt pubkey:
- `https://explorer.solana.com/tx/<signature>?cluster=devnet`
- `https://explorer.solana.com/address/<receiptPubkey>?cluster=devnet`
7. Claim again with the same QR: expected behavior is operational completion with `already joined` (no duplicate payout).

## Verification Commands

Pages verification chain:

```bash
cd wene-mobile
npm run export:web
npm run deploy:pages
npm run verify:pages
```

`verify:pages` check items:

- Bundle SHA256 served at `/admin` matches local `dist`.
- `GET /v1/school/events` returns `200` and `application/json`.
- `POST /api/users/register` is **not** `405 Method Not Allowed`.

Manual spot checks:

```bash
BASE="https://<your-pages-domain>"

curl -sS -D - "$BASE/v1/school/events" -o /tmp/wene_events.json | sed -n '1p;/content-type/p'
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Content-Type: application/json' \
  -d '{}' \
  "$BASE/api/users/register"
```

## Troubleshooting / Known Behaviors

- `/v1/school/events` returns HTML: `_redirects` proxy is not applied, or the wrong artifact was deployed.
- Directly fetching `/_redirects` returns 404: this can be normal on Pages. Check runtime behavior by confirming `/v1` is JSON and `/api` is non-405.
- Login/user state is expected to persist in browser or device storage. Private browsing is recommended for shared-device testing.
- Web `/u/scan` camera scan is implemented (PoC), but may fail depending on browser/device permissions or compatibility. For maximum demo reproducibility, scan the printed QR using a smartphone camera/QR reader to open `/u/scan?eventId=<eventId>`.

## Detailed Docs

- School PoC guide: `./wene-mobile/README_SCHOOL.md`
- Cloudflare Pages deployment notes: `./wene-mobile/docs/CLOUDFLARE_PAGES.md`
- Worker API details: `./api-worker/README.md`
- Devnet setup: `./docs/DEVNET_SETUP.md`

## Reviewer Context

This repository is a prototype/evaluation kit for grant/PoC review. The priority is not feature marketing, but reproducibility and independent verification (especially devnet Explorer evidence).
