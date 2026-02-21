# we-ne (instant-grant-core)

**Solana-based instant grant / benefit distribution PoC**
Non-custodial, transparent, and auditable distribution flows for public-support style use cases.

> **Project Status:** This project is currently under **Superteam Japan Grants** review.
> It is in a **PoC / v0** phase, focused on the demo flow described below.

---

## Recent Updates (Stability Improvements)

* Introduced participation state tracking (**started / completed**) to ensure accurate "incomplete / completed" views for users
* Added **print-friendly QR layout** using CSS print (`@media print`) for reliable offline and backup operations
* Implemented **role-based UI restrictions** (viewer / operator / admin) to improve safety on shared school devices
* Added a development-only role switcher for faster testing and demos (**not visible in production**)

These updates focus on stability, operational safety, and real-world school usage.

---

## Recent Updates (School Participation Flow Refactor)

School participation flow logic, types, and error handling have been restructured for clarity and easy replacement.

* **API layer abstraction:** `SchoolClaimClient` / `SchoolEventProvider` keep screens decoupled while runtime uses HTTP implementation.
* **API mode hardening:** `EXPO_PUBLIC_API_MODE` is treated as `http` only; unsupported values fall back to HTTP with a warning.
* **UI/logic separation via Hook:** `useSchoolClaim` centralizes `idle/loading/success/already/error` states; screens depend only on `state` and `handleClaim`.
* **Unified error representation:** `SchoolClaimResult` (`Success | Failure`), `SchoolClaimErrorCode` (`retryable / invalid_input / not_found`) enable clear logic-side branching. `errorInfo / isRetryable` identify retryable errors.
* **eventId centralization:** `parseEventId / useEventIdFromParams` consolidate query/route parsing and validation; invalid `eventId` redirects to `/u`.
* **Unified routing:** `schoolRoutes` constants for `home/events/scan/confirm/success/schoolClaim`.
* **Unified already-handling:** Already-joined (`alreadyJoined`) also navigates to success screen for consistent UX.
* **Retry flow:** Button label changes to `"Retry"` for retryable errors.

→ Details: **School Participation Flow (Architecture)** and `wene-mobile/docs/STATIC_VERIFICATION_REPORT.md`

---

## Project Status: Claim flow verified on Android (2025)

Claim flow is fully verified on Android (APK) with Phantom wallet:

`connect → sign → send → confirm → token receipt`

Phantom strictly validates cluster consistency (**devnet / testnet / mainnet**). If the transaction is interpreted as mainnet, Phantom may block signing with a warning.

* Deep links and RPC endpoints must explicitly match the target cluster
  (e.g. `cluster=devnet` in redirect URLs and **devnet RPC only**).
* The current PoC is fixed to **devnet** for safety; all RPC and Phantom deeplinks use devnet.

---

## What works today (Demo Flow)

* Scan event QR code
* View event details
* Claim a digital participation ticket
* Ticket is stored and viewable in the app

---

## School Participation Flow (Architecture)

### Flow

* Home → "Start participation" → Event list (`/u`)
* "Participate" → Scan (`/u/scan`)
* "Start scan" → Confirm (`/u/confirm?eventId=evt-001`)
* "Participate" → Claim API → Success (`/u/success?eventId=evt-001`)
* "Done" → Back to list

### Key concepts

| Concept                | Description                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `SchoolClaimClient`    | Interface for the claim API client. Runtime is HTTP-based; tests can still inject custom implementations                              |
| `useSchoolClaim`       | Hook encapsulating claim logic. Exposes status (`idle/loading/success/already/error`), `handleClaim`, `onSuccess`                   |
| `SchoolClaimResult`    | Discriminated union: success `{ success: true, eventName, alreadyJoined? }`, failure `{ success: false, error: { code, message } }` |
| `useEventIdFromParams` | Parses and validates `eventId` from query/route. `redirectOnInvalid: true` replaces to `/u` when invalid                            |
| `schoolRoutes`         | Route constants: `home/events/scan/confirm/success/schoolClaim`                                                                     |

### Demo API cases (for testing)

* `evt-001`: Success
* `evt-002`: Already joined (`alreadyJoined`) → navigates to success screen
* `evt-003`: Retryable (`retryable`) error for retry UX verification

### Verification (static)

* TypeScript: `npx tsc --noEmit` ✅
* `useSchoolClaim` state transitions ✅
* Routing consistency (`eventId` unified via `useEventIdFromParams`) ✅

HTTP errors are mapped to Result (`404→not_found`, `5xx/network→retryable`)

→ Details:

* `wene-mobile/docs/STATIC_VERIFICATION_REPORT.md`
* `docs/DEVELOPMENT.md`
* `wene-mobile/docs/EMULATOR_DEVELOPMENT.md`

---

## First Target Use Case: School Event Participation Ticket

The first concrete use case of We-ne is a digital participation ticket for school events and volunteer activities.

* Students scan a QR code at the event venue
* A non-transferable digital participation ticket is issued instantly
* No monetary value or exchangeability
* Personal information (name, student number) is not exposed externally
* Event organizers can verify participation counts via an admin interface

This use case prioritizes speed, usability, and privacy, making it suitable for real educational environments.

---

## Distribution (School PoC)

* **Students:** native app

  * Android: APK distribution (EAS Build or local build; no Play Store)
  * iOS: TestFlight (planned; EAS Build → IPA → App Store Connect)
* **Web:** Admin & support use only (`/admin/*`)
  Not used for student claim flow; student participation is app-only.

The Expo app is the primary flow for Phantom stability; Web/PWA is not used for the main claim flow.

---

## Deliverables (PoC)

1. **Devnet claim flow on Android with Phantom** (devnet-only)

   * Verified: demo video and steps in `DEVNET_SETUP.md`

2. **Reproducible build/test from repo root**

   * Verified: `npm run build` and `npm run test` (or `scripts/build-all.sh build/test`) succeed in the supported environment
   * Verified: CI and `DEVELOPMENT.md`

3. **School participation UI flow with API-driven claim states**

   * Verified: `/u → /u/scan → /u/confirm → /u/success` and API demo cases `evt-001/002/003` behave as specified
   * Verified: `STATIC_VERIFICATION_REPORT.md`

4. **Print-ready QR and role-restricted admin UI for school devices**

   * Verified: `/admin/print/:eventId` renders CSS print layout and viewer/operator/admin restrictions are enforced
   * Verified: manual check in app and print preview

---

## Next Milestones (PoC)

* Simplify Scan → Confirm → Success flow

  * Verified by: updated demo video and flow section
* Basic admin dashboard (issued / completed counts)

  * Verified by: local run of `wene-mobile/server` and a short demo
* Short demo video (1–2 minutes)

  * Verified by: link in README

---

## Abuse Prevention & Eligibility (PoC)

* Implemented: on-chain double-claim prevention per period using `ClaimReceipt` PDA
* Not implemented: allowlist/Merkle eligibility, FairScale reputation, and production-grade identity checks
* School PoC: optional join-token on the school server can gate participation, but it is not a strong identity system and is out-of-scope for production security

---

## Operational Constraints (QR + Phantom) (PoC)

* Devnet-only; cluster mismatch is blocked by Phantom
* Android: “Phantom → back to browser” is unreliable

  * v0 uses Phantom browse deeplink
    `https://phantom.app/ul/browse/<url>?ref=<ref>`
  * Print the URL shown on the admin print screen (`/admin/print/:eventId`) as a QR code so students open the app inside Phantom
* Redirect-based connect (browser → Phantom → redirect back) is not the primary flow in v0 due to instability

  * `/phantom-callback` exists only for manual recovery

Recommended browsers for `/u/*`: Safari (iOS) / Chrome (Android). Other browsers may be unstable.

---

## School Admin & Off-chain Data Integrity (PoC)

* Admin views and counts are derived from the school API server and its JSON persistence (demo-suitable, not tamper-evident)
* Participation records are not cryptographically signed or independently verifiable in this PoC
* Operational assumption: controlled distribution of QR codes and trusted local operators during the school event

---

## Instant, transparent benefit distribution on Solana — built for Japan's public support needs

[![CI](https://github.com/hk089660/instant-grant-core/actions/workflows/ci.yml/badge.svg)](https://github.com/hk089660/instant-grant-core/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/hk089660/instant-grant-core/blob/main/LICENSE)

**Links:**

* 日本語版 README: `README.ja.md`
* Architecture: `docs/ARCHITECTURE.md`
* Development Guide: `docs/DEVELOPMENT.md`
* Static Verification Report: `wene-mobile/docs/STATIC_VERIFICATION_REPORT.md`
* Emulator Development: `wene-mobile/docs/EMULATOR_DEVELOPMENT.md`

---

## Overview

**日本語:**
We-neは、Solana上で動作する非保管型の支援配布システムのPoCです。現在はプロトタイプ段階で、Phantom連携と基本的なclaimフローが動作しています。本PoCはdevnet固定で、本番利用は想定していません。不正・濫用対策はPoCで限定的で、オンチェーンの二重claim防止が中心です。FairScaleや許可リスト（Allowlist）の連携は計画段階で未実装です。

**English:**
We-ne is a non-custodial benefit distribution PoC built on Solana. It is prototype-stage with Phantom integration and a working basic claim flow. This PoC is devnet-only and not intended for production use. Abuse prevention is limited, centered on on-chain double-claim prevention. FairScale and allowlist-based eligibility are planned but not implemented.

---

## 🎯 What is we-ne?

we-ne is a non-custodial benefit distribution system built on Solana, designed to deliver support payments instantly and transparently.

**One-liner:** SPL token grants with periodic claims, double-claim prevention, and mobile wallet integration — all verifiable on-chain.

---

## Unified Balance List (Credits, Vouchers, and SPL Tokens)

The app shows a single balance list that normalizes credits, vouchers, coupons, and SPL tokens into one `BalanceItem` model. Issuer and usability (e.g. “usable today”) are shown in the UI so users understand who issued the value and when they can use it.

### What appears in the list

* Demo Support Credits (off-chain)
* Community / Event Vouchers (off-chain)
* Merchant Coupons (off-chain)
* SPL Tokens from the connected wallet (on-chain, Devnet)

### Design concept

The goal of this UI is not to expose blockchain assets as something special, but to normalize them as part of everyday usable balances. Users do not see “on-chain” vs “off-chain”; they see a list of balances they can use. Web3 is integrated into a life-style UI where the source of value (issuer) defines its meaning — whether it is a grant, a coupon, or a token.

### UX rules (behavior)

* Balances with expiration dates are prioritized
* Items expiring sooner are shown first
* “Usable Today” badges indicate immediate usability
* SPL token balances are merged into the list only after wallet connection
* Devnet fallback ensures at least one SPL row is always displayed when connected (fail-soft, demo-friendly)

### Devnet / Demo note

* SPL token balance is fetched from Devnet
* If a specific mint is unavailable (e.g. not deployed on Devnet), the app safely falls back to any positive SPL balance in the wallet

This fail-soft, demo-friendly behavior keeps demos stable and avoids blank or broken states during review.

---

## 🚨 Problem & Why It Matters

### The Problem (Japan Context)

In Japan, public support programs suffer from:

* Slow delivery: weeks/months from application to receipt
* High overhead: administrative costs eat into small grants
* Opacity: hard to verify if funds reached intended recipients
* Inflexibility: fixed schedules don’t match urgent needs

### Global Relevance

These problems exist worldwide:

* Disaster relief that arrives too late
* Micro-grants where fees exceed value
* Aid programs lacking accountability

---

## Our Solution

we-ne provides:

* ⚡ Instant delivery: claims settle in seconds
* 💰 Low cost: ~$0.001 per transaction
* 🔍 Full transparency: every claim verifiable on-chain
* 📱 Mobile-first: recipients claim via smartphone

---

## 🏗️ How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                      HIGH-LEVEL FLOW                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   GRANTOR                 SOLANA                 RECIPIENT  │
│   ───────                 ──────                 ─────────  │
│                                                             │
│   1. Create Grant ──────► Grant PDA                         │
│   2. Fund Vault ────────► Token Vault                       │
│                                                             │
│                           ┌─────────┐                       │
│                           │ Period  │◄──── 3. Open App      │
│                           │ Check   │                       │
│                           └────┬────┘                       │
│                                │                            │
│                           ┌────▼────┐                       │
│                           │  Claim  │◄──── 4. Sign in       │
│                           │ Receipt │      Phantom          │
│                           └────┬────┘                       │
│                                │                            │
│                           ┌────▼────┐                       │
│   5. Verify on Explorer ◄─┤ Tokens  ├────► Wallet           │
│                           │Transfer │                       │
│                           └─────────┘                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

* Smart Contract (`grant_program/`): Anchor program managing grants, claims, and receipts
* Mobile App (`wene-mobile/`): React Native app for recipients to claim benefits
* Phantom Integration: Non-custodial signing via deep links

### Recommended browsers

Recommended browsers for student UI `/u/*` via QR: Safari (iPhone) / Chrome (Android). Phantom connect may be unstable on Firefox.

**Android:** use Phantom in-app browser
On Android, “Phantom → back to browser” can fail, so v0 uses Phantom browse deeplink as the main student QR content. Redirect-based connect is not the primary flow; `/phantom-callback` exists only for manual recovery.

→ See `docs/ARCHITECTURE.md` for details

---

## 📱 Demo

Demo video is posted on X (formerly Twitter):

* 🎬 Demo video: [https://x.com/Shiki93278/status/2015659939356889450](https://x.com/Shiki93278/status/2015659939356889450)

What the demo shows:

* Opening the mobile app and connecting Phantom wallet
* Scanning QR code or opening deep link (`wene://r/<campaignId>`)
* Viewing grant details (amount, period, eligibility)
* Tapping “Claim” → Phantom wallet signing the transaction
* SPL tokens being transferred to recipient's wallet within seconds

---

## 🚀 Quickstart

### Prerequisites

* Node.js v18+ (recommended: v20 LTS)
* For smart contract: Rust, Solana CLI v1.18+, Anchor v0.30+
* For mobile: Android SDK (API 36), Java 17

### One-command build (for contributors / third parties)

From the repository root you can build and test everything without entering each subproject.

**Option A: npm scripts (requires Node at root)**

```bash
git clone https://github.com/<owner>/we-ne.git
cd we-ne

npm install # optional: only if you want to run root scripts
npm run build # build contract + mobile typecheck
npm run test  # run Anchor tests
```

**Option B: shell script (no root Node required)**

```bash
chmod +x scripts/build-all.sh
./scripts/build-all.sh all   # build + test contract + mobile typecheck
./scripts/build-all.sh build # build only
./scripts/build-all.sh test  # contract tests only
```

### Local verification (type/build)

```bash
# From repo root
npm run build

# Mobile only (TypeScript)
cd wene-mobile && npx tsc --noEmit
```

**Upcoming:** Device/emulator verification will be done later (Android Emulator and Pixel 8 via USB are not available in current environment).
UI final check on Pixel 8 (USB debugging) is planned after returning home.

### What success looks like

| Step                                   | Result                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run build` / `build-all.sh build` | Contract builds with `anchor build`; mobile passes `npm install + tsc --noEmit`      |
| `npm run test` / `build-all.sh test`   | Anchor tests (e.g. create_grant, fund_grant, claimer can claim once per period) pass |
| `build-all.sh all`                     | All of the above; ends with “✅ Done.”                                                |

---

## Dependency note (mobile)

The mobile app (`wene-mobile`) can hit npm peer dependency errors due to React/react-dom version mismatch.

The repo uses:

* `wene-mobile/.npmrc` (`legacy-peer-deps=true`)
* `--legacy-peer-deps` in root scripts and CI

For mobile-only setup, use:

```bash
npm install --legacy-peer-deps
```

See `docs/DEVELOPMENT.md` for per-component setup and recent changes for third-party builds.

---

## Run Mobile App (Development)

```bash
# From repo root (after cloning)
cd wene-mobile

# One-command setup (recommended)
npm run setup

# Or manual setup:
npm install --legacy-peer-deps

npm run doctor:fix
npx expo prebuild --clean
npm start
```

> **⚠️ Note: Phantom Connection Setup**
> When running locally, it is highly recommended to change the `scheme` in `app.config.ts` to a unique string (e.g., `my-solana-app`) instead of the default `wene-mobile`.
> This prevents DeepLink conflicts if you already have the production/demo version of the app installed on your device. The Phantom redirect logic in this codebase automatically adapts to the configured scheme.

---

## Build Android APK

```bash
# From repo root
cd wene-mobile
npm run build:apk

# Output:
# android/app/build/outputs/apk/release/app-release.apk
```

---

## Troubleshooting

Use the built-in doctor script:

```bash
npm run doctor
npm run doctor:fix
```

The doctor checks: dependencies, polyfills, SafeArea configuration, Phantom integration, Android SDK setup, and more.

---

## Build Smart Contract

```bash
cd grant_program
anchor build
anchor test
```

→ Full setup: `docs/DEVELOPMENT.md`

---

## 📁 Repository Structure

```
we-ne/
├── grant_program/           # Solana smart contract (Anchor)
│   ├── programs/grant_program/src/lib.rs   # Core logic
│   └── tests/               # Integration tests
│
├── wene-mobile/             # Mobile app (React Native + Expo)
│   ├── app/                 # Screens (Expo Router)
│   ├── src/solana/          # Blockchain client
│   ├── src/wallet/          # Phantom adapter
│   └── src/utils/phantom.ts # Deep link encryption
│
├── docs/                    # Documentation
│   ├── ARCHITECTURE.md      # System design
│   ├── SECURITY.md          # Threat model
│   ├── PHANTOM_FLOW.md      # Wallet integration
│   ├── DEVELOPMENT.md       # Dev setup
│   └── ROADMAP.md           # Future plans
│
├── .github/workflows/       # CI/CD
├── LICENSE                  # MIT
├── CONTRIBUTING.md          # Contribution guide
└── SECURITY.md              # Vulnerability reporting
```

---

## 🔐 Security Model

| Aspect         | Implementation                                  |
| -------------- | ----------------------------------------------- |
| Key custody    | Non-custodial — keys never leave Phantom wallet |
| Session tokens | Encrypted with NaCl box, stored in app sandbox  |
| Double-claim   | Prevented by on-chain ClaimReceipt PDA          |
| Deep links     | Encrypted payloads, strict URL validation       |

⚠️ **Audit Status:** NOT AUDITED — use at own risk for testing only

→ Full threat model: `docs/SECURITY.md`

---

## 🗺️ Roadmap

| Phase           |   Timeline | Deliverables                          |
| --------------- | ---------: | ------------------------------------- |
| MVP             | ✅ Complete | Basic claim flow, Phantom integration |
| Allowlist       |   +2 weeks | Merkle-based eligibility              |
| Admin Dashboard |   +1 month | Web UI for grant creators             |
| Mainnet Beta    |  +3 months | Audit, partners, production deploy    |

→ Full roadmap: `docs/ROADMAP.md`

---

## 💡 Why Solana? Why Now? Why Foundation Grant?

### Why Solana?

* Speed: sub-second finality for real-time support
* Cost: ~$0.001/tx makes micro-grants viable
* Ecosystem: Phantom, SPL tokens, developer tools
* Japan presence: growing Solana community in Japan

### Why Now?

* Japan exploring digital benefit distribution
* Post-COVID interest in efficient aid delivery
* Mobile wallet adoption accelerating

### Why Foundation Grant?

* Novel use case: public benefit infrastructure (not DeFi/NFT)
* Real-world impact: designed for actual support programs
* Open source: MIT licensed, reusable components
* Japan market: local team, local partnerships

---

## 🤝 Contributing

We welcome contributions! See `CONTRIBUTING.md`.

Priority areas:

* Testing coverage
* Documentation translations
* Security review
* UI/UX feedback

---

## 📜 License

MIT License — free to use, modify, and distribute.
See `LICENSE`.

---

## 📋 Recent changes (third-party build improvements)

To make the project easier to build and verify for contributors and third parties:

* Root-level scripts: Added `package.json` at repo root with:

  * `npm run build` (contract + mobile typecheck)
  * `npm run test` (Anchor tests)
  * `npm run build:contract`, `npm run build:mobile`, `npm run test:contract` for per-component runs
* Unified build script: Added `scripts/build-all.sh` so you can run `./scripts/build-all.sh all` (or build / test) without installing Node at root
* Third-party build verification: Confirmed the above steps build and test successfully in a fresh environment
* Mobile peer dependency handling:

  * `wene-mobile/.npmrc (legacy-peer-deps=true)`
  * `--legacy-peer-deps` in root scripts and CI
* CI: Added `.github/workflows/ci.yml` so every push/PR runs Anchor build & test and mobile install & TypeScript check
* Docs: `docs/DEVELOPMENT.md` updated with root-level build/test and CI usage
* Double-claim fix: In `grant_program`, the claim receipt account was changed from `init_if_needed` to `init`. This correctly rejects a second claim in the same period (receipt PDA already exists, so init fails). All Anchor tests, including "claimer can claim once per period", now pass.

---

## 📞 Contact

* Issues: [https://github.com/hk089660/instant-grant-core/issues](https://github.com/hk089660/instant-grant-core/issues)
* Discussions: [https://github.com/hk089660/instant-grant-core/discussions](https://github.com/hk089660/instant-grant-core/discussions)
* Security: See `SECURITY.md` for vulnerability reporting

Built with ❤️ for public good on Solana
