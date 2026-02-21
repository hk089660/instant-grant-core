# 学校PoC API（Cloudflare Workers）

Hono による最小構成の API。`wene-mobile`（Cloudflare Pages）から固定HTTPSで接続し、学校運用を完結させる。

## API 仕様

- `GET /v1/school/events`  
  - レスポンス: `{ items: SchoolEvent[]; nextCursor?: string }`  
  - 各 item に `claimedCount` を含む
- `GET /v1/school/events/:eventId`  
  - レスポンス: `SchoolEvent`（`claimedCount` 含む）。存在しなければ 404 + `SchoolClaimResult`（not_found）
- `POST /v1/school/events`
  - リクエスト: `{ title: string; datetime: string; host: string; state?: 'draft'|'published'; solanaMint?: string; solanaAuthority?: string; solanaGrantId?: string; ticketTokenAmount: number; claimIntervalDays?: number; maxClaimsPerInterval?: number | null }`
  - `ticketTokenAmount` は 1 以上の整数（数値文字列も許容）
  - `claimIntervalDays` は 1 以上の整数（未指定時 30）
  - `maxClaimsPerInterval` は `null`（無制限）または 1 以上の整数（未指定時 1）
  - レスポンス: 作成された `SchoolEvent`
- `POST /v1/school/claims`  
  - リクエスト: `{ eventId: string; walletAddress?: string; joinToken?: string; txSignature?: string; receiptPubkey?: string }`  
  - レスポンス: `SchoolClaimResult`  
  - **walletAddress 未指定かつ joinToken 未指定** → `wallet_required`（Phantom誘導用）  
  - `ENFORCE_ONCHAIN_POP=true` かつ on-chain 設定済みイベント（`solanaMint`/`solanaAuthority`/`solanaGrantId`）では、`walletAddress + txSignature + receiptPubkey` を必須化
  - `POST /api/events/:eventId/claim`（userId+PIN）でも同様に on-chain 証跡を必須化
  - **evt-003** → 常に `retryable`（デモ用）
- `GET /v1/school/pop-status`
  - レスポンス: `{ enforceOnchainPop: boolean; signerConfigured: boolean; signerPubkey?: string | null; error?: string | null }`
- `GET /v1/school/audit-status`
  - レスポンス: `{ mode: 'off'|'best_effort'|'required'; failClosedForMutatingRequests: boolean; operationalReady: boolean; primaryImmutableSinkConfigured: boolean; sinks: { r2Configured: boolean; kvConfigured: boolean; ingestConfigured: boolean } }`
- `GET /v1/school/runtime-status`
  - レスポンス: `{ ready: boolean; checks: {...}; blockingIssues: string[]; warnings: string[] }`
  - 実運用の前提（`ADMIN_PASSWORD`、PoP signer、監査 immutable sink）を一括で確認
- `GET /api/master/audit-integrity`（Master Password 必須）
  - クエリ: `limit`（既定 50, 最大 200）, `verifyImmutable`（既定 true）
  - レスポンス: `ok`, `issues[]`, `warnings[]` を含む整合性レポート（`ok=false` の場合 HTTP 409）
- `POST /v1/audit/log`（監査ログ強制書き込み用）
  - Authorization 必須（`Bearer <AUDIT_LOG_WRITE_TOKEN>`。未設定時は `ADMIN_PASSWORD`）
  - `AUDIT_LOG_WRITE_TOKEN` / `ADMIN_PASSWORD` が無効な設定の場合は 503

契約型は `src/types.ts`（wene-mobile の `SchoolEvent` / `SchoolClaimResult` と一致）。

## ローカル起動

```bash
cd api-worker
npm i
npx wrangler dev
```

デフォルトで `http://localhost:8787` で待ち受ける。Pages の `.env` で `EXPO_PUBLIC_API_BASE_URL=http://localhost:8787` にするとローカルで UI と接続できる。

## デプロイ

```bash
cd api-worker
npm i
npx wrangler deploy
```

デプロイ後に表示される URL（正規: `https://instant-grant-core.haruki-kira3.workers.dev`）を、Pages の環境変数 `EXPO_PUBLIC_API_BASE_URL` に設定する。

### PoP（Proof of Process）署名設定（必須）

L1 で PoP 検証を行うため、以下の Worker 変数を設定する:

- `POP_SIGNER_SECRET_KEY_B64`: Ed25519 の 32byte seed または 64byte secret key を base64 で設定
- `POP_SIGNER_PUBKEY`: 対応する公開鍵（base58）
- `ENFORCE_ONCHAIN_POP`: on-chain 設定イベントで PoP 証跡を必須化（推奨: `true`、未設定時も強制）
- `AUDIT_IMMUTABLE_MODE`: `required`（推奨） / `best_effort` / `off`
- `AUDIT_IMMUTABLE_FETCH_TIMEOUT_MS`: immutable ingest 送信タイムアウト（ms、既定 5000）
- `AUDIT_IMMUTABLE_INGEST_URL`: 任意。R2 に加えて外部 immutable sink に二重固定化したい場合に設定
- `AUDIT_LOG_WRITE_TOKEN`: 任意。`POST /v1/audit/log` を有効化する場合の専用トークン

`POST /v1/school/pop-proof` はこの鍵で署名した PoP 証明を返し、クライアントは `claim_grant` 送信前に Ed25519 検証命令を付与する。
デプロイ後は次を確認してから本番運用に入ること:
- `GET /v1/school/pop-status` で `signerConfigured: true`
- `GET /v1/school/audit-status` で `operationalReady: true`
- `GET /api/master/audit-integrity?limit=50` が `ok: true`

## CORS

この Worker は次の優先順で CORS を判定する。

1. リクエスト `Origin` が `*.pages.dev` または `localhost` の場合は、その `Origin` をそのまま許可
2. それ以外は `CORS_ORIGIN` を使用（未設定時は `https://instant-grant-core.dev`）

`CORS_ORIGIN` を明示したい場合:

- **ダッシュボード**: Workers → 該当 Worker → Settings → Variables and Secrets → `CORS_ORIGIN` = `https://<your-domain>`
- **wrangler.toml**: `[vars]` に `CORS_ORIGIN = "https://<your-domain>"` を追加

## ストレージ（Durable Objects）

**Durable Object**（`SchoolStore`）で claims を永続化している。

- `/v1/school/*` のリクエストは Worker から DO に転送され、DO 内の `ctx.storage`（KV）に保存する。
- キー: `claim:${eventId}:${subject}`。**subject** は walletAddress または joinToken を **正規化**（trim・連続空白を1つに）した値。空になった場合は `wallet_required`。
- **同一 subject の 2 回目**は `alreadyJoined: true` を返し、**claimedCount は増えない**。異なる subject なら 1 ずつ増える。
- 集計は `claim:${eventId}:` を prefix に list して件数。eventId ごとに独立（evt-001 と evt-002 は混ざらない）。
- Worker の再起動・デプロイ後も claimedCount と already 判定は維持される。
- ロジックは `src/claimLogic.ts`（`ClaimStore`）、DO は `src/storeDO.ts` でルーティングとストレージアダプタのみ。

### 監査ログの不変保存（運用要件）

- 監査エントリは DO 内ハッシュチェーンに加えて、DO 外の不変シンクに固定化される。
- `AUDIT_IMMUTABLE_MODE=required` の場合、更新系 API（POST/PUT/PATCH/DELETE）は監査固定化が失敗すると 503 で fail-close する。
- `AUDIT_IMMUTABLE_MODE=required` かつ immutable sink が未設定/未準備のときは、更新系 API を**実処理前に 503 で遮断**する（状態変更の先行を防止）。
- production では `AUDIT_LOGS`（R2 バインディング）を必ず設定すること。
- 監査整合性は `GET /api/master/audit-integrity` で定期確認すること。

## テスト

```bash
npm test
```

`test/claimPersistence.test.ts` で「同一 subject で2回 POST しても claimedCount が増えない」「異なる subject なら増える」「joinToken も同様」を検証している。

## 関連

- UI: `wene-mobile`（Cloudflare Pages）
- 契約型: `wene-mobile/src/types/school.ts`
- デプロイメモ: `wene-mobile/docs/CLOUDFLARE_PAGES.md`
