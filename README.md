# instant-grant-core

Prototype for auditable school participation and grant operations on Solana.
This repository combines an Anchor program, a Cloudflare Worker API, and an Expo / Cloudflare Pages frontend for the We-ne / Asuka Network Core prototype.

[Japanese README](./README.ja.md)

## Snapshot

Verified on 2026-03-10.

- User app: `https://instant-grant-core.pages.dev/`
- Admin app: `https://instant-grant-core.pages.dev/admin/login`
- Worker API: `https://instant-grant-core.haruki-kira3.workers.dev`
- Public readiness endpoints:
  - `https://instant-grant-core.pages.dev/v1/school/pop-status`
  - `https://instant-grant-core.pages.dev/v1/school/runtime-status`
  - `https://instant-grant-core.pages.dev/v1/school/audit-status`
- Public runtime state observed on 2026-03-10:
  - `runtime-status.ready=true`
  - `pop-status.enforceOnchainPop=true`
  - `pop-status.signerConfigured=true`
  - `audit-status.operationalReady=true`

Local validation executed on 2026-03-10:

- `api-worker`: `npm test` -> 80 tests passed
- `wene-mobile`: `npm run test:server` -> 18 tests passed
- `api-worker`: `npx tsc --noEmit` -> passed
- `wene-mobile`: `npx tsc --noEmit` -> passed
- `grant_program`: `anchor build` -> passed
- `grant_program`: `anchor test --skip-build --provider.cluster localnet` -> passed
- root: `npm run check:lockfiles` -> passed
- root: `npm run verify:production` -> 11/11 checks passed

## What This Repo Does

The prototype has three layers:

1. `grant_program/`
   - Solana program built with Anchor.
   - Handles on-chain grant claim execution.
   - When the on-chain route is used, PoP-linked claim evidence is required inside claim instructions.
2. `api-worker/`
   - Cloudflare Worker + Durable Object backend.
   - Issues off-chain participation receipts, exposes admin/master audit APIs, and publishes readiness endpoints.
3. `wene-mobile/`
   - Expo application used for user, admin, and local master flows.
   - Deployed as Cloudflare Pages for the web surfaces.

Current implemented flow:

- Attend: off-chain participation issuance with `confirmationCode` and immutable `ticketReceipt`
- Optional walletless claim path when event policy allows it
- Policy-gated on-chain redeem path with PoP proof and Solana transaction evidence
- Admin participant search, transfer audit, and runtime readiness UI
- Master-only disclosure and indexed search APIs
- API guardrails for rate limiting, payload limits, and Cost of Forgery integration hooks

## Verification Model

- Off-chain Attend can be verified through public receipt APIs such as `/api/audit/receipts/verify-code`, but this still relies on the Worker and stored audit data.
- On-chain Redeem can be verified independently from Solana transaction and account state.
- Current trust model is still prototype-centralized: the system uses a single PoP signer / operator boundary today. Planned decentralization work is tracked in [docs/ROADMAP.md](./docs/ROADMAP.md).

## Repository Layout

- `grant_program/`: Solana contract workspace; commands are defined in [grant_program/package.json](./grant_program/package.json)
- [api-worker/README.md](./api-worker/README.md): API contract, Worker variables, audit and PoP operations
- [wene-mobile/README.md](./wene-mobile/README.md): app-specific flow, mobile/web usage, and Expo details
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md): architecture overview
- [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md): contributor setup
- [docs/DEVNET_SETUP.md](./docs/DEVNET_SETUP.md): devnet claim verification
- [docs/SECURITY.md](./docs/SECURITY.md): security model and operational controls
- [docs/POP_CHAIN_OPERATIONS.md](./docs/POP_CHAIN_OPERATIONS.md): PoP chain recovery and cutover
- [docs/ROADMAP.md](./docs/ROADMAP.md): planned decentralization and pilot milestones

## Prerequisites

Validated locally on 2026-03-10 with:

- Node.js `v20.19.4`
- npm `10.8.2`
- `anchor-cli 0.31.1`
- `solana-cli 3.0.13`
- `rustc 1.92.0`

For app-only work, Node.js and npm are enough.
For contract work, you also need Rust, Solana CLI, and Anchor.

## Install Dependencies

```bash
npm ci

cd api-worker
npm ci

cd ../wene-mobile
npm ci --legacy-peer-deps

cd ../grant_program
npm ci
```

## Validate The Repo

Run the checks that were used for this README refresh:

```bash
npm run check:lockfiles

cd api-worker
npm test
npx tsc --noEmit

cd ../wene-mobile
npm run test:server
npx tsc --noEmit

cd ../grant_program
anchor build
anchor test --skip-build --provider.cluster localnet
```

Notes:

- Root `npm run build` runs `anchor build` and the mobile TypeScript check.
- Root `npm run test` only runs the Anchor test suite.
- `wene-mobile` uses `npm ci --legacy-peer-deps` intentionally.

## Run Locally

### 1. Start the Worker API

```bash
cd api-worker
npx wrangler dev
```

This starts the API at `http://localhost:8787`.

### 2. Configure the frontend

```bash
cd wene-mobile
cp .env.example .env.local
```

Set at least:

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:8787
EXPO_PUBLIC_API_MODE=http
```

For on-chain flows, also configure the Solana values in [wene-mobile/.env.example](./wene-mobile/.env.example), especially:

- `EXPO_PUBLIC_SOLANA_RPC_URL`
- `EXPO_PUBLIC_SOLANA_CLUSTER`
- `PROGRAM_ID`

### 3. Start the web surface

```bash
cd wene-mobile
npm run web
```

Open the local Expo web URL shown in the terminal, then navigate to:

- `/` for the user surface
- `/admin/login` for the admin surface
- `/master/login` for the local master surface

## Verify The Deployed Environment

Quick public checks:

```bash
BASE="https://instant-grant-core.pages.dev"

curl -s "$BASE/v1/school/pop-status"
curl -s "$BASE/v1/school/runtime-status"
curl -s "$BASE/v1/school/audit-status"
```

Full production readiness check:

```bash
npm run verify:production
```

Optional environment variables:

- `WORKER_BASE_URL`
- `PAGES_BASE_URL`
- `SOLANA_RPC_URL`
- `MASTER_TOKEN` for master-protected checks

The current readiness script validates:

- Worker root health
- PoP status
- audit status
- runtime readiness
- Pages proxy readiness
- on-chain `pop-config` alignment for published events
- expected `401` behavior on protected master endpoints without a token

## Key Public Endpoints

- `GET /v1/school/pop-status`
- `GET /v1/school/runtime-status`
- `GET /v1/school/audit-status`
- `POST /api/audit/receipts/verify-code`

See [api-worker/README.md](./api-worker/README.md) for the complete API contract and Worker configuration.

## Development Notes

- Canonical package manager: `npm`
- Canonical lockfiles: root / `api-worker` / `wene-mobile` / `grant_program` `package-lock.json`
- CI enforces the lockfile policy and rejects `yarn.lock`, `pnpm-lock.yaml`, and non-canonical lockfile names
- Root production verification script is [scripts/verify-production-readiness.mjs](./scripts/verify-production-readiness.mjs)

## License

[MIT](./LICENSE)
