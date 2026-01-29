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

デモ動画は **X（旧Twitter）** の投稿で公開しています。  
**Demo video** is posted on **X (formerly Twitter)**.

> 🎬 **デモ動画 / Demo video**: [X で見る / Watch on X](https://x.com/Shiki93278/status/2015659939356889450)

**What the demo shows**（動画の内容）:
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
- Node.js v18+（推奨: v20 LTS）
- スマートコントラクト: Rust, Solana CLI v1.18+, Anchor v0.30+
- モバイル: Android SDK (API 36), Java 17

### 第三者・コントリビュータ向け：一括ビルド

**リポジトリルート**から、各サブプロジェクトに入らずにビルド・テストできます。

```bash
git clone https://github.com/<owner>/we-ne.git
cd we-ne

# 方法A: npm スクリプト（ルートに Node が必要）
npm install   # 任意: ルートのスクリプトを使う場合のみ
npm run build      # コントラクトビルド + モバイル型チェック
npm run test       # Anchor テスト実行

# 方法B: シェルスクリプト（ルートに Node 不要）
chmod +x scripts/build-all.sh
./scripts/build-all.sh all    # ビルド + コントラクトテスト + モバイル型チェック
./scripts/build-all.sh build  # ビルドのみ
./scripts/build-all.sh test   # コントラクトテストのみ
```

詳細は [Development Guide](./docs/DEVELOPMENT.md)、[変更内容](#-変更内容第三者ビルド改善) を参照してください。

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

## 📋 変更内容（第三者ビルド改善）

第三者・コントリビュータがビルド・検証しやすいよう、以下を追加・更新しました。

- **ルートスクリプト**: リポジトリルートに `package.json` を追加。`npm run build`（コントラクト + モバイル型チェック）と `npm run test`（Anchor テスト）を実行可能。`npm run build:contract` / `npm run build:mobile` / `npm run test:contract` で個別実行も可能。
- **一括ビルドスクリプト**: `scripts/build-all.sh` を追加。ルートに Node を入れずに `./scripts/build-all.sh all`（または `build` / `test`）で実行可能。
- **CI**: `.github/workflows/ci.yml` を追加。push/PR のたびに Anchor のビルド・テストとモバイルのインストール・TypeScript チェックを実行。README の CI バッジはこのワークフローを指します。
- **ドキュメント**: [Development Guide](./docs/DEVELOPMENT.md) にルートからのビルド・テスト手順と CI の説明を追記。
- **二重 claim 防止の修正**: `grant_program` で claim 用レシートアカウントを `init_if_needed` から `init` に変更。同一期間での2回目の claim が正しく拒否されるようになった（receipt PDA が既に存在するため `init` が失敗）。Anchor の全テスト（「claimer can claim once per period」含む）がパスする状態です。

---

## 📞 Contact

- **Issues**: [GitHub Issues](https://github.com/hk089660/-instant-grant-core/issues)
- **Discussions**: [GitHub Discussions](https://github.com/hk089660/-instant-grant-core/discussions)
- **Security**: See [SECURITY.md](./SECURITY.md) for vulnerability reporting

---

<p align="center">
  <i>Built with ❤️ for public good on Solana</i>
</p>
