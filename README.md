# we-ne

> **Instant, transparent benefit distribution on Solana — built for Japan's public support needs**

[![CI](https://github.com/hk089660/-instant-grant-core/actions/workflows/ci.yml/badge.svg)](https://github.com/hk089660/-instant-grant-core/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

[日本語版 README](./README.ja.md) | [Architecture](./docs/ARCHITECTURE.md) | [Development Guide](./docs/DEVELOPMENT.md)

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

**Demo Video**:

<div align="center">

**[📹 デモ動画を見る / Watch Demo Video (11MB)](https://github.com/hk089660/-instant-grant-core/raw/main/docs/demo.mp4)**

*Click the link above to watch the demo video*

</div>

**日本語**: 上記のリンクをクリックすると、モバイルアプリからPhantomウォレットを接続し、給付プログラムに接続して受給する一連の流れを確認できるデモ動画が表示されます。

**English**: Click the link above to watch a demo video showing the complete flow of connecting a Phantom wallet from the mobile app, accessing a grant program, and claiming benefits.

**What the demo shows**:
1. Opening the mobile app and connecting Phantom wallet
2. Scanning QR code or opening deep link (`wene://r/<campaignId>`)
3. Viewing grant details (amount, period, eligibility)
4. Tapping "Claim" → Phantom wallet signing the transaction
5. SPL tokens being transferred to recipient's wallet within seconds

### Screenshots


---

## Screenshots

| Home | Claim | Success |
|------|-------|---------|
| Connect wallet | Review grant details | Tokens received |

---

## 🚀 Quickstart

### Prerequisites
- Node.js v18+
- For smart contract: Rust, Solana CLI, Anchor
- For mobile: Android SDK, Java 17

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

## 📞 Contact

- **Issues**: [GitHub Issues](https://github.com/hk089660/-instant-grant-core/issues)
- **Discussions**: [GitHub Discussions](https://github.com/hk089660/-instant-grant-core/discussions)
- **Security**: See [SECURITY.md](./SECURITY.md) for vulnerability reporting

---

<p align="center">
  <i>Built with ❤️ for public good on Solana</i>
</p>
