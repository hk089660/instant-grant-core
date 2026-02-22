# Asuka Network Core (Prototype)
> 行政プロセスの正当性を証明する Proof of Process (PoP) 基盤

[![Solana](https://img.shields.io/badge/Solana-Devnet-green?style=flat&logo=solana)]
[![Edge](https://img.shields.io/badge/Edge-Cloudflare_Workers-orange?style=flat&logo=cloudflare)]
[![License](https://img.shields.io/badge/License-MIT-blue)]
[![Status](https://img.shields.io/badge/Status-Mitou_Applied-red)]

[English README](./README.md)

## デモ
- 利用者アプリ: https://instant-grant-core.pages.dev/
- 管理者アプリ: https://instant-grant-core.pages.dev/admin/login

## 審査員向け要約（2026年2月22日時点）
このリポジトリは、次の問いに対する実装です。
「オンチェーンの結果だけでなく、行政オペレーションの過程そのものをどう検証可能にするか」

本プロジェクトの答え:
- PoP（Proof of Process）で API 側の処理ログとオンチェーン決済を暗号学的に結合
- 3層アーキテクチャ
1. Layer 1（Solana/Anchor）: 決済ファイナリティと二重受給防止
2. Layer 2（Cloudflare Workers + Durable Objects）: 監査ハッシュチェーンと運用API
3. Layer 3（Web/Mobile UI）: 利用者・管理者・運営者の運用UI

独自性:
- 「結果の整合性」だけでなく「過程の整合性」を検証できる
- 権限厳格レベル（`運営 > 管理者`）で監査情報の開示範囲を分離
- Master検索はサーバー側インデックス化し、DO SQLite に永続化（コールドスタート後も遅延を安定化）

## 現在動作しているもの
- claim フローでの on-chain PoP 検証（`claim_grant` / `claim_grant_with_proof`）
- 監査ログのグローバル連鎖とイベント単位連鎖（`prev_hash`, `stream_prev_hash`）
- DO 外不変シンク（R2 + 任意 ingest）への固定化と fail-close 運用
- 認証強化:
  - 管理者専用 API は Bearer 必須
  - Master 専用 API は実値 `ADMIN_PASSWORD` 必須
- 運営者 UI:
  - 招待コードの発行/無効化/名称変更
  - 管理者・利用者の開示ビュー
  - `GET /api/master/search` によるサーバー側検索

## 審査用の最短確認手順（約5分）
リポジトリルートで実行:

```bash
cd api-worker && npm test && npx tsc --noEmit
cd ../wene-mobile && npm run test:server && npx tsc --noEmit
```

推奨 API チェック:
- `GET /v1/school/runtime-status` が `ready: true`
- `GET /v1/school/pop-status` で signer 設定が有効
- `GET /api/master/audit-integrity?limit=50` が `ok: true`
- `GET /api/master/search?q=<keyword>&limit=50` で検索結果が返る

## アーキテクチャ概要
- `grant_program/`: Solana プログラム（Layer 1）
- `api-worker/`: API、PoP、監査、権限制御（Layer 2）
- `wene-mobile/`: 利用者/管理者/運営者 UI（Layer 3）
- `functions/` と `wene-mobile/functions/`: Pages プロキシルーティング（`/api`, `/v1`, `/metadata`, `/health`）

## 国産インフラとしてのビジョン
目標:
助成金・給付・行政手続きを対象に、国内で運用可能な監査可能デジタル公共基盤を作ること。

長期目標:
富岳などの国産サーバ/計算基盤へ PoP 実装を展開し、サーバが「いつ・誰が・どの手続きで処理したか」を検証可能にすること。
本プロジェクトではこれを「国産サーバに時間を吹き込む」と定義しています。

設計原則:
- Accountability by default: 重要操作はすべて検証可能な痕跡を残す
- Non-custodial: 利用者の鍵管理を中央に集約しない
- Operational sovereignty: 国内事業者・公共機関が運用可能な構成
- Progressive decentralization: 実運用から始めて段階的に分散化

## 独自チェーンでの将来運用（計画）
現時点では Solana devnet-first で検証を進めています。
並行して、将来的には独自チェーン運用を見据えています。

計画フェーズ:
1. Federation: 自治体・公共機関参加型のコンソーシアム運用
2. Sovereign infra: 国内バリデータ/監査ネットワーク運用
3. Independent chain: PoP を第一級データとして扱う独自チェーン運用

独自チェーンで目指す仕様:
- トランザクション結果だけでなく、プロセス証明をネイティブ管理
- 現在の配布ロジック（決定論的 Vault / 重複防止）を継承
- Solana を含む外部チェーンとの相互運用（移行・ブリッジ）

実装状況:
- 独自チェーン運用はロードマップ項目であり、本リポジトリには未実装

## リポジトリ構成
- `grant_program/` Solana プログラムとテスト
- `api-worker/` Worker API、監査ロジック、権限制御 API
- `wene-mobile/` Expo アプリ（Web/Mobile）、管理者/運営者 UI
- `docs/` 設計・セキュリティ・ロードマップ

## 詳細ドキュメント
- アーキテクチャ: `docs/ARCHITECTURE.md`
- セキュリティ: `docs/SECURITY.md`
- ロードマップ: `docs/ROADMAP.md`
- Devnet セットアップ: `docs/DEVNET_SETUP.md`
- API 詳細: `api-worker/README.md`
- アプリ詳細: `wene-mobile/README.md`

## Author
Kira (hk089660), 19歳

## 応募・申請先
- 未踏 IPA（申請済み）
- Solana Foundation grant track（申請済み）
- 孫正義育英財団（申請済み）

## License
MIT
