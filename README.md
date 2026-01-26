# we-ne

**すぐ届き、すぐ使える給付を、日本で現実に機能させるための Solana 基盤**

we-ne（ウィネー）は、日本社会における「給付」「支援」「分配」を、  
**即時性・低コスト・透明性**を重視して実行するためのオンチェーン基盤です。

本リポジトリは、既存の `solana-grant-program` を中核に据え、  
**SPL トークンによる固定レート型・定期給付（サブスク型）**を実際に動かす  
最小実装（MVP）をまとめたものです。

---

## 思想 / Philosophy

日本では、支援が必要だと分かってから実際に届くまでに、  
多くの時間・事務処理・中間コストが発生します。

- 手続きが重く、緊急性に対応できない  
- 少額支援ほどコスト負けしやすい  
- 実行の透明性が低く、検証が難しい

we-ne は、これらを **技術によって単純化する** ことを目指します。

> **支援は、思い立った瞬間に作れ、**  
> **条件を満たした人に、即座に届き、**  
> **その実行は誰でも検証できるべきである**

本プロジェクトは、投機や金融商品を目的としたものではありません。  
**生活支援・地域活動・実証実験**など、日本での現実的な利用を主眼に置いています。

---

## なぜ Solana なのか

給付や支援において最も重要なのは、  
**「届くまでの速さ」と「実際に使える距離」**です。

Solana は、この思想と非常に相性の良い特性を持っています。

- **高速な確定性**："申請中" ではなく "今、届いた" 体験を作れる  
- **低い手数料**：少額・高頻度の給付が成立する  
- **オンチェーン実行**：誰が・いつ・どの条件で配布されたかを検証できる  
- **グローバル基盤**：日本の小規模ユースケースでも成立する柔軟性

we-ne は、**給付を金融ではなく生活インフラとして扱う**ために Solana を採用しています。

---

## 現在できていること（MVP）

現在の we-ne は、以下の仕様で **実際に動作する MVP** になっています。

### スマートコントラクト（grant_program）

- SPL トークン限定の給付プログラム  
- 固定レート方式（例：1 トークン = 1 円相当として運用）  
- 定期給付（1 期間につき 1 回のみ受給可能）  
- 二重受給防止（period index + ClaimReceipt PDA）  
- 入金・受給・停止まで一通り実装済み

```text
Create Grant → Fund Grant → Periodic Claim → Pause / Resume
```

Anchor による `build / test` は通過済みです。

### モバイルアプリ（wene-mobile）

- React Native（Expo + TypeScript）による受給者向けUI
- Solanaウォレット連携（Phantom Wallet対応）
- 給付プログラムへの接続と受給機能
- Deep Link対応（`wene://r/<campaignId>` および `https://wene.app/r/<campaignId>`）
- iOS / Android 両対応

モバイルアプリの詳細は [`wene-mobile/README.md`](./wene-mobile/README.md) を参照してください。

---

## 定期給付（期間ベース）の考え方

we-ne は、月次給付に限らず、**日次・週次・月次といった定期的な給付**を  
同一の仕組みで扱えるように設計されています。

給付の頻度は、Grant 作成時に設定する `period_seconds` によって決まります。  
これは「給付を何日・何週間・何か月ごとに行うか」を秒単位で指定する方式です。

例：
- 日次給付：`period_seconds = 86,400`  
- 週次給付：`period_seconds = 604,800`  
- 月次給付（暫定）：`period_seconds = 2,592,000`

各期間ごとに `period_index` が計算され、  
`(grant, claimer, period_index)` をキーとした ClaimReceipt により、  
**同一期間内での二重受給が防止**されます。

この仕組みにより、we-ne は以下を実現します。

- 給付頻度を用途に応じて柔軟に変更できる  
- 実装を増やさずに日次・週次・月次へ拡張できる  
- 定期給付を「時間ベースのルール」として明確に説明できる

we-ne は、給付を特定の周期に縛るのではなく、  
**時間によって区切られた繰り返し給付のエンジン**として設計されています。

---

## 条件付き給付（Allowlist）の考え方

we-ne は、定期給付に **条件を組み合わせること** を前提に設計されています。

条件付き給付では、「誰が受け取れるか」を複雑なロジックで判定するのではなく、  
**事前に定義された対象リスト（Allowlist）** に基づいて制御します。

Allowlist は Merkle Tree を用いて Grant に紐づけられる想定です。

- Grant 作成時に Allowlist の Merkle Root を登録  
- Claim 時に、受給者が自分が対象であることを証明  
- 条件を満たさない場合は受給不可

この方式により、we-ne は以下を実現します。

- KYC や個人情報を扱わずに条件付き給付を行える  
- 学校・地域・団体などの名簿ベース運用と相性が良い  
- 定期給付（日次・週次・月次）と自然に組み合わせられる

we-ne は、条件を複雑化するのではなく、  
**「誰が対象か」を明示することで成立する給付**を重視しています。

---

## Japan-Focused Use Cases

This section outlines realistic, near-term pilot scenarios where we-ne can be deployed in Japan. These use cases are written in English for Solana Foundation Japan reviewers and ecosystem stakeholders.

### The Problem with Existing Distribution Systems

Japan's current grant and benefit distribution relies on bank transfers and manual administrative workflows, which creates structural friction:

- **Business-hour constraints**: Bank transfers do not settle on weekends, holidays, or outside daily cut-off times. Urgent disbursements are delayed by days.
- **Per-transaction fees**: Transferring small amounts (under 10,000 JPY) costs 200-400 JPY per transaction, making frequent micro-grants economically unviable.
- **Processing bottlenecks**: Each disbursement requires human verification, causing backlogs during high-volume periods such as disaster response.
- **Limited auditability**: Recipients cannot independently verify disbursement conditions or timing without requesting internal records.

### Target Use Cases

**Municipal Emergency and Livelihood Support**  
City and ward offices distribute emergency benefits or livelihood assistance. With we-ne, a municipality defines eligibility via allowlist, funds a grant vault, and residents claim directly from a mobile wallet—bypassing days-long bank batch processing.

**Scholarship and Educational Support Credits**  
Schools, PTAs, and foundations provide grants for supplies, meals, or activities. We-ne enables fixed-value credits that students or guardians claim on demand, with every disbursement recorded on-chain for transparent accounting.

**Rapid Disaster Relief Distribution**  
After earthquakes or typhoons, affected households wait weeks for relief due to verification queues. We-ne allows pre-registered resident lists to receive support immediately once a grant is activated.

**Regional NPOs and Mutual-Aid Groups**  
Small community organizations distribute modest funds to members. Conventional bank fees erode small transfers. Solana's near-zero costs make weekly or daily micro-disbursements sustainable.

### Additional Pilot Scenarios

- **Local consumption incentives**: Municipalities issuing regional spending credits to registered residents
- **After-school program subsidies**: Governments funding youth activity participation through claimable credits
- **Volunteer stipends**: Per-session payments to registered volunteers without invoicing overhead
- **Senior welfare disbursements**: Periodic small grants where the claim action serves as a lightweight activity signal

### Why Solana Fits

| Requirement | Solana Capability |
|-------------|-------------------|
| Immediate settlement | Sub-second finality; recipients see funds instantly |
| Cost-effective micro-grants | Transaction fees under 0.01 USD |
| Mobile-first access | Claim via smartphone wallet; no bank account required |
| Transparent execution | All events verifiable on-chain without exposing personal data |

---

## 想定ユースケース（日本向け）

本セクションでは、we-ne が日本国内で短期〜中期に実証可能な具体的ユースケースを整理します。

### 既存の給付システムが抱える課題

日本の給付・支援金配布は、銀行振込と人手による事務処理に依存しており、構造的な制約があります。

- **営業時間の制約**：銀行振込は土日祝日・締め時間外に処理されず、緊急の給付でも数日の遅延が発生する
- **振込手数料の負担**：1万円未満の少額送金でも200〜400円の手数料がかかり、高頻度の少額給付は経済的に成立しにくい
- **処理のボトルネック**：各給付に人手の確認・承認が必要なため、災害対応など高負荷時に処理が滞留する
- **透明性の限界**：受給者や外部監査者が、給付条件やタイミングを独自に検証する手段がない

### 主要ユースケース

**自治体による緊急支援・生活支援給付**  
市区町村が緊急給付金や生活支援を配布する場面。we-ne を使えば、自治体が対象者リスト（Allowlist）で受給資格を定義し、住民がモバイルウォレットから直接受け取れる。銀行のバッチ処理による数日の遅延を回避できる。

**学校・教育機関での奨学金・学習支援クレジット**  
学校、PTA、教育財団が学用品・給食費・課外活動費の補助を行う場面。we-ne により、生徒や保護者が必要なタイミングで固定額クレジットを受け取れる。すべての給付がオンチェーンに記録され、手作業の会計処理なしに透明な監査が可能。

**災害発生時の迅速な給付**  
地震・台風・水害の発生後、被災世帯は確認作業の滞留により数週間待たされることがある。we-ne では、事前登録された住民リストに対し、給付が有効化された瞬間に即座に支援を届けられる。

**地域NPO・共助団体による支援金配布**  
地域の小規模団体やNPOが、会員や受益者に少額の支援金を配布する場面。従来の銀行振込手数料が少額送金を圧迫するが、Solanaの極めて低い手数料により、週次・日次の少額給付が持続可能になる。

### その他のパイロットシナリオ

- **地域消費促進クレジット**：自治体が登録住民に地域限定の消費ポイントを配布
- **放課後活動助成**：自治体が青少年の課外活動参加費を保護者へ直接給付
- **ボランティア活動手当**：登録ボランティアへの1回あたりの謝礼を請求書なしで配布
- **高齢者見守り給付**：定期的な少額給付で、受給アクション自体を安否確認シグナルとして活用

### Solana を採用する理由

| 要件 | Solana の特性 |
|------|---------------|
| 即時着金 | サブ秒の確定性により、受給者は即座に資金を確認できる |
| 少額給付の経済性 | 0.01 USD未満の手数料で、高頻度の少額給付が成立する |
| モバイルファースト | スマートフォンのウォレットアプリから受給可能。銀行口座不要 |
| 透明な実行記録 | 個人情報を公開せず、すべての給付イベントをオンチェーンで検証可能 |

---

## リポジトリ構成

```text
we-ne/
├─ README.md
├─ grant_program/          # Solana スマートコントラクト（Anchor）
│  ├─ Anchor.toml
│  ├─ programs/
│  │  └─ grant_program/
│  │     └─ src/
│  │        └─ lib.rs     # Grant / Claim / Allowlist / Receipt の中核実装
│  └─ tests/              # Anchor tests
└─ wene-mobile/           # モバイルアプリ（React Native + Expo）
   ├─ app/                # Expo Router による画面定義
   ├─ src/                # アプリケーションロジック
   │  ├─ solana/          # Solana クライアント実装
   │  ├─ screens/         # 画面コンポーネント
   │  └─ wallet/          # ウォレットアダプター
   └─ android/            # Android ネイティブプロジェクト
   └─ ios/                # iOS ネイティブプロジェクト
```

---

## 開発環境

### スマートコントラクト（grant_program）

- Rust  
- Solana CLI  
- Anchor  
- anchor-lang / anchor-spl

#### ビルド
```bash
cd grant_program
anchor build
```

#### テスト
```bash
cd grant_program
anchor test
```

### モバイルアプリ（wene-mobile）

- Node.js（推奨: v18以上）
- npm または yarn
- Expo CLI
- iOS開発: Xcode（macOSのみ）
- Android開発: Android Studio / Android SDK

#### セットアップ
```bash
cd wene-mobile
npm install
```

#### 開発サーバー起動
```bash
npm start
```

#### ビルド
```bash
# Android APK
npm run build:apk

# iOS Simulator
npm run build:ios
```

詳細な手順は [`wene-mobile/README.md`](./wene-mobile/README.md) を参照してください。

---

## セキュリティ・注意事項

- KYC / 本人確認は行いません（ウォレット単位）  
- スマートコントラクトの監査は未実施です  
- 本番運用を想定していません

**研究・検証目的でのみ利用してください。**

---

## Status

- Anchor build: ✅  
- Anchor test: ✅  
- SPL fixed-rate periodic grant (MVP): ✅
- Mobile app (React Native + Expo): ✅
- Wallet integration (Phantom): ✅
- Deep Link support: ✅

---

## コンタクト

Issue / Discussion を通じたフィードバックを歓迎します.