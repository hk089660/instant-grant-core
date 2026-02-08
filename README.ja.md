# we-ne

**Solana 上の即時・透明な支援配布 — 日本の公的支援ニーズ向け**

[![CI](https://github.com/hk089660/-instant-grant-core/actions/workflows/ci.yml/badge.svg)](https://github.com/hk089660/-instant-grant-core/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## グラントの位置づけ

本プロジェクトは **Superteam Japan Grants**（または同等のエコシステムプログラム）における **初回グラント（例: $3,000）** を想定した申請です。**技術 PoC** として、**通信制高校 1 校**をスコープに以下を提供します。

- **QR ベースの参加フロー** — スマホで完結する参加導線  
- **即時発行のデジタル参加券** — 非譲渡・非換金の参加証明  
- **管理者 UI** — 教員・運営が参加数・参加者を確認し、印刷用 QR を用意可能  
- **ブロックチェーンを裏側に** — 生徒はウォレットや Web3 の知識不要  

- **フェーズ**: PoC / v0（プロトタイプ）。本番運用は対象外。  
- **クラスタ**: 安全な検証のため **Devnet 固定**。  
- **目的**: 学校という実環境でエンドツーエンドの導線を検証し、審査担当がビルド・動作を再現できる形で成果を提出する。

---

## 課題

日本および世界で、公的支援やイベント参加には次のような問題があります。

- **遅い配付** — 申請から受給まで数週間〜数ヶ月  
- **高い事務コスト** — 小さな給付のうちにコストが吸われる  
- **不透明さ** — 誰が何を受け取ったか検証しづらい  
- **硬直した運用** — 紙と固定スケジュールに依存  

---

## 解決策: we-ne

we-ne は Solana 上で動作する **非保管型の支援・参加システム** です。

- **即時** — 参加や claim が数秒で完了。  
- **低コスト** — オンチェーン利用時は約 $0.001/件。  
- **透明** — claim はオンチェーンで検証可能（付与フロー）；参加データは管理者画面で確認可能（学校フロー）。  
- **モバイルファースト** — 生徒・受給者はスマホのみ；学校フローでは Web3 用語不要。

今回のグラントでは **第一ユースケース** として **学校イベントのデジタル参加券** を対象とします。生徒が QR をスキャン（またはリンクで遷移）し、イベント内容を確認して「参加」すると、非譲渡の参加記録が発行されます。教員は管理者 UI でリアルタイムの参加数・参加者一覧を確認できます。ブロックチェーンはこのフローではオプションであり、PoC はモック API とローカル保存でも動作し、将来的にオンチェーンやバックエンドへ拡張可能です。

---

## 本グラント（$3,000 初回）のスコープ

### 対象とする成果物

- **学校参加 PoC**  
  - 利用者: ホーム → イベント一覧 → スキャン（またはボタン）→ 確認 → 参加 → 完了。  
  - 管理者: イベント一覧（リアルタイム参加数）、イベント詳細（参加者一覧）、印刷用 QR レイアウト、ロール制御（viewer / operator / admin）。  
- **データ同期** — 利用者の「参加」が管理者画面に反映（同一アプリ内；バックエンド API は将来オプション）。  
- **再現可能なビルド** — リポジトリルートから `npm run build` および `npm run test`（または `scripts/build-all.sh`）；CI でコントラクトビルドとモバイル型チェックを実行。  
- **Devnet claim フロー（オプション）** — Android で Phantom 接続 → 署名 → 送信 → トークン受取まで devnet で技術検証。  
- **ドキュメント** — アーキテクチャ、開発ガイド、静的検証レポート、機能一覧（動作している点・していない点）。

### 対象外（本グラント）

- 本番向け認証・KYC。  
- 実際の現金給付や譲渡可能な資産。  
- 行政システムとの直接連携。  
- 本番レベルの Allowlist/Merkle や FairScale レピュテーション（計画あり、本グラントでは約束しない）。

### 成功基準

- 教員・運営が実際の運用（QR 印刷、集計確認、ロール分離）を回せる。  
- 生徒がウォレットや Web3 を意識せずに参加完了できる（学校モード）。  
- 第三者が README の手順で `npm run build` / `npm run test`（または同等）を再現できる。

---

## 現在動作している範囲

| 領域 | 状態 |
|------|------|
| **利用者（生徒）** | ホーム、イベント一覧、スキャン画面（ボタン→確認）、確認画面、「参加」→ モック API → 成功；参加・チケットはローカルに保存。 |
| **管理者** | イベント一覧（同期 rtCount）、イベント詳細（参加者一覧）、参加者ログ、印刷画面（ブラウザ印刷・CSS @media print）、ロール別 UI（viewer/operator/admin）。 |
| **同期** | 利用者の参加がローカル store に反映；管理者が同一 store を参照し、件数・一覧が一致。 |
| **コントラクト** | Grant 作成・入金・claim；二重 claim 防止（ClaimReceipt PDA）；Anchor テスト通過。 |
| **モバイル（Solana モード）** | Android で Phantom 接続→署名→送信→受取（devnet）。 |

モック・部分実装: QR はボタン操作（カメラスキャンは未実装）；管理者の「イベント作成」「CSV」等はプレースホルダー。詳細は [wene-mobile/docs/FEATURE_STATUS.md](./wene-mobile/docs/FEATURE_STATUS.md)。

---

## デモ

- **デモ動画**: [X (Twitter)](https://x.com/Shiki93278/status/2015659939356889450)  
- **学校フロー**: `/u` → `/u/scan` → `/u/confirm` → 参加 → `/u/success`。モック: evt-001（成功）、evt-002（既参加）、evt-003（再試行可能エラー）。  
- **管理者**: `/admin`（イベント一覧）、`/admin/events/[eventId]`（詳細・参加者）、`/admin/print/[eventId]`（印刷レイアウト）。

---

## クイックスタート

**前提**: Node.js v18 以上（v20 LTS 推奨）、npm。コントラクト: Rust、Solana CLI、Anchor。モバイル: Android SDK（例: API 36）、Java 17。詳細は [開発ガイド](./docs/DEVELOPMENT.md)。

```bash
git clone https://github.com/<owner>/we-ne.git
cd we-ne

# コントラクト + モバイル型チェック
npm run build

# コントラクトテスト
npm run test

# またはシェルスクリプト（ルート npm 不要）
./scripts/build-all.sh all
```

**モバイルアプリ（開発）**:

```bash
cd wene-mobile
npm run setup    # または: npm install --legacy-peer-deps && npm run doctor:fix && npx expo prebuild --clean
npm start
```

**Android APK**: `cd wene-mobile && npm run build:apk`  
**トラブルシューティング**: `cd wene-mobile && npm run doctor` または `npm run doctor:build-repair`

---

## リポジトリ構成

| パス | 説明 |
|------|------|
| `grant_program/` | Solana スマートコントラクト（Anchor）: grant、vault、claim、二重 claim 防止 |
| `wene-mobile/` | React Native (Expo): 利用者・管理者画面、Phantom 連携、学校フロー |
| `docs/` | アーキテクチャ、セキュリティ、開発ガイド、Phantom フロー、Devnet 設定 |
| `scripts/` | `build-all.sh`、`clean-install.sh` |
| `.github/workflows/ci.yml` | コントラクトビルド + モバイル install と TypeScript チェック |

---

## ドキュメント

| ドキュメント | 内容 |
|--------------|------|
| [アーキテクチャ](./docs/ARCHITECTURE.md) | システム構成、コンポーネント、データフロー |
| [開発ガイド](./docs/DEVELOPMENT.md) | 環境構築、ビルド、テスト、モバイル起動 |
| [機能一覧](./wene-mobile/docs/FEATURE_STATUS.md) | 動作している機能・していない機能・未実装（モバイル・管理者） |
| [静的検証レポート](./wene-mobile/docs/STATIC_VERIFICATION_REPORT.md) | 学校フローの型とルーティング |
| [セキュリティ](./docs/SECURITY.md) | 脅威モデル、脆弱性報告 |
| [Devnet 設定](./docs/DEVNET_SETUP.md) | Devnet claim フローの検証手順 |

---

## セキュリティとライセンス

- **監査**: 未実施。テスト・PoC 目的。  
- **モデル**: 非保管型（Phantom）；二重 claim はオンチェーンで防止（ClaimReceipt）。  
- **ライセンス**: [MIT](./LICENSE)。

---

## 連絡先

- **課題・要望**: [GitHub Issues](https://github.com/hk089660/-instant-grant-core/issues)  
- **議論**: [GitHub Discussions](https://github.com/hk089660/-instant-grant-core/discussions)  
- **脆弱性報告**: [SECURITY.md](./SECURITY.md)

---

[English README](./README.md)

<p align="center"><i>Solana 上の公共性を目的に開発</i></p>
