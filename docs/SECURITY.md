# セキュリティモデルと脅威分析

## 概要

we-ne は **non-custodial** を前提に設計されています。モバイルアプリはユーザー秘密鍵へアクセスせず、オンチェーン検証と off-chain 監査証跡を組み合わせて運用します。ただし、現時点では Worker / PoP signer を中心とする中央集約的 trust assumption が残っています。

この文書は「現時点の脅威モデル」を扱います。背景にある設計思想と次フェーズの狙いは [DESIGN_PRINCIPLES.md](./DESIGN_PRINCIPLES.md) を参照してください。

## 設計原則

現在の repository は **Phase 1: 機能検証の PoC** です。ここでは UX、PoP、hash chain、L1 / L2 連動を検証しています。

一方で、次フェーズでは次の原則をセキュリティ設計の中心に置きます。

- 単一鍵への依存を減らす
- 静的な攻撃面を減らす
- 異常時に検知、隔離、零化、復旧できるようにする
- 証跡の保全を優先し、復旧時にも auditability を落とさない

## 現時点で明示している最重要課題

### 1. 単一 signer / 中央集約境界

現行の `api-worker` は、PoP signer と運用制御の中心です。PoC としては妥当ですが、長寿命の単一鍵を境界に置く構成は次フェーズで縮小する対象です。

### 2. 静的 QR / オフライン媒体

物理会場の入口として静的 QR や紙の URL を使うと、盗撮、再利用、後追いアクセスの余地が残ります。これはネットワーク層ではなく、物理層に近い脆弱性です。

## 次フェーズの対策方針

### ネットワーク / 制御層

- TEE / secure enclave を用いた署名環境
- エフェメラル鍵のラチェット構造
- role-key separation
- threshold signer / multisig
- fail-closed を基本にした停止 / rotate / cutover

### 物理 / 会場層

- TOTP を用いた動的 QR
- 数秒単位で更新される短寿命コード
- 会場端末側での表示制御
- 静的 URL 依存の縮小

### 復旧 / 証跡保全

- 異常時の検知と隔離
- 鍵 / セッションの零化
- in-place 修正より cutover を優先
- hash chain と immutable sink を維持したままの recovery

## 脅威モデル

### 1. Deep Link Injection

脅威:

- 悪意のあるアプリが deep link を傍受または偽造し、セッション窃取や誤誘導を狙う

主な対策:

- Phantom レスポンスは NaCl box で暗号化される
- 復号にはアプリが保持する `dappSecretKey` が必要
- URL パラメータを厳格に検証する
- セッションは特定の dapp 側鍵ペアに紐づく

関連箇所:

- `wene-mobile/src/utils/phantom.ts`
  - `parsePhantomRedirect()`
  - `decryptPhantomResponse()`

### 2. Session Hijacking

脅威:

- Phantom session token を盗み、不正署名を試みる

主な対策:

- セッションは app sandbox 内ストレージで扱う
- セッション単独では不十分で、Phantom 側暗号鍵との組み合わせが必要
- 実際の署名には Phantom でのユーザー承認が必要

残余リスク:

- root 化 / jailbreak 済み端末では AsyncStorage へのアクセスリスクがある

### 3. Replay Attack / Double Claim

脅威:

- 正当な claim を再送して二重受給を狙う

主な対策:

- on-chain `ClaimReceipt` PDA で同一期間の claim を禁止
- receipt seed に `period_index` を含める
- Solana の recent blockhash によるリプレイ抑止
- `api-worker` の `POST /v1/school/pop-proof` は `popProofLock` で直列化し、同一 claim への fresh な再アクセスでは同じ PoP proof を返して multi-terminal 再送による重複発行を抑止

関連箇所:

- `grant_program/programs/grant_program/src/lib.rs`
- `api-worker/src/storeDO.ts`

### 4. Sybil / Fraud

脅威:

- 複数 wallet や複数アカウントを作って不正 claim を試みる

主な対策:

- 現在: allowlist ベース判定
- 現在: API レベルの rate limiting
- 現在: Cost of Forgery 連携フック
- 将来: trust assumption 縮小と運用ルール強化

制約:

- allowlist 管理や実運用上の本人確認は off-chain 側の責任に残る

### 5. Audit Chain Tampering

脅威:

- receipt や監査ログを後から改ざんし、参加証跡や transfer 記録を操作する

主な対策:

- receipt に hash chain を持たせる
- immutable sink への固定化を支援する
- `/api/audit/receipts/verify` と `/api/audit/receipts/verify-code` を公開する
- `/api/master/audit-integrity` により整合確認を行う

残余リスク:

- Worker が完全に侵害された場合、運用時点の trust assumption は残る
- そのため immutable sink と公開検証導線を併用する

### 6. Signer / Config Drift

脅威:

- PoP signer の公開鍵と on-chain `pop-config` がずれ、検証不能や誤動作を起こす

主な対策:

- `/v1/school/pop-status` で signer 状態を公開
- `verify:production` で `pop-config` 整合を確認
- HD rotation と key separation の導入計画を進める

### 7. MITM

脅威:

- RPC や deep link を中間者が傍受し、内容を改ざんする

主な対策:

- RPC は HTTPS 前提
- deep link payload は end-to-end で暗号化
- Phantom 通信の暗号化により wallet 経路の MITM を抑止

### 8. Phishing

脅威:

- 偽アプリや偽サイトがユーザーに悪意ある署名を承認させる

主な対策:

- Phantom で署名内容を確認できる
- Universal Links によるドメイン検証を使う
- 利用者に署名内容の確認を促す

## 機微データの取り扱い

### `wene-mobile` 側で保持するもの

| データ | 暗号化 | 用途 |
| --- | --- | --- |
| `dappSecretKey` | No* | Phantom レスポンス復号 |
| `phantomSession` | Phantom 側で暗号化された payload | Phantom とのセッション維持 |
| `walletPubkey` | No | 接続 wallet の表示 |

\* 非 root 端末では app sandbox 内に保持されます。

### 保持しないもの

- wallet 秘密鍵
- seed phrase / mnemonic
- 他アプリ由来の平文セッショントークン

## ログ方針

- Production: 機微情報はログしない
- Debug: 暗号化済み payload や状態遷移は出す場合がある
- 常に出さないもの
  - 秘密鍵
  - 平文 session
  - 復号済み payload

## 監査状況

| コンポーネント | 監査状況 | 補足 |
| --- | --- | --- |
| `grant_program` | ❌ 未監査 | 外部監査キックオフ目標: 2026-04-01 |
| `wene-mobile` | ❌ 未監査 | モバイルセキュリティレビュー目標: 2026-04-15 |
| `api-worker` | ❌ 未監査 | trust boundary の整理と外部確認が必要 |
| 依存関係 | 一部対応 | メジャー依存は継続確認が必要 |

## 外部保証計画（2026-02-22 時点）

1. 2026-03-15: `grant_program` と API trust boundary の監査範囲を確定
2. 2026-04-01: スマートコントラクト外部監査を開始
3. 2026-04-30: 是正ステータスの要約を repository docs に公開

## 本番前提での推奨事項

1. スマートコントラクト外部監査
2. モバイルアプリのセキュリティレビュー
3. responsible disclosure / bug bounty の整備
4. on-chain / Worker 両面の監視強化
5. RPC / API の rate limiting と fail-closed ポリシーの明確化
6. 単一 signer を縮小するための enclave / ratchet / threshold signer 設計
7. 静的 QR を減らすための動的 QR / TOTP 導線の実装
