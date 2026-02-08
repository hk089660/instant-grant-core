# we-ne

**Instant, transparent benefit distribution on Solana — built for Japan's public support needs.**

[![CI](https://github.com/hk089660/-instant-grant-core/actions/workflows/ci.yml/badge.svg)](https://github.com/hk089660/-instant-grant-core/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## Grant context

This project is submitted for an **initial grant (e.g. $3,000)** under **Superteam Japan Grants** (or equivalent ecosystem program). It delivers a **technical PoC** scoped to **one correspondence high school**: QR-based participation flow, instant digital participation tickets, and an admin interface for staff — all without requiring students to understand wallets or Web3.

- **Phase**: PoC / v0 (prototype). Not production-ready.
- **Cluster**: Devnet-only for safe verification.
- **Goal**: Prove the flow end-to-end in a real school setting; reproducible build and clear deliverables for reviewers.

---

## Problem

In Japan (and globally), public support and event participation often suffer from:

- **Slow delivery** — weeks or months from application to receipt  
- **High overhead** — administrative cost eats into small benefits  
- **Opacity** — hard to verify who received what  
- **Rigid processes** — fixed schedules, paper-heavy workflows  

---

## Solution: we-ne

we-ne is a **non-custodial benefit and participation system** on Solana:

- **Instant** — participation or claim completes in seconds.  
- **Low cost** — ~$0.001 per transaction where on-chain.  
- **Transparent** — claims verifiable on-chain (grant flow); participation data visible to admins (school flow).  
- **Mobile-first** — students or recipients use a smartphone; no Web3 jargon required in the school flow.

For this grant, the **first use case** is a **digital participation ticket for school events**: students scan a QR (or follow a link), confirm the event, and receive a non-transferable participation record. Staff see real-time counts and participant lists in an admin UI. Blockchain is optional in this flow; the PoC can run with mock APIs and local storage, with a path to on-chain or backend later.

---

## Scope for this grant ($3,000 initial)

### In scope

- **School participation PoC**  
  - User flow: Home → Event list → Scan (or button) → Confirm → Participate → Success.  
  - Admin flow: Event list with real-time counts, event detail with participant list, print-ready QR layout, role-based UI (viewer / operator / admin).  
- **Data sync** — Participant actions (e.g. “joined”) reflected in admin views (same app; backend API optional later).  
- **Reproducible build** — `npm run build` and `npm run test` (or `scripts/build-all.sh`) from repo root; CI runs contract build and mobile typecheck.  
- **Devnet claim flow (optional)** — Phantom connect → sign → send → token receipt on Android, devnet-only, for technical validation.  
- **Documentation** — Architecture, development guide, static verification report, feature status (what works / what does not).

### Out of scope (this grant)

- Production authentication / KYC.  
- Real cash disbursement or tradable assets.  
- Integration with government systems.  
- Production-grade allowlist/Merkle or FairScale reputation (planned, not committed for this grant).

### Success criteria

- Teachers/operators can run the workflow (print QR, see counts, use roles).  
- Students complete participation without handling wallets or Web3 concepts (school mode).  
- Third parties can clone the repo and run `npm run build` and `npm run test` (or equivalent) as documented.

---

## What works today

| Area | Status |
|------|--------|
| **User (student)** | Home, event list, scan screen (button → confirm), confirm screen, “Participate” → mock API → success; participation and tickets stored locally. |
| **Admin** | Event list with synced rtCount; event detail with participant list; participant log; print screen (browser print, CSS @media print); role-based UI (viewer/operator/admin). |
| **Sync** | User participation updates local store; admin reads same store so counts and lists stay in sync (same app). |
| **Contract** | Grant create/fund/claim; double-claim prevention (ClaimReceipt PDA); Anchor tests pass. |
| **Mobile (Solana mode)** | Phantom connect → sign → send → receipt on Android (devnet). |

Mock/partial: QR is button-driven (no camera scan yet); some admin buttons (e.g. “Create event”, “CSV”) are placeholders. See [wene-mobile/docs/FEATURE_STATUS.md](./wene-mobile/docs/FEATURE_STATUS.md) for a full list.

---

## Demo

- **Demo video**: [X (Twitter)](https://x.com/Shiki93278/status/2015659939356889450)  
- **School flow**: `/u` → `/u/scan` → `/u/confirm` → Participate → `/u/success`. Mock events: evt-001 (success), evt-002 (already joined), evt-003 (retryable error).  
- **Admin**: `/admin` (event list), `/admin/events/[eventId]` (detail + participants), `/admin/print/[eventId]` (print layout).

---

## Quick start

**Prerequisites**: Node.js v18+ (v20 LTS recommended), npm. For contract: Rust, Solana CLI, Anchor. For mobile: Android SDK (e.g. API 36), Java 17 (see [Development Guide](./docs/DEVELOPMENT.md)).

```bash
git clone https://github.com/<owner>/we-ne.git
cd we-ne

# Build contract + mobile typecheck
npm run build

# Run contract tests
npm run test

# Or use the shell script (no root npm required)
./scripts/build-all.sh all
```

**Mobile app (development)**:

```bash
cd wene-mobile
npm run setup    # or: npm install --legacy-peer-deps && npm run doctor:fix && npx expo prebuild --clean
npm start
```

**Android APK**: `cd wene-mobile && npm run build:apk`  
**Troubleshooting**: `cd wene-mobile && npm run doctor` or `npm run doctor:build-repair`

---

## Repository structure

| Path | Description |
|------|-------------|
| `grant_program/` | Solana smart contract (Anchor): grants, vault, claim, double-claim prevention |
| `wene-mobile/` | React Native (Expo) app: user + admin screens, Phantom integration, school flow |
| `docs/` | Architecture, security, development guide, Phantom flow, Devnet setup |
| `scripts/` | `build-all.sh`, `clean-install.sh` |
| `.github/workflows/ci.yml` | Contract build + mobile install & TypeScript check |

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](./docs/ARCHITECTURE.md) | System design, components, data flow |
| [Development Guide](./docs/DEVELOPMENT.md) | Setup, build, test, run mobile |
| [Feature Status](./wene-mobile/docs/FEATURE_STATUS.md) | What works / doesn’t / not implemented (mobile & admin) |
| [Static Verification Report](./wene-mobile/docs/STATIC_VERIFICATION_REPORT.md) | School flow types and routing |
| [Security](./docs/SECURITY.md) | Threat model, disclosure |
| [Devnet Setup](./docs/DEVNET_SETUP.md) | Devnet claim flow verification |

---

## Security and license

- **Audit**: Not audited. For testing and PoC only.  
- **Model**: Non-custodial (Phantom); double-claim prevented on-chain (ClaimReceipt).  
- **License**: [MIT](./LICENSE).

---

## Contact

- **Issues**: [GitHub Issues](https://github.com/hk089660/-instant-grant-core/issues)  
- **Discussions**: [GitHub Discussions](https://github.com/hk089660/-instant-grant-core/discussions)  
- **Security**: [SECURITY.md](./SECURITY.md)

---

[日本語版 README](./README.ja.md)

<p align="center"><i>Built for public good on Solana</i></p>
