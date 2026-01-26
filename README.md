# we-ne

**Instant grant distribution system for Japan, built on Solana**

---

## Summary

**日本語**: we-ne（ウィネー）は、日本社会における給付・支援金の配布を、即時性・低コスト・透明性で実現するSolana基盤のプロトタイプです。自治体や教育機関が、モバイルウォレット経由で即座に給付を配布できるシステムを構築中です。

**English**: we-ne is a prototype Solana-based infrastructure for instant, low-cost, and transparent distribution of grants and support funds in Japan. It enables municipalities and educational institutions to distribute benefits instantly via mobile wallets.

---

## Demo

> **Note**: Demo video will be added here once available.

**Current Flow**:
1. Recipient opens mobile app and connects Phantom wallet
2. Recipient scans QR code or opens deep link (`wene://r/<campaignId>`)
3. App displays grant details (amount, period, eligibility)
4. Recipient taps "Claim" → Phantom wallet signs transaction
5. SPL tokens are transferred to recipient's wallet within seconds

**Status**: MVP is functional. UI/UX improvements and demo video are in progress.

---

## Problem

Japan's current grant and benefit distribution systems face structural limitations:

- **Processing delays**: Bank transfers require business hours and batch processing, causing days to weeks of delay even after eligibility is confirmed
- **High transaction costs**: Small transfers (under 10,000 JPY) incur 200-400 JPY fees, making frequent micro-grants economically unviable
- **Manual bottlenecks**: Each disbursement requires human verification, creating backlogs during high-volume periods (e.g., disaster response)
- **Limited transparency**: Recipients cannot independently verify disbursement conditions or timing without requesting internal records
- **Access barriers**: Bank account requirements exclude unbanked populations

---

## Solution

**we-ne** (instant grant core) addresses these issues by:

- **On-chain execution**: Grant rules are encoded in Solana programs; claims are self-service and settle in seconds
- **Near-zero fees**: Solana transaction costs (under 0.01 USD) enable sustainable micro-grant distribution
- **Mobile-first**: Recipients claim via smartphone wallet apps (Phantom) without bank account requirements
- **Transparent audit trail**: All grant creation, funding, and claim events are publicly verifiable on-chain
- **Flexible eligibility**: Allowlist-based access control (Merkle Tree) without exposing personal data

This is a **prototype/research demo**. Production deployment requires security audits and regulatory compliance.

---

## How It Works

```
1. Grant Creator → Creates Grant Program (Anchor program on Solana)
   └─ Defines: amount_per_period, period_seconds, allowlist (optional)

2. Grant Creator → Funds Grant Vault (SPL token account)

3. Recipient → Opens Mobile App → Connects Phantom Wallet

4. Recipient → Scans QR / Opens Deep Link → Views Grant Details

5. Recipient → Taps "Claim" → Phantom Signs Transaction

6. Solana Program → Validates Eligibility → Transfers Tokens → Records Receipt (PDA)
```

**Key Components**:
- **Smart Contract** (`grant_program/`): Anchor program handling grant lifecycle
- **Mobile App** (`wene-mobile/`): React Native app for recipients (iOS/Android)
- **Deep Links**: `wene://r/<campaignId>` and `https://wene.app/r/<campaignId>`

---

## FairScale Integration (Planned)

**Status**: Not yet implemented. Planned for future versions.

**Intended Use**:
- **Eligibility scoring**: Determine claim eligibility based on on-chain activity patterns
- **Dynamic limits**: Adjust claim amounts based on recipient behavior/need
- **Cooldown periods**: Prevent abuse through time-based restrictions
- **Expiry management**: Automatic expiration of unused claim windows

**Integration Points**:
- FairScale score will be computed off-chain and passed as a parameter to claim instructions
- Score thresholds will be configurable per grant program
- This enables more sophisticated access control beyond simple allowlists

---

## Japan Pilot Use Case: Disaster Relief Distribution

**Scenario**: After an earthquake or typhoon, a municipality needs to distribute emergency relief funds to affected households.

**Current Process**:
1. Municipality compiles list of affected addresses
2. Recipients submit paper applications with proof of residence
3. Staff manually verify each application (weeks of processing)
4. Bank transfers are initiated in batches (additional days)
5. Recipients wait 2-4 weeks total

**With we-ne**:
1. Municipality creates grant program with pre-registered resident allowlist (Merkle Tree)
2. Municipality funds grant vault with SPL tokens
3. Recipients open mobile app, connect wallet, and claim instantly
4. Funds arrive in seconds; all claims are recorded on-chain for audit

**Benefits**:
- **Speed**: Immediate distribution vs. weeks of delay
- **Cost**: Near-zero fees vs. 200-400 JPY per bank transfer
- **Transparency**: On-chain audit trail vs. internal records only
- **Accessibility**: Mobile wallet vs. bank account requirement

**Pilot Scope**: Small-scale test with 50-100 registered households in a single municipality.

---

## Current Status

### ✅ Implemented (MVP)

**Smart Contract** (`grant_program/`):
- ✅ SPL token-based grant program (Anchor)
- ✅ Fixed-rate periodic grants (daily/weekly/monthly via `period_seconds`)
- ✅ Double-claim prevention (PDA-based `ClaimReceipt` per period)
- ✅ Grant creation, funding, claiming, pause/resume
- ✅ Anchor build and tests passing

**Mobile App** (`wene-mobile/`):
- ✅ React Native (Expo + TypeScript)
- ✅ Phantom Wallet integration
- ✅ Grant connection and claim functionality
- ✅ Deep link support (`wene://r/<campaignId>`, `https://wene.app/r/<campaignId>`)
- ✅ iOS / Android support

### 🚧 In Progress / TODO

- ⏳ Allowlist (Merkle Tree) integration in smart contract
- ⏳ FairScale integration for eligibility scoring
- ⏳ Admin dashboard for grant creators
- ⏳ Multi-wallet support (beyond Phantom)
- ⏳ Grant analytics and reporting UI
- ⏳ Security audit of smart contract
- ⏳ Production deployment infrastructure
- ⏳ Regulatory compliance review

---

## Quickstart

### Prerequisites

- **Rust** (latest stable)
- **Solana CLI** (v1.18+)
- **Anchor** (v0.30+)
- **Node.js** (v18+)
- **Android Studio** (for mobile app) or **Xcode** (macOS, for iOS)

### Smart Contract Setup

```bash
cd grant_program
anchor build
anchor test
```

### Mobile App Setup

```bash
cd wene-mobile
npm install --legacy-peer-deps
npm run build:prebuild  # Generates native Android/iOS projects
npm start  # Start Expo dev server
```

**For Android APK build**:
```bash
cd wene-mobile
npm run build:apk
```

**Note**: Ensure `ANDROID_HOME` is set and `local.properties` exists in `android/` directory.

### Running Tests

```bash
# Smart contract tests
cd grant_program
anchor test

# Mobile app (manual testing via Expo)
npm start
```

---

## Repository Structure

```
we-ne/
├── README.md
├── grant_program/              # Solana smart contract (Anchor)
│   ├── Anchor.toml
│   ├── programs/
│   │   └── grant_program/
│   │       └── src/
│   │           └── lib.rs     # Core grant/claim/allowlist logic
│   └── tests/                  # Anchor integration tests
└── wene-mobile/               # Mobile app (React Native + Expo)
    ├── app/                   # Expo Router screens
    │   ├── _layout.tsx        # Root layout
    │   ├── index.tsx          # Home screen
    │   ├── phantom/            # Phantom wallet redirect handler
    │   └── r/[campaignId].tsx # Claim screen
    ├── src/
    │   ├── solana/            # Solana client implementation
    │   ├── screens/            # Screen components
    │   └── wallet/            # Wallet adapter
    ├── android/               # Android native project (generated)
    └── ios/                   # iOS native project (generated)
```

---

## Security & Safety Notes

### Non-Custodial Design

- **Private keys are never stored**: Recipients use Phantom Wallet; private keys remain in their wallet app
- **No server-side key management**: All transactions are signed client-side

### Data Storage

- **Deep links**: Campaign IDs are passed via URL parameters; no sensitive data in links
- **Session data**: Wallet connection state stored in `AsyncStorage` (local device only)
- **No personal information**: Grant eligibility is determined by allowlist (Merkle proof), not KYC

### Known Limitations (Prototype)

- **No smart contract audit**: This is a research prototype; production requires security audit
- **No KYC/AML**: Eligibility is based on allowlist only; no identity verification
- **Single wallet support**: Currently Phantom only; multi-wallet support planned
- **No admin UI**: Grant creation/funding requires direct Anchor CLI usage

### Best Practices

- **Test on devnet**: Always test grant programs on Solana devnet before mainnet
- **Verify allowlists**: Double-check Merkle root before grant creation
- **Monitor vault balance**: Ensure sufficient funds before enabling claims
- **Use pause feature**: Grant programs can be paused if issues are detected

---

## Roadmap

### 2 Weeks
- Complete allowlist (Merkle Tree) integration in smart contract
- Improve mobile app error handling and user feedback
- Add grant program status display in mobile app

### 1 Month
- Admin dashboard (web UI) for grant creation and management
- Multi-wallet support (Solflare, Backpack)
- Grant analytics dashboard (claim counts, token distribution)

### 3 Months
- FairScale integration for eligibility scoring
- Security audit of smart contract
- Pilot deployment with real municipality (50-100 recipients)
- Documentation and developer guides

---

## Disclaimer

**This is a prototype/research demonstration project.**

- **Not production-ready**: Smart contract has not been audited
- **Not officially endorsed**: This is an independent project, not affiliated with Solana Foundation or any government entity
- **Regulatory compliance**: Production deployment requires compliance with Japanese financial regulations (payment services, anti-money laundering, etc.)
- **Use at your own risk**: This software is provided "as-is" without warranties

**For research and validation purposes only.**

---

## Contact & Links

- **GitHub Issues**: [Report bugs or request features](https://github.com/hk089660/-instant-grant-core/issues)
- **Discussions**: [GitHub Discussions](https://github.com/hk089660/-instant-grant-core/discussions)

> **Note**: X (Twitter) thread, Superteam profile, and additional documentation links will be added as they become available.

---

## License

[License information to be added]
