# instant-grant-core

Solana 上で学校参加運用と給付運用を監査可能にするプロトタイプです。
このリポジトリは、We-ne / Asuka Network Core プロトタイプとして、Anchor プログラム、Cloudflare Worker API、Expo / Cloudflare Pages フロントエンドをまとめています。

[English README](./README.md)

## Snapshot

2026-03-10 時点で確認済みです。

- 利用者アプリ: `https://instant-grant-core.pages.dev/`
- 管理者アプリ: `https://instant-grant-core.pages.dev/admin/login`
- Worker API: `https://instant-grant-core.haruki-kira3.workers.dev`
- 公開 readiness endpoint:
  - `https://instant-grant-core.pages.dev/v1/school/pop-status`
  - `https://instant-grant-core.pages.dev/v1/school/runtime-status`
  - `https://instant-grant-core.pages.dev/v1/school/audit-status`
- 2026-03-10 時点の公開 runtime 状態:
  - `runtime-status.ready=true`
  - `pop-status.enforceOnchainPop=true`
  - `pop-status.signerConfigured=true`
  - `audit-status.operationalReady=true`

2026-03-10 に実行したローカル検証:

- `api-worker`: `npm test` -> 80 tests passed
- `wene-mobile`: `npm run test:server` -> 18 tests passed
- `api-worker`: `npx tsc --noEmit` -> passed
- `wene-mobile`: `npx tsc --noEmit` -> passed
- `grant_program`: `anchor build` -> passed
- `grant_program`: `anchor test --skip-build --provider.cluster localnet` -> passed
- root: `npm run check:lockfiles` -> passed
- root: `npm run verify:production` -> 11/11 checks passed

## What This Repo Does

このプロトタイプは 3 層で構成されています。

1. `grant_program/`
   - Anchor で構築した Solana プログラムです。
   - オンチェーンの grant claim 実行を担います。
   - オンチェーン経路を使う場合、claim 命令内で PoP に紐づく証跡が必須です。
2. `api-worker/`
   - Cloudflare Worker + Durable Object バックエンドです。
   - オフチェーン参加レシートの発行、admin/master 向け監査 API、readiness endpoint を提供します。
3. `wene-mobile/`
   - user、admin、ローカル master フローで使う Expo アプリです。
   - Web 向け画面は Cloudflare Pages にデプロイされています。

現在実装されている主なフロー:

- Attend: `confirmationCode` と不変 `ticketReceipt` を使うオフチェーン参加発行
- イベント方針が許す場合の walletless claim 経路
- PoP 証跡と Solana トランザクション証拠を伴う、方針連動の on-chain redeem 経路
- admin 向けの参加者検索、送金監査、runtime readiness UI
- master 限定の開示 API とインデックス検索 API
- レート制限、payload 制限、Cost of Forgery 連携フックを含む API ガードレール

## Verification Model

- オフチェーン Attend は `/api/audit/receipts/verify-code` などの公開レシート API で検証できますが、Worker と保存済み監査データへの依存は残ります。
- オンチェーン Redeem は Solana の transaction と account state だけで独立検証できます。
- 現在の trust model はまだ prototype-centralized で、PoP signer / operator 境界は単一主体です。分散化計画は [docs/ROADMAP.md](./docs/ROADMAP.md) にあります。

## Repository Layout

- `grant_program/`: Solana コントラクトのワークスペース。コマンドは [grant_program/package.json](./grant_program/package.json) を参照
- [api-worker/README.md](./api-worker/README.md): API 契約、Worker 変数、監査と PoP 運用
- [wene-mobile/README.md](./wene-mobile/README.md): アプリ固有フロー、mobile/web 利用方法、Expo 詳細
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md): アーキテクチャ概要
- [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md): 開発環境セットアップ
- [docs/DEVNET_SETUP.md](./docs/DEVNET_SETUP.md): devnet claim 検証手順
- [docs/SECURITY.md](./docs/SECURITY.md): セキュリティモデルと運用制御
- [docs/POP_CHAIN_OPERATIONS.md](./docs/POP_CHAIN_OPERATIONS.md): PoP chain の復旧と cutover
- [docs/ROADMAP.md](./docs/ROADMAP.md): 分散化と pilot の計画

## Prerequisites

2026-03-10 にローカルで確認した環境:

- Node.js `v20.19.4`
- npm `10.8.2`
- `anchor-cli 0.31.1`
- `solana-cli 3.0.13`
- `rustc 1.92.0`

アプリだけ触る場合は Node.js と npm で足ります。
コントラクトも扱う場合は Rust、Solana CLI、Anchor も必要です。

## Install Dependencies

```bash
npm ci

cd api-worker
npm ci

cd ../wene-mobile
npm ci --legacy-peer-deps

cd ../grant_program
npm ci
```

## Validate The Repo

今回の README 同期で使った確認コマンド:

```bash
npm run check:lockfiles

cd api-worker
npm test
npx tsc --noEmit

cd ../wene-mobile
npm run test:server
npx tsc --noEmit

cd ../grant_program
anchor build
anchor test --skip-build --provider.cluster localnet
```

補足:

- ルートの `npm run build` は `anchor build` と mobile の TypeScript チェックを実行します。
- ルートの `npm run test` は Anchor テストだけを実行します。
- `wene-mobile` は意図的に `npm ci --legacy-peer-deps` を使います。

## Run Locally

### 1. Worker API を起動

```bash
cd api-worker
npx wrangler dev
```

API は `http://localhost:8787` で起動します。

### 2. フロントエンドを設定

```bash
cd wene-mobile
cp .env.example .env.local
```

最低限必要な設定:

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:8787
EXPO_PUBLIC_API_MODE=http
```

オンチェーンフローを使う場合は、[wene-mobile/.env.example](./wene-mobile/.env.example) の Solana 関連設定も入れてください。特に必要なのは次です。

- `EXPO_PUBLIC_SOLANA_RPC_URL`
- `EXPO_PUBLIC_SOLANA_CLUSTER`
- `PROGRAM_ID`

### 3. Web 画面を起動

```bash
cd wene-mobile
npm run web
```

ターミナルに出るローカル Expo Web URL を開き、必要な画面に移動します。

- `/` 利用者画面
- `/admin/login` 管理者画面
- `/master/login` ローカル master 画面

## Verify The Deployed Environment

公開 endpoint の簡易確認:

```bash
BASE="https://instant-grant-core.pages.dev"

curl -s "$BASE/v1/school/pop-status"
curl -s "$BASE/v1/school/runtime-status"
curl -s "$BASE/v1/school/audit-status"
```

本番 readiness の一括確認:

```bash
npm run verify:production
```

任意の環境変数:

- `WORKER_BASE_URL`
- `PAGES_BASE_URL`
- `SOLANA_RPC_URL`
- master 保護 API まで確認する場合の `MASTER_TOKEN`

現在の readiness script が検証する内容:

- Worker root health
- PoP status
- audit status
- runtime readiness
- Pages proxy readiness
- 公開中イベントに対する on-chain `pop-config` 整合
- master 保護 endpoint で、token なし `401` が返ること

## Key Public Endpoints

- `GET /v1/school/pop-status`
- `GET /v1/school/runtime-status`
- `GET /v1/school/audit-status`
- `POST /api/audit/receipts/verify-code`

完全な API 契約と Worker 設定は [api-worker/README.md](./api-worker/README.md) を参照してください。

## Development Notes

- 正式な package manager は `npm`
- 正式な lockfile は root / `api-worker` / `wene-mobile` / `grant_program` の `package-lock.json`
- CI は lockfile policy を強制し、`yarn.lock`、`pnpm-lock.yaml`、非正規名の lockfile を拒否します
- ルートの本番検証スクリプトは [scripts/verify-production-readiness.mjs](./scripts/verify-production-readiness.mjs)

## License

[MIT](./LICENSE)
