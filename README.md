# we-ne

### Project Status
This project is currently under **Superteam Japan Grants review**.
It is in a **PoC / v0** phase, focused on the demo flow below.

### Recent Updates (Stability Improvements)

- Introduced participation state tracking (`started` / `completed`) to ensure accurate "incomplete / completed" views for users
- Added print-friendly QR layout using CSS print (`@media print`) for reliable offline and backup operations
- Implemented role-based UI restrictions (viewer / operator / admin) to improve safety on shared school devices
- Added development-only role switcher for faster testing and demos (not visible in production)

These updates focus on **stability, operational safety, and real-world school usage**.

### Recent Updates (School Participation Flow Refactor)

School participation flow logic, types, and error handling have been restructured for clarity and easy replacement.

- **API layer abstraction**: `SchoolClaimClient` / `SchoolEventProvider` interfaces separate mock from production; swapping to a fetch-based implementation is straightforward.
- **UI/logic separation via Hook**: `useSchoolClaim` centralizes idle/loading/success/already/error states; screens depend only on state and `handleClaim`.
- **Unified error representation**: `SchoolClaimResult` (Success | Failure), `SchoolClaimErrorCode` (retryable / invalid_input / not_found) enable clear logic-side branching. `errorInfo` / `isRetryable` identify retryable errors.
- **eventId centralization**: `parseEventId` / `useEventIdFromParams` consolidate query/route parsing and validation; invalid eventId redirects to `/u`.
- **Unified routing**: `schoolRoutes` constants for home/events/scan/confirm/success/schoolClaim.
- **Unified already-handling**: Already-joined (`alreadyJoined`) also navigates to success screen for consistent UX.
- **Retry flow**: Button label changes to "Retry" for retryable errors.

→ Details: [School Participation Flow (Architecture)](#school-participation-flow-architecture) and [wene-mobile/docs/STATIC_VERIFICATION_REPORT.md](./wene-mobile/docs/STATIC_VERIFICATION_REPORT.md)

### Project Status: Claim flow verified on Android (2025)

- **Claim flow is fully verified** on Android (APK) with Phantom wallet: connect → sign → send → confirm → token receipt.
- Phantom **strictly validates cluster consistency** (devnet / testnet / mainnet). If the transaction is interpreted as mainnet, Phantom may block signing with a warning.
- **Deep links and RPC endpoints** must explicitly match the target cluster (e.g. `cluster=devnet` in redirect URLs and devnet RPC only).
- The **current PoC is fixed to devnet** for safety; all RPC and Phantom deeplinks use devnet.

### What works today (Demo Flow)
- Scan event QR code
- View event details
- Claim a digital participation ticket
- Ticket is stored and viewable in the app

### School Participation Flow (Architecture)

**Flow**

1. Home → "Start participation" → Event list (`/u`)
2. "Participate" → Scan (`/u/scan`)
3. "Start scan" → Confirm (`/u/confirm?eventId=evt-001`)
4. "Participate" → Claim API → Success (`/u/success?eventId=evt-001`)
5. "Done" → Back to list

**Key concepts**

| Concept | Description |
|---------|-------------|
| `SchoolClaimClient` | Interface for the claim API client. Mock can be replaced with a fetch-based implementation |
| `useSchoolClaim` | Hook encapsulating claim logic. Exposes `status` (idle/loading/success/already/error), `handleClaim`, `onSuccess` |
| `SchoolClaimResult` | Discriminated union: success `{ success: true, eventName, alreadyJoined? }`, failure `{ success: false, error: { code, message } }` |
| `useEventIdFromParams` | Parses and validates `eventId` from query/route. `redirectOnInvalid: true` replaces to `/u` when invalid |
| `schoolRoutes` | Route constants: home/events/scan/confirm/success/schoolClaim |

**Mock cases (for testing)**

- evt-001: Success
- evt-002: Already joined (`alreadyJoined`) → navigates to success screen
- evt-003: Retryable error → "Retry" to re-claim

**Verification (static)**

- TypeScript: `npx tsc --noEmit` ✅
- `useSchoolClaim` state transitions ✅
- Routing consistency (`eventId` unified via `useEventIdFromParams`) ✅
- For future fetch implementation: map HTTP errors to Result (404→not_found, 5xx/network→retryable)

→ Details: [wene-mobile/docs/STATIC_VERIFICATION_REPORT.md](./wene-mobile/docs/STATIC_VERIFICATION_REPORT.md), [Development Guide](./docs/DEVELOPMENT.md), [Emulator Development](./wene-mobile/docs/EMULATOR_DEVELOPMENT.md)

### First Target Use Case: School Event Participation Ticket
The first concrete use case of **We-ne** is a **digital participation ticket for school events and volunteer activities**.

- Students scan a QR code at the event venue
- A non-transferable digital participation ticket is issued instantly
- No monetary value or exchangeability
- Personal information (name, student number) is not exposed externally
- Event organizers can verify participation counts via an admin interface

This use case prioritizes **speed, usability, and privacy**, making it suitable for real educational environments.

### Distribution (School PoC)

- **Students: native app**
  - **Android**: APK distribution (EAS Build or local build; no Play Store).
  - **iOS**: TestFlight (planned; EAS Build → IPA → App Store Connect).
- **Web**: Admin & support use only (`/admin/*`, print screens). **Not used for student claim flow**; student participation is app-only.
- The Expo app is the primary flow for Phantom stability; Web/PWA is not used for the main claim flow.

### Next Milestone (Short-term)
- Simplified Scan → Confirm → Success flow
- Basic admin dashboard (issued / completed counts)
- Short demo video showcasing the full flow

> **Instant, transparent benefit distribution on Solana — built for Japan's public support needs**

[![CI](https://github.com/hk089660/-instant-grant-core/actions/workflows/ci.yml/badge.svg)](https://github.com/hk089660/-instant-grant-core/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

[日本語版 README](./README.ja.md) | [Architecture](./docs/ARCHITECTURE.md) | [Development Guide](./docs/DEVELOPMENT.md) | [Static Verification Report](./wene-mobile/docs/STATIC_VERIFICATION_REPORT.md) | [Emulator Development](./wene-mobile/docs/EMULATOR_DEVELOPMENT.md)

---

## Overview

**日本語**: We-neは、Solana上で「即時に配布・即時に利用できる」支援クレジット基盤です。FairScaleのレピュテーションを用いて、不正や濫用を抑えつつ、モバイルから誰でもアクセスできます。現在はプロトタイプ段階で、Phantom連携と基本フローが動作しています。給付・クーポン・参加券・ブロックチェーン資産を単一の「残高一覧」として統合表示するプロトタイプであり、利用者は on-chain / off-chain を意識せず「今日使える価値」を直感的に確認できます。

**English**: We-ne is an instant distribution and instant usage support credit infrastructure built on Solana. Using FairScale's reputation system, it prevents fraud and abuse while enabling mobile access for everyone. Currently in prototype stage, with Phantom integration and basic flow operational. We-ne unifies **grants, coupons, participation tickets, and blockchain assets** into a single **balance list**; users see "value I can use today" at a glance without thinking about where it comes from (on-chain or off-chain).

---

## 🎯 What is we-ne?

we-ne is a **non-custodial benefit distribution system** built on Solana, designed to deliver support payments instantly and transparently.

**One-liner**: SPL token grants with periodic claims, double-claim prevention, and mobile wallet integration — all verifiable on-chain.

---

## Unified Balance List (Credits, Vouchers, and SPL Tokens)

The app shows a **single balance list** that normalizes credits, vouchers, coupons, and SPL tokens into one **BalanceItem** model. Issuer and usability (e.g. "usable today") are shown in the UI so users understand *who* issued the value and *when* they can use it.

### What appears in the list

- **Demo Support Credits** (off-chain)
- **Community / Event Vouchers** (off-chain)
- **Merchant Coupons** (off-chain)
- **SPL Tokens** from the connected wallet (on-chain, Devnet)

### Design concept

The goal of this UI is **not** to expose blockchain assets as something special, but to **normalize** them as part of everyday usable balances. Users do not see "on-chain" vs "off-chain"; they see a list of balances they can use. Web3 is integrated into a **life-style UI** where the source of value (issuer) defines its meaning — whether it is a grant, a coupon, or a token.

> The goal of this UI is not to expose blockchain assets, but to normalize them as part of everyday usable balances.

### UX rules (behavior)

- Balances with expiration dates are prioritized.
- Items expiring sooner are shown first.
- **"Usable Today"** badges indicate immediate usability.
- SPL token balances are merged into the list only after wallet connection.
- Devnet fallback ensures at least one SPL row is always displayed when connected (fail-soft, demo-friendly).

### Devnet / Demo note

- SPL token balance is fetched from **Devnet**.
- If a specific mint is unavailable (e.g. not deployed on Devnet), the app **safely falls back** to any positive SPL balance in the wallet.
- This **fail-soft**, **demo-friendly** behavior keeps demos stable and avoids blank or broken states during review.

---

## 🚨 Problem & Why It Matters

### The Problem (Japan Context)

In Japan, public support programs suffer from:
- **Slow delivery**: Weeks/months from application to receipt
- **High overhead**: Administrative costs eat into small grants
- **Opacity**: Hard to verify if funds reached intended recipients
- **Inflexibility**: Fixed schedules don't match urgent needs

### Global Relevance

These problems exist worldwide:
- Disaster relief that arrives too late
- Micro-grants where fees exceed value
- Aid programs lacking accountability

### Our Solution

we-ne provides:
- ⚡ **Instant delivery**: Claims settle in seconds
- 💰 **Low cost**: ~$0.001 per transaction
- 🔍 **Full transparency**: Every claim verifiable on-chain
- 📱 **Mobile-first**: Recipients claim via smartphone

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

**Key Components**:
1. **Smart Contract** (`grant_program/`): Anchor program managing grants, claims, and receipts
2. **Mobile App** (`wene-mobile/`): React Native app for recipients to claim benefits
3. **Phantom Integration**: Non-custodial signing via deep links

**Recommended browsers** (student UI /u/* via QR): Safari (iPhone) / Chrome (Android). Phantom connect may be unstable on Firefox.

**Android: use Phantom in-app browser** — On Android, "Phantom → back to browser" can fail, so v0 uses **Phantom browse deeplink** (`https://phantom.app/ul/browse/<url>?ref=<ref>`) as the main student QR content. Print the URL shown on the admin print screen (`/admin/print/:eventId`) as a QR code so students open the app inside Phantom. **Redirect-based connect** (open in browser → connect in Phantom → redirect back) is not the primary flow in v0 due to instability; `/phantom-callback` is provided for manual recovery.

→ See [Architecture](./docs/ARCHITECTURE.md) for details

---

## 📱 Demo

デモ動画は **X（旧Twitter）** の投稿で公開しています。  
**Demo video** is posted on **X (formerly Twitter)**.

> 🎬 **デモ動画 / Demo video**: [X で見る / Watch on X](https://x.com/Shiki93278/status/2015659939356889450)

**What the demo shows**:
1. Opening the mobile app and connecting Phantom wallet
2. Scanning QR code or opening deep link (`wene://r/<campaignId>`)
3. Viewing grant details (amount, period, eligibility)
4. Tapping "Claim" → Phantom wallet signing the transaction
5. SPL tokens being transferred to recipient's wallet within seconds

### Screenshots

| Home | Claim | Success |
|------|-------|---------|
| Connect wallet | Review grant details | Tokens received |

*Unified balance list (credits, vouchers, SPL) appears on the receive screen below the grant card; screenshot placeholder.*

---

## 🚀 Quickstart

### Prerequisites
- Node.js v18+ (recommended: v20 LTS)
- For smart contract: Rust, Solana CLI v1.18+, Anchor v0.30+
- For mobile: Android SDK (API 36), Java 17

### One-command build (for contributors / third parties)

From the **repository root** you can build and test everything without entering each subproject. The steps below are verified in a third-party environment.

```bash
git clone https://github.com/<owner>/we-ne.git
cd we-ne

# Option A: npm scripts (requires Node at root)
npm install   # optional: only if you want to run root scripts
npm run build      # build contract + mobile typecheck
npm run test       # run Anchor tests

# Option B: shell script (no root Node required)
chmod +x scripts/build-all.sh
./scripts/build-all.sh all    # build + test contract + mobile typecheck
./scripts/build-all.sh build  # build only
./scripts/build-all.sh test   # contract tests only
```

**Local verification (type/build)**

```bash
# From repo root
npm run build

# Mobile only (TypeScript)
cd wene-mobile && npx tsc --noEmit
```

**Upcoming**

- Device/emulator verification will be done later (Android Emulator and Pixel 8 via USB are not available in current environment).
- UI final check on Pixel 8 (USB debugging) is planned after returning home.

**What success looks like**

| Step | Result |
|------|--------|
| `npm run build` / `build-all.sh build` | Contract builds with `anchor build`; mobile passes `npm install` + `tsc --noEmit` |
| `npm run test` / `build-all.sh test` | Anchor tests (e.g. create_grant, fund_grant, claimer can claim once per period) pass |
| `build-all.sh all` | All of the above; ends with "✅ Done." |

**Dependency note (mobile)**  
The mobile app (`wene-mobile`) can hit npm peer dependency errors due to React/react-dom version mismatch. The repo uses `wene-mobile/.npmrc` (`legacy-peer-deps=true`) and `--legacy-peer-deps` in root scripts and CI, so **you can run the root build and CI as-is**. For mobile-only setup, use `npm install --legacy-peer-deps` as in "Run Mobile App" below.

See [Development Guide](./docs/DEVELOPMENT.md) for per-component setup and [Recent changes](#-recent-changes-third-party-build-improvements) for what was added for third-party builds.

### Run Mobile App (Development)

```bash
# From repo root (after cloning — see "One-command build" above)
cd wene-mobile

# One-command setup (recommended)
npm run setup

# Or manual setup:
npm install --legacy-peer-deps
npm run doctor:fix          # Check and fix common issues
npx expo prebuild --clean   # Generate native projects

# Start Expo dev server
npm start
```

### School API server (optional)

For the school participation flow with admin Web and join/claim API (QR with join-token, participations, persistence):

```bash
cd wene-mobile/server
# Set env: SCHOOL_ADMIN_PASSCODE, SCHOOL_ADMIN_WEB_ORIGIN, SCHOOL_JOIN_TOKEN_SECRET, SCHOOL_REQUIRE_JOIN_TOKEN (see server/README.md)
npm install && npm start
```

- API base: `http://localhost:3000/school`. Set `EXPO_PUBLIC_SCHOOL_API_URL` in the app to use it.
- See [wene-mobile/README_SCHOOL.md](./wene-mobile/README_SCHOOL.md) and [wene-mobile/docs/SCHOOL_POC_LAN_SETUP.md](./wene-mobile/docs/SCHOOL_POC_LAN_SETUP.md) for LAN setup and join-token verification.

### Build Android APK

```bash
# From repo root
cd wene-mobile
npm run build:apk

# Output: android/app/build/outputs/apk/release/app-release.apk
```

### Troubleshooting

Use the built-in doctor script to diagnose and fix issues:

```bash
# Check for issues
npm run doctor

# Auto-fix issues
npm run doctor:fix
```

The doctor checks: dependencies, polyfills, SafeArea configuration, Phantom integration, Android SDK setup, and more.

### Build Smart Contract

```bash
# From repo root
cd grant_program
anchor build
anchor test
```

→ Full setup: [Development Guide](./docs/DEVELOPMENT.md)

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
│   ├── server/              # School API (auth, events, participations, claim, join-token; JSON persistence)
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

| Aspect | Implementation |
|--------|----------------|
| **Key custody** | Non-custodial — keys never leave Phantom wallet |
| **Session tokens** | Encrypted with NaCl box, stored in app sandbox |
| **Double-claim** | Prevented by on-chain ClaimReceipt PDA |
| **Deep links** | Encrypted payloads, strict URL validation |

⚠️ **Audit Status**: NOT AUDITED — use at own risk for testing only

→ Full threat model: [Security](./docs/SECURITY.md)

---

## 🗺️ Roadmap

| Phase | Timeline | Deliverables |
|-------|----------|--------------|
| **MVP** | ✅ Complete | Basic claim flow, Phantom integration |
| **Allowlist** | +2 weeks | Merkle-based eligibility |
| **Admin Dashboard** | +1 month | Web UI for grant creators |
| **Mainnet Beta** | +3 months | Audit, partners, production deploy |

→ Full roadmap: [Roadmap](./docs/ROADMAP.md)

---

## 💡 Why Solana? Why Now? Why Foundation Grant?

### Why Solana?

- **Speed**: Sub-second finality for real-time support
- **Cost**: $0.001/tx makes micro-grants viable
- **Ecosystem**: Phantom, SPL tokens, developer tools
- **Japan presence**: Growing Solana community in Japan

### Why Now?

- Japan exploring digital benefit distribution
- Post-COVID interest in efficient aid delivery
- Mobile wallet adoption accelerating

### Why Foundation Grant?

- **Novel use case**: Public benefit infrastructure (not DeFi/NFT)
- **Real-world impact**: Designed for actual support programs
- **Open source**: MIT licensed, reusable components
- **Japan market**: Local team, local partnerships

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md).

Priority areas:
- Testing coverage
- Documentation translations
- Security review
- UI/UX feedback

---

## 📜 License

[MIT License](./LICENSE) — free to use, modify, and distribute.

---

## 📋 Recent changes (third-party build improvements)

To make the project easier to build and verify for contributors and third parties:

- **Root-level scripts**: Added `package.json` at repo root with `npm run build` (contract + mobile typecheck) and `npm run test` (Anchor tests). Use `npm run build:contract`, `npm run build:mobile`, `npm run test:contract` for per-component runs.
- **Unified build script**: Added `scripts/build-all.sh` so you can run `./scripts/build-all.sh all` (or `build` / `test`) without installing Node at root.
- **Third-party build verification**: Confirmed that the above steps build and test successfully in a fresh environment. Mobile React/react-dom peer dependency handling: `wene-mobile/.npmrc` (`legacy-peer-deps=true`) and `--legacy-peer-deps` in root scripts and CI.
- **CI**: Added `.github/workflows/ci.yml` so every push/PR runs Anchor build & test and mobile install & TypeScript check. The CI badge in this README reflects that workflow once the repo is on GitHub.
- **Docs**: [Development Guide](./docs/DEVELOPMENT.md) updated with root-level build/test and CI usage.
- **Double-claim fix**: In `grant_program`, the claim receipt account was changed from `init_if_needed` to `init`. This correctly rejects a second claim in the same period (receipt PDA already exists, so `init` fails). All Anchor tests, including "claimer can claim once per period", now pass.

---

## 📞 Contact

- **Issues**: [GitHub Issues](https://github.com/hk089660/-instant-grant-core/issues)
- **Discussions**: [GitHub Discussions](https://github.com/hk089660/-instant-grant-core/discussions)
- **Security**: See [SECURITY.md](./SECURITY.md) for vulnerability reporting

---

<p align="center">
  <i>Built with ❤️ for public good on Solana</i>
</p>
