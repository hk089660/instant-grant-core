# アーキテクチャ

この文書では、we-ne / instant-grant-core の全体アーキテクチャを高水準で整理します。現在のプロトタイプは、Solana プログラム、Cloudflare Worker API、Expo / Cloudflare Pages フロントエンドの 3 層で構成されています。

## システム概要

```text
┌─────────────────────────────────────────────────────────────────────┐
│                           利用者 / 運営者 / 監査者                 │
├─────────────────────────────────────────────────────────────────────┤
│  利用者 UI          管理者 UI         master UI / 検証者            │
│  (参加・受取)       (イベント運用)     (監査・確認)                 │
└───────────────┬───────────────┬────────────────────────────────────┘
                │               │
                ▼               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     wene-mobile / Cloudflare Pages                 │
│  - Expo / React Native / Expo Router                               │
│  - user / admin / master フロー                                    │
│  - Phantom 連携、QR 導線、印刷導線                                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        api-worker / Cloudflare Worker              │
│  - Hono API                                                         │
│  - Durable Object + SQLite 状態管理                                │
│  - 参加レシート発行、監査 API、readiness endpoint                  │
│  - PoP 証跡発行、immutable audit sink 連携                          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ On-chain claim / verification
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        grant_program / Solana                      │
│  - Anchor program                                                   │
│  - grant / claim / receipt / PoP 検証                              │
│  - ClaimReceipt による二重 claim 防止                              │
└─────────────────────────────────────────────────────────────────────┘
```

## 主要コンポーネント

### 1. Solana Program（`grant_program/`）

目的:

- on-chain の grant claim 実行を担う
- ClaimReceipt により重複 claim を防止する
- PoP（Proof of Process）証跡付き claim を検証する

主な責務:

- grant 設定の保持
- claim 実行と残高移転
- claim receipt の記録
- pause / close など高影響操作の実行

主要なオンチェーン状態の例:

| 概念 | 役割 |
| --- | --- |
| `Grant` | 給付設定、期間、mint、権限を保持する |
| `ClaimReceipt` | 同一期間の二重 claim を防ぐ |
| `PopState` / `pop-config` | PoP ハッシュチェーンと署名者整合を支える |
| Vault Token Account | 配布対象 SPL トークンを保持する |

### 2. Worker API（`api-worker/`）

目的:

- 学校運用向けの off-chain 参加導線を提供する
- immutable receipt と監査 API を提供する
- runtime / PoP / audit readiness を公開する

主な責務:

- イベント作成、取得、claim 受付
- `confirmationCode + ticketReceipt` の発行
- admin / master 向け監査ビュー
- PoP proof 発行とチェーン整合
- 同一 claim に対する PoP proof の短時間 idempotent 再利用による multi-terminal 競合抑制
- immutable audit sink への固定化

主要モジュール:

| パス | 役割 |
| --- | --- |
| `api-worker/src/index.ts` | API ルーティング入口 |
| `api-worker/src/storeDO.ts` | Durable Object + SQLite ベースの状態管理 |
| `api-worker/src/claimLogic.ts` | claim 判定と発行ロジック |
| `api-worker/src/audit/` | 監査ハッシュ、immutable receipt、監査 API |

### 3. Frontend / Mobile（`wene-mobile/`）

目的:

- 利用者、管理者、master の UI を提供する
- モバイルと Web の両方で同じプロトタイプ導線を動かす
- QR 導線、Phantom 接続、on-chain / off-chain 両経路を扱う

主要モジュール:

| パス | 役割 |
| --- | --- |
| `wene-mobile/src/screens/` | user / admin / master 画面 |
| `wene-mobile/src/api/http/` | Worker API への HTTP 実装 |
| `wene-mobile/src/hooks/useSchoolClaim.ts` | 参加 claim 状態遷移の集約 |
| `wene-mobile/src/solana/` | RPC、トランザクション構築、program 設定 |
| `wene-mobile/src/wallet/` | Wallet adapter 層 |
| `wene-mobile/src/utils/phantom.ts` | Phantom deep link / 暗号処理 |
| `wene-mobile/app/phantom/` | Phantom callback 受信ルート |

## 主要フロー

### A. Attend（off-chain 主導線）

学校現場での主導線は off-chain 参加発行です。

```text
利用者 / 管理者
  -> wene-mobile
  -> api-worker
  -> confirmationCode + ticketReceipt 発行
  -> 公開 receipt API で第三者検証
```

特徴:

- ウォレット不要で参加証跡を配布できる
- Worker と監査データに依存するが、検証導線は公開できる
- 学校イベント運用に合わせて即時配布しやすい

### B. Redeem（on-chain 拡張導線）

イベント設定で on-chain 経路を使う場合に限り、有効になります。

```text
利用者
  -> wene-mobile
  -> Phantom 署名
  -> api-worker / PoP proof
  -> grant_program claim
  -> Solana 上の tx と receipt で独立検証
```

特徴:

- wallet、`txSignature`、`receiptPubkey` が必要
- PoP 検証を claim 命令内で実施する
- Solana の状態だけで独立検証しやすい
- 同一 claim を別端末から再送しても、fresh window 内は Worker が同一 PoP proof を返し、不要な重複 entry を増やさない

## 主要データモデル

### API 側

| モデル | 概要 |
| --- | --- |
| `SchoolEvent` | 学校イベント設定。on/off-chain 方針や ticket 設定を含む |
| `SchoolClaimResult` | claim 成否、already、error code を表す |
| `ParticipationTicketReceipt` | immutable な参加証跡。hash chain と検証情報を含む |

### On-chain 側

| モデル | 概要 |
| --- | --- |
| `Grant` | 給付設定 |
| `ClaimReceipt` | 二重 claim 防止用 receipt |
| `PopState` | PoP チェーンの最新ハッシュ |

## 信頼境界

| 境界 | 信頼前提 |
| --- | --- |
| Phantom Wallet | 秘密鍵保持とユーザー承認を担う |
| `wene-mobile` | 鍵を保持せず、トランザクションや API 呼び出しを組み立てる |
| `api-worker` | off-chain 運用と監査を司る中央集約境界。現時点では trust assumption の中心 |
| Solana | 署名検証、状態遷移、receipt 記録を担う trustless 層 |

## 補足ドキュメント

- [DEVELOPMENT.md](./DEVELOPMENT.md): 開発環境と実行手順
- [SECURITY.md](./SECURITY.md): 脅威分析と残余リスク
- [ROADMAP.md](./ROADMAP.md): 分散化とパイロット計画
