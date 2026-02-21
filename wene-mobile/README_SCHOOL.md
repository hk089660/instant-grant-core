# We-ne 参加券アプリ（学校向け / PoC）

イベント・行事に参加した記録を、QRコードを読み取るだけで簡単に残せるアプリです。
学校PoCでは、**管理者が受付QRを印刷 → 利用者が読み取り → Success → Solana Explorerで検証（devnet）**までを再現できます。

* ネットワーク：**Solana devnet**
* 目的：**当日運用できる完成**（受付オペが迷わない／第三者が再現・検証できる）

---

## 使い方（利用者）

1. アプリを開く
2. 「参加を開始」または「QRを読み取る」をタップ
3. 受付のQRコードを読み取る
4. イベント内容を確認して「参加する」をタップ
5. 「参加しました」「参加履歴に保存されました」と表示されたら完了

   * **すでに参加済み（already-claim）でも運用上は完了扱い**としてSuccess画面に到達します

---

## 参加履歴

「参加券」画面で、未完了・完了済みの参加券を確認できます。

---

# 審査員/第三者向け：再現手順（1ページ）

## 前提条件

* Node.js / npm
* Webで印刷を確認したいので **Web起動推奨**
* （任意）モバイルでclaimを実際にやる場合：

  * Phantom等のウォレット（署名が必要）
  * devnetのSOL（手数料用に少量）

---

## セットアップ

```bash
cd wene-mobile
npm i
```

---

## 起動（Web推奨）

```bash
cd wene-mobile
npm run web
```

---

## PoCデモ手順（60–90秒）

### 1) 管理者：印刷QR

1. 管理者画面を開く：`/admin`
2. 任意のイベントを選ぶ（**state が published のもの**）
3. 印刷画面を開く：`/admin/print/[eventId]`
4. QRが**自動生成**されていることを確認し、印刷（またはPDF保存）

> QRの中身は参加用URL（`/u/scan?eventId=...`）です。
> QRが読み取れない時のために、印刷画面に **eventId文字表示**があることを確認してください。

### 2) 利用者：QR読み取り → confirm

1. 利用者側：`/u/scan` を開く（カメラ許可）
2. 印刷したQRを読み取る
3. `eventId` を取得して `confirm` に遷移：`/u/confirm?eventId=...`

### 3) 利用者：参加 → success

1. confirm画面で「参加する」を押す
2. successへ遷移：`/u/success?...`

### 4) Explorer検証（devnet）

Success画面に表示される以下を確認：

* tx signature（コピー可能）
* receipt pubkey（表示される場合）
* **Explorerリンク（devnet）**

  * tx: `https://explorer.solana.com/tx/<sig>?cluster=devnet`
  * receipt: `https://explorer.solana.com/address/<pubkey>?cluster=devnet`

---

## 確認ポイント（これが見えればPoC成功）

* `/admin/print/[eventId]` で **QRが表示され、印刷しても消えない**
* `/u/confirm → /u/success` まで到達できる
* Success画面に **tx / receipt / Explorerリンク**が出る
* Explorerで devnet の実データが確認できる
* 同じQRで2回目を試すと **already-claimでもsuccess扱い**で完了表示になる（運用上の詰まり防止）

---

## 失敗ケース（期待される挙動）

### already-claim（既参加）

* **再現**：同じQRで2回参加する
* **期待**：2回目もSuccessに到達し、「既に参加済み（運用上完了）」が表示される

### eligibility（対象外）

* **再現**：`state !== published` のイベントで参加を試す
* **期待**：「対象外」表示（受付に案内）

### invalid / not_found（無効なQR / イベント不明）

* **再現**：eventIdが存在しないURLを入力/読み取り
* **期待**：「無効なQR」「イベント不明」などの案内表示

### retryable（通信/一時障害）

* **再現**：一時的なネットワーク障害（通信遮断など）
* **期待**：「再試行」導線が表示される

### user_cancel（ユーザーキャンセル）

* **再現**：署名をキャンセル
* **期待**：エラーで詰まらず、自然に戻れる案内表示

---

## トラブルシューティング / 既知の挙動

* `/v1/school/events` が HTML を返す：`functions/[[path]].ts`（Pages Functions）がデプロイされていない、または誤った成果物がデプロイされている可能性があります。
* `/_redirects` を直接 fetch して 404：Pages では正常な場合があります（ファイルとして常に参照できるとは限りません）。実行時の挙動で確認してください（`/v1` が JSON、`/api` が `405 Method Not Allowed` ではないこと）。
* ログイン/ユーザー状態：ブラウザ/端末のストレージに保持される想定です。共有端末テストではプライベートブラウズを推奨します。
* Web の `/u/scan` カメラUI：実装済みです（権限確認 + in-app decode）。ただしブラウザ/端末依存で失敗する場合があるため、再現性を優先する場合は印刷QRをスマホ標準カメラ/QRリーダーで読み取り、`/u/scan?eventId=...` を開く手順を推奨します。

---

## 詳細ドキュメント

* School PoC guide: このドキュメント（`README_SCHOOL.md`）
* Cloudflare Pages deployment notes: `./docs/CLOUDFLARE_PAGES.md`
* Worker API details: `../api-worker/README.md`
* Devnet setup: `../docs/DEVNET_SETUP.md`

---

## 審査員向けコンテキスト

* このリポジトリは助成金/PoC審査用の再現キットです。
* 重要なのは機能のマーケティングではなく、再現性と独立検証です。
* 特に Explorer 証拠（devnet）の確認を優先してください。

---

## 配布（運用メモ）

* **Android**：APK配布（Play Store不要）
* **iOS**：TestFlight（予定）
* 学校当日は「印刷QR＋予備のeventId文字表示」があると事故が減ります

---

## お問い合わせ

担当の先生・管理者にご相談ください。
