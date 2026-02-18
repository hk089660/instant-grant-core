# Asuka Network Core (Prototype)
> **Public Blockchain Protocol based on Proof of Process (PoP), Auditable & Made in Japan**

[![Solana](https://img.shields.io/badge/Solana-Mainnet-green?style=flat&logo=solana)]
[![Edge](https://img.shields.io/badge/Edge-Cloudflare_Workers-orange?style=flat&logo=cloudflare)]
[![License](https://img.shields.io/badge/License-MIT-blue)]
[![Status](https://img.shields.io/badge/Status-Mitou_Applied-red)]

## ⚡ Live Demo (We-ne)
The first reference implementation for government and public sectors running on Asuka Network, "We-ne", is available to experience directly from your browser.
No installation required. Experience the lightning-fast approval process powered by the edge.

[🚀 **Launch We-ne (Web App)**](https://instant-grant-core.pages.dev/)

---

## 📖 Project Overview
**Asuka Network** is a next-generation public infrastructure protocol designed to solve "Process Opacity" in administrative procedures and grant distributions.

Existing public blockchains guarantee the integrity of "results (balance transfers)", but the "process (how the transaction was generated)" has remained a black box.
This project proposes and implements a new consensus concept called **"Proof of Process (PoP)"**, where Web2-style API logs are carved into an irreversible hash chain and mathematically bound to on-chain settlements.

## 🏗 Architecture: Trinity of Trust
This repository defines "accountability" in code through the following three-layer structure (Trinity Architecture).

### 1. Layer 1: The Vault (Guarantee of Result)
* **Tech Stack:** Rust, Anchor Framework (Solana SVM)
* **Role:** Storage of value and settlement finality.
* **Innovation:** Uses **PDA (Program Derived Address)** deterministic seed generation to prevent "Double-Spending" at a physical law level, without relying on databases.
* [📂 View Contract Code](./grant_program)

### 2. Layer 2: The Time (Proof of Process)
* **Tech Stack:** TypeScript, Cloudflare Workers (Edge Computing)
* **Role:** Auditor of time and process.
* **Innovation:** Generates an **Append-only Hash Chain** in real-time for every request, including the previous log hash.
    * This makes it mathematically impossible for even administrators to tamper with or conceal a single bit of past history.
* [📂 View API Code](./api-worker)

### 3. Layer 3: The Interface (Protection of Intent)
* **Tech Stack:** React Native, React Native Web, NaCl
* **Role:** Sovereign interface for citizens.
* **Innovation:** Uses **NaCl (Curve25519)** for End-to-End Encryption (E2EE) to completely protect user signatures (intent) from Man-in-the-Middle attacks until they reach the protocol. Deployed as a censorship-resistant PWA.
* [📂 View Mobile Code](./wene-mobile)

## 🦁 Philosophy: Beyond Winny
Peer-to-Peer (P2P) technology once aimed for "freedom without administrators", but what society demanded was "trust with clear accountability".
Asuka Network inherits the autonomous decentralized philosophy of P2P while implementing **complete auditability via "Proof of Process"**, aiming to become a domestic digital public infrastructure that government and public services can rely on with confidence.

## 🛠 Roadmap (Goals during Mitou Period)
- [x] **Phase 1: Genesis (Completed)**
    - Integrated implementation of SVM contract (Rust) and Edge Hash Chain (TS).
    - Deployment of MVP app "We-ne" as PWA.
- [ ] **Phase 2: Gating (In Development)**
    - Implementation of logic to forcibly reject transactions on the L1 contract side if they lack a valid PoP proof from the API layer.
- [ ] **Phase 3: Federation**
    - Expansion to a consortium model where municipalities and public institutions can participate as nodes.

## 👨💻 Author
**Kira (hk089660)**
* 19 years old. Asuka Network Architect.
* *Driven by the legacy of Winny, powered by modern cryptography.*

---

# We-ne (instant-grant-core)

We-ne is an open-source prototype/evaluation kit for verifying non-custodial aid distribution and participation ticket operations on Solana. It emphasizes third-party verifiability using receipt records and prevention of duplicate reception.

> Status (as of Feb 11, 2026): **PoC / devnet-first**. This is for reproducibility and evaluation verification, not for production mainnet operation.

[Japanese README](./README.ja.md) | [Architecture](./docs/ARCHITECTURE.md) | [Devnet Setup](./docs/DEVNET_SETUP.md) | [Security](./docs/SECURITY.md)

## What this prototype solves

- Non-custodial Distribution: Recipients sign with their own wallets; the app does not hold private keys.
- Auditability: tx/receipt records can be independently verified on Solana Explorer.
- Duplicate Prevention: Receipt logic enforces single reception; re-application in the school flow is treated as `already joined` (operation complete) rather than a double payment.

## Current PoC Status

- Devnet E2E claim flow available (wallet sign -> send -> Explorer verification).
- School event QR flow available (`/admin` -> Print QR -> `/u/scan` -> `/u/confirm` -> `/u/success`).
- Success screen shows tx signature + receipt pubkey + Explorer link (devnet).
- Re-application is treated as `already joined` (operation complete), no double payment.

## Trust Layer: Participation & Eligibility Gating via FairScale

Status: Planned

- FairScale is planned to be introduced as a trust signal for abuse resistance (Sybil pressure countermeasures), not just a cosmetic label.
- Planned gating points are before claim acceptance at `POST /v1/school/claims` and before server-side issuance/verification of participant identification tokens.
- Currently valid code gates are event state qualification (`published` only) and duplicate entity check by `walletAddress` / `joinToken` (returns `alreadyJoined` on duplicate, not double payment).
- Runtime integration of FairScale is unimplemented; milestones are listed in `./docs/ROADMAP.md` (`FairScale Integration`) and referenced as planned in `./docs/SECURITY.md`.
- As an abuse deterrence effect, combining on-chain receipt control with off-chain eligibility gating reduces duplicate claim paths while maintaining non-custodial onboarding.
- Current review verification involves running `cd wene-mobile && npm run test:server` and `cd api-worker && npm test` to confirm `eligibility` / `alreadyJoined` behavior at `/v1/school/claims`.

Reviewer shortcut: Check `./wene-mobile/server/routes/v1School.ts`, `./api-worker/src/claimLogic.ts`, `./docs/SECURITY.md`, and `./docs/ROADMAP.md`.

Why it matters for Solana Foundation / Instagrant: It is an element to achieve both permissionless onboarding with auditability and stronger abuse resistance.

## Camera/QR Scan Implementation Status

Status: Implemented (PoC)

- Currently Working: Admin print screen (`/admin/print/<eventId>`) generates QR for `/u/scan?eventId=<eventId>`, printable/PDF export.
- Currently Working: User screen `/u/scan` implements QR reading with camera permission handling (in-app decode).
- Currently Working: Extract `eventId` from QR string and navigate to `/u/confirm?eventId=...`.
- Currently Working: Web uses `@zxing/browser` for reading (fallback even for non-BarcodeDetector browsers).
- Current Limitations: Scan fallback is URL-based (defaults to `evt-001` if `eventId` is unspecified), prioritizing PoC demo reproducibility.
- Current Reviewer Test: Confirm `/u/scan -> /u/confirm -> /u/success` and Explorer link following current Demo steps.

Reviewer shortcut: Check `./wene-mobile/src/screens/user/UserScanScreen.tsx` and `./wene-mobile/src/screens/admin/AdminPrintScreen.tsx`.

### Roadmap (Until PoC Completion)

- Milestone 1 (`Status: Completed`): Implement actual scan processing (QR decode + permission handling) at `/u/scan`.
- Milestone 2 (`Status: Planned`): Add `eventId` manual entry fallback + expired/invalid QR messages, and fix via UI/API tests.

## Quick Start (Local)

```bash
cd wene-mobile
npm i
npm run dev:full
```

Check after startup:

- Admin Dashboard: `http://localhost:8081/admin`
- User Scan Flow: `http://localhost:8081/u/scan?eventId=evt-001`

## Quick Start (Cloudflare Pages)

Cloudflare Pages configuration for this monorepo:

- Root directory: `wene-mobile`
- Build command: `npm ci && npm run export:web`
- Output directory: `dist`

Prerequisites for `export:web`:

- Set Worker URL to `EXPO_PUBLIC_API_BASE_URL` (or `EXPO_PUBLIC_SCHOOL_API_BASE_URL`).
- If unset, `scripts/gen-redirects.js` will fail. If proxy redirects are not generated, `/api/*` and `/v1/*` may hit Pages directly and return `405` or HTML.

Copy-paste Deploy Command:

```bash
cd wene-mobile
EXPO_PUBLIC_API_BASE_URL="https://<your-worker>.workers.dev" npm run export:web
npm run deploy:pages
npm run verify:pages
```

## Demo / Reproduction Steps (1 Page)

1. Open Admin Event List: `/admin`
2. Open Event Details: `/admin/events/<eventId>` (e.g., `evt-001`, state `published` recommended).
3. Navigate to Print Screen from "Print PDF" in details: `/admin/print/<eventId>`.
4. Confirm Print QR link points to `/u/scan?eventId=<eventId>`.
5. Open QR URL on User side -> `/u/confirm?eventId=<eventId>` -> claim -> `/u/success?eventId=<eventId>`.
6. Confirm Explorer links for tx signature and receipt pubkey on Success screen:
- `https://explorer.solana.com/tx/<signature>?cluster=devnet`
- `https://explorer.solana.com/address/<receiptPubkey>?cluster=devnet`
7. Claim again with same QR: Expected behavior is `already joined` (operation complete), no double payment.

## Verification Commands

Pages Verification Chain:

```bash
cd wene-mobile
npm run export:web
npm run deploy:pages
npm run verify:pages
```

Check items for `verify:pages`:

- Bundle SHA256 for `/admin` matches local `dist`.
- `GET /v1/school/events` returns `200` and `application/json`.
- `POST /api/users/register` is **NOT `405 Method Not Allowed`**.

Manual Spot Check:

```bash
BASE="https://<your-pages-domain>"

curl -sS -D - "$BASE/v1/school/events" -o /tmp/wene_events.json | sed -n '1p;/content-type/p'
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Content-Type: application/json' \
  -d '{}' \
  "$BASE/api/users/register"
```

## Troubleshooting / Known Behaviors

- `/v1/school/events` returns HTML: `_redirects` proxy not applied, or wrong artifact deployed.
- Direct fetch of `/_redirects` returns 404: Normal for Pages. Check runtime behavior if `/v1` is JSON or `/api` is non-405.
- Login/User state is assumed to be held in browser or device storage. Private browsing recommended for shared device testing.
- Web `/u/scan` camera scan is implemented (PoC), but may fail depending on browser/device permissions or compatibility. To maximize demo reproducibility, we recommend scanning the printed QR with a smartphone camera/QR reader to open `/u/scan?eventId=<eventId>`.

## Detailed Documentation

- School PoC guide: `wene-mobile/README_SCHOOL.md`
- Cloudflare Pages deployment notes: `CLOUDFLARE_PAGES.md`
- Worker API details: `README.md`
- Devnet setup: `DEVNET_SETUP.md`

## Context for Judges

This repository is a **reproduction/evaluation kit** for grant/PoC review. Please prioritize checking **reproducibility** and **independent verification** (especially Explorer evidence) over feature marketing.
