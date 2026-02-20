# Asuka Network Core (Prototype)
> **Proof of Process (PoP) に基づく、日本発の監査可能な公共ブロックチェーン・プロトコル**

[![Solana](https://img.shields.io/badge/Solana-Mainnet-green?style=flat&logo=solana)]
[![Edge](https://img.shields.io/badge/Edge-Cloudflare_Workers-orange?style=flat&logo=cloudflare)]
[![License](https://img.shields.io/badge/License-MIT-blue)]
[![Status](https://img.shields.io/badge/Status-Mitou_Applied-red)]

## ⚡ デモを体験する (We-ne)
Asuka Network上で稼働する最初の行政・公共向けリファレンス実装「We-ne」は、今すぐブラウザから体験可能です。
インストール不要。エッジで動作する爆速の承認プロセスを確認してください。

[🚀 **Launch We-ne (Web App)**](https://instant-grant-core.pages.dev/)

[🚀 **Launch We-ne (Web admin App)**](https://instant-grant-core.pages.dev/admin/login)

---

## 📖 プロジェクト概要
**Asuka Network** は、行政手続きや助成金給付における「プロセスの不透明性（Process Opacity）」を解決するために設計された、次世代の公共インフラ・プロトコルです。

既存のパブリックチェーンは「結果（残高の移動）」の整合性は保証しますが、「過程（どのような手続きを経てそのトランザクションが生成されたか）」はブラックボックスでした。
本プロジェクトでは、Web2的なAPIログを不可逆なハッシュチェーンとして刻み、それをオンチェーンの決済と数学的に結合させる **「Proof of Process (PoP)」** という新たなコンセンサス概念を提唱・実装します。

## 🏗 アーキテクチャ：三位一体の信頼基盤
本リポジトリは、以下の3層構造（Trinity Architecture）によって「責任の所在」をコードで定義します。



```mermaid
graph TD
    User["User / Mobile"] -- "1. Signed Request (NaCl)" --> Layer2
    subgraph "Layer 2: The Time (Process)"
    Layer2["API Worker / Cloudflare"] -- "2. Append to Hash Chain" --> AuditLog["Audit Hash Chain"]
    end
    subgraph "Layer 1: The Vault (Result)"
    Layer2 -- "3. Anchor Root Hash" --> Solana["Solana SVM / Rust"]
    Solana -- "4. Verify & Settle" --> PDA["PDA Vault"]
    end
```

### 1. Layer 1: The Vault (結果の保証)
* **技術スタック:** Rust, Anchor Framework (Solana SVM)
* **役割:** 価値の保存と決済のファイナリティ。
* **革新点:** **PDA (Program Derived Address)** の決定論的なシード生成を用い、データベースに依存することなく、物理法則レベルで「二重給付（Double-Spending）」を防止します。
* [📂 View Contract Code](./grant_program)

### 2. Layer 2: The Time (過程の証明)
* **技術スタック:** TypeScript, Cloudflare Workers (Edge Computing)
* **役割:** 時間とプロセスの監査人。
* **革新点:** 全てのリクエストに対し、直前のログハッシュを含む **Append-only Hash Chain** をリアルタイムに生成します。
    * これにより、たとえ管理者であっても、過去の履歴を1ビットたりとも改ざん・隠蔽することは数学的に不可能です。
* [📂 View API Code](./api-worker)

### 3. Layer 3: The Interface (意思の保護)
* **技術スタック:** React Native, React Native Web, NaCl
* **役割:** 市民のための主権的インターフェース。
* **革新点:** **NaCl (Curve25519)** を用いたエンドツーエンド暗号化 (E2EE) により、ユーザーの署名（意思）がプロトコルに届くまで、中間者攻撃から完全に保護されます。検閲耐性を持つPWAとして展開されます。
* [📂 View Mobile Code](./wene-mobile)

## 🦁 哲学：Winnyのその先へ
かつてP2P技術は「管理者のいない自由」を目指しましたが、社会が求めていたのは「責任の所在が明確な信頼」でした。
Asuka Networkは、P2Pの自律分散思想を継承しつつ、**「Proof of Process」による完全な監査可能性（Auditability）** を実装することで、行政や公共サービスが安心して依存できる、国産のデジタル公共基盤を目指します。

## 🛠 ロードマップ (未踏期間中の目標)
- [x] **Phase 1: Genesis (完了)**
    - SVMコントラクト(Rust)とエッジハッシュチェーン(TS)の統合実装。
    - MVPアプリ「We-ne」のPWAデプロイ。
- [ ] **Phase 2: Gating (開発中)**
    - API層からの有効なPoP証明がないトランザクションを、L1コントラクト側で強制的に拒絶するロジックの実装。
- [ ] **Phase 3: Federation**
    - 自治体や公共機関がノードとして参加可能な、コンソーシアム・モデルへの拡張。

## 👨💻 Author
**Kira (hk089660)**
* 19歳。Asuka Network アーキテクト。
* *Driven by the legacy of Winny, powered by modern cryptography.*

---

# We-ne (instant-grant-core)

We-ne は、Solana 上で非保管型の支援配布と参加券運用を検証するための、オープンソースのプロトタイプ/評価キットです。receipt 記録を用いた第三者検証性と重複受取防止を重視しています。

> ステータス（2026年2月11日時点）: **PoC / devnet-first**。本番 mainnet 運用ではなく、再現性と審査向け検証を目的としています。

[English README](./README.md) | [Architecture](./docs/ARCHITECTURE.md) | [Devnet Setup](./docs/DEVNET_SETUP.md) | [Security](./docs/SECURITY.md)

## このプロトタイプが解決すること

- 非保管型配布: 受取者は自分のウォレットで署名し、アプリは秘密鍵を保持しない。
- 監査可能性: tx/receipt 記録は Solana Explorer で独立して検証できる。
- 重複受取防止: receipt ロジックで 1 回受取を強制し、学校フローでの再申請は二重支払いではなく \`already joined\` の運用完了扱いになる。

## 現在の PoC ステータス

- Devnet E2E claim フローが利用可能（wallet sign -> send -> Explorer 検証）。
- 学校イベント QR フローが利用可能（\`/admin\` -> 印刷 QR -> \`/u/scan\` -> \`/u/confirm\` -> \`/u/success\`）。
- Success 画面で tx signature + receipt pubkey + Explorer リンク（devnet）を確認できる。
- 再申請は \`already joined\` の運用完了として扱われ、二重支払いはしない。

## 最新のセキュリティ/監査更新（2026-02-20）

- 管理者専用の学校APIは Bearer 認証が必須になりました:
  - \`POST /v1/school/events\`
  - \`GET /v1/school/events/:eventId/claimants\`
- Master専用APIは、既定のプレースホルダーパスワード（\`change-this-in-dashboard\`）を拒否するようになりました。実値の \`ADMIN_PASSWORD\` 設定が必須です。
- API監査ログは、管理者/利用者/システムAPIを横断するグローバルチェーン（\`prev_hash\`）で連結しつつ、イベント単位の追跡（\`stream_prev_hash\`）も維持します。
- 管理者デモ導線は維持しつつ、UI直通バイパスは廃止しました:
  - デモボタンは \`EXPO_PUBLIC_ADMIN_DEMO_PASSWORD\` を使って API ログインを実行します。
  - \`/admin/*\` はセッションガードされ、未認証時は \`/admin/login\` にリダイレクトされます。
  - 管理者APIクライアントは常に \`Authorization\` を付与し、\`401\` ではセッションを破棄します。
- ローカル開発サーバーの CORS は、実運用に合わせて \`Authorization\` ヘッダーを許可しました。

### この更新で必要な設定

- Cloudflare Worker 変数（\`api-worker\`）:
  - \`ADMIN_PASSWORD\`: 必須（\`change-this-in-dashboard\` は不可）。
  - \`ADMIN_DEMO_PASSWORD\`: 任意（デモ管理者ログインを有効化する場合のみ）。
- アプリ環境変数（\`wene-mobile\`）:
  - \`EXPO_PUBLIC_ADMIN_DEMO_PASSWORD\`: デモログインボタンを使う場合のみ必須。

## 信頼レイヤー：FairScaleによる参加・受給資格ゲート

状態：予定

- FairScale は、濫用耐性（Sybil 圧力対策）のための信頼シグナルとして導入予定であり、見た目だけのラベルではない。
- 予定している資格ゲート適用点は、\`POST /v1/school/claims\` のクレーム受理前と、参加者識別トークンのサーバー側発行/検証前。
- 現在コードで強制している資格ゲートは、イベント状態の資格判定（\`published\` のみ）と、\`walletAddress\` / \`joinToken\` による重複主体判定（重複時は二重支払いではなく \`alreadyJoined\` を返す）。
- FairScale のランタイム統合は未実装で、マイルストーンは \`./docs/ROADMAP.md\`（\`FairScale Integration\`）に記載され、\`./docs/SECURITY.md\` でも planned として参照している。
- 濫用抑止の効果として、オンチェーン receipt 制御とオフチェーン資格ゲートを組み合わせることで、非保管型オンボーディングを維持しながら重複クレーム経路を減らせる。
- 現時点のレビュー検証は、\`cd wene-mobile && npm run test:server\` と \`cd api-worker && npm test\` を実行し、\`/v1/school/claims\` の \`eligibility\` / \`alreadyJoined\` 挙動を確認する。

Reviewer shortcut: \`./wene-mobile/server/routes/v1School.ts\`、\`./api-worker/src/claimLogic.ts\`、\`./docs/SECURITY.md\`、\`./docs/ROADMAP.md\` を確認してください。

Why it matters for Solana Foundation / Instagrant: 監査可能性を維持した permissionless onboarding と、より強い濫用耐性を両立するための要素です。

## カメラ/QRスキャン実装状況

状態：実装済み（PoC）

- 現在動作している点: 管理者の印刷画面（\`/admin/print/<eventId>\`）で \`/u/scan?eventId=<eventId>\` の QR を生成し、印刷/PDF出力できる。
- 現在動作している点: 利用者画面 \`/u/scan\` でカメラ権限ハンドリング付きの QR 読み取りを実装（in-app decode）。
- 現在動作している点: QR 文字列から \`eventId\` を抽出し、\`/u/confirm?eventId=...\` へ遷移できる。
- 現在動作している点: Web は \`@zxing/browser\` で読み取り（BarcodeDetector 非対応ブラウザでもフォールバック）。
- 現在の制限: スキャンのフォールバックは URL ベース（\`eventId\` が未指定の場合は \`evt-001\`）で、PoC デモ再現性を優先している。
- 現時点のレビュアーテスト: 現行の Demo 手順どおりに \`/u/scan -> /u/confirm -> /u/success\` と Explorer リンクを確認する。

Reviewer shortcut: \`./wene-mobile/src/screens/user/UserScanScreen.tsx\` と \`./wene-mobile/src/screens/admin/AdminPrintScreen.tsx\` を確認してください。

### ロードマップ（PoC完了まで）

- マイルストーン1（\`状態：完了\`）: \`/u/scan\` に実スキャン処理（QRデコード + 権限ハンドリング）を実装。
- マイルストーン2（\`状態：予定\`）: \`eventId\` 手入力フォールバック + 期限切れ/無効 QR メッセージを追加し、UI/API テストで固定する。

## 🔗 デプロイメントフロー（厳格な順序）
Asuka Networkの全システムを動作させるには、依存関係IDを満たすために、以下の順序でコンポーネントをデプロイする**必要**があります。

### Step 1: Layer 1 (Solana Program)
1. `grant_program/` に移動します。
2. ビルドし、Devnetへデプロイします。
3. 生成された `Program ID` を**コピー**します。

### Step 2: Layer 2 (API Worker)
1. `api-worker/` に移動します。
2. `wrangler.toml` に Step 1 の `Program ID` を貼り付けます。
3. Cloudflare Workersへデプロイします。
4. WorkerのURL（例: `https://api.your-name.workers.dev`）を**コピー**します。

### Step 3: Layer 3 (Mobile App)
1. `wene-mobile/` に移動します。
2. `.env.example` から `.env` を作成します。
3. `Worker URL` (Step 2由来) と `Program ID` (Step 1由来) を貼り付けます。
4. `npm install` を実行します（web3.jsのパッチが自動的に適用されます）。
5. アプリを起動します。

## クイックスタート（ローカル）

\`\`\`bash
cd wene-mobile
npm i
npm run dev:full
\`\`\`

起動後の確認先:

- 管理画面一覧: \`http://localhost:8081/admin\`
- 利用者スキャン導線: \`http://localhost:8081/u/scan?eventId=evt-001\`

## クイックスタート（Cloudflare Pages）

このモノレポの Cloudflare Pages 設定:

- Root directory: \`wene-mobile\`
- Build command: \`npm ci && npm run export:web\`
- Output directory: \`dist\`

\`export:web\` の必須条件:

- \`EXPO_PUBLIC_API_BASE_URL\`（または \`EXPO_PUBLIC_SCHOOL_API_BASE_URL\`）に Worker URL を設定する。
- 未設定の場合、\`scripts/gen-redirects.js\` が失敗する。proxy 用リダイレクトが生成されないと、\`/api/*\` と \`/v1/*\` が Pages に直接当たり \`405\` や HTML を返す場合がある。

コピペ用デプロイコマンド:

\`\`\`bash
cd wene-mobile
EXPO_PUBLIC_API_BASE_URL="https://<your-worker>.workers.dev" npm run export:web
npm run deploy:pages
npm run verify:pages
\`\`\`

## デモ / 再現手順（1ページ）

1. 管理者イベント一覧を開く: \`/admin\`
2. イベント詳細を開く: \`/admin/events/<eventId>\`（例: \`evt-001\`、state は \`published\` 推奨）。
3. 詳細画面の「印刷用PDF」から印刷画面へ遷移: \`/admin/print/<eventId>\`。
4. 印刷 QR のリンク先が \`/u/scan?eventId=<eventId>\` であることを確認。
5. 利用者側で QR URL を開く -> \`/u/confirm?eventId=<eventId>\` -> claim -> \`/u/success?eventId=<eventId>\`。
6. Success 画面で tx signature と receipt pubkey の Explorer リンクを確認:
- \`https://explorer.solana.com/tx/<signature>?cluster=devnet\`
- \`https://explorer.solana.com/address/<receiptPubkey>?cluster=devnet\`
7. 同じ QR で再度 claim: 期待挙動は \`already joined\` の運用完了扱い（重複支払いなし）。

## 検証コマンド

Pages 検証チェーン:

\`\`\`bash
cd wene-mobile
npm run export:web
npm run deploy:pages
npm run verify:pages
\`\`\`

\`verify:pages\` の確認項目:

- \`/admin\` の配信 bundle SHA256 がローカル \`dist\` と一致する。
- \`GET /v1/school/events\` が \`200\` かつ \`application/json\` を返す。
- \`POST /api/users/register\` が **\`405 Method Not Allowed\` ではない**。

手動スポットチェック:

\`\`\`bash
BASE="https://<your-pages-domain>"

curl -sS -D - "$BASE/v1/school/events" -o /tmp/wene_events.json | sed -n '1p;/content-type/p'
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \\
  -H 'Content-Type: application/json' \\
  -d '{}' \\
  "$BASE/api/users/register"
\`\`\`

## トラブルシューティング / 既知の挙動

- \`/v1/school/events\` が HTML を返す: \`_redirects\` proxy が未適用、または誤った成果物をデプロイしている。
- \`/_redirects\` を直接 fetch して 404: Pages では正常な場合がある。\`/v1\` が JSON か、\`/api\` が非 405 かで実行時挙動を確認する。
- ログイン/利用者状態はブラウザや端末ストレージに保持される想定。共用端末テストではプライベートブラウズ推奨。
- Web の \`/u/scan\` カメラスキャンは実装済み（PoC）だが、ブラウザ/端末の権限や互換性によって失敗する場合がある。デモ再現性を最大化するには、印刷 QR をスマホカメラ/QR リーダーで読み取り \`/u/scan?eventId=<eventId>\` を開くことを推奨する。

## 詳細ドキュメント

- School PoC guide: \`wene-mobile/README_SCHOOL.md\`
- Cloudflare Pages deployment notes: \`CLOUDFLARE_PAGES.md\`
- Worker API details: \`README.md\`
- Devnet setup: \`DEVNET_SETUP.md\`

## 審査員向けコンテキスト

このリポジトリは助成金/PoC審査用の **再現・評価キット** です。機能のマーケティングよりも、**再現性** と **独立検証**（特に Explorer 証跡）の確認を優先してください。
