# Development Guide

This guide covers setting up the development environment for we-ne. Third-party and contributor builds are supported via root-level scripts and CI.

## Prerequisites

### All Platforms
- Node.js v18+ (recommended: v20 LTS)
- npm or yarn
- Git

### Smart Contract Development
- Rust (latest stable)
- Solana CLI v1.18+
- Anchor v0.30+

### Mobile Development
- **Android**: Android Studio, Android SDK (API 36), Java 17
- **iOS**: Xcode 15+ (macOS only), CocoaPods

## Quick Start

### Root-level build (recommended for contributors)

From the **repository root** you can build and test without entering each subproject:

```bash
git clone https://github.com/<owner>/we-ne.git
cd we-ne

# Using npm (requires Node at root)
npm run build      # contract build + mobile typecheck
npm run test       # Anchor tests
npm run build:contract
npm run build:mobile
npm run test:contract

# Using shell script (no root Node required)
chmod +x scripts/build-all.sh
./scripts/build-all.sh all    # build + test + mobile typecheck
./scripts/build-all.sh build  # build only
./scripts/build-all.sh test   # contract tests only
```

### Per-component setup

```bash
# Clone repository
git clone https://github.com/<owner>/we-ne.git
cd we-ne

# Install mobile app dependencies
cd wene-mobile
npm install

# Start development server
npm start
```

## CI (GitHub Actions)

On every push/PR to `main` or `master`, [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs:

- **Smart contract**: Install Rust, Solana CLI, Anchor → `grant_program`: `yarn install`, `anchor build`, `anchor test`
- **Mobile app**: Node 20 → `wene-mobile`: `npm ci`, `npx tsc --noEmit`

No secrets required. The README CI badge reflects this workflow once the repo is on GitHub.

## Repository Structure

```
we-ne/
├── grant_program/          # Solana smart contract (Anchor)
│   ├── programs/
│   │   └── grant_program/
│   │       └── src/lib.rs  # Main program logic
│   ├── tests/              # Integration tests
│   ├── Anchor.toml         # Anchor configuration
│   └── Cargo.toml
│
├── wene-mobile/            # React Native app (Expo)
│   ├── app/                # Expo Router screens
│   ├── src/
│   │   ├── solana/         # Blockchain client
│   │   ├── screens/        # UI components
│   │   ├── store/          # Zustand state
│   │   ├── wallet/         # Wallet adapters
│   │   └── utils/          # Utilities
│   ├── assets/             # Images, icons
│   └── scripts/            # Build scripts
│
├── docs/                   # Documentation
└── .github/workflows/      # CI/CD
```

## Smart Contract (Anchor)

### Setup

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install latest
avm use latest
```

### Build & Test

```bash
cd grant_program

# Build
anchor build

# Run tests (starts local validator)
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

### Key Files

| File | Description |
|------|-------------|
| `programs/grant_program/src/lib.rs` | Main program with instructions |
| `Anchor.toml` | Network configuration |
| `tests/basic.ts` | TypeScript integration tests |

## Mobile App (Expo)

### Setup

```bash
cd wene-mobile
npm install
```

### Development Server

```bash
# Standard start
npm start

# Clear cache
npm run start:clear

# Full reset (clears all caches)
npm run start:reset
```

### Android Development

#### Prerequisites
```bash
# macOS (Homebrew)
brew install openjdk@17
brew install --cask android-commandlinetools

# Set environment
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
```

#### Build APK
```bash
# Generate native project (first time)
npm run build:prebuild

# Build release APK
npm run build:apk
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

#### Install via ADB
```bash
# One-command deploy (generates icons, builds, installs)
npm run deploy:adb

# Or manually
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

### iOS Development

#### Prerequisites
- Xcode 15+ from App Store
- `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`

#### Build for Simulator
```bash
npm run build:ios
```

#### Without Xcode (EAS Cloud Build)
```bash
npm install -g eas-cli
eas login
eas build --platform ios --profile development
```

### Environment Variables

Create `.env.local` from template:
```bash
cp .env.example .env.local
```

| Variable | Description | Default |
|----------|-------------|---------|
| `SOLANA_RPC_URL` | RPC endpoint | devnet |
| `PROGRAM_ID` | Grant program address | (from deploy) |

## Troubleshooting

### Metro Bundler Issues
```bash
# Clear all caches
npm run clean

# Or manually
rm -rf .expo node_modules/.cache .metro
npm run start:reset
```

### Android Build Fails
```bash
# Check Java version (must be 17)
java -version

# Clear Gradle cache
cd android && ./gradlew clean
```

### iOS Build Fails
```bash
# Reinstall pods
cd ios && pod install --repo-update
```

### Phantom Redirect Not Working
1. Check `scheme` in `app.config.ts` matches deep link
2. Verify `intentFilters` include `wene://` scheme
3. Check Phantom app is installed and updated

## Code Style

### TypeScript
```bash
# Lint
npx eslint . --ext .ts,.tsx

# Type check
npx tsc --noEmit
```

### Rust
```bash
cd grant_program
cargo fmt
cargo clippy
```

## Debugging

### React Native
- Shake device → "Debug" menu
- React DevTools: `npx react-devtools`
- Flipper for network/storage inspection

### Solana Program
- `msg!()` macro for logging
- View logs: `solana logs -u devnet`
- Explorer: https://explorer.solana.com/?cluster=devnet
