# パイロットオンボーディングフロー（1ページ版）

ステータス: 2026-02-22 時点で固定。

## 目的

少なくとも 1 件の実在パイロットを実施し、第三者が再検証できる証跡を残すことを目的とします。匿名組織での実施も許容します。

## 想定プロファイル

- 組織: 1 機関（学校 / 教育 NPO / 自治体委託先）
- オペレーター: `admin 1-3`
- 参加者: `20-200`
  - ウォレット利用者と非利用者が混在してよい

## エンドツーエンドフロー

| ステップ | 主担当 | 実施内容 | 完了条件 |
| --- | --- | --- | --- |
| 1. 受け入れ確認とスコープ確定 | オペレーター + プロジェクトチーム | パイロット範囲、匿名方針、イベント規模を確定する | スコープ文書が承認され、日付付きで残る |
| 2. Runtime readiness 確認 | オペレーター | `/v1/school/pop-status`、`/v1/school/runtime-status`、`/v1/school/audit-status` を確認する | 必須 readiness チェックがすべて通る |
| 3. イベント準備 | オペレーター | admin フローでイベント作成・準備、QR 導線の印刷、参加者案内を整備する | イベントが publish-ready 状態になる |
| 4. 小規模ドライラン | オペレーター + サンプル参加者 | `admin login -> QR -> /u/scan -> /u/confirm -> /u/success` を 1 回通す | ブロッカーなしでリハーサル完了 |
| 5. 本番パイロット | オペレーター + 実参加者 | 同じ導線で実イベントを少なくとも 1 回実施する | 実イベントが完了し、ticket receipt が発行される |
| 6. エビデンス整備 | プロジェクトチーム | マスキング済み証跡と検証手順を公開する | 第三者が証跡から再検証できる |

## 最低限必要なエビデンス

- runtime / readiness スナップショット
  - `/v1/school/pop-status`
  - `/v1/school/runtime-status`
  - `/v1/school/audit-status`
- receipt 検証の証跡
  - `/api/audit/receipts/verify-code` による `confirmationCode` 検証結果を 1 件以上
- ユーザーフロー証跡
  - success 画面で得られる `confirmationCode`、`receipt_id`、`receipt_hash`
- 任意のオンチェーン証跡
  - on-chain 経路を使った場合のみ `txSignature`、`receiptPubkey`

## 匿名パイロット向けのマスキング方針

- 学校名、組織名、個人識別子は除去する
- 技術的証跡（hash、signature、pubkey、timestamp）は改変しない
- 独立検証に必要な情報だけを公開する
