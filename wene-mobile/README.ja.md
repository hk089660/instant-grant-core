# We-ne（we-ne）— Solana上の「非保管型・透明な支援配布」PoC

**We-ne** は、Solana上で動作する **非保管型（non-custodial）** の支援配布 / バウチャー配布の **PoC（v0）** です。
「支援があるのに、届くまでが遅い」「不正や二重受給を防ぎたい」「ただし個人情報は出したくない」——そういった **“公共支援っぽい”** ユースケースを想定して設計しています。

> ✅ 現在の状態：PoC / v0（レビュー用）
> ✅ クラスタ：**devnet固定**（安全のため）
> ⚠️ 本番運用は想定していません（監査未実施）

---

## One-liner

**SPLトークンの支援配布を、一定期間のクレーム（claim）として提供し、二重受給はオンチェーンのReceiptで防止。
受給者はPhantomで署名し、支給は数秒で完了。すべてオンチェーンで監査可能。**

---

## 何を作っているか（概要）

We-ne は以下を満たす「支援配布の基本プリミティブ」を提供します。

* **非保管型**：鍵は受給者のPhantomにあり、サーバが資産を預からない
* **透明性**：支給（claim）はオンチェーンで追跡可能
* **高速/低コスト**：Solanaの特性で、即時性と手数料の低さを活かす
* **二重受給の防止**：オンチェーンの `ClaimReceipt PDA` で **同一期間の重複claimを拒否**
* **運用の現実性**：学校/コミュニティの現場で回る「QR→参加→確認」動線をPoCとして実装

---

## PoCで今できること（デモフロー）

### ✅ School Participation Ticket（学校イベント参加チケット）

「参加証明（チケット）をその場で発行し、集計できる」ことを想定したデモです。

1. イベント会場で **QR** をスキャン
2. イベント詳細を確認
3. **Participate / Claim**
4. Phantomで署名 → 送信
5. 参加チケット（オンチェーンの記録＋受領）が作成される

> チケットは譲渡不能想定 / 金銭価値なしの参加証明PoC
> 個人情報（氏名・学籍番号など）を外部に露出しない運用を優先

---

## すでにある実装（PoCの現状）

* Solana devnet 上での **claimフロー**（Receipt発行による二重claim防止）
* 学校参加チケットの **エンドツーエンド動線**（QR→確認→claim→成功）
* **プログラムロジックとUI/クライアント**の分離（将来の差し替え/強化を前提）

---

## 最近のアップデート（安定性 / 運用性）

### Stability Improvements

* 参加状態の追跡（started / completed）で「未完了/完了」表示の精度を改善
* CSS print（`@media print`）による **印刷向けQRレイアウト**（現場でのバックアップ運用を想定）
* 共有端末向けの **ロール制限（viewer / operator / admin）**
* 開発用ロール切替（本番では非表示）

### School Participation Flow Refactor

* API層の抽象化：`SchoolClaimClient` / `SchoolEventProvider` で画面依存を分離しつつ、実行時は HTTP 実装を利用
* APIモードの固定化：`EXPO_PUBLIC_API_MODE` は `http` のみをサポートし、非対応値は警告のうえ `http` にフォールバック
* HookでUI/ロジック分離：`useSchoolClaim` が状態遷移（idle/loading/success/already/error）を集約
* エラー表現の統一：`SchoolClaimResult` / `SchoolClaimErrorCode` による分岐
* eventIdの一元化：`parseEventId` / `useEventIdFromParams`
* ルーティング統一：`schoolRoutes`（home/events/scan/confirm/success/schoolClaim）
* already時のUX統一：alreadyJoinedもsuccessに遷移して一貫性
* リトライ導線：retryableエラーは「Retry」表示

→ 詳細：`wene-mobile/docs/STATIC_VERIFICATION_REPORT.md`

---

## Phantom / QR運用に関する重要メモ（PoC）

### devnet固定

* Phantomはクラスタ整合性（devnet/testnet/mainnet）を厳密にチェックします
* deeplink / RPC は **devnetに明示的に合わせる必要**があります

### Androidの戻り不安定問題（PoCの設計判断）

Androidでは「Phantom → ブラウザに戻る」が不安定なケースがあるため、PoCでは以下を推奨しています。

* 学生の主要動線は **Phantom in-app browser** を想定
* `/admin/print/:eventId` で生成するURLをQRとして印刷し、**Phantom内で開く**運用を基本にする
* Redirect-based connect は主要動線にしない（`/phantom-callback` はリカバリ用）

推奨ブラウザ：Safari（iOS） / Chrome（Android）

---

## リポジトリ構成

```
we-ne/
├── grant_program/           # Solana smart contract (Anchor)
│   ├── programs/grant_program/src/lib.rs
│   └── tests/
│
├── wene-mobile/             # Mobile app (React Native + Expo)
│   ├── app/                 # Screens (Expo Router)
│   ├── src/solana/          # Blockchain client
│   ├── src/wallet/          # Phantom adapter
│   └── src/utils/phantom.ts
│
├── docs/                    # Documentation
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   ├── PHANTOM_FLOW.md
│   ├── DEVELOPMENT.md
│   └── ROADMAP.md
│
├── scripts/                 # build helper
├── .github/workflows/       # CI
└── ...
```

---

## クイックスタート（第三者が再現できることを重視）

### 前提

* Node.js v18+（推奨：v20 LTS）
* コントラクト：Rust / Solana CLI v1.18+ / Anchor v0.30+
* モバイル：Android SDK（API 36）/ Java 17

### ルートからのワンコマンド build/test

**Option A（npm）**

```bash
git clone https://github.com/hk089660/instant-grant-core.git
cd instant-grant-core

npm install
npm run build
npm run test
```

**Option B（script）**

```bash
chmod +x scripts/build-all.sh
./scripts/build-all.sh all
```

#### ローカル検証（型/ビルド）

```bash
npm run build
cd wene-mobile && npx tsc --noEmit
```

> **⚠️ 注意: Phantom接続のための設定**
> ローカル環境で開発を行う際、`app.config.ts` 内の `scheme` 設定をデフォルトの `wene-mobile` から独自の文字列（例: `my-solana-app`）に変更することを強く推奨します。
> これにより、インストール済みの本番アプリやデモ版とのDeepLink競合（アプリが正しく戻ってこない問題）を防げます。変更した場合、Phantomへの接続リクエストも自動的に新しいschemeを使用するよう実装されています。

---

## 成功条件（レビューで確認できること）

| Step  | Result                                          |
| ----- | ----------------------------------------------- |
| build | `anchor build` が通る / mobileの `tsc --noEmit` が通る |
| test  | Anchor tests が通る（例：期間内1回のみclaimできる）             |
| demo  | QR→確認→claim→成功 の動線が破綻しない                        |

---

## セキュリティモデル（PoC）

| Aspect         | Implementation                     |
| -------------- | ---------------------------------- |
| Key custody    | 非保管型（鍵はPhantom内）                   |
| Session tokens | NaCl boxで暗号化し、アプリサンドボックスに保存        |
| Double-claim   | `ClaimReceipt PDA` で期間内の二重claimを拒否 |
| Deep links     | 暗号化ペイロード / URL validation          |

⚠️ **監査未実施（NOT AUDITED）**：テスト用途のみ
→ 詳細：`docs/SECURITY.md`

---

## 今後のマイルストーン（PoC→パイロット準備）

* Eligibility gating / abuse resistance（しきい値/スコア/審査フックなど）
* テスト/CI/デプロイの強化、rate limitやanti-spam
* レビュー向け「評価キット」（再現スクリプト・デモガイド・デプロイノート）
* 小規模パイロット（コミュニティ/学校的環境）に向けた導入テンプレ/ドキュメント

---

## ライセンス / 貢献

* License：MIT
* Contributing：`CONTRIBUTING.md`
* Security：`SECURITY.md`

---

## 連絡先

* Issues：GitHub Issues
* Security：`SECURITY.md` に記載の手順に従ってください

---

Built for public-good style distribution on Solana.
