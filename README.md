# instant-grant-core

[![CI](https://github.com/hk089660/instant-grant-core/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/hk089660/instant-grant-core/actions/workflows/ci.yml)
[![Local Validation](https://img.shields.io/badge/local_validation-2026--03--12-passed-success)](#ローカル検証スナップショット)
[![Public Readiness](https://img.shields.io/badge/public_readiness-11%2F11%20checks%20passed-success)](#検証とデプロイ確認)

助成金運用のブラックボックス化という社会課題を解決するため、 Solana 上で学校参加運用と給付運用を監査可能にするプロトタイプ基盤です。
このリポジトリは、We-ne / Asuka Network Core プロトタイプとして、Anchor プログラム、Cloudflare Worker API、Expo / Cloudflare Pages フロントエンドをまとめています。

![We-ne モバイル版の初回登録からイベント参加、トークン受け取りまでのフロー](./docs/media/wene-mobile-onboarding-flow.gif)

_We-ne モバイル版の初回登録からイベント参加、トークン受け取りまでのフロー_

[English README](./README.en.md)

## 概要

2026-03-10 時点の公開環境確認に、2026-03-12 の実装更新を反映しています。

### 一目でわかる現状

| 項目 | 状態 | 直近の根拠 |
| --- | --- | --- |
| CI | 有効 | GitHub Actions `CI` が `push` / `pull_request` / `workflow_dispatch` で実行され、lockfile policy、Rust、Anchor、Worker、mobile を検証 |
| `grant_program` | passing | `cargo check --all-features`、`cargo clippy --all-targets -- -D warnings`、`anchor build`、`anchor test --skip-build --provider.cluster localnet` を 2026-03-12 に確認 |
| `api-worker` | passing | `npm test` 86 tests passed、`npx tsc --noEmit` passed |
| `wene-mobile` | passing | `npm run test:server` 22 tests passed、`npx tsc --noEmit` passed |
| 公開 readiness | passing | `npm run verify:production` が 2026-03-10 時点で 11/11 checks passed |
| コードの成熟度 | Phase 1 PoC | 自動検証はあるが、trust model はまだ prototype-centralized で、次フェーズで単一鍵と静的導線を壊しにいく |

### 設計思想と次フェーズ

この repository は、完成済みの trustless 基盤ではなく **Phase 1: 機能検証の PoC** です。短期間で検証しているのは、UX、L1 / L2 連動、PoP、hash chain、監査導線が実際に成立するかどうかです。

その先で目指しているのは、**攻撃を検知して自壊し、自律的に復旧する動的セキュリティ基盤** です。中心に置いている課題は 2 つあります。

- 現在の `api-worker` が単一 signer / 中央集約境界をまだ持っていること
- 会場導線で静的 QR やオフライン媒体に依存しうること

次フェーズでは、これらに対して次の方向でアーキテクチャを組み替えます。

- ネットワーク / 制御層: TEE / secure enclave、エフェメラル鍵のラチェット、役割鍵分離、threshold signer / multisig
- 物理 / 会場層: TOTP を使った動的 QR、短寿命トークン、盗撮耐性のある現場導線
- 復旧層: 異常検知、隔離、零化、証跡保全を前提にした cutover / recovery

補足:

- AI は実装速度を上げるために使っていますが、採用条件は「人が読む」「AI にもレビューさせる」「実装してビルド / テスト / 挙動を確認する」です
- 詳細な背景は [docs/DESIGN_PRINCIPLES.md](./docs/DESIGN_PRINCIPLES.md) にまとめています

### 公開 URL

| 画面 | URL |
| --- | --- |
| 利用者アプリ | `https://instant-grant-core.pages.dev/` |
| 管理者アプリ | `https://instant-grant-core.pages.dev/admin/login` |
| Worker API | `https://instant-grant-core.haruki-kira3.workers.dev` |

管理者デモ用パスコード: `83284ab4d9874e54b301dcf7ea6a6056`

### 第三者検証の事前準備

- Phantom ウォレット（または対応ウォレット）をインストールしてください。
- ウォレットの設定画面からネットワークを `Devnet` に切り替えてください。

### Devnet SOL の取得

- テスト用ウォレットに Devnet SOL を入れてください。
- 公式 Faucet: `https://faucet.solana.com/`
- 上記 Faucet から、検証に使うウォレットアドレス宛てに Devnet SOL を取得してください。

### 検証フロー

1. 管理者アプリ `https://instant-grant-core.pages.dev/admin/login` にアクセスします。
2. デモログインコード `83284ab4d9874e54b301dcf7ea6a6056` を使って管理者としてログインします。
3. 「発行」操作を行い、接続した Phantom ウォレットで署名します。
4. その後、受給者（Claimer）としてトークンを受け取る流れまで確認してください。

### 公開 Readiness Endpoint

| Endpoint | URL | 2026-03-10 時点の確認結果 |
| --- | --- | --- |
| PoP status | `https://instant-grant-core.pages.dev/v1/school/pop-status` | `enforceOnchainPop=true`, `signerConfigured=true` |
| Runtime status | `https://instant-grant-core.pages.dev/v1/school/runtime-status` | `ready=true` |
| Audit status | `https://instant-grant-core.pages.dev/v1/school/audit-status` | `operationalReady=true` |

### 2026-03-12 の実装更新

- `api-worker` の `POST /v1/school/pop-proof` は、同一 claim に対する別端末からの再アクセスを短時間 idempotent に再利用し、PoP chain の不要な重複進行を防ぐようになりました
- PoP proof 発行は従来どおり `popProofLock` で直列化され、同時アクセスと連続再送の両方を抑制します
- 同一 `solanaAuthority + solanaMint + solanaGrantId` のイベント再利用拒否と組み合わせて、grant 単位の PoP stream 競合を減らす運用ガードを明記しました
- この更新に対する `api-worker` の回帰確認として `npm test` を再実行し、`86 tests passed` を確認しました

### ローカル検証スナップショット

| 対象 | コマンド | 確認日 | 結果 |
| --- | --- | --- | --- |
| `grant_program` | `cargo check --all-features` | 2026-03-12 | passed |
| `grant_program` | `cargo clippy --all-targets -- -D warnings` | 2026-03-12 | passed |
| `grant_program` | `anchor build` | 2026-03-12 | passed |
| `grant_program` | `anchor test --skip-build --provider.cluster localnet` | 2026-03-12 | 4 tests passed |
| `api-worker` | `npm test` | 2026-03-12 | 86 tests passed |
| `wene-mobile` | `npm run test:server` | 2026-03-12 | 22 tests passed |
| `api-worker` | `npx tsc --noEmit` | 2026-03-12 | passed |
| `wene-mobile` | `npx tsc --noEmit` | 2026-03-12 | passed |
| root | `npm run check:lockfiles` | 2026-03-10 | passed |
| root | `npm run verify:production` | 2026-03-10 | 11/11 checks passed |

## 構成

### リポジトリの 3 レイヤー

| Directory | 役割 | 補足 |
| --- | --- | --- |
| `grant_program/` | Anchor で構築した Solana プログラム | オンチェーンの grant claim 実行を担います。オンチェーン経路を使う場合、claim 命令内で PoP に紐づく証跡が必須です。 |
| `api-worker/` | Cloudflare Worker + Durable Object バックエンド | オフチェーン参加レシートの発行、admin/master 向け監査 API、readiness endpoint を提供します。 |
| `wene-mobile/` | user、admin、ローカル master フローで使う Expo アプリ | Web 向け画面は Cloudflare Pages にデプロイされています。 |

### 実装済みフロー

- Attend: `confirmationCode` と不変 `ticketReceipt` を使うオフチェーン参加発行
- イベント方針が許す場合の walletless claim 経路
- PoP 証跡と Solana トランザクション証拠を伴う、方針連動の on-chain redeem 経路
- 同一 claim に対する multi-terminal PoP proof 再取得を短時間 idempotent に吸収する Worker 側競合対策
- admin 向けの参加者検索、送金監査、runtime readiness UI
- master 限定の開示 API とインデックス検索 API
- レート制限、payload 制限、Cost of Forgery 連携フックを含む API ガードレール

## 信頼モデルと検証

- オフチェーン Attend は `POST /api/audit/receipts/verify-code` などの公開レシート API で検証できますが、Worker と保存済み監査データへの依存は残ります。
- オンチェーン Redeem は Solana の transaction と account state だけで独立検証できます。
- Worker の PoP proof 発行は grant 単位で直列化され、同一 claim の fresh な再アクセスは同じ proof を返すため、別端末からの重複 PoP 発行を抑えます。
- 現在の trust model はまだ prototype-centralized で、PoP signer / operator 境界は単一主体です。分散化計画は [docs/ROADMAP.md](./docs/ROADMAP.md) にあります。

## クイックスタート

### 前提環境

2026-03-10 にローカルで確認した環境:

| ツール | バージョン |
| --- | --- |
| Node.js | `v20.19.4` |
| npm | `10.8.2` |
| `anchor-cli` | `0.31.1` |
| `solana-cli` | `3.0.13` |
| `rustc` | `1.92.0` |

アプリだけ触る場合は Node.js と npm で足ります。
コントラクトも扱う場合は Rust、Solana CLI、Anchor も必要です。

### 依存関係のインストール

```bash
npm ci

cd api-worker
npm ci

cd ../wene-mobile
npm ci --legacy-peer-deps

cd ../grant_program
npm ci
```

### ローカル起動

1. Worker API を起動します。

```bash
cd api-worker
npx wrangler dev
```

API は `http://localhost:8787` で起動します。

2. フロントエンドを設定します。

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

3. Web 画面を起動します。

```bash
cd wene-mobile
npm run web
```

ターミナルに出るローカル Expo Web URL を開き、必要な画面に移動します。

- `/` 利用者画面
- `/admin/login` 管理者画面
- `/master/login` ローカル master 画面

## 検証とデプロイ確認

### ローカル検証コマンド

README の検証情報を更新するときに使う確認コマンド:

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

### デプロイ済み環境の確認

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
- token なしで protected master endpoint に `401` が返ること

## リポジトリガイド

| Path | 用途 |
| --- | --- |
| `grant_program/` | Solana コントラクトのワークスペース。コマンドは [grant_program/package.json](./grant_program/package.json) を参照 |
| [api-worker/README.md](./api-worker/README.md) | API 契約、Worker 変数、監査と PoP 運用 |
| [wene-mobile/README.ja.md](./wene-mobile/README.ja.md) | アプリ固有フロー、mobile/web 利用方法、Expo 詳細 |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | アーキテクチャ概要 |
| [docs/DESIGN_PRINCIPLES.md](./docs/DESIGN_PRINCIPLES.md) | 現状 PoC の位置づけ、設計思想、次フェーズの実装方針 |
| [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) | 開発環境セットアップ |
| [docs/DEVNET_SETUP.md](./docs/DEVNET_SETUP.md) | Devnet claim 検証手順 |
| [docs/SECURITY.md](./docs/SECURITY.md) | セキュリティモデルと運用制御 |
| [docs/POP_CHAIN_OPERATIONS.md](./docs/POP_CHAIN_OPERATIONS.md) | PoP chain の復旧、grant 再利用制限、multi-terminal 競合ガード |
| [docs/ROADMAP.md](./docs/ROADMAP.md) | 分散化と pilot の計画 |

## 開発メモ

- 正式な package manager は `npm`
- 正式な lockfile は root / `api-worker` / `wene-mobile` / `grant_program` の `package-lock.json`
- CI は [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) で管理し、push / pull request / manual dispatch 時に lockfile policy、`api-worker` の Vitest + TypeScript、`wene-mobile` の server テスト + TypeScript、`grant_program` の Cargo check / clippy / Anchor build / Anchor test を実行します
- ルートの本番検証スクリプト: [scripts/verify-production-readiness.mjs](./scripts/verify-production-readiness.mjs)

## ライセンス

[MIT](./LICENSE)
