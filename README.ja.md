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

### 最近の更新（School参加フロー刷新）

School参加フローのロジック・型・エラー処理を整理し、差し替えしやすい構造にしました。

- **API層の抽象化**: `SchoolClaimClient` / `SchoolEventProvider` インターフェースで mock と本番実装を分離。`fetch` 版への差し替えが容易。
- **Hook によるUI/ロジック分離**: `useSchoolClaim` で idle/loading/success/already/error を一元管理。画面は状態と `handleClaim` に依存するだけ。
- **エラー表現の統一**: `SchoolClaimResult`（Success | Failure）、`SchoolClaimErrorCode`（retryable / invalid_input / not_found）でロジック側の判定が明確。`errorInfo` / `isRetryable` により再試行可能なエラーを判別可能。
- **eventId の一元化**: `parseEventId` / `useEventIdFromParams` でクエリ・ルートからの取得・検証を集約。無効時は `/u` へ自動リダイレクト。
- **ルーティングの統一**: `schoolRoutes` 定数で home/events/scan/confirm/success/schoolClaim を一貫して利用。
- **already の扱い統一**: 既参加（`alreadyJoined`）でも success 画面へ遷移し、体験を一貫。
- **再試行導線**: retryable エラー時にボタン文言を「再試行」に変更。

→ 詳細は [School参加フロー（アーキテクチャ）](#school参加フローアーキテクチャ) および [wene-mobile/docs/STATIC_VERIFICATION_REPORT.md](./wene-mobile/docs/STATIC_VERIFICATION_REPORT.md)

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

### School参加フロー（アーキテクチャ）

**動線**

1. ホーム → 「参加を開始」→ 参加券一覧（`/u`）
2. 「参加する」→ スキャン（`/u/scan`）
3. 「読み取り開始」→ 確認（`/u/confirm?eventId=evt-001`）
4. 「参加する」→ 参加 API → 成功（`/u/success?eventId=evt-001`）
5. 「完了」→ 一覧へ戻る

**主要な概念**

| 概念 | 説明 |
|------|------|
| `SchoolClaimClient` | 参加申請を送信する API クライアントのインターフェース。mock から fetch 版へ差し替え可能 |
| `useSchoolClaim` | 参加ロジックをカプセル化した Hook。`status`（idle/loading/success/already/error）、`handleClaim`、`onSuccess` を提供 |
| `SchoolClaimResult` | 成功時 `{ success: true, eventName, alreadyJoined? }`、失敗時 `{ success: false, error: { code, message } }` の discriminated union |
| `useEventIdFromParams` | クエリ/ルートから `eventId` を取得・検証。`redirectOnInvalid: true` で無効時に `/u` へ replace |
| `schoolRoutes` | home/events/scan/confirm/success/schoolClaim のルート定数 |

**Mock ケース（テスト用）**

- evt-001: 成功
- evt-002: 既参加（`alreadyJoined`）→ success 画面へ遷移
- evt-003: リトライ可能エラー → 「再試行」で再 claim

**検証結果（静的）**

- TypeScript: `npx tsc --noEmit` ✅
- `useSchoolClaim` の状態遷移 ✅
- ルーティング整合（`eventId` は `useEventIdFromParams` に統一）✅
- 将来の fetch 版実装時: HTTP エラー → Result マッピング（404→not_found、5xx/network→retryable など）を明示すること

→ 詳細は [wene-mobile/docs/STATIC_VERIFICATION_REPORT.md](./wene-mobile/docs/STATIC_VERIFICATION_REPORT.md)、[開発ガイド](./docs/DEVELOPMENT.md)、[エミュレータ開発](./wene-mobile/docs/EMULATOR_DEVELOPMENT.md)

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

### 提供物（PoC）
Android 実機での devnet claim フロー。完了条件: Phantom 接続 → 署名 → 送信 → 受け取り表示まで完走し、devnet 固定であることを確認。検証: デモ動画と DEVNET_SETUP.md の手順。
リポジトリ一括ビルド/テスト。完了条件: npm run build と npm run test（または scripts/build-all.sh build/test）が所定環境で成功。検証: CI と DEVELOPMENT.md の手順。
School 参加 UI フロー（モック）。完了条件: /u → /u/scan → /u/confirm → /u/success の遷移と evt-001/002/003 の状態遷移が仕様通り。検証: STATIC_VERIFICATION_REPORT.md。
印刷用 QR とロール制御。完了条件: /admin/print/:eventId の印刷レイアウトと viewer/operator/admin の UI 制御が反映。検証: アプリ内表示と印刷プレビュー。

### 直近のマイルストーン（PoC）
Scan → Confirm → Success の簡潔化。完了条件: 参加導線を1本化し、ルートと画面構成が README と一致。検証: デモ動画更新と導線図の更新。
最小限の運営ダッシュボード（発行数・完了数）。完了条件: /admin にカウント表示を実装し、school API から取得できること。検証: wene-mobile/server の起動手順と短いデモ。
短いデモ動画。完了条件: 接続→スキャン→claim→受け取りまでの 1〜2 分動画を公開し README に記載。検証: README のリンク。

### 不正・資格管理（PoC）
実装済み: 同一期間の二重 claim 防止（ClaimReceipt PDA）。
未実装: Allowlist/Merkle、FairScale レピュテーション連携、強い本人性/資格確認。
School PoC では join-token を任意で使えるが、強い本人性ではなく、運用での配布管理を前提とする。

### 運用上の制約（QR/Phantom）
devnet 固定。RPC と deeplink は cluster=devnet を明示しないと Phantom でブロックされる。
Android では「Phantom → 外部ブラウザへ戻る」動作が不安定。主導線は Phantom in-app browser の browse deeplink と印刷 QR。
redirect-based connect は主導線にせず、/phantom-callback は手動復帰用。
/u/* は Safari(iOS)/Chrome(Android) 推奨。その他ブラウザは不安定な場合がある。

### 学校運用とデータ整合性（PoC）
管理画面のカウントは school API サーバの JSON 永続化データに基づく。改ざん耐性や監査証跡はない。
参加記録は PoC 範囲では暗号学的に署名/検証されない。
想定は「限定された学校イベントでの運用」と「QR 配布の管理・端末の役割分離」を前提とした管理である。

> **Solana 上の即時・透明な支援配布 — 日本の公的支援ニーズ向けプロトタイプ**

[![CI](https://github.com/hk089660/instant-grant-core/actions/workflows/ci.yml/badge.svg)](https://github.com/hk089660/instant-grant-core/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

[英語版 README](./README.md) | [アーキテクチャ](./docs/ARCHITECTURE.md) | [開発ガイド](./docs/DEVELOPMENT.md) | [静的検証レポート](./wene-mobile/docs/STATIC_VERIFICATION_REPORT.md) | [エミュレータ開発](./wene-mobile/docs/EMULATOR_DEVELOPMENT.md)

---

## 概要

we-ne は Solana 上で動作する非保管型の支援配布システムの PoC です。現在はプロトタイプ段階で、Phantom 連携と基本的な claim フローが動作しています。本 PoC は devnet 固定で、本番利用は想定していません。不正・資格管理は PoC で限定的で、オンチェーンの二重 claim 防止が中心です。FairScale 連携や許可リスト（Allowlist）は計画段階で未実装です。

コア: 期間ごとの SPL 付与、二重 claim 防止、モバイルウォレット連携（オンチェーンで検証可能）
構成: スマートコントラクト（grant_program/）、モバイルアプリ（wene-mobile/）、Phantom ディープリンク連携

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

## ローカル確認コマンド・今後の予定

**ローカルでの型・ビルド確認**

```bash
# ルートから
npm run build

# モバイルのみ（TypeScript）
cd wene-mobile && npx tsc --noEmit
```

**今後の予定**

- 外出先のため実行環境（Android Emulator / 実機 USB）での動作確認は後日実施
- 帰宅後に Pixel 8（USB デバッグ）で UI 最終確認を実施予定

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

## 統合残高一覧（クレジット・参加券・クーポン・SPLトークン）

アプリは、**クレジット・参加券・クーポン・SPLトークン**を同一の **BalanceItem** モデルに正規化した**単一の残高一覧**を表示する。発行主体（issuer）と利用可能性（例: 今日使える）を UI で明示し、利用者が**誰が発行した価値か**・**いつ使えるか**を把握できる設計である。

### 一覧に表示される要素

- **デモ支援クレジット**（オフチェーン）
- **コミュニティ・イベント参加券**（オフチェーン）
- **加盟店クーポン**（オフチェーン）
- **接続ウォレットの SPL トークン**（オンチェーン、Devnet）

### 設計思想

この UI の目的は、ブロックチェーン資産を「特別なもの」として見せることではなく、**日常の使える残高の一部として当たり前に溶け込ませること**である。利用者には「オンチェーン / オフチェーン」は見えず、「使える残高が並んでいる」だけに見える。Web3 を生活 UI に統合し、**発行者（issuer）によって価値の意味が変わる**構造を表現している。

> この UI の目的は、ブロックチェーン資産を露出させることではなく、日常で使える残高の一部として当たり前にすることである。

### UX ルール（挙動）

- 期限（expiresAt）がある残高を優先して上に表示する
- 期限が近いものほど上に表示する
- **「今日使える」**バッジで即時利用可能であることを示す
- SPL トークン残高はウォレット接続後にのみ一覧にマージする
- Devnet フォールバックにより、接続時は少なくとも 1 行の SPL 行が常に表示される（fail-soft・デモ向け）

### Devnet / デモに関する注意

- SPL トークン残高は **Devnet** から取得している
- 特定の mint が利用できない場合（例: Devnet に未デプロイ）、アプリはウォレット内の**任意の正の SPL 残高**に**安全にフォールバック**する
- この **fail-soft**・**デモ向け**の挙動により、審査時も空白やエラー状態にならず、安定してデモできる

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

*統合残高一覧（クレジット・参加券・SPL）は受け取り画面の付与カード下に表示される。スクリーンショットはプレースホルダー。*

---

## クイックスタート

### 前提環境

- Node.js v18 以上（推奨 v20）
- コントラクト: Rust, Solana CLI v1.18+, Anchor v0.30+
- モバイル: Android SDK (API 36), Java 17

### 一括ビルド（ルートから）

```bash
git clone https://github.com/hk089660/instant-grant-core.git
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

- **課題・要望**: [GitHub Issues](https://github.com/hk089660/instant-grant-core/issues)
- **議論**: [GitHub Discussions](https://github.com/hk089660/instant-grant-core/discussions)
- **脆弱性の報告**: [SECURITY.md](./SECURITY.md)

---

[English README](./README.md)

<p align="center"><i>Solana 上の公共性を目的に開発</i></p>
