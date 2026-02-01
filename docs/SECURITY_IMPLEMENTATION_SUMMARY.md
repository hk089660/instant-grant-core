# セキュリティ・信頼性改善 実装サマリ（P0/P1）

SECURITY_REVIEW の P0/P1 に基づくコード変更の要約・ファイル一覧・テスト結果・残タスク。

---

## 1) 変更内容の要約

### P0: 本番ログ無効化（H1）

- **devLog 導入**: `wene-mobile/src/utils/devLog.ts` を追加。`__DEV__` が true のときのみ `console.log/warn/error` を実行し、本番では no-op。
- **phantom.ts**: URL・redirect_link・decrypt パラメータ・sign URL 等の `console.*` をすべて `devLog` / `devWarn` / `devError` に置き換え。
- **phantomStore.ts**: `savePhantomConnectResult` / `loadPhantomConnectResult` / `clearConnectResult` / `clearPhantomKeys` のログを `devLog` / `devError` に置き換え。
- **phantomDeeplinkListener.ts**: ディープリンク受信・connect/sign 成功/失敗・listener 登録のログを `devLog` / `devWarn` / `devError` に置き換え。
- **phantom-callback.tsx**: クエリ長の `console.log` を `__DEV__` でガード。

### P1: devnet 設定の環境変数化（H2）

- **devnetConfig.ts**: `EXPO_PUBLIC_WENE_DEVNET_AUTHORITY`, `EXPO_PUBLIC_WENE_DEVNET_MINT`, `EXPO_PUBLIC_WENE_DEVNET_GRANT_ID`, `EXPO_PUBLIC_WENE_DEVNET_START_TS`, `EXPO_PUBLIC_WENE_DEVNET_PERIOD_SECONDS` を読み、未設定時は従来の `_RAW` にフォールバック。
- **wene-mobile/README.md**: 「Devnet Grant Config」セクションを追加し、環境変数一覧と SECURITY_REVIEW への参照を記載。

### P1: Deep link scheme 検証（M4）

- **phantom.ts**: `isAllowedPhantomRedirectUrl(url)` を追加。`expo-linking` の `parse(url)` で scheme と hostname を取得し、`scheme === 'wene' && hostname === 'phantom'` の場合のみ true。
- **phantomDeeplinkListener.ts**: `processPhantomUrl` の先頭で `isAllowedPhantomRedirectUrl(url)` をチェックし、false の場合は早期 return。`getInitialURL` の処理でも同様に `isAllowedPhantomRedirectUrl` を使用。

### P1: Phantom redirect 系の単体テスト

- **wene-mobile**: Jest + ts-jest を追加し、`src/utils/__tests__/phantom.test.ts` を新規作成。
  - `parsePhantomRedirect`: data/nonce 欠損で null、両方あれば `{ data, nonce }`、parse 例外で null。
  - `isAllowedPhantomRedirectUrl`: wene/phantom で true、scheme 違いで false、hostname 違いで false、parse 例外で false。
  - `handlePhantomConnectRedirect`: 必須パラメータ欠損で ok:false (check_params)、errorCode ありで ok:false (error_response)、phantom_encryption_public_key 欠損で ok:false (check_params)。
- **モック**: `__mocks__/expo-linking.ts`, `react-native.ts`, `phantomSignTxPending.ts`, `phantomUrlDebug.ts`, `openPhantom.ts`, `devLog.ts` を追加（Jest 用）。

### P1: Merkle proof 長さ制限（M2）

- **grant_program/programs/grant_program/src/lib.rs**: `claim_grant_with_proof` の先頭で `const MAX_MERKLE_PROOF_DEPTH: usize = 32` を定義し、`require!(proof.len() <= MAX_MERKLE_PROOF_DEPTH, ErrorCode::InvalidProof)` を追加。`ErrorCode::InvalidProof` を定義。

### P1: paused / 権限まわりの統合テスト

- **grant_program/tests/basic.ts**:
  - 「claim_grant fails when grant is paused」: create_grant → set_paused(true) → claim_grant が失敗することを assert。
  - 「set_paused rejects when signer is not grant authority」: authority A で create_grant 後、別キーペア B で set_paused(true) を呼ぶと失敗することを assert。

---

## 2) 変更ファイル一覧

| ファイル | 種別 |
|----------|------|
| `wene-mobile/src/utils/devLog.ts` | 新規 |
| `wene-mobile/src/utils/phantom.ts` | 修正 |
| `wene-mobile/src/store/phantomStore.ts` | 修正 |
| `wene-mobile/src/utils/phantomDeeplinkListener.ts` | 修正 |
| `wene-mobile/app/phantom-callback.tsx` | 修正 |
| `wene-mobile/src/solana/devnetConfig.ts` | 修正 |
| `wene-mobile/README.md` | 修正 |
| `wene-mobile/jest.config.js` | 新規 |
| `wene-mobile/package.json` | 修正（test スクリプト、jest / ts-jest / @types/jest） |
| `wene-mobile/src/utils/__tests__/phantom.test.ts` | 新規 |
| `wene-mobile/src/utils/__mocks__/expo-linking.ts` | 新規 |
| `wene-mobile/src/utils/__mocks__/react-native.ts` | 新規 |
| `wene-mobile/src/utils/__mocks__/phantomSignTxPending.ts` | 新規 |
| `wene-mobile/src/utils/__mocks__/phantomUrlDebug.ts` | 新規 |
| `wene-mobile/src/utils/__mocks__/openPhantom.ts` | 新規 |
| `wene-mobile/src/utils/__mocks__/devLog.ts` | 新規 |
| `grant_program/programs/grant_program/src/lib.rs` | 修正 |
| `grant_program/tests/basic.ts` | 修正 |
| `docs/SECURITY_REVIEW.md` | 修正（P0/P1 タスクの状態欄追加） |
| `docs/SECURITY_IMPLEMENTATION_SUMMARY.md` | 新規（本ファイル） |

---

## 3) テスト結果

### wene-mobile 単体テスト

```bash
cd wene-mobile && npm test
```

- **結果**: 10 tests passed（parsePhantomRedirect 3、isAllowedPhantomRedirectUrl 4、handlePhantomConnectRedirect 3）
- **実行コマンド**: `npm test`（内部で `jest --passWithNoTests`）

### wene-mobile 型チェック

```bash
cd wene-mobile && npx tsc --noEmit
```

- **結果**: エラーなし

### grant_program ビルド

```bash
cd grant_program && anchor build
```

- **結果**: 成功（Merkle 制限・InvalidProof 追加後もビルド成功）

### grant_program 統合テスト

```bash
cd grant_program && yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/basic.ts
```

- **前提**: `ANCHOR_PROVIDER_URL`（および必要に応じて `ANCHOR_WALLET`）を設定したうえで実行。未設定の場合は「ANCHOR_PROVIDER_URL is not defined」で失敗する（想定どおり）。
- **実行例**（localnet または devnet 利用時）:  
  `anchor test` または上記コマンドで、create_grant / fund_grant / claim once per period / **claim fails when paused** / **set_paused rejects non-authority** が通ることを確認。

---

## 4) PR 単位の整理

| PR | 内容 | SECURITY_REVIEW |
|----|------|-----------------|
| **PR1** | P0: 本番ログ無効化（devLog、phantom / phantomStore / deeplink / phantom-callback） | H1 |
| **PR2** | P1: devnetConfig 環境変数化 + README 記載 | H2 |
| **PR3** | P1: Deep link scheme 検証（isAllowedPhantomRedirectUrl + phantomDeeplinkListener） | M4 |
| **PR4** | P1: Phantom redirect 単体テスト（Jest 設定 + phantom.test.ts + モック） | P1-4 |
| **PR5** | P1: grant_program Merkle 長制限 + paused/authority 統合テスト | M2, P1-1, P1-2 |

※ 1 PR にまとめる場合は PR1〜PR5 をまとめて「security/reliability P0-P1」としても可。

---

## 5) 残タスク（P1 未対応・P2）

- **P1 残り**: 特になし（P1-1〜P1-5 は対応済み）。
- **P2**（SECURITY_REVIEW より）:
  - P2-1: `require_claim_timing` 境界値の単体テスト（Rust）
  - P2-2: `verify_merkle_sorted` の単体テスト
  - P2-3: RPC フェイルオーバーまたは複数エンドポイントの検討・ドキュメント化
  - P2-4: `create_grant` の `expires_at` 仕様を doc コメントで明示
  - P2-5: 本番ビルド後のログ漏洩チェック手順を DEVELOPMENT.md または SECURITY.md に追記

---

## 参照

- [docs/SECURITY_REVIEW.md](./SECURITY_REVIEW.md) … リスク一覧・修正案・タスク一覧
- [docs/SECURITY.md](./SECURITY.md) … 脅威モデル・監査状況・推奨事項
