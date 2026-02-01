# セキュリティ・信頼性レビュー

非保管型・Phantom連携・PoC/v0・devnet固定を前提とした、監査前の改善提案とタスク一覧。

---

## 1) 重大度付きリスク一覧

### High

| ID | リスク | 対象 | 概要 |
|----|--------|------|------|
| H1 | 本番ログ漏洩 | wene-mobile | `phantom.ts` 等で `__DEV__` 外でも `console.log` が実行され、URL・パラメータ長が本番で漏洩する可能性 |
| H2 | devnet 設定のハードコード | wene-mobile | `devnetConfig.ts` の authority/mint がソースに直書き。漏洩時は同一 Grant の悪用リスク（devnet 限定だが監査・運用で指摘されやすい） |
| H3 | 監査未実施の明示不足 | ドキュメント | README/配布物に「監査未実施・自己責任」が十分でないと誤解を招く |

### Medium

| ID | リスク | 対象 | 概要 |
|----|--------|------|------|
| M1 | `create_grant` の `init_if_needed` | grant_program | 既存 Grant PDA が別理由で存在する稀なケースで挙動が直感と異なる可能性（現状は新規作成のみ想定で問題なし） |
| M2 | Merkle proof の最大深度未制限 | grant_program | `claim_grant_with_proof` の `proof: Vec<[u8; 32]>` が非常に長いと CU 不足で失敗。DoS 的には影響小だが上限を明示するとよい |
| M3 | RPC URL 固定の単一障害点 | wene-mobile | `cluster.ts` で `api.devnet.solana.com` のみ。落ちると全員影響。フェイルオーバーは PoC では必須ではないが記載があるとよい |
| M4 | Phantom リダイレクトのスキーム検証 | wene-mobile | ディープリンクの `wene://` が他アプリに奪われた場合の検証がアプリ側にない（OS の Intent に依存） |

### Low

| ID | リスク | 対象 | 概要 |
|----|--------|------|------|
| L1 | `expires_at` の 0 と過去値 | grant_program | `expires_at == 0` は無期限。過去の unix time を入れると即期限切れ。仕様として明示するとよい |
| L2 | エラーメッセージの詳細漏洩 | wene-mobile | `sendTx.ts` の `formatSendError` はユーザー向けだが、生の RPC エラーをそのまま返す経路が他にあると情報漏洩 |
| L3 | AsyncStorage の永続性 | wene-mobile | セッション・dappSecretKey はアプリ削除で消えるが、端末バックアップに含まれる可能性。ドキュメントで注意喚起するとよい |

---

## 2) 具体的な修正案（実装レベル）と該当ファイル

### H1: 本番ログ漏洩の防止

**対象**: `wene-mobile/src/utils/phantom.ts`, `wene-mobile/src/store/phantomStore.ts`

- **修正案**  
  - 機密・URL・パラメータを扱う `console.log` / `console.warn` を `if (typeof __DEV__ !== 'undefined' && __DEV__)` 内に移動、またはラッパー `devLog(...)` に集約する。  
  - 本番ビルドでは `devLog` を no-op にし、`phantom.ts` の「URL全文」「redirect_link raw」「stage=decrypt の keyLen」等を DEV のみに限定する。

**該当箇所（例）**  
- `phantom.ts`: 81–86 行目（connect URL）、263–273 行目（decrypt パラメータ）、384–388 行目（sign URL）  
- `phantomStore.ts`: 107 行目（`savePhantomConnectResult` の log）、133 行目（`loadPhantomConnectResult` の error）

### H2: devnet 設定のハードコード緩和

**対象**: `wene-mobile/src/solana/devnetConfig.ts`

- **修正案（短期）**  
  - 値はコードに持つが、`DEVNET_GRANT_CONFIG` を「環境変数またはビルド時定数で上書き可能」にし、README に「本番では環境/ビルドで差し替えること」と記載する。  
- **修正案（中期）**  
  - campaignId / QR から Grant 情報（authority, mint, grant_id）を取得する API を用意し、`txBuilders.ts` の `buildClaimTx` がその API を参照するようにする（ROADMAP の「API から取得」と整合）。

### H3: 監査未実施の明示

**対象**: `README.md`, `README.ja.md`, `docs/SECURITY.md`

- **修正案**  
  - README の「Project Status」直下に 1 行追加:  
    `This project has not undergone a formal security audit. Use at your own risk.`  
  - 日本語 README にも同趣旨を記載。  
  - `docs/SECURITY.md` の「Audit Status」表をそのまま維持し、「本番利用前に監査必須」を Recommendations で再度明記する。

### M2: Merkle proof の最大深度

**対象**: `grant_program/programs/grant_program/src/lib.rs`

- **修正案**  
  - `claim_grant_with_proof` の先頭で `require!(proof.len() <= 32, ErrorCode::InvalidProof);` を追加（32 は 2^32 リーフ相当の深さ。必要なら定数化）。  
  - `ErrorCode::InvalidProof` を追加。

### M3: RPC 単一障害点の記載

**対象**: `docs/SECURITY.md`, `wene-mobile/src/solana/cluster.ts`

- **修正案**  
  - SECURITY.md の「Recommendations for Production」に「RPC の冗長化・フェイルオーバー」を追記。  
  - `cluster.ts` のコメントに「現在は単一 RPC。本番では複数エンドポイントまたはプロキシの利用を推奨」と記載する（実装は P2 でよい）。

### M4: ディープリンクスキームの検証

**対象**: ディープリンクを受け取る画面（例: `app/phantom/[action].tsx` や同等）

- **修正案**  
  - 受け取った URL の scheme が `wene`（またはアプリで定義したスキーム）であることをチェックし、一致しない場合は無視する。  
  - 既存の `parsePhantomRedirect` の前に「scheme === 'wene'」を確認する処理を追加する。

### L1: expires_at の仕様明示

**対象**: `grant_program/programs/grant_program/src/lib.rs`

- **修正案**  
  - `create_grant` の doc コメントに「`expires_at`: 0 = 無期限。0 以外の場合は unix timestamp（その時点で受付終了）」と追記。  
  - 必要なら `require!(expires_at >= 0, ...)` を追加（現状 0 と正の値のみ想定なら明示で十分）。

---

## 3) テスト・検証観点の追加

### スマートコントラクト（grant_program）

| 観点 | 内容 | 実装場所・方法 |
|------|------|----------------|
| 単体（ロジック） | `require_claim_timing` の境界値（start_ts 直前・直後、expires_at 直前・直後、period_index 不一致） | Rust の単体テスト、または `tests/basic.ts` に期間・期限のケースを追加 |
| 単体（Merkle） | `verify_merkle_sorted` の正しい proof / 不正な proof / 空 proof | `lib.rs` に `#[cfg(test)]` モジュールを追加 |
| 統合 | 二重 claim 拒否（同一 period_index） | 既存 `basic.ts` で実施済み。allowlist 有効時の `claim_grant_with_proof` を追加 |
| 統合 | `set_paused` 後の claim 拒否 | `tests/basic.ts` に paused → claim が失敗するテストを追加 |
| セキュリティ | authority 以外の `fund_grant` / `set_paused` / `close_grant` 拒否 | `tests/basic.ts` で別キーペアから呼んでエラーになることを確認 |

### モバイルアプリ（wene-mobile）

| 観点 | 内容 | 実装場所・方法 |
|------|------|----------------|
| 単体 | `parsePhantomRedirect` / `handlePhantomConnectRedirect`: 不正 URL・欠損パラメータで null / ok:false になること | Jest で `phantom.ts` の該当関数をテスト |
| 単体 | `formatSendError` / `isBlockhashExpiredError`: 想定メッセージで日本語・判定が正しいこと | Jest で `sendTx.ts` をテスト |
| 統合 | buildClaimTx → sign → sendSignedTx の E2E（devnet または local validator） | 既存の手動確認に加え、Detox または E2E スクリプトで自動化（P2 でよい） |
| セキュリティ | 本番ビルドで Phantom URL・secret 関連がログに出ないこと | 本番ビルド後に grep / 実行で確認する手順を docs に記載 |

---

## 4) 監査前に必ず埋めるべき項目チェックリスト

- [ ] **コントラクト**  
  - [ ] 全 instruction の権限チェック（authority / signer）が正しいことをコードレビューで確認  
  - [ ] 算術は `checked_*` または `require!` でオーバーフローを防いでいる  
  - [ ] PDA seeds がドメイン分離されており、他プログラムと衝突しない  
  - [ ] Merkle のドメイン分離文字列（`we-ne:allowlist`）とソートペア仕様が IDL/ドキュメントと一致  
  - [ ] 依存クレート（blake3, constant_time_eq）のバージョンとパッチが追跡可能

- [ ] **モバイル**  
  - [ ] 秘密鍵・シード・セッション平文を保存・送信・ログ出力していない  
  - [ ] Phantom との通信（redirect / sign）が devnet 固定であることを本番ビルドで確認  
  - [ ] ディープリンク受け取り時に scheme 検証を実施している  
  - [ ] 本番ビルドで機密に関わる `console.*` が無効化されている

- [ ] **ドキュメント・運用**  
  - [ ] README に「監査未実施・自己責任」の記載がある  
  - [ ] SECURITY.md に脅威モデル・保管しないデータ・ログポリシーが書かれている  
  - [ ] 依存関係の監査状況（npm audit / cargo audit）を記録し、既知の重大脆弱性が残っていない

- [ ] **CI・再現性**  
  - [ ] CI で `anchor build` と `npx tsc --noEmit` が通る  
  - [ ] コントラクトのテストが localnet または devnet で実行可能で、手順が docs にある  

---

## 5) 実装優先度（P0/P1/P2）付きタスク一覧

### P0（監査前・最初の 2 PR で対応したいもの）

| タスク | 内容 | 主なファイル | 状態 |
|--------|------|--------------|------|
| P0-1 | 本番で Phantom/URL/パラメータをログに出さない（`__DEV__` でガードまたは devLog 化） | `wene-mobile/src/utils/phantom.ts`, `wene-mobile/src/store/phantomStore.ts`, `phantomDeeplinkListener.ts`, `devLog.ts` | ✅ 対応済 |
| P0-2 | README / README.ja に「監査未実施・自己責任」の 1 文を追加 | `README.md`, `README.ja.md` | ✅ 対応済 |
| P0-3 | SECURITY.md の「Recommendations」に監査必須・RPC 冗長化の記載を追加 | `docs/SECURITY.md` | ✅ 対応済 |

### P1（短期・2〜3 PR 目）

| タスク | 内容 | 主なファイル | 状態 |
|--------|------|--------------|------|
| P1-1 | Merkle proof の最大長チェック（例: 32）と `ErrorCode::InvalidProof` 追加 | `grant_program/programs/grant_program/src/lib.rs` | ✅ 対応済 |
| P1-2 | `set_paused` 後の claim 拒否の統合テスト追加 | `grant_program/tests/basic.ts` | ✅ 対応済 |
| P1-3 | Phantom リダイレクト受け取り時の scheme 検証（`wene`） | `phantom.ts`（`isAllowedPhantomRedirectUrl`）, `phantomDeeplinkListener.ts` | ✅ 対応済 |
| P1-4 | `phantom.ts` の `parsePhantomRedirect` / `handlePhantomConnectRedirect` の単体テスト（不正 URL・欠損パラメータ） | `wene-mobile/src/utils/__tests__/phantom.test.ts` | ✅ 対応済 |
| P1-5 | devnetConfig を環境変数で上書き可能にし、README に注意書き | `wene-mobile/src/solana/devnetConfig.ts`, `wene-mobile/README.md` | ✅ 対応済 |

### P2（中期・監査準備・本番化の直前）

| タスク | 内容 | 主なファイル |
|--------|------|--------------|
| P2-1 | `require_claim_timing` 境界値の単体テスト（Rust） | `grant_program/programs/grant_program/src/lib.rs` の `#[cfg(test)]` |
| P2-2 | `verify_merkle_sorted` の単体テスト | 同上 |
| P2-3 | RPC フェイルオーバーまたは複数エンドポイントの検討・ドキュメント化 | `docs/SECURITY.md`, `wene-mobile/src/solana/cluster.ts` |
| P2-4 | `create_grant` の `expires_at` 仕様を doc コメントで明示 | `grant_program/programs/grant_program/src/lib.rs` |
| P2-5 | 本番ビルド後のログ漏洩チェック手順を DEVELOPMENT.md または SECURITY.md に追記 | `docs/DEVELOPMENT.md` または `docs/SECURITY.md` |

---

## 参照

- 脅威モデル・保管データ・ログポリシー: [docs/SECURITY.md](./SECURITY.md)  
- ロードマップ・監査計画: [docs/ROADMAP.md](./ROADMAP.md)  
- 開発・ビルド手順: [docs/DEVELOPMENT.md](./DEVELOPMENT.md)
