# we-ne

### プロジェクト状況
本プロジェクトは現在、**Superteam Japan Grants の審査中**です。
現在は **PoC / v0 フェーズ**で、下記のデモ導線に範囲を絞っています。

### 最近の更新（安定性向上）

- 参加状態（started / completed）を保存し、利用者側の「未完了 / 完了」表示の正確性を向上
- 印刷運用に備え、CSS print（@media print）によるQR印刷レイアウトを追加
- viewer / operator / admin の権限によるUI制御を明確化し、学校端末での誤操作リスクを低減
- 開発・デモ効率向上のため、開発環境限定のロール切替UIを追加（本番非表示）

これらの更新は、**学校での実運用を想定した安定性と安全性の向上**を目的としています。

### 受け取り成功までの動作確認（2025年）

- **Android 実機（APK）**で Phantom 署名 → 送信 → **受け取り完了**まで一連のフローを動作確認済みです。
- モバイルでは Phantom のセキュリティ仕様により、**cluster（devnet）の明示が必須**です。
- RPC / トランザクション / deeplink のクラスタ不一致は Phantom によりブロックされます（「メインネットで有効な取引」等の警告）。
- 本 PoC では **devnet 固定**で動作させています（RPC・Phantom deeplinkともに `cluster=devnet` を明示）。

### 現在動作しているデモ導線
- イベントQRコードの読み取り
- イベント内容の確認
- デジタル参加券の発行（Claim）
- アプリ内で参加券を保持・確認可能

### 最初の目標ユースケース：学校イベント参加券
**We-ne** の最初の具体的なユースケースは、  
学校内イベントやボランティア活動向けの **デジタル参加券（参加証明）** です。

- 生徒が会場でQRコードを読み取る
- 即時にデジタル参加券が発行される
- 金銭的価値・換金性は持たない
- 氏名などの個人情報は外部に公開されない
- 運営側は参加人数や発行状況を管理画面で確認可能

このユースケースは、**速さ・使いやすさ・プライバシー**を最優先に設計されています。

### 配布方針（学校PoC向け）

- **生徒用：専用アプリ**
  - **Android**: APK 配布（EAS Build またはローカルビルドで APK を生成。Play Store 公開は行わない前提）。
  - **iOS**: TestFlight で配布（予定。EAS Build で IPA を生成し、App Store Connect へ提出）。
- **Web**: 管理者・補助用（`/admin/*` や印刷画面など）。**生徒の受け取り用途では使用しない**。生徒の参加フローはアプリで完結する想定です。
- 上記のとおり、生徒用は Web/PWA を主導線にせず Expo アプリを主導線とし、Phantom 連携の安定性を最優先しています。

### 直近のマイルストーン
- Scan → Confirm → Success の簡潔な参加フロー
- 最小限の運営ダッシュボード（発行数・完了数）
- デモ動画の作成・公開

> **Solana 上の即時・透明な支援配布 — 日本の公的支援ニーズ向けプロトタイプ**

[![CI](https://github.com/hk089660/-instant-grant-core/actions/workflows/ci.yml/badge.svg)](https://github.com/hk089660/-instant-grant-core/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

[英語版 README](./README.md) | [アーキテクチャ](./docs/ARCHITECTURE.md) | [開発ガイド](./docs/DEVELOPMENT.md)

---

## 概要

we-ne は Solana 上で動作する**非保管型の支援配布システム**のプロトタイプである。現時点では**プロトタイプ段階**にあり、Phantom 連携と基本的な claim フローが実装されている。本番利用は想定していない。

- **コア**: 期間ごとの SPL 付与、二重 claim 防止、モバイルウォレット連携（オンチェーンで検証可能）
- **構成**: スマートコントラクト（`grant_program/`）、モバイルアプリ（`wene-mobile/`）、Phantom ディープリンク連携

---

## 現在動作する範囲

- **コントラクト**: Grant 作成・Vault 入金・期間ごとの claim・同一期間の二重 claim 拒否
- **モバイル**: Phantom 接続、QR/ディープリンク（`wene://r/<campaignId>`）からの付与詳細表示、Claim 時の Phantom 署名とトークン受取
- **ビルド・テスト**: ルートからの `npm run build` / `npm run test`、および `scripts/build-all.sh` による一括ビルド・型チェック・Anchor テスト
- **devnet E2E**: Phantom(devnet) での claim フロー（simulate 通過 → 署名 → 送信）が動作。手順は [docs/DEVNET_SETUP.md](./docs/DEVNET_SETUP.md) を参照

---

## 現在の成功条件

**正常終了が期待されるコマンドと判断基準**

| コマンド | 成功とみなす状態 |
|----------|------------------|
| `npm run build` または `./scripts/build-all.sh build` | `grant_program` で `anchor build` が完了し、`wene-mobile` で `npm install` と `npx tsc --noEmit` がエラーなく終了する |
| `npm run test` または `./scripts/build-all.sh test` | `grant_program` の Anchor テスト（create_grant, fund_grant, claimer can claim once per period）がすべて成功する |
| `./scripts/build-all.sh all` | 上記ビルド・テスト・モバイル型チェックが一括で完了し、最後に「✅ Done.」が表示される |

**プロトタイプ段階で許容しているもの**

- 環境差（Node/OS/Anchor のバージョンなど）によるビルド・テストの失敗
- モバイルの `npm install` 時のピア依存警告（`legacy-peer-deps` で回避可能である旨は後述）
- CI の一時的な失敗（CI はベストエフォートであり、全環境での成功は保証しない）

---

## 既知の制限・未実装

- **監査**: 未実施。本番・金銭的リスクのある利用は想定していない
- **許可リスト（Allowlist）**: 未実装（Merkle 等による資格制限はロードマップに記載）
- **管理者 UI**: 未実装（Grant 作成・運用は現状 CLI 等を想定）
- **モバイル**: React/react-dom のピア依存により、環境によっては `npm install` でエラーになる。`wene-mobile/.npmrc` およびルート/CI では `--legacy-peer-deps` で対応済み

**QR・Web 検証時の注意（README 追記候補）**

- **Web 起動**: `wene-mobile` で `expo start --web` するには `react-dom` と `react-native-web` が必要。未導入の場合は `npx expo install react-dom react-native-web` を実行する。
- **QR は「URLに飛ばす」方式**: 今回のテストは「QRを読む」のではなく「QRからURLに遷移できるか」の確認。`/u/scan` 画面のカメラはモックのため、実機でカメラを使う場合は別途実装が必要。
- **HTTPS**: 実機でカメラ（getUserMedia）を使う場合、Safari では HTTPS が必須となることがある。ローカル開発では同一 Wi‑Fi の PC の IP（例: `http://192.168.x.x:8081/u/scan`）や Expo tunnel でスマホからアクセスして確認できる。
- **推奨ブラウザ**: QR から生徒 UI（/u/*）を開く際は Safari(iPhone)/Chrome(Android) を推奨。Firefox 等では Phantom 接続が不安定になる場合があります。
- **Android は Phantom 内ブラウザでの参加を推奨**: Android では「Phantom → 外部ブラウザへ戻れない」問題があるため、v0 では**生徒用QRの内容を Phantom browse deeplink**（`https://phantom.app/ul/browse/<url>?ref=<ref>`）にし、Phantom の in-app browser で開く導線を主としています。管理者印刷画面（`/admin/print/:eventId`）で表示される URL を QR コード化して印刷してください。
- **redirect-based connect**: 従来の「ブラウザで開く → Phantom で接続 → ブラウザへリダイレクト」は、環境によっては不安定なため v0 では主導線にしていません。手動復帰用に `/phantom-callback` リンクを用意しています。
- **生徒用は専用アプリ**: 学校PoC では生徒に iOS（TestFlight）または Android（APK）の専用アプリを配布し、Phantom 接続後にアプリへ確実に復帰する導線を主としています。Web は管理者・補助用です。

---

## 動作確認環境・CI

**README で想定している動作確認環境**

- コントラクト: Rust（stable）, Solana CLI 1.18 以上, Anchor 0.30 以上（0.31.x 推奨）
- モバイル: Node.js v18 以上（v20 推奨）, Android の場合は Android SDK (API 36), Java 17
- その他: [開発ガイド](./docs/DEVELOPMENT.md) を参照

**CI について**

- `.github/workflows/ci.yml` でプッシュ・プルリクエスト時に Anchor のビルド・テストとモバイルのインストール・TypeScript チェックを実行している
- CI は**ベストエフォート**であり、あらゆる環境でのビルド成功を保証するものではない
- 目的は、明らかな回帰や環境起因の問題の検出である

---

## we-ne とは

we-ne は Solana 上で動作する**非保管型の支援配布システム**であり、支援金を即時・透明に届けることを目的としている。

**要約**: 期間ごとの SPL 付与、二重 claim 防止、モバイルウォレット連携を備え、いずれもオンチェーンで検証可能。

---

## 課題と解決策

### 日本の文脈での課題

- 申請から受給まで数週間〜数ヶ月、事務コストが大きい、配分の透明性不足、スケジュールが硬直的

### 本プロジェクトの対応

- 即時決済、低コスト（約 $0.001/件）、オンチェーン検証、モバイルでの claim

→ 詳細は [アーキテクチャ](./docs/ARCHITECTURE.md)

---

## 動作の流れ

```
付与者 → Grant 作成 / Vault 入金 → SOLANA（Grant PDA, Token Vault）
受給者 → アプリ起動 → 期間チェック → Claim（Phantom 署名）→ トークン送金 → ウォレット
```

**主要コンポーネント**: スマートコントラクト（`grant_program/`）、モバイルアプリ（`wene-mobile/`）、Phantom 連携

---

## デモ

> 🎬 **デモ動画**: [X で見る](https://x.com/Shiki93278/status/2015659939356889450)

内容: アプリ起動・Phantom 接続 → QR/ディープリンク → 付与詳細表示 → Claim → Phantom 署名 → トークン受取

---

## クイックスタート

### 前提環境

- Node.js v18 以上（推奨 v20）
- コントラクト: Rust, Solana CLI v1.18+, Anchor v0.30+
- モバイル: Android SDK (API 36), Java 17

### 一括ビルド（ルートから）

```bash
git clone https://github.com/<owner>/we-ne.git
cd we-ne

# 方法A: npm
npm install   # ルートで npm スクリプトを使う場合のみ
npm run build
npm run test

# 方法B: シェル
chmod +x scripts/build-all.sh
./scripts/build-all.sh all
```

- モバイルでピア依存エラーが出る場合は、リポジトリ側で `wene-mobile/.npmrc` およびルート/CI の `--legacy-peer-deps` で対応済み。モバイル単体では `npm install --legacy-peer-deps` を使用する。

### モバイル開発

```bash
cd wene-mobile
npm run setup   # または npm install --legacy-peer-deps && npm run doctor:fix && npx expo prebuild --clean
npm start
```

### コントラクト

```bash
cd grant_program
anchor build
anchor test
```

### Android APK ビルド

```bash
cd wene-mobile
npm run build:apk
# 出力: android/app/build/outputs/apk/release/app-release.apk
```

### トラブルシューティング

`npm run doctor` / `npm run doctor:fix` で依存関係・Polyfill・Phantom 設定・Android SDK 等を確認・修正できる。

→ 詳細は [開発ガイド](./docs/DEVELOPMENT.md)

---

## リポジトリ構成

```
we-ne/
├── grant_program/     # Anchor プログラム
├── wene-mobile/       # React Native (Expo) アプリ
├── docs/              # アーキテクチャ、セキュリティ、開発ガイド、ロードマップ等
├── .github/workflows/ # CI
└── LICENSE, CONTRIBUTING.md, SECURITY.md
```

---

## セキュリティモデル

- 鍵は Phantom 側で保持（非保管型）
- セッショントークンは NaCl で暗号化してアプリサンドボックスに保存
- 二重 claim は ClaimReceipt PDA で防止
- **監査**: 未実施。テスト目的での利用を想定

→ [セキュリティ](./docs/SECURITY.md)

---

## ロードマップ

| フェーズ | 状態 | 内容 |
|-------|------|------|
| MVP | 完了 | 基本 claim フロー、Phantom 連携 |
| 許可リスト | 未実装 | Merkle による資格制限 |
| 管理ダッシュボード | 未実装 | Grant 作成・運用 UI |
| メインネットベータ | 未実装 | 監査・本番運用 |

→ [ロードマップ](./docs/ROADMAP.md)

---

## コントリビューション

[CONTRIBUTING.md](./CONTRIBUTING.md) を参照。テスト拡充、ドキュメント翻訳、セキュリティレビュー、UI/UX フィードバックを歓迎する。

---

## ライセンス

[MIT License](./LICENSE)

---

## 📋 変更内容（第三者ビルドまわり）

- ルートに `package.json` を追加（`npm run build` / `npm run test`、必要に応じて `build:contract` / `build:mobile` / `test:contract`）
- `scripts/build-all.sh` で一括ビルド・テスト・モバイル型チェックが可能
- CI: `.github/workflows/ci.yml` で Anchor ビルド・テストとモバイル install・`tsc --noEmit` を実行（ベストエフォート）
- モバイル: `wene-mobile/.npmrc` およびルート/CI で `--legacy-peer-deps` を利用
- 二重 claim 防止: `grant_program` の claim レシートを `init_if_needed` から `init` に変更し、同一期間の再 claim を拒否

---

## 連絡先

- **課題・要望**: [GitHub Issues](https://github.com/hk089660/-instant-grant-core/issues)
- **議論**: [GitHub Discussions](https://github.com/hk089660/-instant-grant-core/discussions)
- **脆弱性の報告**: [SECURITY.md](./SECURITY.md)
