/**
 * 【開発・テスト専用】Node.js インメモリ API サーバ
 *
 * このファイルは wene-mobile/server/ 以下の Express サーバを起動する。
 * ここで動くサーバは「本番バックエンドではない」。用途は次の 2 つに限定される。
 *
 *   1. ローカル開発: EXPO_PUBLIC_API_MODE=node のときに mobile/web が接続するスタブ
 *   2. 単体テスト: npm run test:server（Vitest）が createServer() を直接インポートして使う
 *
 * ─────────────────────────────────────────────
 *  バックエンドが二つある理由（wene-mobile/server vs api-worker）
 * ─────────────────────────────────────────────
 *  │ 項目                │ wene-mobile/server        │ api-worker                     │
 *  │─────────────────────│───────────────────────────│────────────────────────────────│
 *  │ ランタイム          │ Node.js / Express         │ Cloudflare Workers (Hono + DO) │
 *  │ ストレージ          │ オンメモリ（휘발性）       │ Durable Object（永続）         │
 *  │ 用途                │ テスト / ローカル開発     │ 本番・Devnet デプロイ          │
 *  │ デプロイ先          │ しない                    │ Cloudflare Workers             │
 *  │ PoP / 監査 chain    │ 実装なし（スタブ相当）    │ 完全実装                       │
 *  ─────────────────────────────────────────────
 *
 * 本番環境では api-worker のみが動き、wene-mobile/server は一切起動しない。
 * EXPO_PUBLIC_API_BASE_URL=http://localhost:8787 で UI が接続する。
 */

import { createServer } from './createServer';
import { createMemoryStorage } from './storage/MemoryStorage';
import { listen } from './createServer';

const PORT = parseInt(process.env.PORT ?? '8787', 10);

const app = createServer({
  storage: createMemoryStorage(),
});

listen(app, PORT)
  .then(({ port, close }) => {
    console.log(`School API server listening on http://localhost:${port}`);
    process.on('SIGINT', () => close().then(() => process.exit(0)));
    process.on('SIGTERM', () => close().then(() => process.exit(0)));
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
