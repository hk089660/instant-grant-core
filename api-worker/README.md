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
  - リクエスト: `{ eventId: string; walletAddress?: string; joinToken?: string }`  
  - レスポンス: `SchoolClaimResult`  
  - **walletAddress 未指定かつ joinToken 未指定** → `wallet_required`（Phantom誘導用）  
  - **evt-003** → 常に `retryable`（デモ用）

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

デプロイ後に表示される URL（例: `https://we-ne-school-api.<subdomain>.workers.dev`）を、Pages の環境変数 `EXPO_PUBLIC_API_BASE_URL` に設定する。

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

## テスト

```bash
npm test
```

`test/claimPersistence.test.ts` で「同一 subject で2回 POST しても claimedCount が増えない」「異なる subject なら増える」「joinToken も同様」を検証している。

## 関連

- UI: `wene-mobile`（Cloudflare Pages）
- 契約型: `wene-mobile/src/types/school.ts`
- デプロイメモ: `wene-mobile/docs/CLOUDFLARE_PAGES.md`
