# ロードマップ

we-ne の開発ロードマップです。現状の到達点、実証パイロットの目標、今後 3 か月の優先事項をまとめています。

## ビジョン

日本を含む公的支援プログラムに対して、即時性、透明性、低コストを備えた給付配布基盤を実現することを目指します。

## フェーズ定義

| フェーズ | 目的 | 現在の状況 |
| --- | --- | --- |
| Phase 1 | UX、L1 / L2 連動、PoP、hash chain、監査導線の成立性を検証する | 現在の repository はここにある |
| Phase 2 | 単一鍵、静的導線、中央集約境界を壊し、検知、隔離、零化、復旧を含む動的セキュリティ基盤へ移行する | これから設計と PoC を進める |

補足:

- 現状は「完成済みの trustless 基盤」ではなく、Phase 2 に進むための PoC です
- 設計思想の詳細は [DESIGN_PRINCIPLES.md](./DESIGN_PRINCIPLES.md) を参照してください

## 現在地（MVP）

### 実装済み

- SPL トークンによる定期給付機能（スマートコントラクト）
- 受給者向けモバイルアプリ（React Native / Expo）
- Phantom ウォレット連携
- Deep link 対応（カスタムスキーム + Universal Links）
- 二重請求防止を含む基本 claim フロー
- Merkle ベースの allowlist claim 経路（`claim_grant_with_proof`）
- Solana 上での PoP 署名検証（`verify_and_record_pop_proof`）
- admin / master 向けの監査可視化 API と receipt 検証 endpoint
- `api-worker` による PoP proof の直列化と、同一 claim に対する短時間 idempotent 再利用
- 同一 `solanaAuthority + solanaMint + solanaGrantId` のイベント再利用拒否による grant 競合ガード

### 2026-03-12 時点のステータス要約

現在すでに実装されている内容:

- イベント単位の on/off-chain 経路ポリシー切り替え
  - enforced / non-enforced の切り替えに対応
  - オンチェーン claim 命令内では PoP 検証を必須のまま維持
- オペレーター確認用の runtime / PoP / audit readiness endpoint
- 転送監査と参加レシート監査のための hash-chain ベース監査証跡
- PoP proof の multi-terminal 競合対策
  - Worker は proof 発行を直列化
  - 同一 claim の fresh な再アクセスは同じ proof を再利用し、不要な chain 進行を避ける

次に進める内容:

- 外部監査の実施と是正
- CI/CD とテストカバレッジの強化
- federation / adapter 設計の汎化
- 単一 signer / 中央集約境界の縮小
  - TEE / secure enclave、role-key separation、threshold signer の比較検討
- 静的 QR / 物理導線の縮小
  - dynamic QR / TOTP ベース導線の PoC
- 検知、隔離、零化、復旧を前提にした incident runbook の整備
- trust assumption の縮小計画
  - 単一 operator / signer から multi-operator / multi-signer へ移行
- 実在組織でのパイロット 1 件
  - 匿名組織は許容
  - 固定 1 ページのオンボーディングフローを併用

## 実証パイロット（実運用適合性の確認）

### 目的

- 机上評価に留まらず、少なくとも 1 つの実運用主体がエンドツーエンドでフローを回せることを示す

### 想定プロファイル

- 対象組織: 1 機関（学校 / 教育 NPO / 自治体委託先）
- オペレーター: `admin 1-3`
- 参加者: `20-200`

### スケジュール目標

- [ ] 候補先の確定（匿名表記ポリシー確定を含む）: 2026-03-10
- [ ] オペレーターのドライラン完了: 2026-03-24
- [ ] 本番パイロットイベント実施: 2026-04-15
- [ ] マスキング済みエビデンス公開: 2026-04-22

### 成功条件

- 少なくとも 1 つのイベントで `admin login -> QR issuance -> user claim -> success -> audit verification` が通る
- runtime / readiness スナップショット（`/v1/school/pop-status`、`/v1/school/runtime-status`、`/v1/school/audit-status`）が取得されている
- コードによる receipt 検証（`/api/audit/receipts/verify-code`）を第三者が再現できる
- オンチェーン経路を使った場合は、`txSignature` と `receiptPubkey` を取得し、独立検証できる

### 参照フロー

- [PILOT_ONBOARDING_FLOW.md](./PILOT_ONBOARDING_FLOW.md)

## 短期（2 週間）

### スマートコントラクト

- [x] Merkle ベースの allowlist 検証
- [ ] インデックス性を高めるイベント発火
- [ ] grant パラメータ更新命令の追加
- [ ] PoP メッセージ検証の negative-path テスト追加

### モバイルアプリ

- [ ] エラーハンドリングとユーザーフィードバックの改善
- [ ] 取引履歴画面
- [ ] grant 情報のオフラインキャッシュ

### インフラ

- [x] CI/CD パイプライン（GitHub Actions）
- [ ] 自動テストカバレッジ 60% 超
- [ ] devnet デプロイスクリプト
- [ ] PoP chain 復旧ドリル（`reset / fork handling / stream cut`）とオペレーター runbook の検証

## 中期（1 か月）

### スマートコントラクト

- [ ] 複数トークン給付への対応
- [ ] バッチ claim の最適化
- [ ] grant の有効期限と自動 close

### モバイルアプリ

- [ ] 複数ウォレット対応（Solflare など）
- [ ] claim 可能通知の push 配信
- [ ] 多言語化の完成（EN / JA）

### 管理ツール

- [ ] grant 作成者向け Web ダッシュボード
- [ ] 分析と監視
- [ ] allowlist の一括管理

### セキュリティ

- [ ] スマートコントラクト監査（外部）: ベンダー選定目標 2026-03-15
- [ ] スマートコントラクト監査キックオフ目標: 2026-04-01
- [ ] モバイルアプリのセキュリティレビュー目標: 2026-04-15
- [ ] バグバウンティ開始
- [ ] TEE / secure enclave signer の threat model と候補比較
- [ ] エフェメラル鍵ラチェットの PoC
- [ ] dynamic QR / TOTP 会場導線の PoC
- [ ] detect / isolate / zeroize / recover を前提にした incident response の設計

### Trust Assumption 縮小（Operator / Signer 分散化）

- [ ] 役割鍵の分離（`operator`、`pop_signer`、`audit_admin`）と key rotation runbook: 2026-03-31 目標
- [ ] 高影響 grant 操作向け `2-of-3 multisig`
  - 対象: `upsert_pop_config`、`set_paused`、`set_allowlist_root`、`close_grant`
  - 目標: 2026-04-30
- [ ] `threshold PoP signer (t-of-n)` の設計確定と devnet PoC: 2026-05-31 目標

## 長期（3 か月）

### Cost of Forgery 連携

- [ ] Sybil resistance レイヤー
- [ ] プライバシーを保った eligibility proof
- [ ] grant 横断の重複排除

### エコシステム

- [ ] サードパーティ連携用 SDK
- [ ] grant discovery API
- [ ] パートナー向けオンボーディングツール

### コンプライアンス

- [ ] KYC 連携
  - 規制用途では任意オプション
- [ ] 監査証跡とレポーティングツール
- [ ] multisig による grant 管理

### スケール

- [ ] mainnet デプロイ
- [ ] パフォーマンス最適化
- [ ] 日本国外への展開

## Solana Foundation 向けマイルストーン

| マイルストーン | 成果物 | 期限 |
| --- | --- | --- |
| M1 | devnet MVP とドキュメント | 完了 |
| M2 | allowlist + 監査準備 | 目標: 2026-03-08 |
| M3 | admin ダッシュボード + 監査 + 役割鍵分離 | 目標: 2026-03-31 |
| M4 | パイロット 1 件（匿名可）+ 1 ページオンボーディングフロー + マスキング済みエビデンス | 目標: 2026-04-22 |
| M5 | mainnet beta readiness + multisig / threshold signer PoC | 目標: 2026-05-31 |

## コントリビュート

ガイドラインは [CONTRIBUTING.md](../CONTRIBUTING.md) を参照してください。

優先的に歓迎する領域:

1. テスト（unit + integration）
2. ドキュメント改善
3. 多言語化
4. セキュリティレビュー
5. UI / UX フィードバック

## 連絡先

- GitHub Issues: バグ報告、機能要望
- 問い合わせ全般: GitHub Issues を利用
