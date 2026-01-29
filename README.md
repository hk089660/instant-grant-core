# we-ne

> **Instant, transparent benefit distribution on Solana — built for Japan's public support needs**

[![CI](https://github.com/hk089660/-instant-grant-core/actions/workflows/ci.yml/badge.svg)](https://github.com/hk089660/-instant-grant-core/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

[日本語版 README](./README.ja.md) | [Architecture](./docs/ARCHITECTURE.md) | [Development Guide](./docs/DEVELOPMENT.md)

---

## Overview

**日本語**: We-neは、Solana上で「即時に配布・即時に利用できる」支援クレジット基盤です。FairScaleのレピュテーションを用いて、不正や濫用を抑えつつ、モバイルから誰でもアクセスできます。現在はプロトタイプ段階で、Phantom連携と基本フローが動作しています。

**English**: We-ne is an instant distribution and instant usage support credit infrastructure built on Solana. Using FairScale's reputation system, it prevents fraud and abuse while enabling mobile access for everyone. Currently in prototype stage, with Phantom integration and basic flow operational.

---

## 🎯 What is we-ne?

we-ne is a **non-custodial benefit distribution system** built on Solana, designed to deliver support payments instantly and transparently.

**One-liner**: SPL token grants with periodic claims, double-claim prevention, and mobile wallet integration — all verifiable on-chain.

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

---

## 🚀 Quickstart

### Prerequisites
- Node.js v18+ (recommended: v20 LTS)
- For smart contract: Rust, Solana CLI v1.18+, Anchor v0.30+
- For mobile: Android SDK (API 36), Java 17

### One-command build (for contributors / third parties)

From the **repository root** you can build and test everything without entering each subproject:

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

See [Development Guide](./docs/DEVELOPMENT.md) for per-component setup and [Recent changes](#-recent-changes) for what was added for third-party builds.

### Run Mobile App (Development)

```bash
# Clone repository
git clone https://github.com/hk089660/-instant-grant-core.git
cd we-ne/wene-mobile

# One-command setup (recommended)
npm run setup

# Or manual setup:
npm install --legacy-peer-deps
npm run doctor:fix          # Check and fix common issues
npx expo prebuild --clean   # Generate native projects

# Start Expo dev server
npm start
```

### Build Android APK

```bash
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
