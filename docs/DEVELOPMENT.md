# 開発ガイド

この文書では、instant-grant-core の開発環境構築、各コンポーネントの起動方法、主要な検証コマンドをまとめます。現在のリポジトリは root スクリプトを起点に、`grant_program`、`api-worker`、`wene-mobile` を個別にも動かせます。

## 前提環境

### 全体共通

- Node.js `v20` 系推奨
- npm `v10` 系
- Git

### コントラクト開発

- Rust stable
- Solana CLI
- Anchor CLI

### モバイル開発

- Android: Android Studio / Android SDK / Java 17
- iOS: Xcode 15 以降（macOS のみ）、CocoaPods

## クイックスタート

### 1. リポジトリ取得

```bash
git clone https://github.com/hk089660/instant-grant-core.git
cd instant-grant-core
```

### 2. 依存関係インストール

```bash
npm ci

cd api-worker
npm ci

cd ../wene-mobile
npm ci --legacy-peer-deps

cd ../grant_program
npm ci
```

補足:

- `wene-mobile` は peer dependency の都合で `npm ci --legacy-peer-deps` を前提にしています
- root の `npm run build` は `anchor build` と mobile の TypeScript check を実行します

### 3. root からの主要コマンド

```bash
# コントラクト build + mobile typecheck
npm run build

# Anchor テスト
npm run test

# lockfile policy の検証
npm run check:lockfiles

# 本番 readiness の確認
npm run verify:production
```

## コンポーネント別の開発

### `api-worker`

```bash
cd api-worker
npm ci
npm run dev
```

主なコマンド:

- `npm run dev`: `wrangler dev`
- `npm run deploy`: `wrangler deploy`
- `npm test`: `vitest run`

ローカル起動先:

- `http://localhost:8787`

### `wene-mobile`

```bash
cd wene-mobile
npm ci --legacy-peer-deps
npm start
```

主なコマンド:

- `npm start`: Expo 開発サーバー
- `npm run web`: Web 起動
- `npm run android`: Android 実機 / エミュレータ起動
- `npm run ios`: iOS 起動
- `npm run test:server`: server 側テスト
- `npx tsc --noEmit`: TypeScript check

### `grant_program`

```bash
cd grant_program
anchor build
anchor test
```

主なコマンド:

- `anchor build`: プログラム build
- `anchor test`: Anchor テスト
- `npm run devnet:setup`: devnet 向け mint / grant / vault のセットアップ補助

## CI

GitHub Actions では主に以下を検証します。

- lockfile policy
  - `yarn.lock`、`pnpm-lock.yaml`、非正規 lockfile 名を拒否
- `api-worker`
  - `npm ci`
  - `npm test`
  - `npx tsc --noEmit`
- `grant_program`
  - `cargo check --all-features`
  - `cargo clippy --all-targets -- -D warnings`
  - `npm ci`
  - `anchor build`
  - `anchor test --skip-build --provider.cluster localnet`
- `wene-mobile`
  - `npm ci --legacy-peer-deps`
  - `npm run test:server`
  - `npx tsc --noEmit`

workflow 定義は [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) にあります。push / pull request に加えて manual dispatch にも対応しています。

## リポジトリ構成

```text
instant-grant-core/
├── grant_program/          # Anchor program とテスト
├── api-worker/             # Cloudflare Worker API
├── wene-mobile/            # Expo / React Native / Pages frontend
├── docs/                   # 設計、運用、検証ドキュメント
└── scripts/                # root 補助スクリプト
```

### 主要ディレクトリ

| パス | 役割 |
| --- | --- |
| `grant_program/programs/grant_program/src/lib.rs` | Anchor program 本体 |
| `grant_program/tests/` | コントラクト検証 |
| `api-worker/src/index.ts` | Worker API 入口 |
| `api-worker/src/storeDO.ts` | Durable Object 状態管理 |
| `wene-mobile/src/screens/` | UI 画面群 |
| `wene-mobile/src/solana/` | Solana RPC / tx 構築 |
| `wene-mobile/src/wallet/` | wallet adapter |
| `wene-mobile/src/utils/phantom.ts` | Phantom 連携 |

## 環境変数

### `wene-mobile`

テンプレートから `.env.local` を作成します。

```bash
cd wene-mobile
cp .env.example .env.local
```

代表的な変数:

| 変数 | 説明 | 例 |
| --- | --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | Worker API ベース URL | `http://localhost:8787` |
| `EXPO_PUBLIC_API_MODE` | API モード | `http` |
| `EXPO_PUBLIC_SOLANA_RPC_URL` | Solana RPC | `https://solana-devnet.api.onfinality.io/public` |
| `EXPO_PUBLIC_SOLANA_CLUSTER` | Solana cluster | `devnet` |
| `PROGRAM_ID` | grant program ID | `anchor deploy` 出力値 |

詳しくは [wene-mobile/.env.example](../wene-mobile/.env.example) を参照してください。

### `api-worker`

ローカルでは `wrangler dev`、本番では Cloudflare の secrets / vars を使います。代表的な設定は次のとおりです。

- `CORS_ORIGIN`
- `AUDIT_IMMUTABLE_MODE`
- `POP_SIGNER_*` / `POP_SIGNER_HD_*`
- `SECURITY_RATE_LIMIT_*`
- `COST_OF_FORGERY_*`

詳細は [api-worker/README.md](../api-worker/README.md) と [api-worker/wrangler.toml](../api-worker/wrangler.toml) を参照してください。

## Android 開発

### エミュレータ中心で進める場合

詳細は [wene-mobile/docs/EMULATOR_DEVELOPMENT.md](../wene-mobile/docs/EMULATOR_DEVELOPMENT.md) を参照してください。

```bash
cd wene-mobile
npm run emulator:check
npm run emulator:start
npm run deploy:adb
```

### APK ビルド

```bash
cd wene-mobile
npm run build:prebuild
npm run build:apk
```

出力先:

- `wene-mobile/android/app/build/outputs/apk/release/app-release.apk`

## iOS 開発

### シミュレータ起動

```bash
cd wene-mobile
npm run build:ios
```

### 前提

- Xcode 15 以降
- `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`

## よく使う検証コマンド

### 型・テスト

```bash
# Worker
cd api-worker
npm test
npx tsc --noEmit

# Mobile
cd ../wene-mobile
npm run test:server
npx tsc --noEmit

# Contract
cd ../grant_program
anchor build
anchor test --skip-build --provider.cluster localnet
```

### devnet セットアップ

```bash
cd grant_program
npm run devnet:setup
```

その後、出力された `_RAW` を `wene-mobile/src/solana/devnetConfig.ts` へ反映します。詳細は [DEVNET_SETUP.md](./DEVNET_SETUP.md) を参照してください。

## トラブルシューティング

### Metro の不調

```bash
cd wene-mobile
npm run clean
```

### Android build 失敗

```bash
java -version
cd wene-mobile/android && ./gradlew clean
```

Java 17 を使っていることを確認してください。

### iOS build 失敗

```bash
cd wene-mobile/ios
pod install --repo-update
```

### Phantom リダイレクト不調

以下を確認します。

1. `app.config.ts` の `scheme`
2. deep link 受信ルート
3. Phantom アプリが最新であること

詳細は [PHANTOM_FLOW.md](./PHANTOM_FLOW.md) と [PHANTOM_DEBUG.md](./PHANTOM_DEBUG.md) を参照してください。
