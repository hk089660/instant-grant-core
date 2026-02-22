# PoP Chain Operations Runbook

この文書は、PoP チェーン（`prev_hash` / `stream_prev_hash`）の実運用上の前提と、障害時の復旧手順を明確化するための運用ランブックです。

## 1. 現行モデル（2026-02-22 時点）

- On-chain 検証（`grant_program`）は `PopState` を grant 単位で 1 本保持します。
  - `last_global_hash`
  - `last_stream_hash`
- PoP proof 発行（`api-worker`）は `popProofLock` で直列化されます。
  - global head key: `pop_chain:lastHash:global:<grant>`
  - stream head key: `pop_chain:lastHash:stream:<grant>`
- したがって stream 境界は「grant 単位」です。1 grant を複数イベントで再利用すると、運用上の競合リスクが上がります。

## 2. 競合を減らす運用ガード

- `1イベント = 1grant` を運用ルールとします。
- API でも同じ on-chain 設定の再利用を拒否します。
  - 対象: `solanaAuthority + solanaMint + solanaGrantId` の同一組み合わせ
  - 挙動: `POST /v1/school/events` は 409（`on-chain grant config already linked ...`）を返します。
- PoP proof は `api-worker` の `/v1/school/pop-proof` 経由に限定し、別経路で同一 grant の proof を並列発行しないことを必須にします。

## 3. 障害シグナル（検知）

- On-chain claim で以下のエラーが出た場合、チェーン連続性不整合の可能性があります。
  - `PopHashChainBroken`
  - `PopStreamChainBroken`
  - `PopGenesisMismatch`
- 付随チェック:
  - `/v1/school/pop-status`（signer 設定の健全性）
  - `/api/master/audit-integrity`（監査チェーン整合）

## 4. 復旧手順（Reset / Fork Handling / Stream Cut）

### Step 0: 影響範囲を凍結

- 該当イベントの新規 on-chain claim を一時停止（新規 QR 配布停止、運用アナウンス）。
- 必要なら一時的に off-chain Attend にフォールバック（運用ポリシーに従う）。

### Step 1: 直近正常点を特定

- 最後に成功した `txSignature` と `receiptPubkey` を控える。
- Solana Explorer / RPC で、どの時点から `Pop*Broken` が出始めたか確認する。

### Step 2: Stream を切り替える（実運用上の reset）

- 現行設計では `PopState` の in-place reset 命令はありません。
- そのため reset は「同じ grant を直す」のではなく、「新しい grant に切り替えて GENESIS から再開」します。
  1. 新しい `grant_id` で grant を新規作成
  2. `fund_grant` 実行
  3. `upsert_pop_config` で signer 設定
  4. 新しいイベント（または切替イベント）に新 grant 設定を紐付け

### Step 3: Fork handling（過去チェーンの扱い）

- 既存チェーンの `prev_hash` / `stream_prev_hash` は書き換えない（監査証跡を保全）。
- 旧イベント/旧grant は「過去証跡」として残し、運用上は read-only 扱いにする。
- 新しい grant 側を正系として告知し、利用者導線を更新する。

### Step 4: 事後検証

- 新 grant 側で `How to Verify (Independent / Server-Untrusted)` の手順を再実施。
- `/api/master/audit-integrity` と参加券検証 API の整合を合わせて記録する。

## 5. 設計上の注意

- この PoC は「不整合時に自動修復する設計」ではなく、「明示的 cutover で監査証跡を保全する設計」です。
- 自動復旧よりも、証跡破壊を避けること（書き換えないこと）を優先しています。

## 6. 次フェーズ（Planned）

- `role keys` 分離
- 高影響操作の `2-of-3 multisig` 化
- `threshold PoP signer (t-of-n)` 導入

詳細マイルストーンは `docs/ROADMAP.md` を参照してください。
