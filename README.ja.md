# We-ne (instant-grant-core)

Solana上の**非保管型 支援配布 / 参加券**を対象にした、オープンソースの public-good プロトタイプです。

> ステータス（2026年2月11日時点）: **PoC / devnet-first**。本番mainnet運用ではなく、再現性と第三者検証を重視しています。

[English README](./README.md) | [Architecture](./docs/ARCHITECTURE.md) | [Devnet Setup](./docs/DEVNET_SETUP.md) | [Security](./docs/SECURITY.md)

## Problem
給付・参加証明系の仕組みは、次の5点で詰まりやすいです。

- 承認から受取までが遅い
- 少額支援ほど運用コストが重い
- 第三者監査のしやすさが弱い
- 重複claimや不正参加の圧力がある
- 過剰な個人情報要求によるプライバシーリスクがある

## Solution
We-ne は次の2レイヤーで解決します。

- **オンチェーン非保管 claim フロー（Solana devnet）**
- **学校PoC向け運用フロー（QR参加導線 + API）**

設計原則:

- 受給者が鍵を保持（署名はwallet側、アプリは秘密鍵を持たない）
- オンチェーン `ClaimReceipt` PDA で期間内1回claimを強制
- Explorerで第三者が検証できる監査導線
- 当日運用しやすいUX（印刷QR、confirm/success、already時も運用上完了）

## What Is Built Now (Fact-Based)

- **Anchor grant program**: `./grant_program/programs/grant_program/src/lib.rs`
- `ClaimReceipt` PDA による二重claim防止（grant + claimer + period index をseed化）
- devnet program ID をコードと Anchor config で固定（`GZcUoGHk8SfAArTKicL1jiRHZEQa3EuzgYcC2u4yWfSR`）
- **学校PoC UIルート**実装済み:
  - `/admin`（イベント一覧）
  - `/admin/print/[eventId]`（印刷QR + event ID文字表示）
  - `/u/scan` -> `/u/confirm?eventId=...` -> `/u/success?eventId=...`
- **学校API**実装済み（ローカルサーバ / Workers 両対応）:
  - `GET /v1/school/events`
  - `GET /v1/school/events/:eventId`
  - `POST /v1/school/claims`
  - `POST /api/users/register`
- **Cloudflare Pages proxy対策導線**実装済み:
  - `npm run export:web` で `dist` 生成 + `scripts/gen-redirects.js` 実行
  - `_redirects` に `/api/*` `/v1/*` proxy と SPA fallback を生成
- **検証資産**が存在:
  - `./wene-mobile/scripts/verify-pages-build.sh`
  - `./wene-mobile/scripts/gen-redirects.js`
  - `./api-worker/test/claimPersistence.test.ts`
  - `./wene-mobile/server/__tests__/schoolApi.test.ts`

### Important Current Constraints

- Solana claim検証は devnet 前提
- PoC は未監査
- 学校向け `/u/scan` は現在カメラ部分がモックで、URLベースの遷移を使う（`/u/scan?eventId=...`）
- schoolモードの運用フローと Solana walletフローは、同一リポジトリ内の別ランタイム経路

## Demo (Fastest Review Path)

### A. School PoC Demo (QR -> confirm -> success)

1. 管理画面 `/admin` を開く
2. 印刷画面 `/admin/print/evt-001` を開く
3. `/u/scan?eventId=evt-001` を含むQRを印刷（またはPDF保存）
4. 利用者側でQR URLを開く
5. `/u/confirm?eventId=evt-001` へ進む
6. 参加処理後に `/u/success?eventId=evt-001` 到達

すでに実装されている運用挙動:

- `alreadyJoined` でも完了扱い（現場の詰まりを減らす）
- `published` 状態での参加制御あり
- リトライ可能エラー分岐あり（`evt-003`）

### B. Solana Devnet E2E Claim (wallet sign -> send -> Explorer)

- ルート: `/r/demo-campaign?code=demo-invite`
- フロー: Phantom connect -> sign transaction -> send -> tx表示
- Explorer確認リンク形式:
  - `https://explorer.solana.com/tx/<signature>?cluster=devnet`
- Receiptアカウントはオンチェーンロジックで生成（ClaimReceipt PDA）。seed設計と挙動は `grant_program` テストで検証

## Repro / Verify (Copy-Paste)

### 1) ローカルAPI / Workerロジックテスト

```bash
# School API integration tests
cd wene-mobile
npm run test:server

# Worker claim persistence tests
cd ../api-worker
npm test
```

### 2) Devnet Grant Setup（オンチェーンclaimデモ用）

```bash
cd grant_program
yarn devnet:setup
```

出力された `_RAW` を `./wene-mobile/src/solana/devnetConfig.ts` に貼り付けます。

詳細: `./docs/DEVNET_SETUP.md`

### 3) Pages Deploy Verification Chain（必須）

```bash
cd wene-mobile
npm run export:web
npm run deploy:pages
npm run verify:pages
```

`verify:pages` は本番ルーティング不整合を早期に落とすための検証です。主に次を確認します。

- ローカル `dist` JS bundle hash と本番 `/admin` bundle hash の一致
- `/v1/school/events` が PagesのHTMLではなく API系レスポンス（JSON）であること
- `POST /api/users/register` が **`405 Method Not Allowed` ではない**こと

期待される挙動:

- 成功時は `OK:` ログを出して `0` 終了
- 失敗時は `FAIL:` ログを出して非0終了

### 4) API到達の手動確認（curl）

```bash
BASE="https://<your-pages-domain>"

# HTTP 200 かつ content-type に application/json を含むこと
curl -sS -D - "$BASE/v1/school/events" -o /tmp/wene_events.json | sed -n '1p;/content-type/p'
head -c 160 /tmp/wene_events.json && echo

# 405 でないこと（400/401/200 はバリデーション/認証条件により許容）
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Content-Type: application/json' \
  -d '{}' \
  "$BASE/api/users/register"
```

`/v1/school/events` が `text/html` になったり、`/api/users/register` が `405` なら、APIパスが Pages 側に誤着弾しています（proxy設定不整合）。

## Deployment (Cloudflare Pages + Workers)

### 推奨: Wranglerベースのデプロイ

1. Worker API をデプロイ:

```bash
cd api-worker
npm i
npm run deploy
```

2. Pages の環境変数を設定:

- `EXPO_PUBLIC_API_MODE=http`
- `EXPO_PUBLIC_API_BASE_URL=https://<your-worker>.workers.dev`
- `EXPO_PUBLIC_BASE_URL=https://<your-pages>.pages.dev`

3. `./wene-mobile` から build + deploy:

```bash
npm run export:web
npm run deploy:pages
```

理由:

- `scripts/gen-redirects.js` が proxy安全な `dist/_redirects` を生成
- `/api/*` `/v1/*` が静的Pages応答に落ちる事故を防ぐ

### 非推奨: 手動ZIPアップロード

手動ZIPは `_redirects` 欠落や配置ミスを起こしやすいです。`wrangler pages deploy` を推奨します。

手動が必要な場合のみ `./wene-mobile/scripts/make-dist-upload-zip.sh` を使ってください。

## Roadmap (With a $3,000 Microgrant)

目標: 小さく、現実的で、検証可能な改善に集中。

- **Workstream 1: Verification hardening**
  - Pages検証スクリプトの安定化
  - reviewer向け routing/API 到達チェックを1コマンド化
- **Workstream 2: Demo reliability**
  - 印刷QR -> 利用者完了までの再現性向上
  - 外部審査員向けdevnetデモ導線の安定化
- **Workstream 3: Minimal abuse controls v0**
  - schoolフローでの重複参加検知を強化
  - already/retryable時の運用runbook明確化
- **Workstream 4: Documentation for grant reviewers**
  - READMEとdocsを実コマンドのみで同期維持
  - テスト/スクリプト/Explorerリンクの証跡導線を明示

## Milestones (2-4 Weeks)

1. **Week 1: Repro Baseline**
- Deliverable: 検証チェックリスト更新 + ローカルテスト緑化
- Verification: `npm run test:server`, `cd api-worker && npm test`

2. **Week 2: Pages/Workers Reliability**
- Deliverable: deploy + proxy検証の再現可能化
- Verification: `npm run export:web && npm run deploy:pages && npm run verify:pages`

3. **Week 3: Demo Packaging for Reviewers**
- Deliverable: school PoC + devnet claim の短い審査員用実演手順
- Verification: `/admin/print/evt-001` -> `/u/success` 導線 + devnet explorer tx確認

4. **Week 4: Abuse-Resilience v0 + Docs Finalization**
- Deliverable: エッジケース運用資料とテスト整備
- Verification: テスト更新 + クリーン環境でrunbook再現

## Why This Fits a Microgrant

- MITライセンスの open-source public good
- **sub-$10k / microgrant** で完遂可能な、実証寄りスコープ
- 過剰な機能拡張より、再現性・運用性・監査可能性を優先

## Links

- Public demo URL (Pages): [https://we-ne-school-ui.pages.dev](https://we-ne-school-ui.pages.dev)
- School PoC guide: `./wene-mobile/README_SCHOOL.md`
- Cloudflare Pages setup: `./wene-mobile/docs/CLOUDFLARE_PAGES.md`
- Worker API details: `./api-worker/README.md`
- Devnet setup guide: `./docs/DEVNET_SETUP.md`
- Architecture: `./docs/ARCHITECTURE.md`
- Security model: `./docs/SECURITY.md`
- GitHub issues: [https://github.com/hk089660/instant-grant-core/issues](https://github.com/hk089660/instant-grant-core/issues)
- GitHub pull requests: [https://github.com/hk089660/instant-grant-core/pulls](https://github.com/hk089660/instant-grant-core/pulls)

---

短い補足: このREADMEは「いま再現できる手順」と「第三者検証できる導線」を優先して更新しています。PoC段階のため、mainnet本番運用を断定する記述は避けています。
